import { NextResponse } from "next/server";
import { getSupportedCommodityInstruments } from "@/server/commodities/service";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return NextResponse.json(getSupportedCommodityInstruments());
}
