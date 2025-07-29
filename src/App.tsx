import React from 'react';
import { AuthProvider } from './hooks/useAuth';
import { NavigationProvider } from './hooks/useNavigation';
import { MainApp } from './components/MainApp';


function App() {
  return (
    <AuthProvider>
      <NavigationProvider>
        <MainApp />
      </NavigationProvider>
    </AuthProvider>
  );
}

export default App;