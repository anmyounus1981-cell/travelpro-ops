import { NextResponse } from "next/server";

export function POST() {
  return NextResponse.json(
    { error: "This endpoint has been retired. Submit travel inquiries at /inquire." },
    { status: 410 },
  );
}
