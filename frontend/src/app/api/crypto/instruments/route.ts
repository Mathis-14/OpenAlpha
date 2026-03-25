import { NextResponse } from "next/server";
import { getSupportedCryptoInstruments } from "@/server/crypto/service";
import { ServiceError } from "@/server/shared/errors";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    const instruments = await getSupportedCryptoInstruments();
    return NextResponse.json(instruments);
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json(error.body, { status: error.status });
    }

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
