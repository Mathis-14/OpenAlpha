import { NextResponse } from "next/server";
import {
  getCryptoOverview,
  parseCryptoInstrument,
} from "@/server/crypto/service";
import { ServiceError } from "@/server/shared/errors";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ instrument: string }> },
): Promise<Response> {
  try {
    const { instrument } = await context.params;
    const normalized = parseCryptoInstrument(instrument);
    const overview = await getCryptoOverview(normalized);
    return NextResponse.json(overview);
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json(error.body, { status: error.status });
    }

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
