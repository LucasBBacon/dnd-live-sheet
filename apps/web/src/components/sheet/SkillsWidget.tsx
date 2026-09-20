import { useCheckRoll } from "../../hooks/useCheckRoll";
import { useDerivedStats } from "../../hooks/useCharacterStats";
import { SKILL_MAP } from "@project/shared";

const signed = (value: number): string =>
  value >= 0 ? `+${value}` : `${value}`;

/**
 * The skill list, with each modifier doubling as the roll button.
 *
 * Extracted from DashboardLayout when skills stopped being read-only: the
 * layout had no business owning roll behaviour, and a focused component is
 * what let the rolling be tested at all.
 */
export const SkillsWidget = () => {
  const { skills } = useDerivedStats();
  const rollCheck = useCheckRoll();

  return (
    <div className="bg-white border-2 border-gray-300 p-4 rounded flex-grow overflow-y-auto">
      <h2 className="font-bold border-b-2 border-gray-800 pb-1 mb-2 uppercase">
        Skills
      </h2>

      <ul className="text-xs flex-col gap-1">
        {skills.map((skill) => (
          <li
            key={skill.id}
            data-proficient={skill.isProficient ? "true" : "false"}
            className="flex items-center justify-between border-b border-gray-100 py-1"
          >
            <span
              className={skill.isProficient ? "font-bold" : "text-gray-600"}
            >
              {skill.name}
            </span>

            <button
              type="button"
              onClick={() =>
                void rollCheck({
                  label: skill.name,
                  modifier: skill.totalModifier,
                  target: "ABILITY_CHECK",
                  ability: SKILL_MAP[skill.id]?.ability as "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA",
                })
              }
              className="rounded border border-gray-300 px-1.5 py-0.5 font-mono hover:bg-gray-100"
            >
              {signed(skill.totalModifier)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
