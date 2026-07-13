import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  Send,
  XCircle,
  AlertTriangle,
  UserRound,
  Inbox,
  PlusCircle,
  Check,
  Circle,
  Trash2,
  ChevronDown,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import toast, { Toaster } from 'react-hot-toast';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  deleteDoc,
  where,
} from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { useAuth } from '../hooks/useAuth';
import { useAppDialog } from '../hooks/useAppDialog';
import {
  AG_BRAND_BLUE,
  OperationalScreenHeader,
  OperationalScreenShell,
} from './ui/OperationalScreenShell';
import { db, storage } from '../utils/firebase';
import {
  canSubmitVacationRequest,
  canUserActOnSolicitud,
  VACATION_RH_EMAILS,
  getVacationFlowType,
  initialNotifyStepForFlow,
  initialStatusForFlow,
  isVacationApprover,
  VACATION_STATUS_LABELS,
  type VacationStatus,
} from '../utils/vacationPermissions';
import {
  nextStatusAfterApproval,
  approvalStepForStatus,
  validateSolicitudForm,
  inferFlowType,
  getMinVacationStartDate,
  VACATION_MIN_NOTICE_DAYS,
  type SolicitudVacacionesDoc,
  type VacationHistorialEntry,
} from '../utils/vacationWorkflow';
import {
  notifyVacationPendingApproval,
  notifyVacationRejected,
  notifyVacationSubmitted,
  notifyVacationStepApproved,
  notifyVacationFullyApproved,
} from '../utils/vacationNotify';
import { requestVacationRhEmailRetry } from '../utils/vacationFinalize';
import { getDownloadURL } from 'firebase/storage';
import {
  computeVacationBalance,
  getDiasAsignadosFromSaldo,
  getVacationYear,
  type VacacionesSaldoYear,
  type VacationBalance,
} from '../utils/vacationBalance';
import {
  countVacationDaysInclusive,
  formatProgressStateLabel,
  getVacationProgressSteps,
  type ProgressStepState,
} from '../utils/vacationProgress';

type TabId = 'nueva' | 'mis' | 'pendientes';

const AG_BLUE = AG_BRAND_BLUE;
const nowISO = () => new Date().toISOString();

export const SolicitudVacacionesScreen: React.FC = () => {
  const { user } = useAuth();
  const { confirm } = useAppDialog();

  const calendarUser = useMemo(
    () =>
      user
        ? { name: user.name, email: user.email, puesto: user.puesto, role: user.role }
        : null,
    [user],
  );

  const puedeSolicitar = canSubmitVacationRequest(calendarUser);
  const puedeAutorizar = isVacationApprover(calendarUser);
  const tipoFlujoUsuario = getVacationFlowType(calendarUser);

  const [tab, setTab] = useState<TabId>(puedeSolicitar ? 'nueva' : 'pendientes');
  const [misSolicitudes, setMisSolicitudes] = useState<SolicitudVacacionesDoc[]>([]);
  const [pendientes, setPendientes] = useState<SolicitudVacacionesDoc[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [busy, setBusy] = useState(false);

  const [diasVacaciones, setDiasVacaciones] = useState(1);
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [comentario, setComentario] = useState('');

  const [rejectTarget, setRejectTarget] = useState<SolicitudVacacionesDoc | null>(null);
  const [rejectMotivo, setRejectMotivo] = useState('');
  const [selectedSolicitudId, setSelectedSolicitudId] = useState<string | null>(null);
  const [selectedApproverId, setSelectedApproverId] = useState<string | null>(null);
  const [vacacionesSaldo, setVacacionesSaldo] = useState<Record<string, VacacionesSaldoYear>>({});

  const minFechaInicio = useMemo(() => getMinVacationStartDate(), []);

  const diasSegunFechas = useMemo(
    () =>
      fechaInicio && fechaFin && fechaFin >= fechaInicio
        ? countVacationDaysInclusive(fechaInicio, fechaFin)
        : null,
    [fechaInicio, fechaFin],
  );

  const diasNoCoinciden =
    diasSegunFechas != null &&
    Number.isFinite(diasVacaciones) &&
    diasVacaciones !== diasSegunFechas;

  const validarFormulario = () =>
    validateSolicitudForm({
      diasVacaciones: Number(diasVacaciones),
      fechaInicio,
      fechaFin,
      diasSegunFechas,
    });

  useEffect(() => {
    if (!user?.id || !puedeSolicitar) return;
    return onSnapshot(doc(db, 'usuarios', user.id), (snap) => {
      const data = snap.data();
      setVacacionesSaldo((data?.vacacionesSaldo as Record<string, VacacionesSaldoYear>) ?? {});
    });
  }, [user?.id, puedeSolicitar]);

  const miSaldoVacaciones = useMemo(() => {
    const asignados = getDiasAsignadosFromSaldo(vacacionesSaldo);
    return computeVacationBalance(asignados, misSolicitudes, getVacationYear());
  }, [vacacionesSaldo, misSolicitudes]);

  useEffect(() => {
    if (diasSegunFechas != null && diasSegunFechas >= 1) {
      setDiasVacaciones(diasSegunFechas);
    }
  }, [diasSegunFechas]);

  useEffect(() => {
    if (!user?.id) return;
    const qMine = query(
      collection(db, 'solicitudesVacaciones'),
      where('solicitanteUid', '==', user.id),
    );
    const unsubMine = onSnapshot(
      qMine,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SolicitudVacacionesDoc));
        list.sort((a, b) => {
          const ta = (a.updatedAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
          const tb = (b.updatedAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
          return tb - ta;
        });
        setMisSolicitudes(list);
        setLoadingList(false);
      },
      (err) => {
        console.error(err);
        setLoadingList(false);
      },
    );
    return () => unsubMine();
  }, [user?.id]);

  useEffect(() => {
    if (!puedeAutorizar) {
      setPendientes([]);
      return;
    }
    const qPend = query(
      collection(db, 'solicitudesVacaciones'),
      where('estado', 'in', ['pendiente_calidad', 'pendiente_edgar', 'pendiente_jorge']),
    );
    const unsub = onSnapshot(qPend, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SolicitudVacacionesDoc));
      all.sort((a, b) => {
        const ta = (a.updatedAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
        const tb = (b.updatedAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
        return tb - ta;
      });
        const filtradas = all.filter((s) =>
          canUserActOnSolicitud(calendarUser, s.estado, inferFlowType(s)),
        );
        filtradas.sort((a, b) => {
          const fa = a.fechaSolicitud || '';
          const fb = b.fechaSolicitud || '';
          if (fa !== fb) return fa.localeCompare(fb);
          const ta = (a.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
          const tb = (b.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
          return ta - tb;
        });
        setPendientes(filtradas);
    });
    return () => unsub();
  }, [puedeAutorizar, calendarUser]);

  const buildBasePayload = () => {
    const anio = fechaFin ? parseISO(fechaFin).getFullYear() : new Date().getFullYear();
    return {
      solicitanteUid: user!.id,
      solicitanteNombre: user!.name,
      solicitanteEmail: user!.email,
      solicitantePuesto: user!.puesto || 'Colaborador',
      tipoFlujo: tipoFlujoUsuario,
      diasVacaciones: Number(diasVacaciones),
      fechaInicio,
      fechaFin,
      anio,
      comentarioSolicitante: comentario.trim() || '',
      fechaSolicitud: format(new Date(), 'yyyy-MM-dd'),
      historial: [] as VacationHistorialEntry[],
      aprobaciones: {},
      correoRh: VACATION_RH_EMAILS[0],
      correosRh: [...VACATION_RH_EMAILS],
    };
  };

  const handleGuardarBorrador = async () => {
    const err = validarFormulario();
    if (err) return toast.error(err);
    setBusy(true);
    try {
      await addDoc(collection(db, 'solicitudesVacaciones'), {
        ...buildBasePayload(),
        estado: 'borrador' as VacationStatus,
        historial: [{ ts: nowISO(), user: user!.name, action: 'creada' }],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success('Borrador guardado.');
      setTab('mis');
      resetForm();
    } catch (e) {
      console.error(e);
      toast.error('No se pudo guardar el borrador.');
    } finally {
      setBusy(false);
    }
  };

  const handleEnviar = async () => {
    const err = validarFormulario();
    if (err) return toast.error(err);
    setBusy(true);
    try {
      const estadoInicial = initialStatusForFlow(tipoFlujoUsuario);
      const pasoNotif = initialNotifyStepForFlow(tipoFlujoUsuario);
      const refDoc = await addDoc(collection(db, 'solicitudesVacaciones'), {
        ...buildBasePayload(),
        estado: estadoInicial,
        historial: [{ ts: nowISO(), user: user!.name, action: 'enviada' }],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await notifyVacationPendingApproval({
        solicitudId: refDoc.id,
        solicitanteNombre: user!.name,
        solicitanteEmail: user!.email,
        step: pasoNotif,
        dias: Number(diasVacaciones),
        fechaInicio,
        fechaFin,
      });
      await notifyVacationSubmitted({
        solicitanteUid: user!.id,
        solicitanteNombre: user!.name,
        solicitanteEmail: user!.email,
        solicitudId: refDoc.id,
        dias: Number(diasVacaciones),
      });
      toast.success('Solicitud enviada correctamente.');
      setTab('mis');
      resetForm();
    } catch (e) {
      console.error(e);
      toast.error('No se pudo enviar la solicitud.');
    } finally {
      setBusy(false);
    }
  };

  const puedeEliminarSolicitud = (s: SolicitudVacacionesDoc) => s.estado !== 'aprobada';

  const handleEliminarSolicitud = async (s: SolicitudVacacionesDoc) => {
    if (!s.id || !puedeEliminarSolicitud(s)) return;
    const ok = await confirm({
      message: '¿Eliminar esta solicitud de vacaciones? Esta acción no se puede deshacer.',
      variant: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;

    setBusy(true);
    try {
      if (s.pdfStoragePath) {
        try {
          await deleteObject(ref(storage, s.pdfStoragePath));
        } catch (e) {
          console.warn('PDF no eliminado en storage:', e);
        }
      }
      await deleteDoc(doc(db, 'solicitudesVacaciones', s.id));
      if (selectedSolicitudId === s.id) setSelectedSolicitudId(null);
      toast.success('Solicitud eliminada.');
    } catch (e) {
      console.error(e);
      toast.error('No se pudo eliminar la solicitud.');
    } finally {
      setBusy(false);
    }
  };

  const toggleSeleccionSolicitud = (id: string | undefined) => {
    if (!id) return;
    setSelectedSolicitudId((prev) => (prev === id ? null : id));
  };

  const toggleSeleccionAprobador = (id: string | undefined) => {
    if (!id) return;
    setSelectedApproverId((prev) => (prev === id ? null : id));
  };

  const handleReenviar = async (s: SolicitudVacacionesDoc) => {
    if (!s.id) return;
    const flujo = inferFlowType(s);
    setBusy(true);
    try {
      const estadoInicial = initialStatusForFlow(flujo);
      await updateDoc(doc(db, 'solicitudesVacaciones', s.id), {
        estado: estadoInicial,
        rechazoMotivo: null,
        rechazadoPorNombre: null,
        rechazadoPorPaso: null,
        rechazadoEn: null,
        historial: [
          ...(s.historial || []),
          { ts: nowISO(), user: user!.name, action: 'corregida' as const },
        ],
        updatedAt: serverTimestamp(),
      });
      await notifyVacationPendingApproval({
        solicitudId: s.id,
        solicitanteNombre: s.solicitanteNombre,
        solicitanteEmail: s.solicitanteEmail,
        step: initialNotifyStepForFlow(flujo),
        dias: s.diasVacaciones,
        fechaInicio: s.fechaInicio,
        fechaFin: s.fechaFin,
      });
      await notifyVacationSubmitted({
        solicitanteUid: s.solicitanteUid,
        solicitanteNombre: s.solicitanteNombre,
        solicitanteEmail: s.solicitanteEmail,
        solicitudId: s.id,
        dias: s.diasVacaciones,
      });
      toast.success('Solicitud reenviada.');
    } catch (e) {
      console.error(e);
      toast.error('No se pudo reenviar.');
    } finally {
      setBusy(false);
    }
  };

  const handleAprobar = async (s: SolicitudVacacionesDoc) => {
    if (!s.id || !user) return;
    const flujo = inferFlowType(s);
    const paso = approvalStepForStatus(s.estado);
    if (!paso || !canUserActOnSolicitud(calendarUser, s.estado, flujo)) {
      return toast.error('No tienes permiso para autorizar en este paso del trámite.');
    }

    const pasoEsperado =
      flujo === 'calidad'
        ? 'jorge'
        : s.estado === 'pendiente_calidad'
          ? 'calidad'
          : s.estado === 'pendiente_edgar'
            ? 'edgar'
            : 'jorge';
    if (paso !== pasoEsperado) {
      return toast.error('Esta solicitud no está en el paso que le corresponde autorizar.');
    }

    setBusy(true);
    try {
      const aprobacion = {
        uid: user.id,
        nombre: user.name,
        fecha: format(new Date(), 'yyyy-MM-dd'),
      };
      const aprobaciones = { ...(s.aprobaciones || {}), [paso]: aprobacion };
      const historial = [
        ...(s.historial || []),
        { ts: nowISO(), user: user.name, action: 'aprobada' as const, paso },
      ];
      const siguiente = nextStatusAfterApproval(s.estado, flujo);

      if (siguiente === 'aprobada') {
        await updateDoc(doc(db, 'solicitudesVacaciones', s.id), {
          estado: 'aprobada',
          aprobaciones,
          historial,
          updatedAt: serverTimestamp(),
        });
        await notifyVacationFullyApproved({
          solicitanteUid: s.solicitanteUid,
          solicitanteNombre: s.solicitanteNombre,
          solicitanteEmail: s.solicitanteEmail,
          solicitudId: s.id,
        });
        toast.success(
          'Solicitud aprobada. El PDF y el correo se enviarán automáticamente a Recursos Humanos.',
        );
      } else if (siguiente) {
        await updateDoc(doc(db, 'solicitudesVacaciones', s.id), {
          estado: siguiente,
          aprobaciones,
          historial,
          updatedAt: serverTimestamp(),
        });
        const nextStep = approvalStepForStatus(siguiente);
        const siguientePasoLabel =
          nextStep === 'calidad'
            ? 'Calidad'
            : nextStep === 'edgar'
              ? 'Edgar Amador'
              : nextStep === 'jorge'
                ? 'Jorge Amador'
                : 'siguiente autorizador';
        await notifyVacationStepApproved({
          solicitanteUid: s.solicitanteUid,
          solicitanteNombre: s.solicitanteNombre,
          solicitanteEmail: s.solicitanteEmail,
          solicitudId: s.id,
          autorizadoPor: user.name,
          siguientePasoLabel,
        });
        if (nextStep) {
          await notifyVacationPendingApproval({
            solicitudId: s.id,
            solicitanteNombre: s.solicitanteNombre,
            solicitanteEmail: s.solicitanteEmail,
            step: nextStep,
            dias: s.diasVacaciones,
            fechaInicio: s.fechaInicio,
            fechaFin: s.fechaFin,
          });
        }
        toast.success('Autorización registrada.');
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Error al aprobar.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmarRechazo = async () => {
    if (!rejectTarget?.id || !user) return;
    const motivo = rejectMotivo.trim();
    if (motivo.length < 5) {
      return toast.error('Escribe el motivo del rechazo (mínimo 5 caracteres).');
    }
    const paso = approvalStepForStatus(rejectTarget.estado);
    if (!paso) return;

    setBusy(true);
    try {
      await updateDoc(doc(db, 'solicitudesVacaciones', rejectTarget.id), {
        estado: 'rechazada',
        rechazoMotivo: motivo,
        rechazadoPorNombre: user.name,
        rechazadoPorPaso: paso,
        rechazadoEn: nowISO(),
        historial: [
          ...(rejectTarget.historial || []),
          { ts: nowISO(), user: user.name, action: 'rechazada' as const, paso, comment: motivo },
        ],
        updatedAt: serverTimestamp(),
      });
      await notifyVacationRejected({
        solicitanteUid: rejectTarget.solicitanteUid,
        solicitanteNombre: rejectTarget.solicitanteNombre,
        solicitanteEmail: rejectTarget.solicitanteEmail,
        rechazadoPorNombre: user.name,
        motivo,
        solicitudId: rejectTarget.id,
      });
      toast.success('Solicitud rechazada.');
      setRejectTarget(null);
      setRejectMotivo('');
    } catch (e) {
      console.error(e);
      toast.error('No se pudo rechazar.');
    } finally {
      setBusy(false);
    }
  };

  const handleDescargarPdf = async (s: SolicitudVacacionesDoc) => {
    if (!s.pdfStoragePath) {
      return toast.error('El PDF aún no está disponible.');
    }
    try {
      const url = await getDownloadURL(ref(storage, s.pdfStoragePath));
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      console.error(e);
      toast.error('No se pudo abrir el PDF.');
    }
  };

  const handleReintentarPdfRh = async (s: SolicitudVacacionesDoc) => {
    if (!s.id) return;
    setBusy(true);
    try {
      await requestVacationRhEmailRetry(s);
      toast.success('Reenvío solicitado. El correo con PDF se procesará en unos momentos.');
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'No se pudo reenviar el PDF.');
    } finally {
      setBusy(false);
    }
  };

  const resetForm = () => {
    setDiasVacaciones(1);
    setFechaInicio('');
    setFechaFin('');
    setComentario('');
  };

  const formatRango = (inicio: string, fin: string) => {
    try {
      const a = format(parseISO(inicio), "d 'de' MMMM yyyy", { locale: es });
      const b = format(parseISO(fin), "d 'de' MMMM yyyy", { locale: es });
      return `${a} — ${b}`;
    } catch {
      return `${inicio} — ${fin}`;
    }
  };

  const tabs: { id: TabId; label: string; icon: React.ReactNode; count?: number }[] = [];
  if (puedeSolicitar) {
    tabs.push({ id: 'nueva', label: 'Nueva solicitud', icon: <PlusCircle size={16} /> });
    tabs.push({
      id: 'mis',
      label: 'Mis solicitudes',
      icon: <Inbox size={16} />,
      count: misSolicitudes.length,
    });
  }
  if (puedeAutorizar) {
    tabs.push({
      id: 'pendientes',
      label: 'Por autorizar',
      icon: <FileText size={16} />,
      count: pendientes.length,
    });
  }

  return (
    <OperationalScreenShell>
      <Toaster position="top-center" toastOptions={{ className: 'text-sm font-medium' }} />

      <OperationalScreenHeader
        maxWidth="5xl"
        title="Solicitud de Vacaciones"
        subtitle="Recursos Humanos · Equipos y Servicios Especializados AG"
        backLabel="Menú"
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
        {/* Tabs */}
        <nav className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                tab === t.id
                  ? 'text-white shadow-md'
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:text-slate-900'
              }`}
              style={tab === t.id ? { backgroundColor: AG_BLUE } : undefined}
            >
              {t.icon}
              {t.label}
              {t.count != null && t.count > 0 && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full ${
                    tab === t.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </nav>

        {puedeSolicitar && tab === 'mis' && (
          <VacationDiasCard saldo={miSaldoVacaciones} year={getVacationYear()} />
        )}

        {tab === 'nueva' && puedeSolicitar && (
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <CalendarDays size={18} style={{ color: AG_BLUE }} />
                Datos de la solicitud
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Complete el periodo solicitado (mín. {VACATION_MIN_NOTICE_DAYS} días de anticipación) y envíe para su revisión.
              </p>
            </div>
            <div className="p-6 space-y-5 max-w-xl">
              <VacationDiasCard saldo={miSaldoVacaciones} year={getVacationYear()} />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Field label="Días solicitados">
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={diasVacaciones}
                      onChange={(e) => setDiasVacaciones(Number(e.target.value))}
                      className="vac-input"
                    />
                  </Field>
                  {miSaldoVacaciones.asignados !== 0 || miSaldoVacaciones.usados > 0 || miSaldoVacaciones.pendientes > 0
                    ? Number(diasVacaciones) >= 1 && (
                    <DiasSolicitudPreview
                      restantes={miSaldoVacaciones.restantes}
                      diasSolicitados={diasVacaciones}
                    />
                  )
                    : null}
                </div>
                <Field label="Fecha de inicio">
                  <input
                    type="date"
                    value={fechaInicio}
                    min={minFechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                    className="vac-input"
                  />
                </Field>
                <Field label="Fecha de fin">
                  <input
                    type="date"
                    value={fechaFin}
                    min={fechaInicio || minFechaInicio}
                    onChange={(e) => setFechaFin(e.target.value)}
                    className="vac-input"
                  />
                </Field>
              </div>
              <p className="text-xs text-slate-500 -mt-2">
                Anticipación mínima: {VACATION_MIN_NOTICE_DAYS} días (inicio desde {minFechaInicio}).
              </p>
              {diasSegunFechas != null && Number(diasVacaciones) >= 1 && (
                <p
                  className={`text-sm -mt-2 font-medium ${
                    diasNoCoinciden ? 'text-red-600' : 'text-emerald-700'
                  }`}
                >
                  {diasNoCoinciden ? 'Las fechas no coinciden con los días indicados.' : 'Fechas y días coinciden.'}
                </p>
              )}
              <Field label="Observaciones (opcional)">
                <textarea
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  rows={3}
                  className="vac-input resize-none"
                  placeholder="Cobertura del área, turnos, etc."
                />
              </Field>
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  disabled={busy || diasNoCoinciden}
                  onClick={handleGuardarBorrador}
                  className="px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                >
                  Guardar borrador
                </button>
                <button
                  type="button"
                  disabled={busy || diasNoCoinciden}
                  onClick={handleEnviar}
                  className="px-5 py-2.5 rounded-lg text-white text-sm font-semibold flex items-center gap-2 shadow-sm disabled:opacity-50"
                  style={{ backgroundColor: AG_BLUE }}
                >
                  {busy ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                  Enviar solicitud
                </button>
              </div>
            </div>
          </section>
        )}

        {tab === 'mis' && puedeSolicitar && (
          <section className="space-y-3">
            {loadingList ? (
              <div className="flex justify-center py-16 bg-white rounded-xl border border-slate-200">
                <Loader2 className="animate-spin text-slate-400" size={28} />
              </div>
            ) : misSolicitudes.length === 0 ? (
              <EmptyState message="No tiene solicitudes registradas." />
            ) : (
              misSolicitudes.map((s) => {
                const selected = selectedSolicitudId === s.id;
                return (
                  <SolicitudCard
                    key={s.id}
                    solicitud={s}
                    formatRango={formatRango}
                    selectable
                    selected={selected}
                    onToggleSelect={() => toggleSeleccionSolicitud(s.id)}
                    showProgress={selected && s.estado !== 'borrador'}
                    collapsed={!selected}
                    extra={
                      selected ? (
                        <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                          {s.estado === 'rechazada' && (
                            <RechazoBanner
                              solicitud={s}
                              onReenviar={() => handleReenviar(s)}
                              busy={busy}
                            />
                          )}
                          {s.estado === 'aprobada' && (
                            <div className="flex flex-wrap gap-2">
                              {s.pdfStoragePath ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleDescargarPdf(s);
                                  }}
                                  className="px-4 py-2.5 rounded-lg border border-[#2464A3] text-[#2464A3] text-sm font-medium flex items-center gap-2 hover:bg-sky-50 disabled:opacity-50"
                                >
                                  <FileText size={16} />
                                  Ver PDF AG-ADM-F12
                                </button>
                              ) : null}
                              {(!s.correoEnviado || s.pdfError) && puedeAutorizar ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleReintentarPdfRh(s);
                                  }}
                                  className="px-4 py-2.5 rounded-lg bg-[#2464A3] text-white text-sm font-medium disabled:opacity-50"
                                >
                                  Reenviar PDF a RH
                                </button>
                              ) : null}
                            </div>
                          )}
                          {s.estado === 'aprobada' && s.pdfError && (
                            <p className="text-xs text-amber-700">{s.pdfError}</p>
                          )}
                          {puedeEliminarSolicitud(s) ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleEliminarSolicitud(s);
                              }}
                              className="w-full sm:w-auto px-4 py-2.5 rounded-lg border border-red-200 bg-white text-red-700 text-sm font-medium flex items-center justify-center gap-2 hover:bg-red-50 disabled:opacity-50"
                            >
                              <Trash2 size={16} />
                              Eliminar solicitud
                            </button>
                          ) : (
                            <p className="text-xs text-slate-500">
                              Las solicitudes aprobadas no se pueden eliminar desde la app.
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 mt-3 flex items-center gap-1">
                          <ChevronDown size={14} />
                          Toque para ver detalle y opciones
                        </p>
                      )
                    }
                  />
                );
              })
            )}
          </section>
        )}

        {tab === 'pendientes' && puedeAutorizar && (
          <section className="space-y-2">
            {pendientes.length === 0 ? (
              <EmptyState
                message="No hay solicitudes pendientes de su autorización."
                icon={<CheckCircle2 size={22} className="text-emerald-600" />}
              />
            ) : (
              <>
                <p className="text-xs text-slate-500 px-1 mb-2">
                  {pendientes.length} en cola · toque una fila para revisarla
                </p>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
                  {pendientes.map((s, index) => {
                    const expanded = selectedApproverId === s.id;
                    return (
                      <SolicitudCard
                        key={s.id}
                        solicitud={s}
                        formatRango={formatRango}
                        variant="approver"
                        queuePosition={index + 1}
                        selectable
                        selected={expanded}
                        onToggleSelect={() => toggleSeleccionAprobador(s.id)}
                        showProgress={expanded}
                        extra={
                          expanded ? (
                            <div className="flex flex-wrap gap-2 pt-1">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleAprobar(s);
                                }}
                                className="flex-1 min-w-[120px] px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                              >
                                <CheckCircle2 size={15} /> Autorizar
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRejectTarget(s);
                                  setRejectMotivo('');
                                }}
                                className="flex-1 min-w-[120px] px-4 py-2.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm font-medium flex items-center justify-center gap-2 hover:bg-red-100 disabled:opacity-50"
                              >
                                <XCircle size={15} /> Rechazar
                              </button>
                            </div>
                          ) : undefined
                        }
                      />
                    );
                  })}
                </div>
              </>
            )}
          </section>
        )}
      </div>

      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full border border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="text-amber-500" size={20} />
              Motivo del rechazo
            </h3>
            <p className="text-slate-500 text-sm mt-2">
              <strong className="text-slate-700">{rejectTarget.solicitanteNombre}</strong> podrá
              ver este mensaje en su solicitud.
            </p>
            <textarea
              value={rejectMotivo}
              onChange={(e) => setRejectMotivo(e.target.value)}
              rows={4}
              className="vac-input w-full mt-4"
              placeholder="Indique el motivo del rechazo…"
            />
            <div className="flex gap-3 mt-5 justify-end">
              <button
                type="button"
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900"
                onClick={() => setRejectTarget(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleConfirmarRechazo}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50"
              >
                Confirmar rechazo
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .vac-input {
          width: 100%;
          background: #fff;
          color: #1e293b;
          color-scheme: light;
          border: 1px solid #cbd5e1;
          border-radius: 0.5rem;
          padding: 0.625rem 0.875rem;
          color: #1e293b;
          font-size: 0.875rem;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .vac-input:focus {
          border-color: ${AG_BLUE};
          box-shadow: 0 0 0 3px rgba(36, 100, 163, 0.12);
        }
      `}</style>
    </OperationalScreenShell>
  );
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">
        {label}
      </span>
      {children}
    </label>
  );
}

function VacationDiasCard({
  saldo,
  year,
}: {
  saldo: VacationBalance;
  year: number;
}) {
  const sinRegistro =
    saldo.asignados === 0 && saldo.usados === 0 && saldo.pendientes === 0;

  if (sinRegistro) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-sm text-slate-500">
          Recursos Humanos aún no ha registrado tus días de vacaciones para {year}.
        </p>
      </div>
    );
  }

  const restantesColor =
    saldo.restantes < 0
      ? 'text-red-700'
      : saldo.restantes <= 5
        ? 'text-amber-700'
        : 'text-emerald-700';

  const detallePartes: string[] = [];
  if (saldo.usados > 0) detallePartes.push(`${saldo.usados} ya tomados`);
  if (saldo.pendientes > 0) detallePartes.push(`${saldo.pendientes} en trámite`);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3.5 space-y-1">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
        Días de vacaciones · {year}
      </p>
      <p className="text-base text-slate-800">
        {saldo.restantes < 0 ? 'Llevas ' : 'Te quedan '}
        <span className={`text-2xl font-bold tabular-nums ${restantesColor}`}>
          {saldo.restantes < 0 ? Math.abs(saldo.restantes) : saldo.restantes}
        </span>{' '}
        {saldo.restantes < 0 ? `día${Math.abs(saldo.restantes) === 1 ? '' : 's'} de adeudo` : `día${saldo.restantes === 1 ? '' : 's'} disponibles`}
        <span className="text-sm font-normal text-slate-500">
          {' '}
          {saldo.asignados < 0
            ? `(saldo inicial: ${saldo.asignados} días)`
            : `de ${saldo.asignados} que te corresponden`}
        </span>
      </p>
      {detallePartes.length > 0 && (
        <p className="text-xs text-slate-400">{detallePartes.join(' · ')}</p>
      )}
    </div>
  );
}

function DiasSolicitudPreview({
  restantes,
  diasSolicitados,
}: {
  restantes: number;
  diasSolicitados: number;
}) {
  const quedarian = restantes - diasSolicitados;
  const yaEnAdeudo = restantes < 0;

  return (
    <p
      className={`text-xs font-medium mt-1.5 flex items-start gap-1 ${
        yaEnAdeudo || quedarian < 0 ? 'text-amber-700' : 'text-slate-500'
      }`}
    >
      {(yaEnAdeudo || quedarian < 0) && <AlertTriangle size={12} className="shrink-0 mt-0.5" />}
      {yaEnAdeudo
        ? `Ya llevas ${Math.abs(restantes)} día(s) de adeudo. RH revisará esta solicitud.`
        : quedarian < 0
          ? `Solo te restan ${restantes}; RH revisará si pides ${diasSolicitados}.`
          : `Te quedarían ${quedarian} día${quedarian === 1 ? '' : 's'} después de esta solicitud.`}
    </p>
  );
}

function EmptyState({ message, icon }: { message: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 py-14 px-6 text-center">
      {icon && <div className="flex justify-center mb-3">{icon}</div>}
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  );
}

function StatusBadge({ estado }: { estado: VacationStatus }) {
  const styles: Record<VacationStatus, string> = {
    borrador: 'bg-slate-100 text-slate-600 border-slate-200',
    pendiente_calidad: 'bg-amber-50 text-amber-800 border-amber-200',
    pendiente_edgar: 'bg-amber-50 text-amber-800 border-amber-200',
    pendiente_jorge: 'bg-blue-50 text-blue-800 border-blue-200',
    aprobada: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    rechazada: 'bg-red-50 text-red-800 border-red-200',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${styles[estado]}`}
    >
      <Clock3 size={12} />
      {VACATION_STATUS_LABELS[estado]}
    </span>
  );
}

function RechazoBanner({
  solicitud,
  onReenviar,
  busy,
}: {
  solicitud: SolicitudVacacionesDoc;
  onReenviar: () => void;
  busy: boolean;
}) {
  return (
    <div className="mt-4 p-4 rounded-lg bg-red-50 border border-red-200">
      <p className="text-red-800 text-sm font-semibold flex items-center gap-2">
        <XCircle size={16} />
        Solicitud rechazada
        {solicitud.rechazadoPorNombre && (
          <span className="font-normal text-red-700">— {solicitud.rechazadoPorNombre}</span>
        )}
      </p>
      <p className="text-red-900/80 text-sm mt-2 leading-relaxed">
        <span className="font-medium">Motivo: </span>
        {solicitud.rechazoMotivo || 'Sin motivo registrado.'}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          onReenviar();
        }}
        className="mt-3 text-sm font-semibold disabled:opacity-50"
        style={{ color: AG_BLUE }}
      >
        Corregir y reenviar solicitud →
      </button>
    </div>
  );
}

function ProgressIcon({ state }: { state: ProgressStepState }) {
  if (state === 'done') {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <Check size={14} strokeWidth={3} />
      </span>
    );
  }
  if (state === 'current') {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-blue-700 ring-2 ring-blue-200">
        <Clock3 size={14} />
      </span>
    );
  }
  if (state === 'rejected') {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-red-700">
        <XCircle size={14} />
      </span>
    );
  }
  if (state === 'skipped') {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Circle size={10} />
      </span>
    );
  }
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-slate-200 text-slate-300">
      <Circle size={10} />
    </span>
  );
}

function VacationProgressTracker({
  solicitud,
  forApprover,
}: {
  solicitud: SolicitudVacacionesDoc;
  forApprover?: boolean;
}) {
  const steps = getVacationProgressSteps(solicitud);
  if (steps.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
        {forApprover ? 'Quién ya autorizó y qué falta' : 'Progreso de autorización'}
      </p>
      <ol className="space-y-0">
        {steps.map((step, index) => (
          <li key={step.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <ProgressIcon state={step.state} />
              {index < steps.length - 1 && (
                <div
                  className={`w-0.5 flex-1 min-h-[20px] my-0.5 ${
                    step.state === 'done' ? 'bg-emerald-200' : 'bg-slate-200'
                  }`}
                />
              )}
            </div>
            <div className="pb-4 flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800">{step.label}</p>
              <p
                className={`text-xs mt-0.5 ${
                  step.state === 'rejected'
                    ? 'text-red-600 font-medium'
                    : step.state === 'current'
                      ? 'text-blue-700'
                      : 'text-slate-500'
                }`}
              >
                {formatProgressStateLabel(step.state)}
              </p>
              {step.state === 'done' && step.autorizadoPor && (
                <p className="text-xs text-slate-600 mt-1">
                  {step.autorizadoPor}
                  {step.fecha && (
                    <span className="text-slate-400">
                      {' '}
                      · {format(parseISO(step.fecha), 'dd/MM/yyyy', { locale: es })}
                    </span>
                  )}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
      {solicitud.estado === 'aprobada' && (
        <p className="text-xs text-emerald-700 font-medium flex items-center gap-1.5 -mt-1">
          <CheckCircle2 size={14} />
          Solicitud completada
          {solicitud.correoEnviado ? ' · Enviada a Recursos Humanos' : ''}
        </p>
      )}
      {solicitud.estado === 'rechazada' && solicitud.rechazoMotivo && (
        <p className="text-xs text-red-700 mt-1 pl-10 leading-relaxed">
          <span className="font-semibold">Motivo del rechazo: </span>
          {solicitud.rechazoMotivo}
        </p>
      )}
    </div>
  );
}

function formatFechaSolicitud(iso: string): string {
  try {
    return format(parseISO(iso), "d 'de' MMMM yyyy", { locale: es });
  } catch {
    return iso;
  }
}

function SolicitudCard({
  solicitud,
  formatRango,
  showSolicitante,
  showProgress,
  variant = 'default',
  queuePosition,
  selectable,
  selected,
  onToggleSelect,
  collapsed,
  extra,
}: {
  solicitud: SolicitudVacacionesDoc;
  formatRango: (a: string, b: string) => string;
  showSolicitante?: boolean;
  showProgress?: boolean;
  variant?: 'default' | 'approver';
  queuePosition?: number;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  collapsed?: boolean;
  extra?: React.ReactNode;
}) {
  const esAprobador = variant === 'approver';
  const cardClass = esAprobador
    ? `block w-full text-left p-4 transition-colors cursor-pointer ${
        selected ? 'bg-sky-50/90' : 'hover:bg-slate-50'
      }`
    : selectable
      ? `bg-white rounded-xl border shadow-sm p-5 transition-all cursor-pointer ${
          selected
            ? 'border-[#2464A3] ring-2 ring-[#2464A3]/20 shadow-md'
            : 'border-slate-200 hover:border-slate-300 hover:shadow'
        }`
      : 'bg-white rounded-xl border border-slate-200 shadow-sm p-5';

  const rangoCorto = (() => {
    try {
      const a = format(parseISO(solicitud.fechaInicio), 'd MMM', { locale: es });
      const b = format(parseISO(solicitud.fechaFin), 'd MMM yyyy', { locale: es });
      return `${a} – ${b}`;
    } catch {
      return formatRango(solicitud.fechaInicio, solicitud.fechaFin);
    }
  })();

  return (
    <article
      className={cardClass}
      role={selectable ? 'button' : undefined}
      tabIndex={selectable ? 0 : undefined}
      onClick={selectable ? onToggleSelect : undefined}
      onKeyDown={
        selectable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggleSelect?.();
              }
            }
          : undefined
      }
    >
      {esAprobador && !selected && (
        <div className="flex items-center gap-3">
          {queuePosition != null && (
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
              style={{ backgroundColor: AG_BLUE }}
            >
              {queuePosition}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900 truncate">{solicitud.solicitanteNombre}</p>
            <p className="text-sm text-slate-500 truncate">
              {solicitud.diasVacaciones} día(s) · {rangoCorto}
            </p>
          </div>
          <ChevronDown
            size={18}
            className={`shrink-0 text-slate-400 transition-transform ${selected ? 'rotate-180' : ''}`}
          />
        </div>
      )}

      {esAprobador && selected && (
        <>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-start gap-3 min-w-0">
              {queuePosition != null && (
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
                  style={{ backgroundColor: AG_BLUE }}
                >
                  {queuePosition}
                </span>
              )}
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{solicitud.solicitanteNombre}</p>
                {solicitud.solicitantePuesto && (
                  <p className="text-sm text-slate-500">{solicitud.solicitantePuesto}</p>
                )}
                {solicitud.fechaSolicitud && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    Enviada el {formatFechaSolicitud(solicitud.fechaSolicitud)}
                  </p>
                )}
              </div>
            </div>
            <StatusBadge estado={solicitud.estado} />
          </div>
          <p className="text-sm text-slate-700 mb-1">
            <span className="font-semibold">{solicitud.diasVacaciones}</span> día(s) de vacaciones
          </p>
          <p className="text-sm text-slate-500">{formatRango(solicitud.fechaInicio, solicitud.fechaFin)}</p>
          {solicitud.comentarioSolicitante && (
            <p className="text-slate-600 text-sm mt-3 p-3 rounded-lg bg-white border border-slate-100">
              {solicitud.comentarioSolicitante}
            </p>
          )}
          {showProgress && (
            <VacationProgressTracker solicitud={solicitud} forApprover />
          )}
          {extra && <div className="mt-4 pt-4 border-t border-slate-200/80">{extra}</div>}
        </>
      )}

      {!esAprobador && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              {showSolicitante && (
                <p className="text-slate-900 font-medium flex items-center gap-2 mb-1">
                  <UserRound size={16} className="text-slate-400" />
                  {solicitud.solicitanteNombre}
                </p>
              )}
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-800">{solicitud.diasVacaciones}</span> día(s)
              </p>
              <p className="text-sm text-slate-500 mt-0.5">
                {formatRango(solicitud.fechaInicio, solicitud.fechaFin)}
              </p>
            </div>
            <StatusBadge estado={solicitud.estado} />
          </div>
          {solicitud.comentarioSolicitante && (
            <p className="text-slate-500 text-sm mt-3 pl-3 border-l-2 border-slate-200">
              {solicitud.comentarioSolicitante}
            </p>
          )}
          {showProgress && <VacationProgressTracker solicitud={solicitud} />}
          {collapsed && solicitud.estado !== 'borrador' && (
            <p className="text-xs text-slate-500 mt-2">
              {VACATION_STATUS_LABELS[solicitud.estado]}
              {solicitud.estado === 'rechazada' && solicitud.rechazoMotivo
                ? ` · ${solicitud.rechazoMotivo.slice(0, 60)}${solicitud.rechazoMotivo.length > 60 ? '…' : ''}`
                : ''}
            </p>
          )}
          {solicitud.estado === 'aprobada' && solicitud.correoEnviado && !showProgress && (
            <p className="text-emerald-700 text-xs mt-2 font-medium">
              Documento enviado a Recursos Humanos.
            </p>
          )}
          {extra}
        </>
      )}
    </article>
  );
}

export default SolicitudVacacionesScreen;
