import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { routes } from "./app";
import "./styles/app.css";

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root");

const router = createBrowserRouter(routes);

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
