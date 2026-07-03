export type RestCondition =
  | "short_rest"
  | "long_rest"
  | "long_rest_half"
  | "dawn"
  | "never";

export interface CharacterResource {
  id: string;
  name: string;
  current: number;
  max: number;
  resetCondition: RestCondition;
}
