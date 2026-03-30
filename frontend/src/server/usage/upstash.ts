type RedisCommandPart = string | number;

type UpstashResponse<T> = {
  result?: T;
  error?: string;
};

function getUpstashConfig(): {
  url: string;
  token: string;
} {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url || !token) {
    throw new Error("Upstash Redis is not configured");
  }

  return { url, token };
}

async function executeUpstashCommand<T>(
  command: RedisCommandPart[],
): Promise<T> {
  const { url, token } = getUpstashConfig();

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    throw new Error(`Upstash Redis request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as UpstashResponse<T>;
  if (payload.error) {
    throw new Error(payload.error);
  }

  if (!("result" in payload)) {
    throw new Error("Upstash Redis returned no result");
  }

  return payload.result as T;
}

export async function runRedisCommand<T>(
  command: RedisCommandPart[],
): Promise<T> {
  return executeUpstashCommand<T>(command);
}

export async function runRedisEval<T>(
  script: string,
  keys: string[],
  args: Array<string | number>,
): Promise<T> {
  return executeUpstashCommand<T>([
    "EVAL",
    script,
    keys.length,
    ...keys,
    ...args,
  ]);
}
