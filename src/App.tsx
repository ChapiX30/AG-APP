import React from 'react';
import { AuthProvider } from './hooks/useAuth';
import { NavigationProvider } from './hooks/useNavigation';
import { MainApp } from './components/MainApp';
import UpdateBanner from './components/UpdateBanner';


function App() {
  return (
    <AuthProvider>
      <NavigationProvider>
        <MainApp />
        <UpdateBanner />
      </NavigationProvider>
    </AuthProvider>
  );
}

export default App;