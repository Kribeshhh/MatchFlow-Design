import React from "react";
import ReactDOM from "react-dom/client";
import Router from "./mvp/PortalBootstrap";
import "./styles.css";
import "./hero.css";
import "./mvp/mvp.css";
import "./mvp/design-system.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Router />
  </React.StrictMode>,
);
