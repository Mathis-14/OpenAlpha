import { NextResponse } from "next/server";
import { getNews } from "@/server/news/service";
import { ServiceError } from "@/server/shared/errors";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ ticker: string }> },
): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? "10");

  try {
    const { ticker } = await context.params;
    const data = await getNews(ticker, Number.isFinite(limit) ? limit : 10);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json(error.body, { status: error.status });
    }

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
