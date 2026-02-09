import { jsx as _jsx } from "react/jsx-runtime";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
// Register service worker for PWA capabilities
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").then((registration) => {
        console.log("[App] Service worker registered");
        // Check for updates periodically
        setInterval(() => {
            registration.update();
        }, 60000); // Check every minute
        // Listen for new service worker
        registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;
            if (!newWorker)
                return;
            newWorker.addEventListener("statechange", () => {
                if (newWorker.state === "installed" &&
                    navigator.serviceWorker.controller) {
                    // New service worker is ready, show update prompt if needed
                    console.log("[App] Service worker update available");
                    // Could trigger an update notification here
                }
            });
        });
    }).catch((err) => {
        console.log("[App] Service worker registration failed:", err);
    });
}
ReactDOM.createRoot(document.getElementById("root")).render(_jsx(React.StrictMode, { children: _jsx(App, {}) }));
