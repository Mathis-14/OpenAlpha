import {
  getQuotaSnapshot,
  initializeQuota,
} from "@/server/usage/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const snapshot = getQuotaSnapshot(request.headers.get("cookie"));
    const initialized = initializeQuota(request.headers.get("cookie"));

    return new Response(
      JSON.stringify({
        limit: snapshot.limit,
        remaining: snapshot.remaining,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          Vary: "Cookie",
          "Set-Cookie": initialized.cookieHeader,
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        error: "quota_unavailable",
        detail: (error as Error).message || "Quota service unavailable",
      },
      { status: 500 },
    );
  }
}
