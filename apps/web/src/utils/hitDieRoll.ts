export const buildHitDieHealingExpression = (
  sides: number,
  conModifier: number,
): string => {
  if (conModifier === 0) return `1d${sides}`;
  const sign = conModifier > 0 ? "+" : "";
  return `1d${sides}${sign}${conModifier}`;
};
