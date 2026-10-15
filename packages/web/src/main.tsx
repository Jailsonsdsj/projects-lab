import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/app.css";

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root");

// Placeholder until the app shell (D-04).
createRoot(root).render(
  <StrictMode>
    <p>Projects Lab</p>
  </StrictMode>,
);
