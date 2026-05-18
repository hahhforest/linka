import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

export const uiPackageName = "@linka/ui";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing root element for LinkA UI scaffold.");
}

createRoot(rootElement).render(
  <StrictMode>
    <main>LinkA UI scaffold</main>
  </StrictMode>,
);
