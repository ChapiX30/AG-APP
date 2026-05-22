import { useCallback, useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

const DISMISS_KEY = "pwa-update-dismissed-script";

/** Workbox PWA registration (not the Firebase messaging SW). */
async function getPwaRegistration(): Promise<ServiceWorkerRegistration | undefined> {
    if (!("serviceWorker" in navigator)) return undefined;
    const regs = await navigator.serviceWorker.getRegistrations();
    return (
        regs.find(
            (r) =>
                r.waiting?.scriptURL.includes("sw.js") ||
                r.waiting?.scriptURL.includes("workbox") ||
                r.active?.scriptURL.includes("sw.js") ||
                r.active?.scriptURL.includes("workbox"),
        ) ?? regs.find((r) => r.waiting) ??
        (await navigator.serviceWorker.getRegistration())
    );
}

export function useSWUpdate() {
    const {
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        immediate: true,
        onRegisteredSW(_swUrl, registration) {
            registration?.update().catch(() => {});
        },
    });

    const [showReload, setShowReload] = useState(false);

    useEffect(() => {
        if (!needRefresh) {
            setShowReload(false);
            return;
        }
        let cancelled = false;
        getPwaRegistration().then((reg) => {
            if (cancelled) return;
            const waitingUrl = reg?.waiting?.scriptURL;
            const dismissed = sessionStorage.getItem(DISMISS_KEY);
            setShowReload(Boolean(waitingUrl) && dismissed !== waitingUrl);
        });
        return () => {
            cancelled = true;
        };
    }, [needRefresh]);

    const reloadPage = useCallback(async () => {
        sessionStorage.removeItem(DISMISS_KEY);
        await updateServiceWorker(true);
    }, [updateServiceWorker]);

    const dismiss = useCallback(async () => {
        const reg = await getPwaRegistration();
        const waitingUrl = reg?.waiting?.scriptURL;
        if (waitingUrl) {
            sessionStorage.setItem(DISMISS_KEY, waitingUrl);
        }
        setNeedRefresh(false);
        setShowReload(false);
    }, [setNeedRefresh]);

    return { showReload, reloadPage, dismiss };
}
