export const buildHitDieHealingExpression = (
  sides: number,
  conModifier: number,
): string => {
  if (conModifier === 0) return `1d${sides}`;
  return `1d${sides}${conModifier > 0 ? "+" : ""}${conModifier}`;
};
