import { NextResponse } from "next/server";
import { getFundamentals } from "@/server/market/service";
import { ServiceError } from "@/server/shared/errors";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ ticker: string }> },
): Promise<Response> {
  try {
    const { ticker } = await context.params;
    const data = await getFundamentals(ticker);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json(error.body, { status: error.status });
    }

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
