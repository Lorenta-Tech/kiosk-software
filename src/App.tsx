import { BrowserRouter } from "react-router-dom";
import Router from "./router";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <main className="container">
        <Router />
      </main>
    </BrowserRouter>
  );
}

export default App;