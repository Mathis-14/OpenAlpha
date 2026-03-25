import { NextResponse } from "next/server";
import { getFilings } from "@/server/filings/service";
import { ServiceError } from "@/server/shared/errors";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ ticker: string }> },
): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const formType = searchParams.get("form_type") ?? "10-K";
  const limit = Number(searchParams.get("limit") ?? "3");

  try {
    const { ticker } = await context.params;
    const data = await getFilings(
      ticker,
      formType,
      Number.isFinite(limit) ? limit : 3,
    );
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json(error.body, { status: error.status });
    }

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
