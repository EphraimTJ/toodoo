import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { WindowRoot } from "./windows/WindowRoot";
import "./index.css";

const queryClient = new QueryClient();

// Pop-out/mini windows load the same SPA with a `?win=<kind>` query.
const params = new URLSearchParams(window.location.search);
const win = params.get("win");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {win ? <WindowRoot win={win} id={params.get("id")} /> : <App />}
    </QueryClientProvider>
  </React.StrictMode>,
);
