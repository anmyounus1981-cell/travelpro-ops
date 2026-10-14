import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const outputPath = resolve(projectRoot, "public/data/airports.json");
const metadataPath = resolve(projectRoot, "public/data/airports.meta.json");

const SOURCE_REPOSITORY = "davidmegginson/ourairports-data";
const MAX_DOWNLOAD_BYTES = 32 * 1024 * 1024;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let closedQuote = false;

  text = text.replace(/^\uFEFF/, "");

  function finishField() {
    row.push(field);
    field = "";
    closedQuote = false;
  }

  function finishRow() {
    finishField();
    if (row.some((value) => value !== "")) rows.push(row);
    row = [];
  }

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === ",") {
      finishField();
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      finishRow();
    } else if (character === '"') {
      if (field !== "" || closedQuote) {
        throw new Error("Invalid quote in source CSV.");
      }
      quoted = true;
    } else {
      if (closedQuote) {
        throw new Error("Unexpected text after a quoted CSV field.");
      }
      field += character;
    }
  }

  if (quoted) throw new Error("Unterminated quoted CSV field.");
  if (field !== "" || row.length > 0 || closedQuote) finishRow();

  if (rows.length < 2) throw new Error("Source CSV has no records.");

  const headers = rows.shift();
  if (new Set(headers).size !== headers.length) {
    throw new Error("Source CSV contains duplicate column names.");
  }

  return rows.map((values, index) => {
    if (values.length !== headers.length) {
      throw new Error(`CSV column mismatch at record ${index + 1}.`);
    }
    return Object.fromEntries(
      headers.map((header, column) => [header, values[column]]),
    );
  });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function downloadText(url, maxBytes = MAX_DOWNLOAD_BYTES) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json, text/csv, text/plain",
      "User-Agent": "TravelPro-Ops-Airport-Dataset-Builder",
    },
    signal: AbortSignal.timeout(60_000),
    redirect: "error",
  });

  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status} (${url})`);
  }

  if (!response.body) {
    throw new Error(`Download returned an empty body (${url}).`);
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error(`Download exceeds the size limit (${url}).`);
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = Buffer.concat(chunks);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

async function resolveSourceCommit() {
  const suppliedCommit = process.argv[2];

  if (suppliedCommit !== undefined) {
    if (!/^[0-9a-f]{40}$/i.test(suppliedCommit)) {
      throw new Error("Source commit must be a complete 40-character SHA.");
    }
    return suppliedCommit.toLowerCase();
  }

  const text = await downloadText(
    `https://api.github.com/repos/${SOURCE_REPOSITORY}/commits/main`,
    1024 * 1024,
  );
  const result = JSON.parse(text);

  if (
    typeof result.sha !== "string" ||
    !/^[0-9a-f]{40}$/i.test(result.sha)
  ) {
    throw new Error("GitHub returned an invalid source commit.");
  }

  return result.sha.toLowerCase();
}

function requireColumns(records, columns, sourceName) {
  for (const column of columns) {
    if (!Object.hasOwn(records[0], column)) {
      throw new Error(`${sourceName} is missing column: ${column}`);
    }
  }
}

function buildAirportRecords(airportRows, countryRows) {
  requireColumns(
    airportRows,
    ["id", "type", "name", "municipality", "iso_country", "iata_code"],
    "Airports CSV",
  );
  requireColumns(countryRows, ["code", "name"], "Countries CSV");

  const countries = new Map();

  for (const row of countryRows) {
    const code = row.code.trim();
    const name = row.name.trim();

    if (!code || !name || countries.has(code)) {
      throw new Error(`Invalid or duplicate country record: ${code}`);
    }

    countries.set(code, name);
  }

  const includedTypes = new Set([
    "large_airport",
    "medium_airport",
    "small_airport",
  ]);

  const airports = [];
  const codes = new Map();
  const conflicts = [];

  for (const row of airportRows) {
    const iata = row.iata_code.trim().toUpperCase();

    if (!includedTypes.has(row.type) || !/^[A-Z]{3}$/.test(iata)) {
      continue;
    }

    const name = row.name.trim();
    const city = row.municipality.trim();
    const country = countries.get(row.iso_country.trim());
    const sourceId = row.id.trim();

    if (!name || !country || !/^\d+$/.test(sourceId)) {
      throw new Error(`Incomplete airport record: ${iata}`);
    }

    if (codes.has(iata)) {
      conflicts.push(`${iata}: source IDs ${codes.get(iata)} and ${sourceId}`);
      continue;
    }

    codes.set(iata, sourceId);
    airports.push({
      iata,
      name,
      city,
      country,
    });
  }

  if (conflicts.length > 0) {
    throw new Error(
      `Duplicate IATA codes require source review:\n${conflicts.join("\n")}`,
    );
  }

  // Detect empty/truncated downloads before replacing the local dataset.
  if (airports.length < 1000) {
    throw new Error("Airport coverage check failed: fewer than 1000 records.");
  }

  for (const code of ["DAC", "LHR", "JFK", "BKK", "SIN"]) {
    if (!codes.has(code)) {
      throw new Error(`Airport coverage check failed: missing ${code}.`);
    }
  }

  airports.sort((left, right) =>
    left.iata < right.iata ? -1 : left.iata > right.iata ? 1 : 0,
  );

  return airports;
}

async function writeJsonFile(path, contents) {
  await mkdir(dirname(path), { recursive: true });

  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, contents, {
    encoding: "utf8",
    flag: "wx",
  });
  await rename(temporaryPath, path);
}

async function main() {
  const sourceCommit = await resolveSourceCommit();
  const sourceBase =
    `https://raw.githubusercontent.com/${SOURCE_REPOSITORY}/${sourceCommit}`;

  const downloads = await Promise.allSettled([
    downloadText(`${sourceBase}/airports.csv`),
    downloadText(`${sourceBase}/countries.csv`),
  ]);

  const errors = downloads
    .filter((result) => result.status === "rejected")
    .map((result) =>
      result.reason instanceof Error
        ? result.reason.message
        : String(result.reason),
    );

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  const [airportCsv, countryCsv] = downloads.map((result) => result.value);
  const airports = buildAirportRecords(
    parseCsv(airportCsv),
    parseCsv(countryCsv),
  );

  const dataset = {
    schemaVersion: 1,
    sourceCommit,
    airports,
  };

  const datasetJson = `${JSON.stringify(dataset)}\n`;
  const datasetBytes = Buffer.byteLength(datasetJson, "utf8");

  if (datasetBytes > 4 * 1024 * 1024) {
    throw new Error("Generated airport dataset exceeds the 4 MiB budget.");
  }

  const metadata = {
    schemaVersion: 1,
    source: "OurAirports",
    sourceRepository: `https://github.com/${SOURCE_REPOSITORY}`,
    sourceCommit,
    sourcePage: "https://ourairports.com/data/",
    licence: "Public Domain",
    generatedAt: new Date().toISOString(),
    airportCount: airports.length,
    datasetBytes,
    datasetSha256: sha256(datasetJson),
    sourceSha256: {
      airportsCsv: sha256(airportCsv),
      countriesCsv: sha256(countryCsv),
    },
    includedTypes: ["large_airport", "medium_airport", "small_airport"],
    limitations: [
      "Includes only airport records with three-letter IATA codes.",
      "Closed airports, heliports and seaplane bases are excluded.",
      "Municipality may be empty.",
      "Metropolitan area codes are not included.",
      "Source data has no accuracy guarantee.",
    ],
  };

  // Validate everything before writing either output.
  await writeJsonFile(outputPath, datasetJson);
  await writeJsonFile(
    metadataPath,
    `${JSON.stringify(metadata, null, 2)}\n`,
  );

  console.log(`Source commit: ${sourceCommit}`);
  console.log(`Airports generated: ${airports.length}`);
  console.log(`Dataset size: ${(datasetBytes / 1024).toFixed(1)} KiB`);
  console.log("Created public/data/airports.json");
  console.log("Created public/data/airports.meta.json");
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Airport dataset build failed.",
  );
  process.exitCode = 1;
});