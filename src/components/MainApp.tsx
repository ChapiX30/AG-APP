import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { LoginScreen } from './LoginScreen';
import { MainMenu } from './MainMenu';
import { ConsecutivosScreen } from './ConsecutivosScreen';
import { MagnitudeDetailScreen } from './MagnitudeDetailScreen';
import { WorkSheetScreen } from './WorkSheetScreen';
import  FridayScreen  from './FridayScreen';
import FridayServiciosScreen from './FridayServiciosScreen';
import { DriveScreen } from './DriveScreen';
import SplashScreen from "./SplashScreen";
import ProgramaCalibracionScreen from './ProgramaCalibracionScreen';
import HojaDeServicioScreen from './HojaDeServicioScreen';
import { EmpresasScreen } from './EmpresasScreen';
import { CalendarScreen }   from './CalendarScreen';
import { RegisterScreen } from './RegisterScreen'; // 👈 AGREGA ESTA LÍNEA

import { AnimatePresence, motion } from 'framer-motion'; // 👈 AGREGA ESTO

export const MainApp: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { currentScreen, navigateTo } = useNavigation();

  const [loading, setLoading] = useState(true); // 👈 ASEGÚRATE DE TENER navigate

// Muestra el SplashScreen durante 2.2 segundos
  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 3200);
    return () => clearTimeout(timeout);
  }, []);

  // Muestra pantalla de carga al iniciar
  if (loading) {
    return <SplashScreen />;
  }

  if (!isAuthenticated) {
    // Aquí pasamos la función para ir a 'register'
    return (
      <div className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-100 to-purple-100">
        <AnimatePresence mode="wait">
     {currentScreen === 'register' ? (
        <motion.div
              key="register"
              initial={{ x: 500, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 500, opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
              className="w-full max-w-md"
            >
        <RegisterScreen onNavigateToLogin={() => navigateTo('login')} />
          </motion.div>
      ) : (
        <motion.div
              key="login"
              initial={{ x: -500, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -500, opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
              className="w-full max-w-xl sm:max-w-2xl md:max-w-3xl"
            >
        <LoginScreen onNavigateToRegister={() => navigateTo('register')} />
     </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  switch (currentScreen) {
    case 'menu':
      return <MainMenu />;
    case 'consecutivos':
      return <ConsecutivosScreen />;
    case 'magnitude-detail':
      return <MagnitudeDetailScreen />;
    case 'work-sheet':
      return <WorkSheetScreen />;
    case 'empresas':
      return <EmpresasScreen />;
    case 'calendario':
      return <CalendarScreen />; 
    case 'hoja-servicio':
      return <HojaDeServicioScreen />;
    case 'drive':
      return <DriveScreen />;
    case 'programa-calibracion':
      return <ProgramaCalibracionScreen />;  
    case 'friday-servicios':
      return <FridayServiciosScreen />;  
    case 'friday':
      return <FridayScreen />;
    default:
      return <MainMenu />;
  }
};
