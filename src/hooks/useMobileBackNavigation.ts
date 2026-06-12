import { useEffect, useRef } from 'react';
import { useNavigation } from './useNavigation';

const EDGE_WIDTH_PX = 40;
const SWIPE_THRESHOLD_PX = 72;
const MAX_VERTICAL_DRIFT_PX = 64;

function isMobileLike(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(pointer: coarse)').matches) return true;
  return window.innerWidth <= 1024;
}

function shouldIgnoreGesture(event?: TouchEvent): boolean {
  const el = document.activeElement;
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    return true;
  }
  if (el?.getAttribute('contenteditable') === 'true') return true;

  const target = event?.target;
  if (target instanceof Element) {
    if (target.closest('.ag-pdf-viewer-scroll, [aria-modal="true"], dialog[open], [data-ag-no-swipe-back]')) {
      return true;
    }
  } else if (document.querySelector('[aria-modal="true"], dialog[open]')) {
    return true;
  }

  return false;
}

/**
 * Intercepta el gesto/botón "atrás" del sistema en móvil:
 * - Swipe desde el borde izquierdo → goBack()
 * - popstate (hardware back / gesto del navegador) → goBack() si hay historial interno
 */
export function useMobileBackNavigation(enabled = true): void {
  const { goBack, canGoBack } = useNavigation();
  const trapReady = useRef(false);
  const canGoBackRef = useRef(canGoBack);
  const goBackRef = useRef(goBack);

  canGoBackRef.current = canGoBack;
  goBackRef.current = goBack;

  useEffect(() => {
    if (!enabled || !isMobileLike()) return;

    if (!trapReady.current) {
      window.history.pushState({ agAppTrap: true }, '');
      trapReady.current = true;
    }

    const onPopState = () => {
      if (canGoBackRef.current) {
        goBackRef.current();
        window.history.pushState({ agAppTrap: true }, '');
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !isMobileLike()) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onTouchStart = (e: TouchEvent) => {
      if (shouldIgnoreGesture(e)) return;
      const touch = e.touches[0];
      if (!touch || touch.clientX > EDGE_WIDTH_PX) return;
      startX = touch.clientX;
      startY = touch.clientY;
      tracking = true;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      if (!canGoBackRef.current) return;

      const touch = e.changedTouches[0];
      if (!touch) return;

      const dx = touch.clientX - startX;
      const dy = Math.abs(touch.clientY - startY);
      if (dx >= SWIPE_THRESHOLD_PX && dy <= MAX_VERTICAL_DRIFT_PX) {
        goBackRef.current();
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [enabled]);
}
