type FetchJsonOptions = {
  revalidate?: number;
  headers?: HeadersInit;
  timeoutMs?: number;
};

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? 10_000);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchJson<T>(
  url: URL | string,
  options: FetchJsonOptions = {},
): Promise<T> {
  const response = await fetchWithTimeout(url, {
    headers: options.headers,
    next:
      options.revalidate != null ? { revalidate: options.revalidate } : undefined,
    timeoutMs: options.timeoutMs,
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function fetchText(
  url: URL | string,
  options: FetchJsonOptions = {},
): Promise<string> {
  const response = await fetchWithTimeout(url, {
    headers: options.headers,
    next:
      options.revalidate != null ? { revalidate: options.revalidate } : undefined,
    timeoutMs: options.timeoutMs,
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.text();
}
