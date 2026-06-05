import { useCallback, useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

const DISMISS_KEY = "pwa-update-dismissed";
const UPDATE_CHECK_KEY = "pwa-update-checked";

function isPwaSwScript(url: string | undefined): boolean {
    if (!url) return false;
    if (url.includes("firebase-messaging-sw")) return false;
    return (
        url.endsWith("/sw.js") ||
        url.includes("/dev-sw.js") ||
        url.includes("workbox")
    );
}

/** Workbox PWA registration (not the Firebase messaging SW). */
async function getPwaRegistration(): Promise<ServiceWorkerRegistration | undefined> {
    if (!("serviceWorker" in navigator)) return undefined;
    const regs = await navigator.serviceWorker.getRegistrations();
    return regs.find(
        (r) =>
            isPwaSwScript(r.active?.scriptURL) ||
            isPwaSwScript(r.waiting?.scriptURL) ||
            isPwaSwScript(r.installing?.scriptURL),
    );
}

/** New PWA worker waiting while an older one is still active. */
function hasPendingPwaUpdate(reg: ServiceWorkerRegistration | undefined): boolean {
    if (!reg?.waiting || !reg.active) return false;
    return isPwaSwScript(reg.waiting.scriptURL);
}

function getWaitingId(reg: ServiceWorkerRegistration): string {
    const waiting = reg.waiting!;
    return `${waiting.scriptURL}@${waiting.state}`;
}

function getDismissedWaitingId(): string | null {
    try {
        return localStorage.getItem(DISMISS_KEY);
    } catch {
        return null;
    }
}

async function shouldShowUpdateBanner(): Promise<boolean> {
    const reg = await getPwaRegistration();
    if (!hasPendingPwaUpdate(reg)) return false;
    return getDismissedWaitingId() !== getWaitingId(reg!);
}

export function useSWUpdate() {
    const {
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        immediate: true,
        onRegisteredSW(_swUrl, registration) {
            if (!registration || sessionStorage.getItem(UPDATE_CHECK_KEY)) return;
            sessionStorage.setItem(UPDATE_CHECK_KEY, "1");
            registration.update().catch(() => {});
        },
    });

    const [showReload, setShowReload] = useState(false);

    const syncBannerState = useCallback(async () => {
        const show = await shouldShowUpdateBanner();
        setShowReload(show);
        if (!show) setNeedRefresh(false);
    }, [setNeedRefresh]);

    useEffect(() => {
        void syncBannerState();
    }, [needRefresh, syncBannerState]);

    useEffect(() => {
        if (!("serviceWorker" in navigator)) return;

        const onControllerChange = () => {
            try {
                localStorage.removeItem(DISMISS_KEY);
            } catch {
                /* ignore */
            }
            setShowReload(false);
            setNeedRefresh(false);
        };

        navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

        const onUpdateFound = () => {
            void syncBannerState();
        };

        let reg: ServiceWorkerRegistration | undefined;
        void getPwaRegistration().then((r) => {
            reg = r;
            r?.addEventListener("updatefound", onUpdateFound);
        });

        return () => {
            navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
            reg?.removeEventListener("updatefound", onUpdateFound);
        };
    }, [setNeedRefresh, syncBannerState]);

    const reloadPage = useCallback(async () => {
        try {
            localStorage.removeItem(DISMISS_KEY);
        } catch {
            /* ignore */
        }

        const reg = await getPwaRegistration();
        reg?.waiting?.postMessage({ type: "SKIP_WAITING" });

        await updateServiceWorker(true);
    }, [updateServiceWorker]);

    const dismiss = useCallback(async () => {
        const reg = await getPwaRegistration();
        if (hasPendingPwaUpdate(reg)) {
            try {
                localStorage.setItem(DISMISS_KEY, getWaitingId(reg!));
            } catch {
                /* ignore */
            }
        }
        setShowReload(false);
        setNeedRefresh(false);
    }, [setNeedRefresh]);

    return { showReload, reloadPage, dismiss };
}
