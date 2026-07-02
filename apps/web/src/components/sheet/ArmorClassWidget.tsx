import { useDerivedStats } from "../../hooks/useCharacterStats";

export const ArmorClassWidget = () => {
  const { armorClass } = useDerivedStats();

  // TODO: STYLES!!! Maybe tailwind?
  return (
    <div>
      <span>Armor Class</span>
      <span>{armorClass.total}</span>

      {/* Hover tooltip */}
      <div>
        <span>Breakdown</span>
        {armorClass.breakdown.map((item, idx) => (
          <div key={idx}>
            <span>{item.name}</span>
            <span>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
