// The wizard has no UI yet for picking spells at level-up (#79). Rather than
// silently letting a player skip past a spell choice the server still
// requires, this step names the gap and blocks the wizard from completing -
// isStepComplete's "spell_selection" case always returns false to match.
export const SpellChoiceUnsupportedStep = () => (
  <div className="text-red-700 border-2 border-red-300 bg-red-50 rounded p-4 font-bold text-center">
    Spell choices are not supported by the wizard yet (#79). This level cannot be completed here.
  </div>
);
