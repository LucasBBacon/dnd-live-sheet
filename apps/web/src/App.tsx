import { Navigate, Route, Routes } from "react-router-dom";
import { ItemWidget } from "./components/sheet/ItemWidget";
import { TraitWidget } from "./components/sheet/TraitWidget";
import { CharacterCreationWizard } from "./components/wizard/CharacterCreationWizard";
import { RollInterceptor } from "./components/sheet/modals/RollInterceptor";
import { DevSheetRoute } from "./pages/DevSheetRoute";
import { LiveSheetRoute } from "./pages/LiveSheetRoute";

const App = () => {
  return (
    <>
      <Routes>
        {/* Flow 1: new character initialization */}
        <Route path="/" element={<CharacterCreationWizard />} />

        {/* Flow 2: prod runtime env */}
        <Route path="/character/:characterId" element={<LiveSheetRoute />} />

        {/* Flow 3: internal dev testing */}
        <Route path="/dev/sheet" element={<DevSheetRoute />} />
        <Route path="/dev/items" element={<ItemWidget />} />
        <Route path="/dev/traits" element={<TraitWidget />} />

        {/* fallback routing */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* globally mounted so any workflow can request an intercepted roll */}
      <RollInterceptor />
    </>
  );
};

export default App;
