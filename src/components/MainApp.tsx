import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { AnimatePresence, motion } from 'framer-motion';

// --- Screens Ligeras ---
import { LoginScreen } from './LoginScreen';
import { MainMenu } from './MainMenu';
import { ConsecutivosScreen } from './ConsecutivosScreen';
import { MagnitudeDetailScreen } from './MagnitudeDetailScreen';
import SplashScreen from "./SplashScreen";

// --- Lazy Loading de Screens ---
const RegisterScreen = lazy(() => import('./RegisterScreen').then(module => ({ default: module.RegisterScreen })));
const ProgramaCalibracionScreen = lazy(() => import('./ProgramaCalibracionScreen').then(module => ({ default: module.ProgramaCalibracionScreen })));
const ControlPrestamosScreen = lazy(() => import('./ControlPrestamosScreen').then(module => ({ default: module.ControlPrestamosScreen })));
const WorkSheetScreen = lazy(() => import('./WorkSheetScreen'));
const FridayScreen = lazy(() => import('./FridayScreen'));
const FridayServiciosScreen = lazy(() => import('./FridayServiciosScreen'));
const DriveScreen = lazy(() => import('./DriveScreen'));
const HojaDeServicioScreen = lazy(() => import('./HojaDeServicioScreen'));
const CalibrationManager = lazy(() => import('./CalibrationManager'));
const EmpresasScreen = lazy(() => import('./EmpresasScreen'));
const NormasScreen = lazy(() => import('./NormasScreen'));
const CalibrationStatsScreen = lazy(() => import('./CalibrationStatsScreen'));
const InventoryProScreen = lazy(() => import('./InventoryProScreen'));
const CalendarScreen = lazy(() => import('./CalendarScreen'));

// --- Loader Component ---
const Loader = () => (
  <div className="w-full h-screen flex flex-col items-center justify-center bg-slate-950 z-50 fixed top-0 left-0">
    <svg className="animate-spin h-10 w-10 text-blue-500" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
    <span className="mt-4 text-blue-400 text-sm font-medium tracking-wider">CARGANDO...</span>
  </div>
);

export const MainApp: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const { currentScreen, navigateTo } = useNavigation();
  const [loading, setLoading] = useState(true);

  usePushNotifications(
    user?.uid || user?.id || localStorage.getItem('usuario_id') || '',
    user?.email || localStorage.getItem('usuario.email') || ''
  );

  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 3200);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (isAuthenticated && (currentScreen === 'menu' || currentScreen === 'login')) {
      if (window.location.pathname !== '/') {
        window.history.replaceState(null, '', '/');
      }
    }
  }, [currentScreen, isAuthenticated]);

  if (loading) {
    return <SplashScreen />;
  }

  // --- LÓGICA DE TRANSICIÓN PREMIUM ---
  if (!isAuthenticated) {
    // Usamos un contenedor oscuro (slate-950) para evitar flashes blancos
    return (
      <div className="relative h-screen w-full overflow-hidden bg-slate-950">
        <AnimatePresence mode="wait">
          {currentScreen === 'register' ? (
            <motion.div
              key="register"
              // Entra grande y borroso, se asienta nítido
              initial={{ opacity: 0, scale: 1.05, filter: "blur(10px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} // Curva suave
              className="absolute inset-0 w-full h-full z-10"
            >
              <Suspense fallback={<Loader />}>
                <RegisterScreen onNavigateToLogin={() => navigateTo('login')} />
              </Suspense>
            </motion.div>
          ) : (
            <motion.div
              key="login"
              // Lo mismo para el login
              initial={{ opacity: 0, scale: 1.05, filter: "blur(10px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 w-full h-full z-10"
            >
              <LoginScreen onNavigateToRegister={() => navigateTo('register')} />
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Capa de fondo base para asegurar consistencia visual */}
        <div className="absolute inset-0 bg-slate-950 z-0" />
      </div>
    );
  }

  // Flujo autenticado normal
  switch (currentScreen) {
    case 'menu': return <MainMenu />;
    case 'consecutivos': return <ConsecutivosScreen />;
    case 'magnitude-detail': return <MagnitudeDetailScreen />;
    case 'work-sheet': return <Suspense fallback={<Loader />}><WorkSheetScreen /></Suspense>;
    case 'empresas': return <Suspense fallback={<Loader />}><EmpresasScreen /></Suspense>;
    case 'calendario': return <Suspense fallback={<Loader />}><CalendarScreen /></Suspense>;
    case 'hoja-servicio': return <Suspense fallback={<Loader />}><HojaDeServicioScreen /></Suspense>;
    case 'calibration-manager': return <Suspense fallback={<Loader />}><CalibrationManager /></Suspense>;
    case 'drive': return <Suspense fallback={<Loader />}><DriveScreen /></Suspense>;
    case 'tableros': return <MainMenu />; 
    case 'calibration-stats':
      const role = (user?.puesto || user?.position || user?.role || "").trim().toLowerCase();
      return role === "administrativo" ? <Suspense fallback={<Loader />}><CalibrationStatsScreen /></Suspense> : <MainMenu />;
    case 'programa-calibracion': return <Suspense fallback={<Loader />}><ProgramaCalibracionScreen /></Suspense>;
    case 'control-prestamos': return <Suspense fallback={<Loader />}><ControlPrestamosScreen /></Suspense>;
    case 'friday-servicios': return <Suspense fallback={<Loader />}><FridayServiciosScreen /></Suspense>;
    case 'normas': return <Suspense fallback={<Loader />}><NormasScreen /></Suspense>;
    case 'check-list': return <Suspense fallback={<Loader />}><InventoryProScreen /></Suspense>;
    case 'friday': return <Suspense fallback={<Loader />}><FridayScreen /></Suspense>;
    default: return <MainMenu />;
  }
};