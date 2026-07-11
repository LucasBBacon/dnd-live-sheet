# 3-layer authority model

## Purpose

This document defines the canonical data authority model used by the repository after split-memory remediation.

The objective is to avoid divergent truth between in-memory dictionaries and persisted records whilst supporting campaign and character homebrew.

## Layer definitions

## 1) Core reference layer (static)

Scope:

- canonical 5e 2014 compendium records;
- immutable in day-to-day operation;
- persisted in PostgreSQL reference tables.

Ownership:

- maintained via seed/import workflows;
- marked as `sourceType = core`.

Examples:

- traits, races, subraces, classes, subclasses, backgrounds, items, progression rows.

## 2) Scoped homebrew reference layer (mutable)

Scope:

- reference records authored by users for a campaign or character.

Ownership metadata:

- `sourceType = homebrew`
- `ownerCampaignId` (required for homebrew)
- `ownerCharacterId` (optional, must belong to campaign)
- `createdByUserId`
- `isPublished`
- `supersedesId` (optional override lineage)

Authorisation:

- write actions require campaign role `owner` or `dm`.

## 3) Operational layer (transactional)

Scope:

- live runtime state and gameplay progression.

Examples:

- campaigns, campaign members, characters, class ledger, inventory, resources, combat-state-adjacent fields.

Guarantee:

- updates are transactional and persist authoritative runtime state between sessions.

## Resolution precedence

Effective reference resolution follows strict precedence:

1. character-scoped homebrew
2. campaign-scoped homebrew
3. core compendium

Conflict handling:

- entries are de-duplicated by canonical key (`supersedesId ?? id`);
- higher-precedence records replace lower-precedence records;
- resolution is deterministic within a scope.

## Cache model

## Base cache

`referenceCache` stores **core + published** rows only.

Why:

- avoids unpublished/homebrew leakage into anonymous reads;
- keeps warm cache compact and predictable;
- provides stable baseline for scoped overlays.

## Scoped cache

`effectiveReferenceResolver` builds scope-specific snapshots keyed by:

- `campaignId`
- `characterId` (optional)

Entries are versioned against `referenceCache` version. Any homebrew write lifecycle action (create/update/publish/archive) invalidates reference cache, which invalidates dependent scoped snapshots via version mismatch.

## Inventory authority boundary

Runtime inventory state is authoritative in operational table `character_inventory`.

Source-of-truth rules:

- slot placement, stack quantity, and attunement state must be read/written from `character_inventory`;
- socket inventory sync payloads are materialised from `character_inventory` rows;
- cached rule snapshots (`referenceCache` and effective scoped snapshots) are metadata-only for item and weapon rules;
- cached snapshots do not own runtime inventory quantities or equipment slot state.

## Invalidation strategy

Current:

- local process invalidation via `invalidateReferenceCache()`;
- scoped snapshots naturally refresh on next read.

Future multi-node strategy:

- use DB notifications/event bus to fan out invalidation across instances;
- keep versioned keying so stale nodes fail safe on miss/reload.

## Authorisation model

## Reads

- Core reads may be public.
- Scoped reads (`campaignId`) require authenticated campaign membership.
- `characterId` scope cannot be used without `campaignId`.

## Writes

- Character routes require authenticated user.
- Homebrew writes require authenticated campaign member with role in allowed set (`owner`, `dm`).
- Scope validation enforces `ownerCharacterId` belongs to the declared campaign.

## Operational design rules

1. Database is source of truth for all reference and operational entities.
2. In-memory structures are caches or derivations only.
3. Homebrew resolution logic must remain centralised in resolver services.
4. Runtime rule snapshots must be built from database-backed reference rows, not static files.
5. Any new scoped endpoint must include:
   - campaign membership guard
   - deterministic precedence resolution
   - scope-aware cache keying
   - cache invalidation hooks on writes

## Anti-patterns (do not introduce)

- Static TypeScript dictionaries as parallel authority.
- Endpoint-specific ad-hoc precedence logic.
- Scope-less query keys in client cache for scoped data.
- Silent fallback from unauthorised scoped reads to broader scopes.
