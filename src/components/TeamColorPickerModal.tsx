import React, { useMemo, useState } from 'react';
import { Check, Loader2, Palette } from 'lucide-react';
import {
  TEAM_AVATAR_PALETTE,
  claimTeamAvatarColor,
  getAvailablePaletteColors,
  getTakenPaletteColors,
  normalizeTeamColor,
} from '../utils/teamAvatarColor';

interface TeamColorPickerModalProps {
  /** Firebase Auth uid used for Firestore writes (`usuarios/{authUserId}`). */
  authUserId: string;
  userName: string;
  usuarios: { id: string; color?: string; name?: string; nombre?: string }[];
  isAdmin?: boolean;
  onColorClaimed: (color: string) => void;
}

const TeamColorPickerModal: React.FC<TeamColorPickerModalProps> = ({
  authUserId,
  userName,
  usuarios,
  isAdmin = false,
  onColorClaimed,
}) => {
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adminOverride, setAdminOverride] = useState(false);

  const taken = useMemo(() => getTakenPaletteColors(usuarios, authUserId), [usuarios, authUserId]);
  const available = useMemo(
    () => getAvailablePaletteColors(usuarios, authUserId),
    [usuarios, authUserId]
  );
  const allTaken = available.length === 0;

  const handleConfirm = async () => {
    if (!selected) {
      setError('Selecciona un color de la paleta.');
      return;
    }
    setSaving(true);
    setError(null);
    const result = await claimTeamAvatarColor(authUserId, selected, {
      allowDuplicate: isAdmin && adminOverride,
      takenColors: taken,
    });
    setSaving(false);
    if (result.ok) {
      onColorClaimed(normalizeTeamColor(selected));
      return;
    }
    setError(result.message);
  };

  const initials = userName
    ? userName
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0])
        .join('')
        .toUpperCase()
    : '??';

  const canConfirm =
    !!selected && (!allTaken || (isAdmin && adminOverride)) && !saving;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="team-color-picker-title"
    >
      <p id="team-color-picker-title" className="sr-only">
        Elige tu color de equipo
      </p>
      <ColorPickerPanel>
        <div className="flex items-center gap-2 mb-2">
          <Palette className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-bold text-gray-900">Elige tu color de equipo</h2>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Este color identificará tu avatar en servicios y asignaciones. Es permanente y no podrás
          cambiarlo después.
        </p>

        {selected && (
          <ColorPreviewBlock selected={selected} initials={initials} userName={userName} />
        )}

        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
          Paleta de colores
        </p>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 mb-4">
          {TEAM_AVATAR_PALETTE.map((hex) => {
            const normalized = normalizeTeamColor(hex);
            const isTaken = taken.has(normalized);
            const isSelected = selected === normalized;
            const disabled =
              saving || (isTaken && !(isAdmin && adminOverride) && !isSelected);

            return (
              <button
                key={hex}
                type="button"
                disabled={disabled}
                title={
                  isTaken && !(isAdmin && adminOverride)
                    ? 'Color no disponible'
                    : `Elegir ${hex}`
                }
                onClick={() => {
                  setSelected(normalized);
                  setError(null);
                }}
                className={`relative w-10 h-10 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                  disabled && !isSelected ? 'opacity-35 cursor-not-allowed' : 'hover:scale-110'
                } ${isSelected ? 'ring-2 ring-offset-2 ring-gray-900 scale-110' : ''}`}
                style={{ backgroundColor: hex }}
              >
                {isSelected && (
                  <Check className="w-4 h-4 text-white absolute inset-0 m-auto drop-shadow" />
                )}
                {isTaken && !(isAdmin && adminOverride) && !isSelected && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="w-full h-0.5 bg-white/90 rotate-45 absolute" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {allTaken && (
          <div className="mb-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
            <p>
              Todos los colores de la paleta están en uso. Contacta a Calidad si necesitas ayuda.
            </p>
            {isAdmin && (
              <label className="mt-2 flex items-center gap-2 cursor-pointer font-medium">
                <input
                  type="checkbox"
                  checked={adminOverride}
                  onChange={(e) => setAdminOverride(e.target.checked)}
                  className="rounded border-amber-400"
                />
                Permitir color duplicado (solo administrador)
              </label>
            )}
          </div>
        )}

        {error && (
          <p className="text-xs text-red-600 mb-3 font-medium" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleConfirm}
          disabled={!canConfirm}
          className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Guardando…
            </>
          ) : (
            'Confirmar mi color'
          )}
        </button>
      </ColorPickerPanel>
    </div>
  );
};

function ColorPreviewBlock({
  selected,
  initials,
  userName,
}: {
  selected: string;
  initials: string;
  userName: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm ring-2 ring-white shadow-md"
        style={{ backgroundColor: selected }}
      >
        {initials}
      </div>
      <div>
        <p className="text-xs text-gray-500">Vista previa</p>
        <p className="text-sm font-semibold text-gray-800">{userName || 'Tu perfil'}</p>
      </div>
    </div>
  );
}

function ColorPickerPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
      {children}
    </div>
  );
}

export default TeamColorPickerModal;
