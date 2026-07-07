// Centralized fetch wrapper to ensure mock auth header is always present

const BASE_URL = "http://localhost:3000/api";
export const MOCK_USER_ID = "dev-user-1";

export type ReferenceScope = {
  campaignId?: string | null;
  characterId?: string | null;
};

type QueryValue = string | number | boolean | null | undefined;

const withQuery = (
  endpoint: string,
  params: Record<string, QueryValue>,
): string => {
  const [path, existingQuery = ""] = endpoint.split("?");
  const query = new URLSearchParams(existingQuery);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    query.set(key, String(value));
  }

  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
};

export const buildScopedReferenceEndpoint = (
  endpoint: string,
  scope: ReferenceScope = {},
  params: Record<string, QueryValue> = {},
): string =>
  withQuery(endpoint, {
    ...params,
    campaignId: scope.campaignId ?? undefined,
    characterId: scope.characterId ?? undefined,
  });

export const apiClient = async (
  endpoint: string,
  options: RequestInit = {},
) => {
  const headers = {
    "Content-Type": "application/json",
    "x-tester-id": MOCK_USER_ID,
    ...options.headers,
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! stats ${response.status}`);
  }

  return response.json();
};
