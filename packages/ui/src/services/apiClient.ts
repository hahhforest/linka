export interface ApiClientOptions {
  readonly baseUrl?: string;
  readonly signal?: AbortSignal;
}

const normalizeBaseUrl = (baseUrl: string): string => baseUrl.replace(/\/$/, "");

const getDefaultBaseUrl = (): string => {
  const configuredUrl = import.meta.env.VITE_LINKA_DAEMON_URL;

  if (typeof configuredUrl === "string" && configuredUrl.trim().length > 0) {
    return normalizeBaseUrl(configuredUrl.trim());
  }

  return "";
};

export const requestJson = async <ResponseBody>(
  path: string,
  options: ApiClientOptions = {},
): Promise<ResponseBody> => {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? getDefaultBaseUrl());
  const response = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`LinkA daemon request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as ResponseBody;
};
