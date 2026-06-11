import { useState, createContext, useContext, ReactNode, useMemo, useCallback } from 'react';

export type Screen = string;

interface NavigationContextType {
  currentScreen: Screen;
  selectedMagnitude: string | null;
  currentConsecutive: string | null;
  navigateTo: (screen: Screen, data?: Record<string, unknown>) => void;
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

  const navigateTo = useCallback((screen: Screen, data?: Record<string, unknown>) => {
    setScreenStack(prev => [...prev, screen]);
    setCurrentScreen(screen);

    if (data?.magnitude) {
      setSelectedMagnitude(typeof data.magnitude === 'string' ? data.magnitude : (data.magnitude as { name?: string }).name ?? null);
    }
    if (data?.consecutive) {
      setCurrentConsecutive(String(data.consecutive));
    }
  }, []);

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

  const value = useMemo(
    () => ({
      currentScreen,
      selectedMagnitude,
      currentConsecutive,
      navigateTo,
      goBack,
      clearWorksheetSession,
    }),
    [currentScreen, selectedMagnitude, currentConsecutive, navigateTo, goBack, clearWorksheetSession],
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
};
