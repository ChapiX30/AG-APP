import React, { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import html2canvas from "html2canvas";
import { addMonths, addYears, format, isValid, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  CheckCircle2,
  ChevronDown,
  Loader2,
  Printer,
  Settings2,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useAppDialog } from "../hooks/useAppDialog";
import EpsonLabel from "../utils/EpsonPlugin";
import {
  loadCachedPrinterLabels,
  saveEpsonPrinterLabel,
  subscribeEpsonPrinterLabels,
  type EpsonPrinterLabels,
} from "../utils/epsonPrinterLabels";

export interface LabelData {
  id: string;
  fechaCal: string;
  fechaSug: string;
  calibro: string;
  certificado: string;
  /** Etiqueta RECHAZADO (Reporte de Diagnóstico). */
  labelType?: "calibrado" | "rechazado";
}

export type LabelDateFormat = "full" | "year_month";

type EpsonPrinterDevice = {
  name: string;
  address: string;
  macAddress?: string;
  deviceId?: string;
  serialNumber?: string;
  alias?: string;
  isEpson: boolean;
  isTarget?: boolean;
};

const EPSON_PRINTER_MAC_KEY = "ag_epson_printer_mac";

function getPrinterDisplayName(device: EpsonPrinterDevice, labels: EpsonPrinterLabels): string {
  const mac = device.macAddress || device.address;
  return labels[mac]?.trim() || device.alias?.trim() || device.name || "LW-PX400";
}

function formatPrinterOption(device: EpsonPrinterDevice, labels: EpsonPrinterLabels): string {
  const mac = device.macAddress || device.address;
  const label = getPrinterDisplayName(device, labels);
  const tail = device.deviceId || mac.replace(/:/g, "").slice(-6).toUpperCase();
  return `${label} · ID ${tail}`;
}

export function formatTechnicianInitials(nombre?: string): string {
  if (!nombre?.trim()) return "AA";
  return nombre
    .trim()
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

function formatEpsonError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? "";
  const message = (error as { message?: string })?.message ?? String(error);

  switch (code) {
    case "NOT_FOUND":
      return "No se encontró la LW-PX400. Empareja la impresora en Ajustes → Bluetooth y vuelve a intentar.";
    case "BT_OFF":
      return "Bluetooth apagado. Actívalo en Ajustes del teléfono.";
    case "PERMISSION_DENIED":
      return "Faltan permisos Bluetooth. Ve a Ajustes → Apps → AG → Permisos → Dispositivos cercanos.";
    case "TIMEOUT":
      return "La impresora no respondió. Apágala y enciéndela, espera 10 s e intenta de nuevo.";
    case "BUSY":
      return "La impresora está ocupada. Espera unos segundos e intenta de nuevo.";
    default:
      return message || "No se pudo imprimir la etiqueta.";
  }
}

export function calcularSiguienteFecha(fechaUltima: string, frecuencia: string): Date | null {
  if (!fechaUltima || !frecuencia) return null;
  const parts = fechaUltima.split("-");
  if (parts.length !== 3) return null;
  const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  if (isNaN(date.getTime())) return null;
  const lowerFrecuencia = frecuencia.toLowerCase();
  if (lowerFrecuencia.includes("mes")) {
    const meses =
      lowerFrecuencia.includes("1") ? 1 :
      lowerFrecuencia.includes("3") ? 3 :
      lowerFrecuencia.includes("6") ? 6 : 0;
    return meses > 0 ? addMonths(date, meses) : null;
  }
  if (lowerFrecuencia.includes("año") || lowerFrecuencia.includes("ano")) {
    const años = lowerFrecuencia.includes("2") ? 2 : lowerFrecuencia.includes("3") ? 3 : 1;
    return addYears(date, años);
  }
  return null;
}

export function formatLabelDate(d: Date, mode: LabelDateFormat): string {
  const pattern = mode === "year_month" ? "yyyy-MMM" : "yyyy-MMM-dd";
  return format(d, pattern, { locale: es }).toUpperCase().replace(".", "");
}

/** Construye los datos de etiqueta a partir de una hoja / registro de historial. */
export function buildLabelDataFromRecord(
  record: {
    id?: string;
    fecha?: string;
    frecuenciaCalibracion?: string;
    certificado?: string;
    nombre?: string;
    magnitud?: string;
  },
  dateMode: LabelDateFormat = "full"
): LabelData {
  const nextDate = calcularSiguienteFecha(record.fecha || "", record.frecuenciaCalibracion || "");
  const fCalObj = record.fecha ? parseISO(record.fecha) : new Date();
  const fSugObj = nextDate ? nextDate : addYears(fCalObj, 1);
  return {
    id: record.id || "PENDIENTE",
    certificado: record.certificado || "PENDIENTE",
    fechaCal: record.fecha ? formatLabelDate(fCalObj, dateMode) : "---",
    fechaSug: isValid(fSugObj) ? formatLabelDate(fSugObj, dateMode) : "---",
    calibro: formatTechnicianInitials(record.nombre),
    labelType: record.magnitud === "Reporte de Diagnostico" ? "rechazado" : "calibrado",
  };
}

export const LabelPrinterButton: React.FC<{
  data: LabelData;
  logo: string;
  compact?: boolean;
  /** Si false, no prepara Bluetooth al montar (útil cuando hay muchos botones en lista). */
  prepareOnMount?: boolean;
  className?: string;
}> = ({ data, logo, compact = false, prepareOnMount = true, className = "" }) => {
  const labelRef = useRef<HTMLDivElement>(null);
  const { alert: showAlert } = useAppDialog();
  const { user } = useAuth();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [tapeSize, setTapeSize] = useState<"24mm" | "12mm">("24mm");
  const [showOptions, setShowOptions] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [showPrinterDialog, setShowPrinterDialog] = useState(false);
  const [printerDevices, setPrinterDevices] = useState<EpsonPrinterDevice[]>([]);
  const [printerLabels, setPrinterLabels] = useState<EpsonPrinterLabels>(() => loadCachedPrinterLabels());
  const [selectedPrinterAddress, setSelectedPrinterAddress] = useState<string>(() =>
    localStorage.getItem(EPSON_PRINTER_MAC_KEY) || ""
  );
  const [editingPrinterMac, setEditingPrinterMac] = useState("");
  const [editingPrinterLabel, setEditingPrinterLabel] = useState("");
  const [isSavingPrinterLabel, setIsSavingPrinterLabel] = useState(false);

  useEffect(() => {
    if (selectedPrinterAddress) {
      localStorage.setItem(EPSON_PRINTER_MAC_KEY, selectedPrinterAddress);
    }
  }, [selectedPrinterAddress]);

  useEffect(() => {
    const unsubscribe = subscribeEpsonPrinterLabels(
      (labels) => setPrinterLabels(labels),
      () => setPrinterLabels(loadCachedPrinterLabels())
    );
    return unsubscribe;
  }, []);

  const selectedPrinterName = useMemo(() => {
    if (!selectedPrinterAddress) return "Automática";
    const device = printerDevices.find(
      (d) => (d.macAddress || d.address).toUpperCase() === selectedPrinterAddress.toUpperCase()
    );
    if (device) return getPrinterDisplayName(device, printerLabels);
    const savedLabel = printerLabels[selectedPrinterAddress];
    if (savedLabel) return savedLabel;
    return `ID ${selectedPrinterAddress.replace(/:/g, "").slice(-6).toUpperCase()}`;
  }, [printerDevices, printerLabels, selectedPrinterAddress]);

  const loadPrinterDevices = async (): Promise<EpsonPrinterDevice[]> => {
    const result = await EpsonLabel.findEpsonPrinters();
    const devices = result.devices.filter((d) => d.isEpson);
    setPrinterDevices(devices);
    return devices;
  };

  const prepareSelectedPrinter = async (address?: string) => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await EpsonLabel.preparePrinter({
        printerAddress: address || undefined,
      });
    } catch {
      // Si falla, la primera impresión hará el descubrimiento completo.
    }
  };

  const openPrinterPicker = async () => {
    if (!Capacitor.isNativePlatform()) {
      await showAlert({
        title: "Solo en Android",
        message: "La selección de impresora solo está disponible en la app del teléfono.",
        variant: "warning",
      });
      return;
    }

    setIsTesting(true);
    try {
      const devices = await loadPrinterDevices();
      if (!devices.length) {
        await showAlert({
          title: "Sin impresoras",
          message: "No hay etiquetadoras Epson emparejadas. Empareja cada LW-PX400 en Ajustes → Bluetooth y ponle un nombre (p. ej. Etiquetadora Juan).",
          variant: "warning",
        });
        return;
      }
      setShowPrinterDialog(true);
    } catch (error) {
      await showAlert({
        title: "Error de conexión",
        message: formatEpsonError(error),
        variant: "danger",
      });
    } finally {
      setIsTesting(false);
    }
  };

  useEffect(() => {
    if (prepareOnMount && Capacitor.isNativePlatform()) {
      void prepareSelectedPrinter(selectedPrinterAddress || undefined);
    }
  }, [prepareOnMount]);

  const savePrinterNickname = async (mac: string) => {
    const trimmed = editingPrinterLabel.trim();
    setIsSavingPrinterLabel(true);
    try {
      await saveEpsonPrinterLabel(mac, trimmed, user?.name || user?.email || "");
      setEditingPrinterMac("");
      setEditingPrinterLabel("");
    } catch (error) {
      await showAlert({
        title: "No se guardó el apodo",
        message: error instanceof Error ? error.message : "Revisa tu conexión e intenta de nuevo.",
        variant: "danger",
      });
    } finally {
      setIsSavingPrinterLabel(false);
    }
  };

  const handleTestConnection = async () => {
    if (!Capacitor.isNativePlatform()) {
      await showAlert({
        title: "Solo en Android",
        message: "La conexión Bluetooth con la Epson solo funciona en la app instalada en el teléfono.",
        variant: "warning",
      });
      return;
    }

    setIsTesting(true);
    try {
      const result = await EpsonLabel.findEpsonPrinters();
      const epsonDevices = result.devices.filter((d) => d.isEpson);
      const lines = epsonDevices.length
        ? epsonDevices.map((d) => {
            const mac = d.macAddress || d.address;
            const tail = d.deviceId || mac.replace(/:/g, "").slice(-6).toUpperCase();
            const label = getPrinterDisplayName(d, printerLabels);
            return `• ${label}\n  MAC: ${mac}\n  ID: ${tail}${d.isTarget ? " ✓ PX400" : ""}`;
          }).join("\n\n")
        : "No hay impresoras Epson emparejadas.";

      await showAlert({
        title: result.targetFound ? "Impresoras detectadas" : "Diagnóstico Bluetooth",
        message: result.targetFound
          ? `${epsonDevices.length} etiquetadora(s) encontrada(s).\n\n${lines}\n\nTip: renombra cada una en Ajustes → Bluetooth para identificarlas (p. ej. Etiquetadora EA).`
          : `No se detectó la LW-PX400.\n\nDispositivos emparejados: ${result.total}\n\n${lines}`,
        variant: result.targetFound ? "default" : "warning",
      });
    } catch (error) {
      await showAlert({
        title: "Error de conexión",
        message: formatEpsonError(error),
        variant: "danger",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handlePrintAction = async (copies = 1) => {
    if (!labelRef.current) return;
    setIsGenerating(true);
    setShowCopyDialog(false);

    try {
      if (Capacitor.isNativePlatform()) {
        await EpsonLabel.printLabel({
          id: data.id.trim(),
          fechaCal: data.fechaCal,
          fechaSug: data.fechaSug,
          certificado: data.certificado.trim(),
          calibro: data.calibro,
          tapeSize,
          labelType: data.labelType === "rechazado" ? "rechazado" : "calibrado",
          copies,
          printerAddress: selectedPrinterAddress || undefined,
        });
        await showAlert({
          title: "Etiqueta impresa",
          message: `${copies} copia${copies === 1 ? "" : "s"} en ${selectedPrinterName} vía Bluetooth.`,
          variant: "default",
        });
      } else {
        await new Promise((resolve) => setTimeout(resolve, 300));
        const originalCanvas = await html2canvas(labelRef.current, {
          scale: 3,
          backgroundColor: "#ffffff",
          useCORS: true,
          logging: true,
        });
        const link = document.createElement("a");
        link.download = `ETIQUETA_${data.id}.png`;
        link.href = originalCanvas.toDataURL("image/png");
        link.click();
      }

      setIsGenerating(false);
      setShowOptions(false);
    } catch (error: unknown) {
      console.error("Error al generar etiqueta", error);
      await showAlert({ title: "Error de impresión", message: formatEpsonError(error), variant: "danger" });
      setIsGenerating(false);
    }
  };

  return (
    <div className={`relative flex flex-col gap-1.5 items-end ${className}`}>
      <div className={`flex bg-slate-900 text-white rounded-lg overflow-hidden shadow-lg border border-slate-700 ${compact ? "text-xs" : ""}`}>
        <button
          type="button"
          onClick={() => {
            if (Capacitor.isNativePlatform()) {
              setShowCopyDialog(true);
            } else {
              void handlePrintAction(1);
            }
          }}
          disabled={isGenerating}
          className={`flex items-center gap-2 hover:bg-slate-800 transition-all disabled:opacity-50 ${compact ? "px-3 py-1.5" : "px-4 py-2"}`}
        >
          {isGenerating ? <Loader2 className="animate-spin w-4 h-4" /> : <Printer className="w-4 h-4" />}
          <span className="font-bold text-sm">
            {compact ? "Etiqueta" : "Imprimir"}
            {!compact && data.labelType === "rechazado" ? " · Rechazado" : ""}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setShowOptions(!showOptions)}
          className={`bg-slate-800 border-l border-slate-700 hover:bg-slate-700 transition-colors ${compact ? "px-1.5" : "px-2"}`}
        >
          <Settings2 className="w-4 h-4" />
        </button>
      </div>

      {Capacitor.isNativePlatform() && !compact && (
        <button
          type="button"
          onClick={() => void openPrinterPicker()}
          disabled={isTesting || isGenerating}
          className="flex items-center gap-2 max-w-[280px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-left shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <Printer className="w-4 h-4 shrink-0 text-slate-700" />
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] uppercase tracking-wide text-slate-500">Impresora</span>
            <span className="block truncate text-sm font-semibold text-slate-900">
              {isTesting ? "Buscando..." : selectedPrinterName}
            </span>
          </span>
          <ChevronDown className="w-4 h-4 shrink-0 text-slate-500" />
        </button>
      )}

      {showOptions && (
        <>
          <div
            className="fixed inset-0 z-[115] bg-black/25"
            onClick={() => setShowOptions(false)}
            aria-hidden
          />
          <div className="fixed top-20 right-4 sm:right-6 z-[120] bg-white rounded-xl shadow-2xl border border-gray-200 p-2 w-56 max-w-[calc(100vw-2rem)]">
            <p className="px-3 pt-1 pb-2 text-[10px] font-bold uppercase tracking-wide text-gray-500">
              Tamaño de cinta
            </p>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => { setTapeSize("24mm"); setShowOptions(false); }}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex justify-between ${tapeSize === "24mm" ? "bg-blue-50 text-blue-700 font-bold" : "text-gray-700 hover:bg-gray-50"}`}
              >
                <span>24mm (Grande)</span> {tapeSize === "24mm" && <CheckCircle2 className="w-3 h-3" />}
              </button>
              <button
                type="button"
                onClick={() => { setTapeSize("12mm"); setShowOptions(false); }}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex justify-between ${tapeSize === "12mm" ? "bg-blue-50 text-blue-700 font-bold" : "text-gray-700 hover:bg-gray-50"}`}
              >
                <span>12mm (Pequeña)</span> {tapeSize === "12mm" && <CheckCircle2 className="w-3 h-3" />}
              </button>
              <div className="border-t border-gray-100 my-1" />
              <div className="px-3 py-2 text-xs text-gray-500">
                Impresora: <span className="font-semibold text-gray-800">{selectedPrinterName}</span>
              </div>
              <button
                type="button"
                onClick={() => { setShowOptions(false); void openPrinterPicker(); }}
                disabled={isTesting || isGenerating}
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {isTesting ? "Buscando..." : "Seleccionar impresora"}
              </button>
              <button
                type="button"
                onClick={() => { setShowOptions(false); void handleTestConnection(); }}
                disabled={isTesting || isGenerating}
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {isTesting ? "Probando..." : "Probar conexión PX400"}
              </button>
            </div>
          </div>
        </>
      )}

      {showPrinterDialog && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl border border-gray-200 p-4 max-h-[85vh] overflow-y-auto">
            <h3 className="text-sm font-bold text-gray-900 mb-1">Seleccionar etiquetadora</h3>
            <div className="flex items-start justify-between gap-2 mb-3">
              <p className="text-xs text-gray-600">
                Los apodos se guardan para <span className="font-semibold">todo el equipo</span>. Usa el ID (últimos 6 del MAC) si aún no tiene nombre.
              </p>
              <button
                type="button"
                onClick={() => void loadPrinterDevices()}
                disabled={isTesting}
                className="shrink-0 rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {isTesting ? "..." : "Actualizar"}
              </button>
            </div>
            <div className="space-y-2 mb-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedPrinterAddress("");
                  localStorage.removeItem(EPSON_PRINTER_MAC_KEY);
                  setShowPrinterDialog(false);
                  void prepareSelectedPrinter();
                }}
                className={`w-full text-left px-3 py-2 rounded-lg border text-sm ${!selectedPrinterAddress ? "border-blue-300 bg-blue-50 font-bold" : "border-gray-200"}`}
              >
                Automática (primera PX400 encontrada)
              </button>
              {printerDevices.map((device) => {
                const mac = device.macAddress || device.address;
                const isSelected = selectedPrinterAddress.toUpperCase() === mac.toUpperCase();
                return (
                  <div key={mac} className={`rounded-lg border p-3 ${isSelected ? "border-blue-300 bg-blue-50" : "border-gray-200"}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPrinterAddress(mac);
                        setShowPrinterDialog(false);
                        void prepareSelectedPrinter(mac);
                      }}
                      className="w-full text-left"
                    >
                      <div className="text-sm font-bold text-gray-900">{formatPrinterOption(device, printerLabels)}</div>
                      <div className="text-xs text-gray-500 mt-1">MAC: {mac}</div>
                    </button>
                    {editingPrinterMac === mac ? (
                      <div className="mt-2 flex gap-2">
                        <input
                          value={editingPrinterLabel}
                          onChange={(e) => setEditingPrinterLabel(e.target.value)}
                          placeholder="Apodo (p. ej. Etiquetadora EA)"
                          className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => void savePrinterNickname(mac)}
                          disabled={isSavingPrinterLabel}
                          className="rounded bg-slate-900 text-white px-2 py-1 text-xs disabled:opacity-50"
                        >
                          {isSavingPrinterLabel ? "..." : "OK"}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPrinterMac(mac);
                          setEditingPrinterLabel(printerLabels[mac] || "");
                        }}
                        className="mt-2 text-xs text-blue-700 hover:underline"
                      >
                        {printerLabels[mac] ? "Editar apodo" : "Poner apodo"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setShowPrinterDialog(false)}
              className="w-full rounded-lg border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {showCopyDialog && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xs rounded-xl bg-white shadow-2xl border border-gray-200 p-4">
            <h3 className="text-sm font-bold text-gray-900 mb-1">Copias de etiqueta</h3>
            <p className="text-xs text-gray-600 mb-1">¿Cuántas copias quieres imprimir?</p>
            <p className="text-xs text-gray-500 mb-4">
              Impresora: <span className="font-semibold text-gray-800">{selectedPrinterName}</span>
            </p>
            <div className="grid grid-cols-5 gap-2 mb-4">
              {[1, 2, 3, 4, 5].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => void handlePrintAction(count)}
                  disabled={isGenerating}
                  className="rounded-lg border border-slate-200 py-2 text-sm font-bold text-slate-800 hover:bg-blue-50 hover:border-blue-300 disabled:opacity-50"
                >
                  {count}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowCopyDialog(false)}
              disabled={isGenerating}
              className="w-full rounded-lg border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* RENDERIZADO VISUAL DE LA ETIQUETA WEB */}
      <div style={{ position: "absolute", opacity: 0, zIndex: -100, pointerEvents: "none", left: 0, top: 0 }}>
        {tapeSize === "24mm" && (
          <div ref={labelRef} style={{ width: "400px", height: "240px", backgroundColor: "white", display: "flex", flexDirection: "column", fontFamily: "Arial, sans-serif", border: "2px solid black", padding: "0", overflow: "hidden" }}>
            <div style={{ backgroundColor: "black", color: "white", textAlign: "center", padding: "6px 0", letterSpacing: "6px", fontSize: "14px", fontWeight: "900" }}>
              {data.labelType === "rechazado" ? "R E C H A Z A D O" : "C A L I B R A D O"}
            </div>
            <div style={{ flex: 1, display: "flex", padding: "6px 8px 2px 8px" }}>
              <div style={{ width: "95px", display: "flex", alignItems: "center", justifyContent: "center", paddingRight: "6px" }}>
                <img src={logo} alt="Logo" style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }} />
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: "3px" }}>
                <div style={{ fontSize: "22px", fontWeight: "900", color: "black", lineHeight: "1" }}>ID: {data.id}</div>
                {data.labelType === "rechazado" ? (
                  <>
                    <div style={{ fontSize: "13px", fontStyle: "italic", color: "black" }}>F.REV.: {data.fechaCal}</div>
                    <div style={{ fontSize: "14px", fontWeight: "bold", color: "black" }}>VERIFICO: {data.calibro}</div>
                    <div style={{ fontSize: "14px", fontWeight: "bold", color: "black" }}>CERT: {data.certificado}</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: "13px", fontStyle: "italic", color: "black" }}>F.CAL: {data.fechaCal}</div>
                    <div style={{ fontSize: "13px", fontStyle: "italic", color: "black" }}>F.SUG: {data.fechaSug}</div>
                    <div style={{ fontSize: "14px", fontWeight: "bold", color: "black" }}>CALIBRÓ: {data.calibro}</div>
                    <div style={{ fontSize: "14px", fontWeight: "bold", color: "black" }}>CERT: {data.certificado}</div>
                  </>
                )}
              </div>
            </div>
            <div style={{ padding: "0 8px 4px 8px", fontSize: "11px", fontStyle: "italic", color: "#444" }}>AG-CAL-F14-00</div>
          </div>
        )}
        {tapeSize === "12mm" && (
          <div ref={labelRef} style={{ width: "400px", height: "120px", backgroundColor: "white", display: "flex", fontFamily: "Arial, sans-serif", border: "1px solid black", padding: 0, overflow: "hidden" }}>
            <div style={{ width: "64px", height: "100%", display: "flex", alignItems: "center", justifyContent: "flex-start", padding: "6px 2px 6px 4px" }}>
              <img src={logo} alt="Logo" style={{ maxHeight: "82%", maxWidth: "100%", objectFit: "contain" }} />
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
              <div style={{ backgroundColor: "black", color: "white", textAlign: "center", padding: "3px 0", letterSpacing: "2px", fontSize: "11px", fontWeight: "900" }}>
                {data.labelType === "rechazado" ? "RECHAZADO" : "CALIBRADO"}
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-around", padding: "2px 4px 2px 4px", fontSize: "12px", fontWeight: "600", lineHeight: 1.15 }}>
                {data.labelType === "rechazado" ? (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                      <span style={{ flex: "1.05 1 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>ID: {data.id}</span>
                      <span style={{ flex: "0.95 1 0", fontSize: "10px", fontWeight: "800", textAlign: "right" }}>AG-CAL-F14-00</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                      <span style={{ flex: "1.05 1 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>F.REV.: {data.fechaCal}</span>
                      <span style={{ flex: "0.95 1 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right", fontWeight: "800" }}>VERIFICO: {data.calibro}</span>
                    </div>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>CERT: {data.certificado}</div>
                  </>
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                      <span style={{ flex: "1.05 1 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>ID: {data.id}</span>
                      <span style={{ flex: "0.95 1 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right", fontWeight: "800" }}>Cert: {data.certificado}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                      <span style={{ flex: "1.05 1 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>F.CAL: {data.fechaCal}</span>
                      <span style={{ flex: "0.95 1 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right", fontWeight: "800" }}>CALIBRÓ: {data.calibro}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "baseline" }}>
                      <span style={{ flex: "1.05 1 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>F.SUG: {data.fechaSug}</span>
                      <span style={{ flex: "0.95 1 0", fontSize: "10px", fontWeight: "800", textAlign: "right" }}>AG-CAL-F14-00</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
