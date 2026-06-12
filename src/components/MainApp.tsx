import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { usePresence } from '../hooks/usePresence';
import { AnimatePresence, motion } from 'framer-motion';

import { LoginScreen } from './LoginScreen';
import { Layout } from './Layout';
import { MainMenu } from './MainMenu';
import { ScreenSuspenseFallback } from './ui/ScreenSkeletons';
import { ScreenTransition } from './ui/ScreenTransition';
import { WhatsNewModal } from './WhatsNewModal';
import { useWhatsNew } from '../hooks/useWhatsNew';
import { useAppUpdates } from '../hooks/useAppUpdates';
import { useWorksheetQueueSync } from '../hooks/useWorksheetQueueSync';
import { MobileBackHandler } from './MobileBackHandler';

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
const SolicitudVacacionesScreen = lazy(() =>
  import('./SolicitudVacacionesScreen').then((module) => ({
    default: module.SolicitudVacacionesScreen,
  })),
);
const ControlVacacionesRhScreen = lazy(() =>
  import('./ControlVacacionesRhScreen').then((module) => ({
    default: module.ControlVacacionesRhScreen,
  })),
);

// --- HISTORIAL DE EQUIPOS ---
const DirectorioEmpresasScreen = lazy(() => import('./EquipmentHistoryScreens').then(module => ({ default: module.DirectorioEmpresasScreen })));
const EquiposPorEmpresaScreen = lazy(() => import('./EquipmentHistoryScreens').then(module => ({ default: module.EquiposPorEmpresaScreen })));
const DetalleEquipoScreen = lazy(() => import('./EquipmentHistoryScreens').then(module => ({ default: module.DetalleEquipoScreen })));

const ConsecutivosScreen = lazy(() =>
  import('./ConsecutivosScreen').then(module => ({ default: module.ConsecutivosScreen })),
);
const MagnitudeDetailScreen = lazy(() =>
  import('./MagnitudeDetailScreen').then(module => ({ default: module.MagnitudeDetailScreen })),
);

const Loader = () => (
  <div className="w-full flex flex-col items-center justify-center py-16 min-h-[12rem]">
    <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#2464A3] border-t-transparent" />
    <span className="mt-3 text-slate-500 text-xs font-medium tracking-wide">Cargando…</span>
  </div>
);

const authScreenTransition = {
  duration: 0.28,
  ease: [0.22, 1, 0.36, 1] as const,
};

export const MainApp: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const { currentScreen, navigateTo, resetTo } = useNavigation();
  
  // --- ESTADO SÍNCRONO PARA DETECTAR CONSULTA PÚBLICA DE QR AL INSTANTE ---
  // Leemos el parámetro directamente en la inicialización para evitar el parpadeo del Login
  const [shareCertificado] = useState<string | null>(() => 
    new URLSearchParams(window.location.search).get('share')
  );

  const uid = user?.uid || user?.id || localStorage.getItem('usuario_id') || '';

  usePushNotifications(uid, user?.email || localStorage.getItem('usuario.email') || '');
  usePresence(isAuthenticated ? uid : undefined);
  useWorksheetQueueSync(user, isAuthenticated);
  const { allUpdates } = useAppUpdates();
  const { update: whatsNewUpdate, dismiss: dismissWhatsNew } = useWhatsNew(
    isAuthenticated ? uid : undefined,
    user,
    allUpdates,
  );

  useEffect(() => {
    if (!isAuthenticated) {
      resetTo('login');
    }
  }, [isAuthenticated, resetTo]);

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
        <MobileBackHandler />
        <AnimatePresence mode="wait">
          {currentScreen === 'register' ? (
            <motion.div
              key="register"
              initial={{ opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={authScreenTransition}
              className="absolute inset-0 w-full h-full z-10"
            >
              <Suspense fallback={<Loader />}>
                <RegisterScreen onNavigateToLogin={() => navigateTo('login')} />
              </Suspense>
            </motion.div>
          ) : (
            <motion.div
              key="login"
              initial={{ opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={authScreenTransition}
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
      <MobileBackHandler />
      <div className="flex min-h-0 flex-1 flex-col h-full">
        <Suspense fallback={<ScreenSuspenseFallback />}>
          <ScreenTransition screenKey={currentScreen}>
            {renderScreen(currentScreen, user)}
          </ScreenTransition>
        </Suspense>
      </div>
      <WhatsNewModal update={whatsNewUpdate} onDismiss={dismissWhatsNew} />
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
    case 'solicitud-vacaciones': return <SolicitudVacacionesScreen />;
    case 'control-vacaciones-rh': return <ControlVacacionesRhScreen />;
    case 'directorio-empresas': return <DirectorioEmpresasScreen />;
    case 'equipos-empresa': return <EquiposPorEmpresaScreen />;
    case 'detalle-equipo': return <DetalleEquipoScreen />;
    default: return <MainMenu />;
  }
};