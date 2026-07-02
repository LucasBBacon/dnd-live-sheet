import { useCombat } from "../../hooks/useCombat";

export const CombatWidget = () => {
  const { attacks } = useCombat();

  // TODO: STYLES!!
  if (attacks.length === 0) {
    return <div>No weapon equipped in active hand slots.</div>;
  }

  return (
    <div>
      {attacks.map((attack, idx) => (
        <div key={idx}>
          {/* WEAPON NAME AND SLOT */}
          <div>
            <span>{attack.name}</span>
            <span>{attack.slot.replace("_", " ")}</span>
          </div>

          {/* ATTACK BONUS TO-HIT */}
          <div>
            <span>ATK</span>
            <span>
              {attack.attackBonus > 0 ? "+" : ""}
              {attack.attackBonus}
            </span>

            {/* TOOLTIP */}
            <div>
              <span>Attack Roll</span>
              {attack.breakdown.attack.map((step: string, i: number) => (
                <span key={i}>{step}</span>
              ))}
            </div>
          </div>

          {/* DAMAGE EXPRESSION */}
          <div>
            <span>DMG</span>
            <span>{attack.damageExpression}</span>

            {/* TOOLTIP */}
            <div>
              <span>
                {attack.breakdown.damage.map((step: string, i: number) => (
                  <span key={i}>{step}</span>
                ))}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
