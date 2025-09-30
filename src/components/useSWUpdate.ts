// src/components/useSWUpdate.ts
import { useEffect, useState } from "react";

// Hook robusto para detectar y activar actualizaciones PWA
export function useSWUpdate() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [showReload, setShowReload] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (!reg) return;
        // 🔵 Detecta si YA hay un SW "waiting" (clave para usuarios que dejaron abierta la app)
        if (reg.waiting) {
          setWaitingWorker(reg.waiting);
          setShowReload(true);
        }
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (
                newWorker.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                setWaitingWorker(newWorker);
                setShowReload(true);
              }
            });
          }
        });
      });
    }
  }, []);

  const reloadPage = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    }
    setShowReload(false); // oculta el banner
  };

  return { showReload, reloadPage };
}
