import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface UseInstallPromptReturn {
  canInstall: boolean;
  isInstalled: boolean;
  prompt: () => Promise<void>;
  dismissPrompt: () => void;
}

export function useInstallPrompt(): UseInstallPromptReturn {
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

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

  const handleBeforeInstallPrompt = (e: Event) => {
    e.preventDefault();
    const event = e as BeforeInstallPromptEvent;
    setDeferredPrompt(event);
    setCanInstall(true);
  };

  const handleAppInstalled = () => {
    setIsInstalled(true);
    setCanInstall(false);
    setDeferredPrompt(null);
  };

  const prompt = async () => {
    if (!deferredPrompt) return;

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
