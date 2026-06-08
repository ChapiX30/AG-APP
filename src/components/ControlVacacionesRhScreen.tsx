import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  Edit3,
  Loader2,
  Search,
  Users,
  X,
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
} from 'firebase/firestore';
import labLogo from '../assets/lab_logo.png';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { db } from '../utils/firebase';
import { isMetrologyRole, isQualityRole } from '../utils/calibrationShared';
import {
  computeVacationBalance,
  getDiasAsignadosFromSaldo,
  getVacationYear,
  type VacacionesSaldoYear,
} from '../utils/vacationBalance';

const AG_BLUE = '#2464A3';
const CURRENT_YEAR = getVacationYear();

const isTestUser = (name: string, email: string): boolean => {
  const combined = `${name} ${email}`.toLowerCase();
  return (
    combined.includes('prueba') ||
    combined.includes('test') ||
    combined.includes('demo') ||
    combined.includes('temporal') ||
    combined.includes('ejemplo')
  );
};

interface UsuarioRh {
  id: string;
  name: string;
  email: string;
  puesto: string;
  role: string;
  vacacionesSaldo?: Record<string, VacacionesSaldoYear>;
}

interface SolicitudResumen {
  solicitanteUid: string;
  diasVacaciones: number;
  estado: string;
  anio?: number;
  fechaInicio?: string;
}

type TabId = 'metrologia' | 'calidad';

// ─────────────────────────────── MAIN SCREEN ──────────────────────────────────

export const ControlVacacionesRhScreen: React.FC = () => {
  const { user } = useAuth();
  const { navigateTo } = useNavigation();

  const [usuarios, setUsuarios] = useState<UsuarioRh[]>([]);
  const [solicitudes, setSolicitudes] = useState<SolicitudResumen[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>('metrologia');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const isAdminRh = useMemo(() => {
    const role = `${user?.puesto || ''} ${user?.role || ''}`.toLowerCase();
    return role.includes('administrativo') || role.includes('admin');
  }, [user]);

  useEffect(() => {
    if (!isAdminRh) return;

    const unsubUsers = onSnapshot(collection(db, 'usuarios'), (snap) => {
      const list: UsuarioRh[] = [];
      snap.forEach((d) => {
        const data = d.data();
        const name = String(data.name || data.nombre || '').trim();
        const email = String(data.email || data.correo || '').trim();
        if (!name && !email) return;
        if (isTestUser(name, email)) return;
        list.push({
          id: d.id,
          name: name || email,
          email,
          puesto: String(data.puesto || '').trim(),
          role: String(data.role || '').trim(),
          vacacionesSaldo: data.vacacionesSaldo ?? {},
        });
      });
      list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
      setUsuarios(list);
      setLoading(false);
    }, (err) => { console.error(err); setLoading(false); });

    const unsubSol = onSnapshot(collection(db, 'solicitudesVacaciones'), (snap) => {
      setSolicitudes(snap.docs.map((d) => {
        const data = d.data();
        return {
          solicitanteUid: String(data.solicitanteUid ?? ''),
          diasVacaciones: Number(data.diasVacaciones ?? 0),
          estado: String(data.estado ?? ''),
          anio: data.anio != null ? Number(data.anio) : undefined,
          fechaInicio: data.fechaInicio ? String(data.fechaInicio) : undefined,
        };
      }));
    });

    return () => { unsubUsers(); unsubSol(); };
  }, [isAdminRh]);

  const getSaldo = (u: UsuarioRh) => {
    const asignados = getDiasAsignadosFromSaldo(u.vacacionesSaldo, CURRENT_YEAR);
    const userSolicitudes = solicitudes.filter((s) => s.solicitanteUid === u.id);
    return computeVacationBalance(asignados, userSolicitudes, CURRENT_YEAR);
  };

  const usersMetrologia = useMemo(
    () => usuarios.filter((u) => isMetrologyRole({ id: u.id, puesto: u.puesto, role: u.role })),
    [usuarios],
  );
  const usersCalidad = useMemo(
    () => usuarios.filter((u) => isQualityRole({ id: u.id, puesto: u.puesto, role: u.role })),
    [usuarios],
  );

  const currentList = tab === 'metrologia' ? usersMetrologia : usersCalidad;
  const filtered = useMemo(
    () => currentList.filter((u) => !search || u.name.toLowerCase().includes(search.toLowerCase())),
    [currentList, search],
  );

  const lowCount = useMemo(
    () => [...usersMetrologia, ...usersCalidad].filter((u) => {
      const { restantes, asignados, usados, pendientes } = getSaldo(u);
      if (asignados === 0 && usados === 0 && pendientes === 0) return false;
      return restantes < 0 || (restantes >= 0 && restantes <= 5);
    }).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [usersMetrologia, usersCalidad, solicitudes],
  );

  useEffect(() => {
    setEditingId(null);
    setEditValue('');
  }, [tab]);

  const startEdit = (u: UsuarioRh) => {
    if (saving) return;
    setEditingId(u.id);
    setEditValue(String(getDiasAsignadosFromSaldo(u.vacacionesSaldo, CURRENT_YEAR)));
  };
  const cancelEdit = () => {
    if (saving) return;
    setEditingId(null);
    setEditValue('');
  };

  const saveEdit = async (u: UsuarioRh) => {
    const val = parseInt(editValue, 10);
    if (isNaN(val) || val < -365 || val > 365) {
      toast.error('Indica un número válido entre -365 y 365.');
      return;
    }
    const actual = getDiasAsignadosFromSaldo(u.vacacionesSaldo, CURRENT_YEAR);
    if (val === actual) {
      cancelEdit();
      return;
    }
    setSaving(true);
    try {
      const yearKey = String(CURRENT_YEAR);
      await updateDoc(doc(db, 'usuarios', u.id), {
        [`vacacionesSaldo.${yearKey}`]: {
          diasAsignados: val,
          actualizadoPor: user?.name ?? 'RH',
          actualizadoEn: new Date().toISOString(),
        },
      });
      toast.success(`${u.name}: ${val} día(s) asignados para ${CURRENT_YEAR}.`);
      cancelEdit();
    } catch (e) {
      console.error(e);
      toast.error('No se pudo guardar. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdminRh) {
    return (
      <div className="min-h-full flex items-center justify-center bg-[#eef2f7]">
        <p className="text-slate-500 text-sm">Acceso restringido a Recursos Humanos.</p>
      </div>
    );
  }

  return (
    <div className="min-h-full w-full flex-shrink-0 bg-[#eef2f7] text-slate-800 font-sans">
      <Toaster position="top-center" toastOptions={{ className: 'text-sm font-medium' }} />

      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigateTo('menu')}
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            title="Menú"
          >
            <ArrowLeft size={20} />
          </button>
          <img src={labLogo} alt="Equipos y Servicios AG" className="h-10 w-auto object-contain" />
          <div className="flex-1 min-w-0 border-l border-slate-200 pl-4">
            <h1 className="text-lg sm:text-xl font-semibold text-slate-900 tracking-tight flex items-center gap-2">
              <CalendarDays size={20} style={{ color: AG_BLUE }} />
              Control de Vacaciones
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 truncate">
              Recursos Humanos · Año {CURRENT_YEAR}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={<Users size={18} />} label="Metrólogos" value={usersMetrologia.length} accent="blue" />
          <StatCard icon={<Users size={18} />} label="Calidad" value={usersCalidad.length} accent="violet" />
          <StatCard icon={<CalendarDays size={18} />} label="Año en curso" value={CURRENT_YEAR} accent="slate" />
          <StatCard icon={<span className="text-base font-bold">!</span>} label="Bajo saldo o adeudo" value={lowCount} accent="amber" />
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar colaborador por nombre…"
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 outline-none focus:border-[#2464A3] focus:ring-2 focus:ring-[#2464A3]/10 transition"
          />
        </div>

        {/* Tabs */}
        <nav className="flex gap-2 flex-wrap">
          {([ 
            { id: 'metrologia' as TabId, label: 'Técnicos / Metrólogos', count: usersMetrologia.length },
            { id: 'calidad' as TabId, label: 'Calidad', count: usersCalidad.length },
          ]).map((t) => (
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
              <Users size={15} />
              {t.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                tab === t.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                {t.count}
              </span>
            </button>
          ))}
        </nav>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-16 bg-white rounded-xl border border-slate-200 shadow-sm">
            <Loader2 className="animate-spin text-slate-400" size={28} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 py-14 px-6 text-center shadow-sm">
            <p className="text-sm text-slate-500">
              {search ? 'No se encontraron colaboradores con ese nombre.' : 'No hay usuarios en este grupo.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div
              className="hidden sm:grid gap-4 px-5 py-3 bg-slate-50/80 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide"
              style={{ gridTemplateColumns: '1fr 160px 180px' }}
            >
              <span>Colaborador</span>
              <span className="text-center">Días que corresponden</span>
              <span className="text-center">Disponibles</span>
            </div>

            <div className="divide-y divide-slate-100">
              {filtered.map((u) => {
                const { asignados, usados, pendientes, restantes } = getSaldo(u);
                const isEditing = editingId === u.id;
                const detalle: string[] = [];
                if (usados > 0) detalle.push(`${usados} tomados`);
                if (pendientes > 0) detalle.push(`${pendientes} en trámite`);

                return (
                  <div
                    key={u.id}
                    className={`px-5 py-4 transition-colors ${
                      isEditing ? 'bg-sky-50/90 ring-1 ring-inset ring-[#2464A3]/25' : 'hover:bg-slate-50/60'
                    }`}
                  >
                    {/* Mobile */}
                    <div className="sm:hidden space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <ColaboradorInfo name={u.name} puesto={u.puesto || u.role} />
                        <DisponiblesBadge restantes={restantes} asignados={asignados} />
                      </div>
                      {detalle.length > 0 && (
                        <p className="text-xs text-slate-400">{detalle.join(' · ')}</p>
                      )}
                      <DiasCorrespondenEditor
                        isEditing={isEditing}
                        editValue={editValue}
                        setEditValue={setEditValue}
                        saving={saving}
                        asignados={asignados}
                        onStart={() => startEdit(u)}
                        onSave={() => saveEdit(u)}
                        onCancel={cancelEdit}
                        layout="stacked"
                      />
                    </div>

                    {/* Desktop */}
                    <div
                      className="hidden sm:grid items-center gap-4"
                      style={{ gridTemplateColumns: '1fr 160px 180px' }}
                    >
                      <div className="min-w-0">
                        <ColaboradorInfo name={u.name} puesto={u.puesto || u.role} />
                        {detalle.length > 0 && (
                          <p className="text-xs text-slate-400 mt-1">{detalle.join(' · ')}</p>
                        )}
                      </div>
                      <DiasCorrespondenEditor
                        isEditing={isEditing}
                        editValue={editValue}
                        setEditValue={setEditValue}
                        saving={saving}
                        asignados={asignados}
                        onStart={() => startEdit(u)}
                        onSave={() => saveEdit(u)}
                        onCancel={cancelEdit}
                        layout="inline"
                      />
                      <div className="flex justify-center">
                        <DisponiblesBadge restantes={restantes} asignados={asignados} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p className="text-xs text-center text-slate-400 pb-4">
          Los días tomados y en trámite se calculan solos. Toca el lápiz para asignar cuántos días le corresponden a cada colaborador en {CURRENT_YEAR}.
        </p>
      </div>
    </div>
  );
};

// ─────────────────────────────── SUBCOMPONENTS ────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: 'blue' | 'violet' | 'slate' | 'amber';
}) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    violet: 'bg-violet-50 text-violet-600 border-violet-100',
    slate: 'bg-slate-50 text-slate-500 border-slate-200',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
  };
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-3 ${colors[accent]}`}>
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-xl font-bold leading-tight">{value}</p>
        <p className="text-xs opacity-75 leading-tight mt-0.5 truncate">{label}</p>
      </div>
    </div>
  );
}

function ColaboradorInfo({ name, puesto }: { name: string; puesto: string }) {
  return (
    <div className="min-w-0">
      <p className="font-semibold text-slate-900 truncate">{name}</p>
      {puesto && <p className="text-xs text-slate-400 truncate mt-0.5">{puesto}</p>}
    </div>
  );
}

function DisponiblesBadge({ restantes, asignados }: { restantes: number; asignados: number }) {
  if (asignados === 0 && restantes === 0) {
    return (
      <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
        Sin asignar
      </span>
    );
  }
  if (restantes < 0) {
    return (
      <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
        {Math.abs(restantes)} días de adeudo
      </span>
    );
  }
  if (restantes <= 5) {
    return (
      <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
        {restantes} disponibles
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
      {restantes} disponibles
    </span>
  );
}

function DiasCorrespondenEditor({
  isEditing,
  editValue,
  setEditValue,
  saving,
  asignados,
  onStart,
  onSave,
  onCancel,
  layout,
}: {
  isEditing: boolean;
  editValue: string;
  setEditValue: (v: string) => void;
  saving: boolean;
  asignados: number;
  onStart: () => void;
  onSave: () => void;
  onCancel: () => void;
  layout: 'inline' | 'stacked';
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const inputClass =
    'w-[4.5rem] h-10 bg-white border border-[#2464A3] rounded-lg text-center text-base font-bold text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-[#2464A3]/25 [color-scheme:light]';

  if (isEditing) {
    const editor = (
      <div
        className={`flex items-center gap-2 ${layout === 'inline' ? 'justify-center' : 'justify-start'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="number"
          min={-365}
          max={365}
          inputMode="numeric"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onSave();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              onCancel();
            }
          }}
          className={inputClass}
          aria-label="Días que corresponden"
        />
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="h-10 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50 transition-colors shrink-0"
        >
          {saving ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Guardar'}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onCancel}
          className="h-10 w-10 flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors shrink-0"
          title="Cancelar"
          aria-label="Cancelar"
        >
          <X size={16} />
        </button>
      </div>
    );
    if (layout === 'stacked') {
      return (
        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
          <p className="text-xs font-medium text-slate-500">Días que corresponden</p>
          {editor}
        </div>
      );
    }
    return editor;
  }

  const viewButton = (
    <button
      type="button"
      onClick={onStart}
      className="group inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-transparent hover:border-slate-200 hover:bg-white transition-colors"
      title="Editar días que corresponden"
    >
      <span className={`text-lg font-bold tabular-nums ${asignados === 0 ? 'text-slate-400' : asignados < 0 ? 'text-red-700' : 'text-slate-800'}`}>
        {asignados}
      </span>
      <span className="text-xs text-slate-400 group-hover:text-[#2464A3]">días</span>
      <Edit3 size={14} className="text-slate-400 group-hover:text-[#2464A3] transition-colors shrink-0" />
    </button>
  );

  if (layout === 'stacked') {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 space-y-1">
        <p className="text-xs font-medium text-slate-500">Días que corresponden</p>
        {viewButton}
      </div>
    );
  }

  return <div className="flex justify-center">{viewButton}</div>;
}

export default ControlVacacionesRhScreen;
