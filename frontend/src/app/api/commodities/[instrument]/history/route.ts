import { NextResponse } from "next/server";
import { ServiceError } from "@/server/shared/errors";
import {
  getCommodityPriceHistory,
  parseCommodityInstrument,
} from "@/server/commodities/service";
import type { CommodityRange } from "@/types/api";

export const runtime = "nodejs";

function normalizeRange(value: string | null): CommodityRange {
  if (
    value === "1d" ||
    value === "5d" ||
    value === "1mo" ||
    value === "3mo" ||
    value === "6mo" ||
    value === "1y" ||
    value === "2y" ||
    value === "5y" ||
    value === "max"
  ) {
    return value;
  }

  return "1mo";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ instrument: string }> },
): Promise<Response> {
  try {
    const { instrument: rawInstrument } = await context.params;
    const { searchParams } = new URL(request.url);
    const instrument = parseCommodityInstrument(rawInstrument);
    const range = normalizeRange(searchParams.get("range"));
    const history = await getCommodityPriceHistory(instrument, range);
    return NextResponse.json(history);
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json(error.body, { status: error.status });
    }

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
