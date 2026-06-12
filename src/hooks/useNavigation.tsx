import { useState, createContext, useContext, ReactNode, useMemo, useCallback } from 'react';

export type Screen = string;

const SCREEN_ALIASES: Record<string, Screen> = {
  mainmenu: 'menu',
  servicios: 'friday-servicios',
};

const resolveScreen = (screen: Screen): Screen => SCREEN_ALIASES[screen] ?? screen;

interface NavigationContextType {
  currentScreen: Screen;
  selectedMagnitude: string | null;
  currentConsecutive: string | null;
  canGoBack: boolean;
  navigateTo: (screen: Screen, data?: Record<string, unknown>) => void;
  /** Reemplaza el stack (p. ej. tras login o logout). */
  resetTo: (screen: Screen, data?: Record<string, unknown>) => void;
  goBack: () => void;
  /** Limpia consecutivo activo al salir de hoja de trabajo */
  clearWorksheetSession: () => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (context === undefined) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
};

export const NavigationProvider = ({ children }: { children: ReactNode }) => {
  const [currentScreen, setCurrentScreen] = useState<Screen>('login');
  const [selectedMagnitude, setSelectedMagnitude] = useState<string | null>(null);
  const [currentConsecutive, setCurrentConsecutive] = useState<string | null>(null);
  const [screenStack, setScreenStack] = useState<Screen[]>(['login']);

  const applyNavigationData = useCallback((data?: Record<string, unknown>) => {
    if (data?.magnitude) {
      setSelectedMagnitude(
        typeof data.magnitude === 'string'
          ? data.magnitude
          : (data.magnitude as { name?: string }).name ?? null,
      );
    }
    if (data?.consecutive) {
      setCurrentConsecutive(String(data.consecutive));
    }
  }, []);

  const navigateTo = useCallback((screen: Screen, data?: Record<string, unknown>) => {
    const resolved = resolveScreen(screen);
    setScreenStack(prev => [...prev, resolved]);
    setCurrentScreen(resolved);
    applyNavigationData(data);
  }, [applyNavigationData]);

  const resetTo = useCallback((screen: Screen, data?: Record<string, unknown>) => {
    const resolved = resolveScreen(screen);
    setScreenStack([resolved]);
    setCurrentScreen(resolved);
    applyNavigationData(data);
  }, [applyNavigationData]);

  const clearWorksheetSession = useCallback(() => {
    setCurrentConsecutive(null);
  }, []);

  const goBack = useCallback(() => {
    setScreenStack(prev => {
      if (prev.length <= 1) return prev;
      const leaving = prev[prev.length - 1];
      const newStack = prev.slice(0, -1);
      setCurrentScreen(newStack[newStack.length - 1]);
      if (leaving === "work-sheet") {
        setCurrentConsecutive(null);
      }
      return newStack;
    });
  }, []);

  const canGoBack = screenStack.length > 1;

  const value = useMemo(
    () => ({
      currentScreen,
      selectedMagnitude,
      currentConsecutive,
      canGoBack,
      navigateTo,
      resetTo,
      goBack,
      clearWorksheetSession,
    }),
    [currentScreen, selectedMagnitude, currentConsecutive, canGoBack, navigateTo, resetTo, goBack, clearWorksheetSession],
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
};
