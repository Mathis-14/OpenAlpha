import { NextResponse } from "next/server";
import {
  MacroServiceError,
  getMacroSnapshotForCountry,
  parseMacroCountry,
} from "@/server/macro/service";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);

  try {
    const country = parseMacroCountry(searchParams.get("country"));
    const snapshot = await getMacroSnapshotForCountry(country);
    return NextResponse.json(snapshot);
  } catch (error) {
    if (error instanceof MacroServiceError) {
      return NextResponse.json(error.body, { status: error.status });
    }

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
