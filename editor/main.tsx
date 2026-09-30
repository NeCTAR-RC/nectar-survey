import { I18nProvider } from "@ardc-ui/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./editor.scss";

const root = document.getElementById("root");
if (!root) throw new Error("The editor page has no #root element.");

createRoot(root).render(
  <StrictMode>
    <I18nProvider locale="en-AU">
      <App />
    </I18nProvider>
  </StrictMode>,
);
