import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { AnimatePresence, motion } from 'framer-motion';

// Screens "ligeras"
import { LoginScreen } from './LoginScreen';
import { MainMenu } from './MainMenu';
import { ConsecutivosScreen } from './ConsecutivosScreen';
import { MagnitudeDetailScreen } from './MagnitudeDetailScreen';
import SplashScreen from "./SplashScreen";

// --- CARGA DIFERIDA OPTIMIZADA ---
const RegisterScreen = lazy(() => import('./RegisterScreen').then(module => ({ default: module.RegisterScreen })));

// Screens GRANDES
const WorkSheetScreen = lazy(() => import('./WorkSheetScreen'));
const FridayScreen = lazy(() => import('./FridayScreen'));
const FridayServiciosScreen = lazy(() => import('./FridayServiciosScreen'));
const DriveScreen = lazy(() => import('./DriveScreen'));
const ProgramaCalibracionScreen = lazy(() => import('./ProgramaCalibracionScreen').then(module => ({ default: module.ProgramaCalibracionScreen })));
const HojaDeServicioScreen = lazy(() => import('./HojaDeServicioScreen'));
const CalibrationManager = lazy(() => import('./CalibrationManager'));
const EmpresasScreen = lazy(() => import('./EmpresasScreen'));
const NormasScreen = lazy(() => import('./NormasScreen'));
const CalibrationStatsScreen = lazy(() => import('./CalibrationStatsScreen'));
const InventoryProScreen = lazy(() => import('./InventoryProScreen'));
const CalendarScreen = lazy(() => import('./CalendarScreen'));

// Loader visual PRO (Ajustado al tema oscuro para evitar flash blanco aquí también)
const Loader = () => (
  <div className="w-full h-screen flex flex-col items-center justify-center bg-[#030712] z-50 fixed top-0 left-0">
    <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4"></div>
    <span className="text-blue-400 text-lg font-medium animate-pulse">Cargando módulo...</span>
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

  if (loading) return <SplashScreen />;

  // --- TRANSICIÓN PROFESIONAL LOGIN <-> REGISTER ---
  if (!isAuthenticated) {
    return (
      // Usamos el mismo fondo oscuro base para evitar destellos
      <div className="fixed inset-0 bg-[#030712] overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          {currentScreen === 'register' ? (
            <motion.div
              key="register"
              // Entra desde la derecha (+20), sale hacia la derecha (+20)
              initial={{ opacity: 0, x: 20, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.98 }}
              transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }} // Curva de aceleración profesional
              className="w-full h-full"
            >
              <Suspense fallback={<Loader />}>
                <RegisterScreen onNavigateToLogin={() => navigateTo('login')} />
              </Suspense>
            </motion.div>
          ) : (
            <motion.div
              key="login"
              // Entra desde la izquierda (-20), sale hacia la izquierda (-20)
              initial={{ opacity: 0, x: -20, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -20, scale: 0.98 }}
              transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
              className="w-full h-full"
            >
              <LoginScreen onNavigateToRegister={() => navigateTo('register')} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // --- SCREENS AUTENTICADAS ---
  // Se envuelven en un contenedor base oscuro también por si acaso
  return (
    <div className="min-h-screen bg-[#0f172a]"> 
       {/* Nota: #0f172a es un buen fondo para la app interna, 
           pero si quieres que TODO sea super oscuro usa #030712 aquí también */}
      <Suspense fallback={<Loader />}>
        {(() => {
          switch (currentScreen) {
            case 'menu': return <MainMenu />;
            case 'consecutivos': return <ConsecutivosScreen />;
            case 'magnitude-detail': return <MagnitudeDetailScreen />;
            case 'work-sheet': return <WorkSheetScreen />;
            case 'empresas': return <EmpresasScreen />;
            case 'calendario': return <CalendarScreen />;
            case 'hoja-servicio': return <HojaDeServicioScreen />;
            case 'calibration-manager': return <CalibrationManager />;
            case 'drive': return <DriveScreen />;
            case 'calibration-stats':
              const role = (user?.puesto || user?.position || user?.role || "").trim().toLowerCase();
              return role === "administrativo" ? <CalibrationStatsScreen /> : <MainMenu />;
            case 'programa-calibracion': return <ProgramaCalibracionScreen />;
            case 'friday-servicios': return <FridayServiciosScreen />;
            case 'normas': return <NormasScreen />;
            case 'check-list': return <InventoryProScreen />;
            case 'friday': return <FridayScreen />;
            default: return <MainMenu />;
          }
        })()}
      </Suspense>
    </div>
  );
};