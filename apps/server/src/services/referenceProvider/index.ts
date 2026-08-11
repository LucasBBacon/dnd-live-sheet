import { DatabaseReferenceProvider } from "./databaseReferenceProvider.js";
import { StaticReferenceProvider } from "./staticReferenceProvider.js";
import type { ReferenceProvider } from "./types.js";

export type ReferenceSource = "static" | "db";

const DEFAULT_SOURCE: ReferenceSource = "static";

let activeProvider: ReferenceProvider | null = null;

const parseReferenceSource = (rawValue: string | undefined): ReferenceSource => {
  if (rawValue === "db" || rawValue === "static") {
    return rawValue;
  }

  if (rawValue) {
    console.warn(
      `[referenceProvider] Invalid REFERENCE_SOURCE '${rawValue}', using '${DEFAULT_SOURCE}'.`,
    );
  }

  return DEFAULT_SOURCE;
};

const parseFallbackEnabled = (rawValue: string | undefined): boolean => {
  if (!rawValue) return true;
  const normalized = rawValue.trim().toLowerCase();
  return normalized !== "0" && normalized !== "false" && normalized !== "no";
};

const createProviderForSource = (source: ReferenceSource): ReferenceProvider => {
  if (source === "db") {
    return new DatabaseReferenceProvider();
  }

  return new StaticReferenceProvider();
};

export const initialiseReferenceProvider = async (): Promise<ReferenceProvider> => {
  if (activeProvider) {
    return activeProvider;
  }

  const configuredSource = parseReferenceSource(process.env.REFERENCE_SOURCE);
  const fallbackEnabled = parseFallbackEnabled(
    process.env.REFERENCE_SOURCE_FALLBACK_ENABLED,
  );

  try {
    const provider = createProviderForSource(configuredSource);
    await provider.warm();
    activeProvider = provider;
    console.log(`[referenceProvider] Using '${provider.source}' provider.`);
    return provider;
  } catch (error) {
    if (configuredSource !== "static" || !fallbackEnabled) {
      throw error;
    }

    console.warn(
      "[referenceProvider] Static provider failed during initialisation, falling back to db provider.",
      error,
    );

    const fallback = createProviderForSource("db");
    await fallback.warm();
    activeProvider = fallback;
    console.log("[referenceProvider] Using 'db' fallback provider.");
    return fallback;
  }
};

export const getReferenceProvider = (): ReferenceProvider => {
  if (!activeProvider) {
    throw new Error(
      "Reference provider not initialised. Call initialiseReferenceProvider() during bootstrap.",
    );
  }

  return activeProvider;
};

export const resetReferenceProviderForTests = (): void => {
  activeProvider = null;
};
