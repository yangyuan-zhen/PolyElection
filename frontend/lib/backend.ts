type FetchOptions = {
  revalidate?: number;
};

function getApiBaseUrl(): string {
  const apiBase = process.env.POLYELECTION_API_BASE_URL?.trim();
  if (!apiBase) {
    throw new Error("POLYELECTION_API_BASE_URL is not configured");
  }

  return apiBase.replace(/\/+$/, "");
}

export async function fetchBackendJson<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const apiBase = getApiBaseUrl();
  const response = await fetch(`${apiBase}${path}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: options.revalidate ?? 60 },
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Backend ${response.status}: ${detail}`);
  }

  return (await response.json()) as T;
}
