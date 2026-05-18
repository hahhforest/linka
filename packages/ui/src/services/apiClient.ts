export interface ApiClientOptions {
  readonly baseUrl?: string;
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
  readonly method?: "GET" | "POST";
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
}

const normalizeBaseUrl = (baseUrl: string): string => baseUrl.replace(/\/$/, "");

const getDefaultBaseUrl = (): string => {
  const env = (
    import.meta as ImportMeta & { readonly env?: { readonly VITE_LINKA_DAEMON_URL?: string } }
  ).env;
  const configuredUrl = env?.VITE_LINKA_DAEMON_URL;

  if (typeof configuredUrl === "string" && configuredUrl.trim().length > 0) {
    return normalizeBaseUrl(configuredUrl.trim());
  }

  return "";
};

const getFetch = (fetchImpl?: typeof fetch): typeof fetch => {
  const resolvedFetch = fetchImpl ?? globalThis.fetch;

  if (!resolvedFetch) {
    throw new Error("fetch is not available for LinkA daemon requests");
  }

  return resolvedFetch;
};

export const requestJson = async <ResponseBody>(
  path: string,
  options: ApiClientOptions = {},
): Promise<ResponseBody> => {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? getDefaultBaseUrl());
  const hasBody = options.body !== undefined;
  const response = await getFetch(options.fetchImpl)(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    body: hasBody ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`LinkA daemon request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as ResponseBody;
};
