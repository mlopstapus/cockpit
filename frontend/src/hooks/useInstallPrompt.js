import { useEffect, useState } from "react";
export function useInstallPrompt() {
    const [canInstall, setCanInstall] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    useEffect(() => {
        // Check if already installed
        const checkIfInstalled = () => {
            if (window.matchMedia("(display-mode: standalone)").matches) {
                setIsInstalled(true);
                setCanInstall(false);
            }
        };
        checkIfInstalled();
        window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
        window.addEventListener("appinstalled", handleAppInstalled);
        return () => {
            window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
            window.removeEventListener("appinstalled", handleAppInstalled);
        };
    }, []);
    const handleBeforeInstallPrompt = (e) => {
        e.preventDefault();
        const event = e;
        setDeferredPrompt(event);
        setCanInstall(true);
    };
    const handleAppInstalled = () => {
        setIsInstalled(true);
        setCanInstall(false);
        setDeferredPrompt(null);
    };
    const prompt = async () => {
        if (!deferredPrompt)
            return;
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") {
            setIsInstalled(true);
            setCanInstall(false);
        }
        setDeferredPrompt(null);
    };
    const dismissPrompt = () => {
        setCanInstall(false);
    };
    return {
        canInstall,
        isInstalled,
        prompt,
        dismissPrompt,
    };
}
