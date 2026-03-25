import { NextResponse } from "next/server";
import {
  MacroServiceError,
  getMacroIndicator,
  parseMacroCountry,
  parseMacroHistoryRange,
  parseMacroIndicatorSlug,
} from "@/server/macro/service";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ indicator: string }> },
): Promise<Response> {
  const { searchParams } = new URL(request.url);

  try {
    const { indicator } = await context.params;
    const country = parseMacroCountry(searchParams.get("country"));
    const range = parseMacroHistoryRange(searchParams.get("range"));
    const normalizedIndicator = parseMacroIndicatorSlug(indicator);
    const data = await getMacroIndicator(normalizedIndicator, range, country);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof MacroServiceError) {
      return NextResponse.json(error.body, { status: error.status });
    }

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
