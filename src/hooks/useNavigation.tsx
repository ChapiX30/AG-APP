import { useState, createContext, useContext, ReactNode } from 'react';

type Screen = 'login' | 'menu' | 'consecutivos' | 'magnitude-detail' | 'work-sheet' | 'friday';

interface NavigationContextType {
  currentScreen: Screen;
  selectedMagnitude: string | null;
  currentConsecutive: string | null;
  navigateTo: (screen: Screen, data?: any) => void;
  goBack: () => void;
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

  const navigateTo = (screen: Screen, data?: any) => {
    setScreenStack(prev => [...prev, screen]);
    setCurrentScreen(screen);
    
    if (data?.magnitude) {
      // Ensure we store only the name string, not the entire object
      setSelectedMagnitude(typeof data.magnitude === 'string' ? data.magnitude : data.magnitude.name);
    }
    if (data?.consecutive) {
      setCurrentConsecutive(data.consecutive);
    }
  };

  const goBack = () => {
    if (screenStack.length > 1) {
      const newStack = screenStack.slice(0, -1);
      setScreenStack(newStack);
      setCurrentScreen(newStack[newStack.length - 1]);
    }
  };

  const value = {
    currentScreen,
    selectedMagnitude,
    currentConsecutive,
    navigateTo,
    goBack
  };

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
};