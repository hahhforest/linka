import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App.js";
import "./styles/main.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing root element for LinkA UI.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
