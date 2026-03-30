import {
  clearUsageUnlockGuard,
  getUsageUnlockGuard,
  refillUsageQuota,
  registerUsageUnlockFailure,
  validateOverridePassword,
} from "@/server/usage/adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UnlockRequest = {
  password?: unknown;
};

function appendSetCookies(headers: Headers, values: string[]) {
  for (const value of values) {
    headers.append("Set-Cookie", value);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const unlockGuard = await getUsageUnlockGuard(request);
    if (unlockGuard.blocked) {
      return Response.json(
        {
          error: "unlock_rate_limited",
          retry_after_seconds: unlockGuard.retryAfterSeconds,
        },
        { status: 429 },
      );
    }
  } catch (error) {
    return Response.json(
      {
        error: "quota_unavailable",
        detail: (error as Error).message || "Quota service unavailable",
      },
      { status: 503 },
    );
  }

  let body: UnlockRequest;

  try {
    body = (await request.json()) as UnlockRequest;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const password = typeof body.password === "string" ? body.password : "";
  let passwordValid = false;
  try {
    passwordValid = validateOverridePassword(password);
  } catch (error) {
    return Response.json(
      {
        error: "quota_unavailable",
        detail: (error as Error).message || "Quota service unavailable",
      },
      { status: 503 },
    );
  }

  if (!passwordValid) {
    try {
      const failedAttempt = await registerUsageUnlockFailure(request);
      const headers = new Headers({
        "Cache-Control": "no-store",
        Vary: "Cookie",
      });
      appendSetCookies(headers, failedAttempt.setCookieHeaders);

      return Response.json(
        failedAttempt.blocked
          ? {
              error: "unlock_rate_limited",
              retry_after_seconds: failedAttempt.retryAfterSeconds,
            }
          : { error: "invalid_password" },
        {
          status: failedAttempt.blocked ? 429 : 401,
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

  try {
    const refilled = await refillUsageQuota(request);
    const clearHeaders = await clearUsageUnlockGuard(request);
    const headers = new Headers({
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Cookie",
    });
    appendSetCookies(headers, refilled.setCookieHeaders);
    appendSetCookies(headers, clearHeaders);

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
      { status: 503 },
    );
  }
}
