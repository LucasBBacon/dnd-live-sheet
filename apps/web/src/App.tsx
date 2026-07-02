import { CharacterCreationWizard } from "./components/wizard/CharacterCreationWizard";
import { Navigate, Route, Routes } from "react-router-dom";
import { LiveSheetRoute } from "./pages/LiveSheetRoute";
import { DevSheetRoute } from "./pages/DevSheetRoute";

const App = () => {
  return (
    <Routes>
      {/* Flow 1: new character initialization */}
      <Route path="/" element={<CharacterCreationWizard />} />

      {/* Flow 2: prod runtime env */}
      <Route path="/character/:characterId" element={<LiveSheetRoute />} />

      {/* Flow 3: internal dev testing */}
      <Route path="/dev/sheet" element={<DevSheetRoute />} />

      {/* fallback routing */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
