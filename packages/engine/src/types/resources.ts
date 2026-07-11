import type {
  ResourceRule as SharedResourceRule,
  RestCondition as SharedRestCondition,
} from "@project/shared";

// #region Resource Types

export type RestCondition = SharedRestCondition;

export interface OperationalResource {
  id: string;
  current: number;
}

export type ResourceDefinition = SharedResourceRule;

export interface HydratedResource extends OperationalResource {
  name: string;
  max: number;
  resetCondition: string;
  isDepleted: boolean;
}

// #endregion
