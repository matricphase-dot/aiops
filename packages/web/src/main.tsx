import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { socket } from "./socket"; // Phase 3: opens the telemetry link
import "./index.css";

void socket; // keep the import side-effect-only — main just opens the connection

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
