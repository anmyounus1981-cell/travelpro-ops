export type InquirySource = "web" | "whatsapp" | "email";

export type CabinClass =
  | "economy"
  | "premium_economy"
  | "business"
  | "first"
  | null;

export type ParsedInquiry = {
  corporateClient: string | null;
  origin: string | null;
  destination: string | null;
  departureDate: string | null;
  returnDate: string | null;
  passengerCount: number | null;
  cabinClass: CabinClass;
  confidence: number;
};

export type InquiryInput = {
  source: InquirySource;
  rawMessage: string;
  senderName?: string | null;
  senderEmail?: string | null;
  senderPhone?: string | null;
  corporateClient?: string | null;
  origin?: string | null;
  destination?: string | null;
  departureDate?: string | null;
  returnDate?: string | null;
  passengerCount?: number | null;
  cabinClass?: CabinClass;
  notes?: string | null;
};

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : null;
}

function normalizeDate(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString().slice(0, 10);
}

function normalizePassengerCount(value: unknown): number | null {
  const count = Number(value);

  if (!Number.isInteger(count) || count < 1 || count > 100) {
    return null;
  }

  return count;
}function normalizeCabinClass(value: unknown): CabinClass {
  const cabin = cleanText(value)?.toLowerCase().replace(/[\s-]+/g, "_");

  if (!cabin) return null;

  if (cabin === "economy" || cabin === "eco") {
    return "economy";
  }

  if (
    cabin === "premium_economy" ||
    cabin === "premiumeconomy" ||
    cabin === "premium"
  ) {
    return "premium_economy";
  }

  if (cabin === "business" || cabin === "biz") {
    return "business";
  }

  if (cabin === "first" || cabin === "first_class") {
    return "first";
  }

  return null;
}

export function normalizeStructuredInquiry(
  input: Record<string, unknown>,
): ParsedInquiry {
  const confidenceValue = Number(input.confidence);

  const confidence = Number.isFinite(confidenceValue)
    ? Math.min(1, Math.max(0, confidenceValue))
    : 1;

  return {
    corporateClient: cleanText(
      input.corporateClient ?? input.corporate_client,
    ),
    origin: cleanText(input.origin),
    destination: cleanText(input.destination),
    departureDate: normalizeDate(
      input.departureDate ?? input.departure_date,
    ),
    returnDate: normalizeDate(input.returnDate ?? input.return_date),
    passengerCount: normalizePassengerCount(
      input.passengerCount ?? input.passenger_count,
    ),
    cabinClass: normalizeCabinClass(
      input.cabinClass ?? input.cabin_class,
    ),
    confidence,
  };
}function findTextMatch(
  text: string,
  patterns: RegExp[],
): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = cleanText(match?.[1]);

    if (value) return value;
  }

  return null;
}

function extractRoute(rawMessage: string): {
  origin: string | null;
  destination: string | null;
} {
  const routePatterns = [
    /\bfrom\s+([A-Za-z]{3})\s+to\s+([A-Za-z]{3})\b/i,
    /\b([A-Za-z]{3})\s*(?:-|–|—|to)\s*([A-Za-z]{3})\b/i,
  ];

  for (const pattern of routePatterns) {
    const match = rawMessage.match(pattern);

    if (match) {
      return {
        origin: match[1].toUpperCase(),
        destination: match[2].toUpperCase(),
      };
    }
  }

  return {
    origin: null,
    destination: null,
  };
}

function extractDates(rawMessage: string): {
  departureDate: string | null;
  returnDate: string | null;
} {
  const isoDates =
    rawMessage.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [];

  const departureText = findTextMatch(rawMessage, [
    /(?:departure|depart|outbound)\s*(?:date)?\s*[:=-]?\s*(\d{4}-\d{2}-\d{2})/i,
  ]);

  const returnText = findTextMatch(rawMessage, [
    /(?:return|inbound)\s*(?:date)?\s*[:=-]?\s*(\d{4}-\d{2}-\d{2})/i,
  ]);

  return {
    departureDate: normalizeDate(departureText ?? isoDates[0]),
    returnDate: normalizeDate(returnText ?? isoDates[1]),
  };
}

function extractPassengerCount(rawMessage: string): number | null {
  const match = rawMessage.match(
    /\b(\d{1,3})\s*(?:passengers?|pax|travellers?|travelers?|adults?)\b/i,
  );

  return normalizePassengerCount(match?.[1]);
}export function parseInquiryDeterministically(
  input: InquiryInput,
): ParsedInquiry {
  const rawMessage = input.rawMessage ?? "";
  const route = extractRoute(rawMessage);
  const dates = extractDates(rawMessage);

  const corporateClient =
    cleanText(input.corporateClient) ??
    findTextMatch(rawMessage, [
      /(?:company|corporate client|client)\s*[:=-]\s*([^\n,]+)/i,
    ]);

  const origin =
    cleanText(input.origin)?.toUpperCase() ?? route.origin;

  const destination =
    cleanText(input.destination)?.toUpperCase() ??
    route.destination;

  const departureDate =
    normalizeDate(input.departureDate) ?? dates.departureDate;

  const returnDate =
    normalizeDate(input.returnDate) ?? dates.returnDate;

  const passengerCount =
    normalizePassengerCount(input.passengerCount) ??
    extractPassengerCount(rawMessage);

  const cabinClass =
    normalizeCabinClass(input.cabinClass) ??
    normalizeCabinClass(
      findTextMatch(rawMessage, [
        /\b(premium economy|business|first class|first|economy)\b/i,
      ]),
    );

  const extractedFields = [
    origin,
    destination,
    departureDate,
    passengerCount,
    cabinClass,
  ];

  const completedFields = extractedFields.filter(Boolean).length;
  const confidence = Number(
    (completedFields / extractedFields.length).toFixed(2),
  );

  return {
    corporateClient,
    origin,
    destination,
    departureDate,
    returnDate,
    passengerCount,
    cabinClass,
    confidence,
  };
}type OpenAIResponse = {
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

function getOpenAIOutputText(response: OpenAIResponse): string | null {
  for (const outputItem of response.output ?? []) {
    for (const contentItem of outputItem.content ?? []) {
      if (
        contentItem.type === "output_text" &&
        typeof contentItem.text === "string"
      ) {
        return contentItem.text;
      }
    }
  }

  return null;
}

function mergeParsedInquiry(
  fallback: ParsedInquiry,
  aiResult: ParsedInquiry,
): ParsedInquiry {
  return {
    corporateClient:
      aiResult.corporateClient ?? fallback.corporateClient,
    origin: aiResult.origin ?? fallback.origin,
    destination: aiResult.destination ?? fallback.destination,
    departureDate:
      aiResult.departureDate ?? fallback.departureDate,
    returnDate: aiResult.returnDate ?? fallback.returnDate,
    passengerCount:
      aiResult.passengerCount ?? fallback.passengerCount,
    cabinClass: aiResult.cabinClass ?? fallback.cabinClass,
    confidence: aiResult.confidence,
  };
}export async function parseInquiry(
  input: InquiryInput,
): Promise<ParsedInquiry> {
  const fallback = parseInquiryDeterministically(input);
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;

  // The app remains functional without AI credentials.
  if (!apiKey || !model) {
    return fallback;
  }

  const prompt = [
    "Extract travel inquiry details from the message.",
    "Use IATA airport codes when they are clearly available.",
    "Return dates in YYYY-MM-DD format.",
    "Do not invent missing information.",
    "",
    `Source: ${input.source}`,
    `Sender: ${input.senderName ?? "Unknown"}`,
    `Message: ${input.rawMessage}`,
  ].join("\n");

  try {
    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: prompt,
          temperature: 0,          text: {
            format: {
              type: "json_schema",
              name: "travel_inquiry",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  corporateClient: {
                    anyOf: [
                      { type: "string" },
                      { type: "null" },
                    ],
                  },
                  origin: {
                    anyOf: [
                      { type: "string" },
                      { type: "null" },
                    ],
                  },
                  destination: {
                    anyOf: [
                      { type: "string" },
                      { type: "null" },
                    ],
                  },
                  departureDate: {
                    anyOf: [
                      { type: "string" },
                      { type: "null" },
                    ],
                  },
                  returnDate: {
                    anyOf: [
                      { type: "string" },
                      { type: "null" },
                    ],
                  },                  passengerCount: {
                    anyOf: [
                      {
                        type: "integer",
                        minimum: 1,
                        maximum: 100,
                      },
                      { type: "null" },
                    ],
                  },
                  cabinClass: {
                    anyOf: [
                      {
                        type: "string",
                        enum: [
                          "economy",
                          "premium_economy",
                          "business",
                          "first",
                        ],
                      },
                      { type: "null" },
                    ],
                  },
                  confidence: {
                    type: "number",
                    minimum: 0,
                    maximum: 1,
                  },
                },
                required: [
                  "corporateClient",
                  "origin",
                  "destination",
                  "departureDate",
                  "returnDate",
                  "passengerCount",
                  "cabinClass",
                  "confidence",
                ],
              },
            },
          },
        }),
      },
    );    if (!response.ok) {
      return fallback;
    }

    const data = (await response.json()) as OpenAIResponse;
    const outputText = getOpenAIOutputText(data);

    if (!outputText) {
      return fallback;
    }

    const parsedJson = JSON.parse(outputText) as Record<
      string,
      unknown
    >;

    const aiResult = normalizeStructuredInquiry(parsedJson);

    return mergeParsedInquiry(fallback, aiResult);
  } catch {
    return fallback;
  }
}