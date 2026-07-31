import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { useRegisterSW } from "virtual:pwa-register/react";

const DISMISS_KEY = "pwa-update-dismissed";
const APPLIED_KEY = "pwa-update-applied";

function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function isPwaSwScript(url: string | undefined): boolean {
  if (!url) return false;
  if (url.includes("firebase-messaging-sw")) return false;
  return (
    url.endsWith("/sw.js") ||
    url.includes("/dev-sw.js") ||
    url.includes("workbox")
  );
}

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

function hasPendingPwaUpdate(reg: ServiceWorkerRegistration | undefined): boolean {
  if (!reg?.waiting || !reg.active) return false;
  return isPwaSwScript(reg.waiting.scriptURL);
}

/** Identifica al worker en espera (URL estable de /sw.js + script comparado por registration). */
function getWaitingFingerprint(reg: ServiceWorkerRegistration): string {
  const w = reg.waiting!;
  // scriptURL suele ser el mismo (/sw.js); usamos también el estado del installing/waiting.
  return `${w.scriptURL}::${w.state}::${reg.scope}`;
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * En APK/Capacitor el service worker PWA suele dejar un worker "waiting"
 * que nunca termina de activarse → el banner sale siempre.
 * Ahí no usamos el prompt; la app ya trae (o carga) su web embebida.
 */
async function unregisterPwaWorkersOnNative(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    regs
      .filter(
        (r) =>
          isPwaSwScript(r.active?.scriptURL) ||
          isPwaSwScript(r.waiting?.scriptURL) ||
          isPwaSwScript(r.installing?.scriptURL),
      )
      .map((r) => r.unregister().catch(() => false)),
  );
}

export function useSWUpdate() {
  const native = isNativeApp();
  const applyingRef = useRef(false);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // En nativo no registramos el ciclo de update del PWA.
    immediate: !native,
    onRegisteredSW(_swUrl, registration) {
      if (native || !registration) return;
      // Una sola revisión suave por pestaña (no spamear update()).
      registration.update().catch(() => {});
    },
    onOfflineReady() {
      setNeedRefresh(false);
    },
  });

  const [showReload, setShowReload] = useState(false);

  const syncBannerState = useCallback(async () => {
    if (native || applyingRef.current) {
      setShowReload(false);
      setNeedRefresh(false);
      return;
    }

    const reg = await getPwaRegistration();
    if (!hasPendingPwaUpdate(reg)) {
      setShowReload(false);
      setNeedRefresh(false);
      return;
    }

    const fp = getWaitingFingerprint(reg!);
    // Ya se aplicó o se descartó este mismo waiting → no molestar de nuevo.
    if (readStorage(APPLIED_KEY) === fp || readStorage(DISMISS_KEY) === fp) {
      setShowReload(false);
      setNeedRefresh(false);
      return;
    }

    setShowReload(true);
  }, [native, setNeedRefresh]);

  useEffect(() => {
    if (!native) return;
    void unregisterPwaWorkersOnNative();
    setShowReload(false);
    setNeedRefresh(false);
  }, [native, setNeedRefresh]);

  useEffect(() => {
    if (native) return;
    void syncBannerState();
  }, [native, needRefresh, syncBannerState]);

  useEffect(() => {
    if (native || !("serviceWorker" in navigator)) return;

    const onControllerChange = () => {
      // Nuevo SW ya controla la página: limpiar aviso.
      setShowReload(false);
      setNeedRefresh(false);
      applyingRef.current = false;
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    let reg: ServiceWorkerRegistration | undefined;
    const onUpdateFound = () => {
      void syncBannerState();
    };

    void getPwaRegistration().then((r) => {
      reg = r;
      r?.addEventListener("updatefound", onUpdateFound);
      // Si el waiting ya estaba al montar
      void syncBannerState();
    });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      reg?.removeEventListener("updatefound", onUpdateFound);
    };
  }, [native, setNeedRefresh, syncBannerState]);

  const reloadPage = useCallback(async () => {
    if (native) return;
    applyingRef.current = true;
    setShowReload(false);

    const reg = await getPwaRegistration();
    if (reg && hasPendingPwaUpdate(reg)) {
      writeStorage(APPLIED_KEY, getWaitingFingerprint(reg));
      removeStorage(DISMISS_KEY);

      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          navigator.serviceWorker.removeEventListener("controllerchange", onChange);
          resolve();
        };
        const onChange = () => finish();
        navigator.serviceWorker.addEventListener("controllerchange", onChange);
        reg.waiting?.postMessage({ type: "SKIP_WAITING" });
        window.setTimeout(finish, 1500);
      });
    }

    try {
      await updateServiceWorker(true);
    } catch {
      window.location.reload();
    }
  }, [native, updateServiceWorker]);

  const dismiss = useCallback(async () => {
    if (native) {
      setShowReload(false);
      setNeedRefresh(false);
      return;
    }
    const reg = await getPwaRegistration();
    if (hasPendingPwaUpdate(reg)) {
      writeStorage(DISMISS_KEY, getWaitingFingerprint(reg!));
    }
    setShowReload(false);
    setNeedRefresh(false);
  }, [native, setNeedRefresh]);

  return {
    showReload: native ? false : showReload,
    reloadPage,
    dismiss,
  };
}
