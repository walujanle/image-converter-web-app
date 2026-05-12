import { useCallback, useEffect, useRef, useState } from "react";

export function usePWA(): {
  isOffline: boolean;
  needRefresh: boolean;
  updateServiceWorker: () => Promise<void>;
  closeUpdatePrompt: () => void;
} {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [needRefresh, setNeedRefresh] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/service-worker.js?v=3", { scope: "/" })
      .then((registration) => {
        registrationRef.current = registration;

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setNeedRefresh(true);
            }
          });
        });
      })
      .catch((error: Error) => {
        console.error("Service Worker registration failed:", error);
      });
  }, []);

  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const updateServiceWorker = useCallback(async () => {
    const registration = registrationRef.current;
    if (!registration?.waiting) return;
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
    window.location.reload();
  }, []);

  const closeUpdatePrompt = useCallback(() => {
    setNeedRefresh(false);
  }, []);

  return {
    isOffline,
    needRefresh,
    updateServiceWorker,
    closeUpdatePrompt,
  };
}
