import React, { useEffect, useState } from 'react';

/** Set to false to disable screen fade without removing the wrapper. */
export const ENABLE_SCREEN_FADE = true;

function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setPrefersReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return prefersReduced;
}

interface ScreenTransitionProps {
  screenKey: string;
  children: React.ReactNode;
}

/**
 * Opacity fade-in when screenKey changes. Fade-in only (no fade-out) to avoid
 * flicker with lazy/Suspense. Skeleton fallback renders outside this wrapper.
 */
export const ScreenTransition: React.FC<ScreenTransitionProps> = ({ screenKey, children }) => {
  const prefersReducedMotion = usePrefersReducedMotion();
  const fadeActive = ENABLE_SCREEN_FADE && !prefersReducedMotion;
  const [visible, setVisible] = useState(!fadeActive);

  useEffect(() => {
    if (!fadeActive) {
      setVisible(true);
      return;
    }

    setVisible(false);
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
    return () => cancelAnimationFrame(raf);
  }, [screenKey, fadeActive]);

  return (
    <div
      className={
        fadeActive
          ? 'flex h-full min-h-0 w-full flex-1 flex-col transition-opacity duration-150 ease-out motion-reduce:transition-none'
          : 'flex h-full min-h-0 w-full flex-1 flex-col'
      }
      style={fadeActive ? { opacity: visible ? 1 : 0 } : undefined}
    >
      {children}
    </div>
  );
};
