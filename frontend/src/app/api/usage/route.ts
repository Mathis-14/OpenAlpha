import {
  getUsageQuotaState,
} from "@/server/usage/adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function appendSetCookies(headers: Headers, values: string[]) {
  for (const value of values) {
    headers.append("Set-Cookie", value);
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const snapshot = await getUsageQuotaState(request);
    const headers = new Headers({
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Cookie",
    });
    appendSetCookies(headers, snapshot.setCookieHeaders);

    return new Response(
      JSON.stringify({
        limit: snapshot.limit,
        remaining: snapshot.remaining,
      }),
      {
        status: 200,
        headers,
      },
    );
  } catch (error) {
    return Response.json(
      {
        error: "quota_unavailable",
        detail: (error as Error).message || "Quota service unavailable",
      },
      { status: 503 },
    );
  }
}
