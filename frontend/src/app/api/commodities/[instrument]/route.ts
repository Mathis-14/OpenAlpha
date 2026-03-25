import { NextResponse } from "next/server";
import { ServiceError } from "@/server/shared/errors";
import {
  getCommodityOverview,
  parseCommodityInstrument,
} from "@/server/commodities/service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ instrument: string }> },
): Promise<Response> {
  try {
    const { instrument: rawInstrument } = await context.params;
    const instrument = parseCommodityInstrument(rawInstrument);
    const overview = await getCommodityOverview(instrument);
    return NextResponse.json(overview);
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json(error.body, { status: error.status });
    }

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
