import React, { useEffect, useState } from 'react';
import { AuthProvider } from './hooks/useAuth';
import { NavigationProvider } from './hooks/useNavigation';
import { AppUpdatesProvider } from './hooks/useAppUpdates';
import { MainApp } from './components/MainApp';
import UpdateBanner from './components/UpdateBanner';
import { SplashScreen } from './components/SplashScreen';

/**
 * Splash de arranque: no bloquea auth (useAuth sin loading).
 * `bootReady` marca el primer frame tras montar providers; el splash sale en ~450ms + fade.
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
      <AppUpdatesProvider>
        <NavigationProvider>
          <AppContent />
        </NavigationProvider>
      </AppUpdatesProvider>
    </AuthProvider>
  );
}

export default App;
