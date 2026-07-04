export type RestCondition =
  | "short_rest"
  | "long_rest"
  | "long_rest_half"
  | "dawn"
  | "never";

export interface OperationalResource {
  id: string;
  current: number;
}

export interface ResourceDefinition {
  id: string;
  name: string;
  resetCondition: RestCondition;
  /**
   * Pure function to derive the maximum pool based on current character state.
   */
  getMax: (totalLevel: number, classLevels: Record<string, number>) => number;
}

export interface HydratedResource extends OperationalResource {
  name: string;
  max: number;
  resetCondition: string;
  isDepleted: boolean;
}
