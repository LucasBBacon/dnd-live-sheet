export type RestCondition = "short_rest" | "long_rest" | "dawn" | "never";

export interface CharacterResource {
  id: string;
  name: string;
  current: number;
  max: number;
  restCondition: RestCondition;
}
