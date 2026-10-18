import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "This inquiry endpoint has been retired.",
      code: "LEGACY_INQUIRY_ENDPOINT_RETIRED",
      inquiryPage: "/inquire",
    },
    {
      status: 410,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}