import { NextResponse } from "next/server";
import {
  getCryptoPriceHistory,
  parseCryptoInstrument,
  parseCryptoRange,
} from "@/server/crypto/service";
import { ServiceError } from "@/server/shared/errors";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ instrument: string }> },
): Promise<Response> {
  const { searchParams } = new URL(request.url);

  try {
    const { instrument } = await context.params;
    const normalized = parseCryptoInstrument(instrument);
    const range = parseCryptoRange(searchParams.get("range"));
    const history = await getCryptoPriceHistory(normalized, range);
    return NextResponse.json(history);
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json(error.body, { status: error.status });
    }

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
