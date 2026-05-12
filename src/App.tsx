import { BrowserRouter } from "react-router-dom";
import Router from "./router";
import "./App.css";
import { useNetworkStatus } from "./hooks/useNetworkStatus";
import OfflinePopup from "./components/OfflinePopup";

function App() {
  const isOnline = useNetworkStatus();

  return (
    <BrowserRouter>
      {!isOnline && <OfflinePopup />}
      <main className="container">
        <Router />
      </main>
    </BrowserRouter>
  );
}

export default App;