import { NextResponse } from "next/server";
import { searchTickers } from "@/server/search/service";
import { ServiceError } from "@/server/shared/errors";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (query.length === 0) {
    return NextResponse.json([], { status: 422 });
  }

  try {
    const data = await searchTickers(query);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json(error.body, { status: error.status });
    }

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
