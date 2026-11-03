import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";
import "./theme.css";
import "./app-layout.css";

document.documentElement.classList.add("dark");
createRoot(document.getElementById("app")!).render(<App />);
