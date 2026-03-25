import { isCommodityInstrument } from "@/lib/commodities";
import type { CommodityInstrumentSlug, CryptoInstrument } from "@/types/api";
import { runAgent } from "@/server/agent/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type AgentRouteRequest = {
  query?: unknown;
  ticker?: unknown;
  dashboard_context?: unknown;
  country?: unknown;
  crypto_instrument?: unknown;
  commodity_instrument?: unknown;
};

function normalizeRequest(body: AgentRouteRequest) {
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query || query.length > 2_000) {
    return null;
  }

  let cryptoInstrument: CryptoInstrument | undefined;
  if (
    body.crypto_instrument === "BTC-PERPETUAL" ||
    body.crypto_instrument === "ETH-PERPETUAL"
  ) {
    cryptoInstrument = body.crypto_instrument;
  }

  let commodityInstrument: CommodityInstrumentSlug | undefined;
  if (
    typeof body.commodity_instrument === "string" &&
    isCommodityInstrument(body.commodity_instrument.trim().toLowerCase())
  ) {
    commodityInstrument = body.commodity_instrument.trim().toLowerCase() as CommodityInstrumentSlug;
  }

  return {
    query,
    ticker: typeof body.ticker === "string" && body.ticker.trim() ? body.ticker.trim() : undefined,
    dashboard_context:
      body.dashboard_context === "macro"
        ? ("macro" as const)
        : body.dashboard_context === "crypto"
          ? ("crypto" as const)
          : body.dashboard_context === "commodity"
            ? ("commodity" as const)
          : undefined,
    country: body.country === "fr" ? "fr" as const : body.country === "us" ? "us" as const : undefined,
    crypto_instrument: cryptoInstrument,
    commodity_instrument: commodityInstrument,
  };
}

export async function POST(request: Request): Promise<Response> {
  let body: AgentRouteRequest;
  try {
    body = (await request.json()) as AgentRouteRequest;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const normalized = normalizeRequest(body);
  if (!normalized) {
    return Response.json({ error: "invalid_request" }, { status: 422 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of runAgent(normalized)) {
          if (request.signal.aborted) {
            break;
          }
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({
              message: (error as Error).message || "Agent stream failed",
            })}\n\n`,
          ),
        );
        controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
