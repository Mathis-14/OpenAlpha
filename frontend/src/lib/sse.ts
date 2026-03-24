import { getApiBaseUrl } from "@/lib/api-base";
import type { AgentEvent, AgentEventType, AgentRequest } from "@/types/api";

/**
 * Stream agent responses via POST + Server-Sent Events.
 *
 * Uses fetch + ReadableStream (not EventSource) because we need POST.
 * Yields typed AgentEvent objects as they arrive.
 */
export async function* streamAgent(
  request: AgentRequest,
  signal?: AbortSignal,
): AsyncGenerator<AgentEvent> {
  const res = await fetch(`${getApiBaseUrl()}/api/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`Agent request failed: ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        if (!block.trim()) continue;

        let eventType: AgentEventType = "text";
        let data: Record<string, unknown> = {};

        for (const line of block.split("\n")) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7) as AgentEventType;
          } else if (line.startsWith("data: ")) {
            try {
              data = JSON.parse(line.slice(6));
            } catch {
              data = { raw: line.slice(6) };
            }
          }
        }

        yield { event: eventType, data };
      }
    }
  } finally {
    reader.releaseLock();
  }
}
