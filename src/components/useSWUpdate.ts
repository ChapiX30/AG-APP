import { useEffect, useState } from "react";

export function useSWUpdate() {
    const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
    const [showReload, setShowReload] = useState(false);

    useEffect(() => {
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.getRegistration().then((reg) => {
                if (!reg) return;
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
            navigator.serviceWorker.addEventListener("controllerchange", () => {
                window.location.reload();
            });
            setShowReload(false); // oculta el banner mientras actualiza
        }
    };

    return { showReload, reloadPage };
}
