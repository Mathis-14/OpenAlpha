import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return NextResponse.json({ status: "ok" });
}
