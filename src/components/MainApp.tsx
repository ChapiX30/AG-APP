import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { AnimatePresence, motion } from 'framer-motion';

import { LoginScreen } from './LoginScreen';
import { Layout } from './Layout';
import { MainMenu } from './MainMenu';
import { ConsecutivosScreen } from './ConsecutivosScreen';
import { MagnitudeDetailScreen } from './MagnitudeDetailScreen';

// --- IMPORT DE LA NUEVA PANTALLA PÚBLICA ---
const ShareView = lazy(() => import('./ShareView').then(module => ({ default: module.ShareView })));

// --- CARGA PEREZOSA DE PANTALLAS EXISTENTES ---
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
const EntradaSalidaScreen = lazy(() => import('./EntradaSalidaScreen').then(module => ({ default: module.EntradaSalidaScreen })));

// --- NUEVA PANTALLA MODO TV ---
const TVDashboardScreen = lazy(() => import('./TVDashboardScreen'));

// --- FORMATOS Y PERMISOS DE TRABAJO ---
const FormatosScreen = lazy(() => import('./FormatosScreen').then(module => ({ default: module.FormatosScreen })));
const PermisosTrabajoScreen = lazy(() => import('./PermisosTrabajoScreen').then(module => ({ default: module.PermisosTrabajoScreen })));

// --- HISTORIAL DE EQUIPOS ---
const DirectorioEmpresasScreen = lazy(() => import('./EquipmentHistoryScreens').then(module => ({ default: module.DirectorioEmpresasScreen })));
const EquiposPorEmpresaScreen = lazy(() => import('./EquipmentHistoryScreens').then(module => ({ default: module.EquiposPorEmpresaScreen })));
const DetalleEquipoScreen = lazy(() => import('./EquipmentHistoryScreens').then(module => ({ default: module.DetalleEquipoScreen })));

const Loader = () => (
  <div className="w-full h-full flex flex-col items-center justify-center min-h-screen bg-slate-950 z-50 fixed top-0 left-0">
    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
    <span className="mt-4 text-blue-400 text-sm font-medium tracking-wider">CARGANDO...</span>
  </div>
);

export const MainApp: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const { currentScreen, navigateTo } = useNavigation();
  
  // --- ESTADO SÍNCRONO PARA DETECTAR CONSULTA PÚBLICA DE QR AL INSTANTE ---
  // Leemos el parámetro directamente en la inicialización para evitar el parpadeo del Login
  const [shareCertificado] = useState<string | null>(() => 
    new URLSearchParams(window.location.search).get('share')
  );

  usePushNotifications(
    user?.uid || user?.id || localStorage.getItem('usuario_id') || '',
    user?.email || localStorage.getItem('usuario.email') || ''
  );

  // --- PRIORIDAD 1: SI ES UNA CONSULTA DE QR, MOSTRAR VISTA PÚBLICA SIN LOGIN ---
  if (shareCertificado) {
    return (
      <Suspense fallback={<Loader />}>
        <ShareView certificado={shareCertificado} />
      </Suspense>
    );
  }

  // --- PRIORIDAD 2: SI NO ESTÁ AUTENTICADO, MOSTRAR LOGIN ---
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

  // --- PRIORIDAD 3: APP PRINCIPAL (USUARIO LOGUEADO) ---
  return (
    <Layout>
      <Suspense fallback={<Loader />}>
        {renderScreen(currentScreen, user)}
      </Suspense>
    </Layout>
  );
};

const renderScreen = (screen: string, user: any) => {
  // Limpiar el ID de edición si NO estamos en la hoja de trabajo
  if (screen !== 'work-sheet') {
    localStorage.removeItem('edit_worksheet_id');
  }

  switch (screen) {
    case 'menu': return <MainMenu />;
    case 'consecutivos': return <ConsecutivosScreen />;
    case 'magnitude-detail': return <MagnitudeDetailScreen />;
    case 'work-sheet': return <WorkSheetScreen worksheetId={localStorage.getItem('edit_worksheet_id') || undefined} />;
    case 'empresas': return <EmpresasScreen />;
    case 'calendario': return <CalendarScreen />;
    case 'hoja-servicio': return <HojaDeServicioScreen />;
    case 'calibration-manager': return <CalibrationManager />;
    case 'drive': return <DriveScreen />;
    case 'calibration-stats':
      const role = (user?.puesto || user?.position || user?.role || "").trim().toLowerCase();
      return role === "administrativo" ? <CalibrationStatsScreen /> : <MainMenu />;
    case 'tvdashboard': return <TVDashboardScreen />; // <-- AQUÍ SE AGREGÓ EL MODO TV
    case 'programa-calibracion': return <ProgramaCalibracionScreen />;
    case 'control-prestamos': return <ControlPrestamosScreen />;
    case 'friday-servicios': return <FridayServiciosScreen />;
    case 'normas': return <NormasScreen />;
    case 'check-list': return <InventoryProScreen />;
    case 'friday': return <FridayScreen />;
    case 'vencimientos': return <VencimientosScreen />;
    case 'entrada-salida': return <EntradaSalidaScreen />;
    case 'formatos': return <FormatosScreen />;
    case 'permisos-trabajo': return <PermisosTrabajoScreen />;
    case 'directorio-empresas': return <DirectorioEmpresasScreen />;
    case 'equipos-empresa': return <EquiposPorEmpresaScreen />;
    case 'detalle-equipo': return <DetalleEquipoScreen />;
    default: return <MainMenu />;
  }
};