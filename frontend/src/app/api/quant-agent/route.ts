import { runQuantAgent } from "@/server/quant-agent/service";
import { assertQuotaAvailable, decrementUsageQuota } from "@/server/usage/adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function appendSetCookies(headers: Headers, values: string[]) {
  for (const value of values) {
    headers.append("Set-Cookie", value);
  }
}

type QuantAgentRouteRequest = {
  query?: unknown;
};

export function normalizeQuantRequest(body: QuantAgentRouteRequest) {
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query || query.length > 2_000) {
    return null;
  }

  return { query };
}

export async function POST(request: Request): Promise<Response> {
  let body: QuantAgentRouteRequest;
  try {
    body = (await request.json()) as QuantAgentRouteRequest;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const normalized = normalizeQuantRequest(body);
  if (!normalized) {
    return Response.json({ error: "invalid_request" }, { status: 422 });
  }

  if (!process.env.MISTRAL_API_KEY?.trim()) {
    return Response.json(
      {
        error: "agent_unavailable",
        detail: "MISTRAL_API_KEY is not configured",
      },
      { status: 503 },
    );
  }

  let quota;
  try {
    await assertQuotaAvailable(request);
    quota = await decrementUsageQuota(request);
  } catch (error) {
    return Response.json(
      {
        error: "quota_unavailable",
        detail: (error as Error).message || "Quota service unavailable",
      },
      { status: 503 },
    );
  }

  if (!quota.allowed) {
    const headers = new Headers({
      "Cache-Control": "no-store",
      Vary: "Cookie, Authorization",
    });
    appendSetCookies(headers, quota.setCookieHeaders);

    return Response.json(
      { error: "quota_exhausted", remaining: 0 },
      {
        status: 429,
        headers,
      },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of runQuantAgent(normalized)) {
          if (request.signal.aborted) {
            break;
          }
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({
              message: (error as Error).message || "Quant Alpha stream failed",
            })}\n\n`,
          ),
        );
        controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
      } finally {
        controller.close();
      }
    },
  });

  const headers = new Headers({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
    Vary: "Cookie, Authorization",
    "X-Requests-Remaining": String(quota.remaining),
  });
  appendSetCookies(headers, quota.setCookieHeaders);

  return new Response(stream, { headers });
}
