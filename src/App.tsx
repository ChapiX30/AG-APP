import React, { useEffect, useState } from 'react';
import { AuthProvider } from './hooks/useAuth';
import { NavigationProvider } from './hooks/useNavigation';
import { AppUpdatesProvider } from './hooks/useAppUpdates';
import { AppDialogProvider } from './hooks/useAppDialog';
import { MainApp } from './components/MainApp';
import UpdateBanner from './components/UpdateBanner';
import { SplashScreen } from './components/SplashScreen';

/**
 * Splash de arranque: secuencia ~3.2s (logo 3D + barra + flash) antes de entrar.
 * `bootReady` marca el primer frame tras montar providers; el splash no sale antes.
 */
function AppContent() {
  const [showSplash, setShowSplash] = useState(true);
  const [bootReady, setBootReady] = useState(false);

  useEffect(() => {
    setBootReady(true);
  }, []);

  return (
    <>
      <div
        className={showSplash ? 'fixed inset-0 opacity-0 pointer-events-none overflow-hidden' : undefined}
        aria-hidden={showSplash}
      >
        <MainApp />
        <UpdateBanner />
      </div>
      {showSplash && (
        <SplashScreen
          ready={bootReady}
          onComplete={() => setShowSplash(false)}
        />
      )}
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppDialogProvider>
        <AppUpdatesProvider>
          <NavigationProvider>
            <AppContent />
          </NavigationProvider>
        </AppUpdatesProvider>
      </AppDialogProvider>
    </AuthProvider>
  );
}

export default App;
