import { NextResponse } from "next/server";
import { getPriceHistory } from "@/server/market/service";
import { ServiceError } from "@/server/shared/errors";
import type { PeriodType } from "@/types/api";

export const runtime = "nodejs";

function parsePeriod(raw: string | null): PeriodType {
  if (
    raw === "1d" ||
    raw === "5d" ||
    raw === "1mo" ||
    raw === "3mo" ||
    raw === "6mo" ||
    raw === "1y" ||
    raw === "2y" ||
    raw === "5y" ||
    raw === "max"
  ) {
    return raw;
  }

  return "1mo";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ ticker: string }> },
): Promise<Response> {
  const { searchParams } = new URL(request.url);

  try {
    const { ticker } = await context.params;
    const period = parsePeriod(searchParams.get("period"));
    const data = await getPriceHistory(ticker, period);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json(error.body, { status: error.status });
    }

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
