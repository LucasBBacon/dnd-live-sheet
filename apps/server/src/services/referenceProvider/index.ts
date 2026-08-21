import { DatabaseReferenceProvider } from "./databaseReferenceProvider.js";
import type { ReferenceProvider } from "./types.js";

/**
 * Kept as a union of one.
 *
 * "static" was the other member, backed by nine hand-maintained dictionaries
 * that no longer exist: rules content comes from packs and nothing else. The
 * type stays so REFERENCE_SOURCE keeps its shape, and so a second source - a
 * cache, a remote catalogue - has somewhere to land.
 */
export type ReferenceSource = "db";

const DEFAULT_SOURCE: ReferenceSource = "db";

let activeProvider: ReferenceProvider | null = null;

const parseReferenceSource = (rawValue: string | undefined): ReferenceSource => {
  if (rawValue === "db") {
    return rawValue;
  }

  if (rawValue) {
    console.warn(
      `[referenceProvider] Invalid REFERENCE_SOURCE '${rawValue}', using '${DEFAULT_SOURCE}'.`,
    );
  }

  return DEFAULT_SOURCE;
};


const createProviderForSource = (_source: ReferenceSource): ReferenceProvider =>
  new DatabaseReferenceProvider();

export const initialiseReferenceProvider = async (): Promise<ReferenceProvider> => {
  if (activeProvider) {
    return activeProvider;
  }

  const configuredSource = parseReferenceSource(process.env.REFERENCE_SOURCE);

  // no fallback: the database is the only source. a failure here means the
  // pack was never imported, and serving an empty rulebook instead of saying
  // so is what made the previous gap so hard to see
  const provider = createProviderForSource(configuredSource);
  await provider.warm();
  activeProvider = provider;
  console.log(`[referenceProvider] Using '${provider.source}' provider.`);
  return provider;
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
