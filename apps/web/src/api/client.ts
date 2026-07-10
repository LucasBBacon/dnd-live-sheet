// Centralized fetch wrapper to ensure mock auth header is always present

const BASE_URL = "http://localhost:3000/api";
export const MOCK_USER_ID = "dev-user-1";

export type ReferenceScope = {
  campaignId?: string | null;
  characterId?: string | null;
};

export type LevelUpOptionsParams = {
  classId?: string | null;
  subclassId?: string | null;
  currentClassLevel?: number | null;
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
  // Character scope is only valid when campaign scope is present.
  // This avoids `/reference/*` requests that the server rejects.
  // See: `characterId scoped reads require campaignId context`.
  (() => {
    const hasCampaignScope = Boolean(scope.campaignId);
    const effectiveCharacterId = hasCampaignScope
      ? (scope.characterId ?? undefined)
      : undefined;

    return withQuery(endpoint, {
      ...params,
      campaignId: scope.campaignId ?? undefined,
      characterId: effectiveCharacterId,
    });
  })();

export const buildLevelUpOptionsEndpoint = (
  scope: ReferenceScope = {},
  params: LevelUpOptionsParams = {},
): string =>
  buildScopedReferenceEndpoint("/reference/level-up/options", scope, {
    classId: params.classId ?? undefined,
    subclassId: params.subclassId ?? undefined,
    currentClassLevel: params.currentClassLevel ?? undefined,
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
