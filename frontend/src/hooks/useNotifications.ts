import { useCallback } from "react";

export interface NotificationOptions {
  title: string;
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  requireInteraction?: boolean;
  actions?: NotificationAction[];
}

export interface NotificationAction {
  action: string;
  title: string;
  icon?: string;
}

export function useNotifications() {
  const isSupported = useCallback(() => {
    return "Notification" in window;
  }, []);

  const requestPermission = useCallback(async (): Promise<NotificationPermission | null> => {
    if (!isSupported()) return null;

    if (Notification.permission === "granted") {
      return "granted";
    }

    if (Notification.permission !== "denied") {
      const permission = await Notification.requestPermission();
      return permission;
    }

    return null;
  }, [isSupported]);

  const sendNotification = useCallback(
    async (options: NotificationOptions): Promise<Notification | null> => {
      if (!isSupported()) return null;

      const permission = await requestPermission();
      if (permission !== "granted") return null;

      // Check if service worker is available for advanced features
      if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        try {
          navigator.serviceWorker.controller.postMessage({
            type: "SHOW_NOTIFICATION",
            options,
          });
          return null; // Service worker will handle notification
        } catch (err) {
          console.error("Failed to send notification via service worker:", err);
        }
      }

      // Fallback to regular notification
      const notification = new Notification(options.title, {
        body: options.body,
        icon: options.icon || "/icon-192.png",
        badge: options.badge || "/icon-192.png",
        tag: options.tag,
        requireInteraction: options.requireInteraction,
      });

      return notification;
    },
    [isSupported, requestPermission]
  );

  const askPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported()) return false;
    const permission = await requestPermission();
    return permission === "granted";
  }, [isSupported, requestPermission]);

  const hasPermission = useCallback((): boolean => {
    if (!isSupported()) return false;
    return Notification.permission === "granted";
  }, [isSupported]);

  return {
    isSupported: isSupported(),
    hasPermission: hasPermission(),
    requestPermission,
    sendNotification,
    askPermission,
  };
}
