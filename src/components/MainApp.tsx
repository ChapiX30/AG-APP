import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { AnimatePresence, motion } from 'framer-motion';

// Screens "ligeras" (login, menu, consecutivos, magnitude-detail)
import { LoginScreen } from './LoginScreen';
import { MainMenu } from './MainMenu';
import { ConsecutivosScreen } from './ConsecutivosScreen';
import { MagnitudeDetailScreen } from './MagnitudeDetailScreen';
import SplashScreen from "./SplashScreen";

// Screens GRANDES en lazy loading
const WorkSheetScreen = lazy(() => import('./WorkSheetScreen'));
const FridayScreen = lazy(() => import('./FridayScreen'));
const FridayServiciosScreen = lazy(() => import('./FridayServiciosScreen'));
const DriveScreen = lazy(() => import('./DriveScreen'));
const ProgramaCalibracionScreen = lazy(() => import('./ProgramaCalibracionScreen'));
const HojaDeServicioScreen = lazy(() => import('./HojaDeServicioScreen'));
const CalibrationManager = lazy(() => import('./CalibrationManager'));
const EmpresasScreen = lazy(() => import('./EmpresasScreen'));
const NormasScreen = lazy(() => import('./NormasScreen'));
const TablerosScreen = lazy(() => import('./TablerosScreen'));
const CalibrationStatsScreen = lazy(() => import('./CalibrationStatsScreen'));
const InventoryProScreen = lazy(() => import('./InventoryProScreen'));
const CalendarScreen = lazy(() => import('./CalendarScreen'));
const RegisterScreen = lazy(() => import('./RegisterScreen'));

// Loader visual PRO
const Loader = () => (
  <div className="w-full h-screen flex flex-col items-center justify-center bg-white/80 z-50 fixed top-0 left-0">
    <svg className="animate-spin h-10 w-10 text-blue-700" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
    <span className="mt-4 text-blue-700 text-xl font-semibold">Cargando módulo...</span>
  </div>
);

export const MainApp: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const { currentScreen, navigateTo } = useNavigation();

  const [loading, setLoading] = useState(true);

  // Notificaciones push
  usePushNotifications(
    user?.uid || user?.id || localStorage.getItem('usuario_id') || '',
    user?.email || localStorage.getItem('usuario.email') || ''
  );

  // SplashScreen de arranque
  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 3200);
    return () => clearTimeout(timeout);
  }, []);

  if (loading) {
    return <SplashScreen />;
  }

  if (!isAuthenticated) {
    // Pantalla de Login/Register con animaciones
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
              <Suspense fallback={<Loader />}>
                <RegisterScreen onNavigateToLogin={() => navigateTo('login')} />
              </Suspense>
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

  // Screens autenticadas
  switch (currentScreen) {
    case 'menu':
      return <MainMenu />;
    case 'consecutivos':
      return <ConsecutivosScreen />;
    case 'magnitude-detail':
      return <MagnitudeDetailScreen />;
    case 'work-sheet':
      return (
        <Suspense fallback={<Loader />}>
          <WorkSheetScreen />
        </Suspense>
      );
    case 'empresas':
      return (
        <Suspense fallback={<Loader />}>
          <EmpresasScreen />
        </Suspense>
      );
    case 'calendario':
      return (
        <Suspense fallback={<Loader />}>
          <CalendarScreen />
        </Suspense>
      );
    case 'hoja-servicio':
      return (
        <Suspense fallback={<Loader />}>
          <HojaDeServicioScreen />
        </Suspense>
      );
    case 'calibration-manager':
      return (
        <Suspense fallback={<Loader />}>
          <CalibrationManager />
        </Suspense>
      );
    case 'drive':
      return (
        <Suspense fallback={<Loader />}>
          <DriveScreen />
        </Suspense>
      );
    case 'tableros':
      return (
        <Suspense fallback={<Loader />}>
          <TablerosScreen />
        </Suspense>
      );
    case 'calibration-stats':
      if (
        ((user?.puesto ?? "").trim().toLowerCase() === "administrativo") ||
        ((user?.position ?? "").trim().toLowerCase() === "administrativo") ||
        ((user?.role ?? "").trim().toLowerCase() === "administrativo")
      ) {
        return (
          <Suspense fallback={<Loader />}>
            <CalibrationStatsScreen />
          </Suspense>
        );
      } else {
        return <MainMenu />;
      }
    case 'programa-calibracion':
      return (
        <Suspense fallback={<Loader />}>
          <ProgramaCalibracionScreen />
        </Suspense>
      );
    case 'friday-servicios':
      return (
        <Suspense fallback={<Loader />}>
          <FridayServiciosScreen />
        </Suspense>
      );
    case 'normas':
      return (
        <Suspense fallback={<Loader />}>
          <NormasScreen />
        </Suspense>
      );
    case 'check-list':
      return (
        <Suspense fallback={<Loader />}>
          <InventoryProScreen />
        </Suspense>
      );
    case 'friday':
      return (
        <Suspense fallback={<Loader />}>
          <FridayScreen />
        </Suspense>
      );
    default:
      return <MainMenu />;
  }
};
