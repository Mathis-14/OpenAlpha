import {
  clearUnlockGuardCookieHeader,
  getUnlockGuard,
  registerUnlockFailure,
  refillQuota,
  verifyOverridePassword,
} from "@/server/usage/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UnlockRequest = {
  password?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  const cookieHeader = request.headers.get("cookie");
  const unlockGuard = getUnlockGuard(cookieHeader);
  if (unlockGuard.blocked) {
    return Response.json(
      {
        error: "unlock_rate_limited",
        retry_after_seconds: unlockGuard.retryAfterSeconds,
      },
      { status: 429 },
    );
  }

  let body: UnlockRequest;

  try {
    body = (await request.json()) as UnlockRequest;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (!verifyOverridePassword(password)) {
    const failedAttempt = registerUnlockFailure(cookieHeader);

    return Response.json(
      failedAttempt.blocked
        ? {
            error: "unlock_rate_limited",
            retry_after_seconds: failedAttempt.retryAfterSeconds,
          }
        : { error: "invalid_password" },
      {
        status: failedAttempt.blocked ? 429 : 401,
        headers: {
          "Cache-Control": "no-store",
          Vary: "Cookie",
          "Set-Cookie": failedAttempt.cookieHeader,
        },
      },
    );
  }

  try {
    const refilled = refillQuota(cookieHeader);
    const headers = new Headers({
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Cookie",
    });
    headers.append("Set-Cookie", refilled.cookieHeader);
    headers.append("Set-Cookie", clearUnlockGuardCookieHeader());

    return new Response(
      JSON.stringify({
        limit: refilled.limit,
        remaining: refilled.remaining,
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
      { status: 500 },
    );
  }
}
