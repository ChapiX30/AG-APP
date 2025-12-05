import React, { Suspense, lazy } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { AnimatePresence, motion } from 'framer-motion';

import { LoginScreen } from './LoginScreen';
import { Layout } from './Layout';
import { MainMenu } from './MainMenu';
import { ConsecutivosScreen } from './ConsecutivosScreen';
import { MagnitudeDetailScreen } from './MagnitudeDetailScreen';

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
const VencimientosScreen = lazy(() => import('./VencimientosScreen').then(module => ({ default: module.VencimientosScreen })));

// --- NUEVO SCREEN ---
const EntradaSalidaScreen = lazy(() => import('./EntradaSalidaScreen').then(module => ({ default: module.EntradaSalidaScreen })));
// --------------------

const Loader = () => (
  <div className="w-full h-full flex flex-col items-center justify-center min-h-screen bg-slate-950 z-50 fixed top-0 left-0">
    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
    <span className="mt-4 text-blue-400 text-sm font-medium tracking-wider">CARGANDO...</span>
  </div>
);

export const MainApp: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const { currentScreen, navigateTo } = useNavigation();
  
  usePushNotifications(
    user?.uid || user?.id || localStorage.getItem('usuario_id') || '',
    user?.email || localStorage.getItem('usuario.email') || ''
  );

  if (!isAuthenticated) {
    return (
      <div className="relative h-screen w-full overflow-hidden bg-slate-950">
        <AnimatePresence mode="wait">
          {currentScreen === 'register' ? (
            <motion.div
              key="register"
              initial={{ opacity: 0, scale: 1.05, filter: "blur(10px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 w-full h-full z-10"
            >
              <Suspense fallback={<Loader />}>
                <RegisterScreen onNavigateToLogin={() => navigateTo('login')} />
              </Suspense>
            </motion.div>
          ) : (
            <motion.div
              key="login"
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
        <div className="absolute inset-0 bg-slate-950 z-0" />
      </div>
    );
  }

  return (
    <Layout>
      <Suspense fallback={<Loader />}>
        {renderScreen(currentScreen, user)}
      </Suspense>
    </Layout>
  );
};

const renderScreen = (screen: string, user: any) => {
  switch (screen) {
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
    case 'control-prestamos': return <ControlPrestamosScreen />;
    case 'friday-servicios': return <FridayServiciosScreen />;
    case 'normas': return <NormasScreen />;
    case 'check-list': return <InventoryProScreen />;
    case 'friday': return <FridayScreen />;
    case 'vencimientos': return <VencimientosScreen />;
    // --- NUEVO CASE ---
    case 'entrada-salida': return <EntradaSalidaScreen />;
    // ------------------
    default: return <MainMenu />;
  }
};