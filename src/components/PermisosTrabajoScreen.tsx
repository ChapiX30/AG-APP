import React, { useState, useEffect } from 'react';
import { FileText, Printer, Users, ShieldCheck, ClipboardList } from 'lucide-react';
import { format } from 'date-fns';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { saveAs } from 'file-saver';
import { collection, query, where, getDocs } from 'firebase/firestore'; 
import { db } from '../utils/firebase';
import { useAppDialog } from '../hooks/useAppDialog';
import {
  AG_BRAND_BLUE,
  OperationalScreenHeader,
  OperationalScreenShell,
} from './ui/OperationalScreenShell';

const AG_BLUE = AG_BRAND_BLUE;
const INPUT_CLASS =
  'w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#2464A3] focus:ring-2 focus:ring-[#2464A3]/15 transition-colors';

const PROCESOS = [
  { id: 'electrica', nombre: 'Proceso eléctrica:', descripcion: 'Simulación de patrón a instrumento o viceversa dependiendo el equipo a calibrar hasta 580 VDC, VAC etc.', riesgo: 'Descarga eléctrica y contacto con partes energizadas' },
  { id: 'presion', nombre: 'Proceso presión:', descripcion: 'Calibración directa entre bomba hidráulica manual de 1,000 PSI a 5,000 PSI.', riesgo: 'Proyección de fluidos a alta presión y liberación súbita de presión' },
  { id: 'temperatura', nombre: 'Proceso temperatura:', descripcion: 'Comparación directa mediante termocople tipo J o K dependiendo de la condición del instrumento.', riesgo: 'Quemaduras por contacto con superficies calientes' },
  { id: 'dimensional', nombre: 'Proceso dimensional:', descripcion: 'Comparacion directa contra bloques patron', riesgo: 'Cortaduras y golpes por manejo de bloques patrón metálicos' },
  { id: 'flujo', nombre: 'Proceso flujo:', descripcion: 'Comparación directa entre patrón e instrumento regulando la presión en máquina.', riesgo: 'Proyección de fluidos y contacto con presión residual en líneas' },
  { id: 'par', nombre: 'Proceso par torsional:', descripcion: 'Comparación directa en analizador torque e instrumento entre 90 lbin y 50 ftlb.', riesgo: 'Atrapamiento de manos y golpes por liberación de energía mecánica' },
  { id: 'quimica', nombre: 'Proceso química:', descripcion: 'Calibración de instrumentos de conductividad y pH mediante soluciones patrón buffer y estándares de conductividad.', riesgo: 'Contacto con soluciones químicas, salpicaduras y irritación en piel u ojos' }
];

// Función de ayuda para dividir texto largo en múltiples líneas sin cortar palabras
const dividirTexto = (texto: string, longitudMaxima: number): string[] => {
  const palabras = texto.split(' ');
  const lineas: string[] = [];
  let lineaActual = '';

  palabras.forEach((palabra) => {
    if ((lineaActual + palabra).length > longitudMaxima) {
      lineas.push(lineaActual.trim());
      lineaActual = palabra + ' ';
    } else {
      lineaActual += palabra + ' ';
    }
  });
  if (lineaActual) lineas.push(lineaActual.trim());
  return lineas;
};

const FormField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
    {children}
  </div>
);

export const PermisosTrabajoScreen: React.FC = () => {
  const { alert: showAlert } = useAppDialog();
  const [fecha, setFecha] = useState(format(new Date(), "dd/MM/yyyy"));
  const [compania, setCompania] = useState('Equipos y Servicios AG');
  const [jefe, setJefe] = useState('Jorge Amador');
  const [lugar, setLugar] = useState('Celestica de Monterrey');
  const [horaInicio, setHoraInicio] = useState('09:00');
  const [horaFin, setHoraFin] = useState('15:00');
  
  const [procesosSel, setProcesosSel] = useState<string[]>(['electrica']); 
  const [metrologosSel, setMetrologosSel] = useState<string[]>([]); 
  const [metrologos, setMetrologos] = useState<{ id: string; nombre: string; ocupacion: string }[]>([]);

  useEffect(() => {
    const fetchMetrologos = async () => {
      try {
        const usersQ = query(collection(db, "usuarios"), where("puesto", "==", "Metrólogo"));
        const usersSnap = await getDocs(usersQ);
        const data = usersSnap.docs.map(doc => ({
          id: doc.id,
          nombre: doc.data().name || doc.data().nombre,
          ocupacion: 'Metrólogo' 
        }));
        setMetrologos(data);
      } catch (error) {
        console.error("Error cargando metrólogos:", error);
      }
    };
    fetchMetrologos();
  }, []);

  const toggleProceso = (id: string) => {
    setProcesosSel(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const toggleMetrologo = (id: string) => {
    setMetrologosSel(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  };

  const generarPDF = async () => {
    if (metrologosSel.length === 0 || procesosSel.length === 0) {
      await showAlert({ title: 'Aviso', message: 'Por favor selecciona al menos un metrólogo y un proceso.' });
      return;
    }

    try {
      const response = await fetch('/plantilla_permiso.pdf');
      const existingPdfBytes = await response.arrayBuffer();
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const pages = pdfDoc.getPages();
      const color = rgb(0, 0, 0);

      const metrologosActivos = metrologos.filter(m => metrologosSel.includes(m.id));
      const procesosActivos = PROCESOS.filter(p => procesosSel.includes(p.id));
      
      const dibujar = (pageIndex: number, texto: string, x: number, y: number, isBold = false, size = 9) => {
        const pagina = pages[pageIndex];
        const { height } = pagina.getSize();
        pagina.drawText(texto, { x, y: height - y, size, font: isBold ? fontBold : font, color });
      };

      // --- DATOS GENERALES ---
      const p1_y_base = 265; 
      const row_spacing = 16; 
      
      // Ajuste Compañia: Movido a la derecha
      dibujar(0, compania, 115, p1_y_base); 
      dibujar(0, jefe, 355, p1_y_base); 
      
      // Ajuste Lugar: Subido un poquito
      dibujar(0, lugar, 95, p1_y_base + row_spacing - 1.5); 
      dibujar(0, 'Ver anexo', 355, p1_y_base + row_spacing); 
      
      // Ajuste Horas: Bajadas 3 puntos para asentar en línea
      const horas_y = p1_y_base + (row_spacing * 2) - 3; 
      // Ajuste Hora Inicio: Movido a la derecha
      dibujar(0, horaInicio, 155, horas_y); 
      // Ajuste Hora Fin: Movido a la izquierda
      dibujar(0, horaFin, 395, horas_y); 
      
      const fecha_y = p1_y_base + (row_spacing * 3) - 7; 
      const [dd, mm, yyyy] = fecha.split('/'); 
      dibujar(0, dd, 172, fecha_y);   
      dibujar(0, mm, 220, fecha_y);   
      dibujar(0, yyyy, 245, fecha_y); 

      // --- MAGNITUDES ---
      const desc_y = 346; 
      dibujar(0, `Servicio de calibración en las magnitudes:`, 50, desc_y);
      
      const magnitudesNombres = procesosActivos.map(p => p.nombre.replace('Proceso ', '').replace(':', '')).join(', ').toUpperCase();
      const lineasMagnitudes = dividirTexto(magnitudesNombres, 85); 
      
      lineasMagnitudes.forEach((linea, index) => {
        dibujar(0, linea, 50, desc_y + 14 + (index * 12), true, 8); 
      });

      // --- ACTIVIDADES (PÁGINA 1) ---
      const COL_ACTIVIDAD_X = 76;
      const COL_ACTIVIDAD_ANCHO = 154;
      const COL_RIESGO_X = 242;
      const COL_RIESGO_ANCHO = 170;
      const COL_CONTRAMEDIDA_X = 424;
      const startY = 418;
      const table1_spacing = 13.8;

      const OFFSETS_CELDA: Record<number, number[]> = {
        1: [1],
        2: [-5, 1],
        3: [-6.5, -1.5, 3],
      };

      const dividirPorAncho = (texto: string, anchoMax: number, size: number, maxLineas: number): string[] => {
        const palabras = texto.split(' ').filter(Boolean);
        const lineas: string[] = [];
        let lineaActual = '';

        for (let i = 0; i < palabras.length; i++) {
          const palabra = palabras[i];
          const candidato = lineaActual ? `${lineaActual} ${palabra}` : palabra;

          if (font.widthOfTextAtSize(candidato, size) > anchoMax && lineaActual) {
            lineas.push(lineaActual);
            if (lineas.length >= maxLineas - 1) {
              lineas.push(palabras.slice(i).join(' '));
              return lineas.slice(0, maxLineas);
            }
            lineaActual = palabra;
          } else {
            lineaActual = candidato;
          }
        }

        if (lineaActual) lineas.push(lineaActual);
        return lineas.slice(0, maxLineas);
      };

      const cabeEnAncho = (lineas: string[], size: number, anchoMax: number) =>
        lineas.every(l => font.widthOfTextAtSize(l, size) <= anchoMax);

      const obtenerLineasCelda = (texto: string, anchoMax: number): { lineas: string[]; size: number } => {
        for (const size of [6.5, 6]) {
          const lineas = dividirPorAncho(texto, anchoMax, size, 2);
          if (lineas.length <= 2 && cabeEnAncho(lineas, size, anchoMax)) return { lineas, size };
        }
        for (const size of [6, 5.5]) {
          const lineas = dividirPorAncho(texto, anchoMax, size, 3);
          if (lineas.length <= 3 && cabeEnAncho(lineas, size, anchoMax)) return { lineas, size };
        }
        return { lineas: dividirPorAncho(texto, anchoMax, 5.5, 3), size: 5.5 };
      };

      const dibujarCelda = (texto: string, x: number, y: number, anchoMax: number) => {
        const { lineas, size } = obtenerLineasCelda(texto, anchoMax);
        const offsets = OFFSETS_CELDA[lineas.length] ?? OFFSETS_CELDA[1];
        lineas.forEach((linea, idx) => {
          dibujar(0, linea, x, y + offsets[idx], false, size);
        });
      };

      dibujar(0, 'Revisión de equipo', COL_ACTIVIDAD_X, startY + 1, false, 6.5);
      dibujar(0, 'Caída de equipo', COL_RIESGO_X, startY + 1, false, 6.5);
      dibujar(0, 'Uso de zapatones', COL_CONTRAMEDIDA_X, startY + 1, false, 6.5);

      procesosActivos.forEach((p, i) => {
        const ajusteFila = i >= 4 ? 2 : 0;
        const y = startY + ((i + 1) * table1_spacing) - 0.5 + ajusteFila;
        dibujarCelda(p.descripcion, COL_ACTIVIDAD_X, y, COL_ACTIVIDAD_ANCHO);
        dibujarCelda(p.riesgo, COL_RIESGO_X, y, COL_RIESGO_ANCHO);
      });

      // --- ASPECTOS E IMPACTOS AMBIENTALES (PÁGINA 1) ---
      const p3_env_y = 588; 
      dibujar(0, 'Residuos etiquetas', 100, p3_env_y, false, 8);
      dibujar(0, 'Basura', 290, p3_env_y, false, 8);
      dibujar(0, 'Depositar en contenedor', 430, p3_env_y, false, 8);

      // --- METRÓLOGOS (PÁGINA 2) ---
      // Ajuste Metrólogos: Bajados 4 puntos para centrar en fila
      const p2_metrologos_y = 156; 
      const p2_row_gap = 14.2; 
      
      metrologosActivos.forEach((m, i) => {
        const row_y = p2_metrologos_y + (i * p2_row_gap);
        dibujar(1, m.nombre, 80, row_y, false, 8);
        dibujar(1, m.ocupacion, 395, row_y, false, 8); 
      });

      // --- HERRAMIENTAS ---
      const p2_herr_y = 343; 
      dibujar(1, 'Ver anexo', 50, p2_herr_y);
      dibujar(1, 'SI', 300, p2_herr_y);
      dibujar(1, 'N/A', 440, p2_herr_y);

      // --- EPP: BATA ANTIESTÁTICA ---
      const p2_bata_y = 612; 
      dibujar(1, 'BATA ANTIESTATICA', 160, p2_bata_y); 

      // --- PÁGINA 3 - FIRMAS Y CHECKBOXES ---
      const p3_otro_y = 416; 
      dibujar(2, 'Servicio de calibración', 215, p3_otro_y); 
      
      const p3_firma_y = 464;
      dibujar(2, 'Metrólogo', 340, p3_firma_y); 

      const ehs_y = 514; 
      const ehs_gap = 23; 
      const ehs_x = 476; 
      
      dibujar(2, 'X', ehs_x, ehs_y, true, 10); 
      dibujar(2, 'X', ehs_x, ehs_y + ehs_gap, true, 10); 
      dibujar(2, 'X', ehs_x, ehs_y + (ehs_gap * 2), true, 10); 

      const pdfBytes = await pdfDoc.save();
      saveAs(new Blob([pdfBytes]), `Permiso_TR_${fecha.replace(/\//g, '-')}_${metrologosActivos[0]?.nombre.split(' ')[0]}.pdf`);
    } catch (e) {
      await showAlert({ title: 'Error', message: 'Error al generar PDF. Revisa la consola.', variant: 'danger' });
      console.error(e);
    }
  };

  const puedeGenerar = metrologosSel.length > 0 && procesosSel.length > 0;

  return (
    <OperationalScreenShell>
      <OperationalScreenHeader
        title="Permisos de Trabajo No Rutinarios"
        subtitle="Seguridad y Medio Ambiente · Formato DOC0040218"
        badge={
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-100 border border-slate-200 text-xs font-medium text-slate-600">
            <FileText size={14} style={{ color: AG_BLUE }} />
            Permiso TR
          </span>
        }
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/80">
            <h2 className="text-base font-semibold text-slate-900">1. Datos generales del servicio</h2>
            <p className="text-sm text-slate-500 mt-0.5">Información que se imprimirá en la carátula del permiso.</p>
          </div>
          <div className="p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FormField label="Fecha">
              <input type="text" value={fecha} onChange={(e) => setFecha(e.target.value)} className={INPUT_CLASS} />
            </FormField>
            <FormField label="Compañía / Empresa">
              <input type="text" value={compania} onChange={(e) => setCompania(e.target.value)} className={INPUT_CLASS} />
            </FormField>
            <FormField label="Lugar de trabajo">
              <input type="text" value={lugar} onChange={(e) => setLugar(e.target.value)} className={INPUT_CLASS} />
            </FormField>
            <FormField label="Jefe inmediato">
              <input type="text" value={jefe} onChange={(e) => setJefe(e.target.value)} className={INPUT_CLASS} />
            </FormField>
            <FormField label="Hora de inicio">
              <input type="text" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className={`${INPUT_CLASS} text-center`} />
            </FormField>
            <FormField label="Hora de término">
              <input type="text" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} className={`${INPUT_CLASS} text-center`} />
            </FormField>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-5 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/80">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <ClipboardList size={18} style={{ color: AG_BLUE }} />
                2. Procesos y actividades
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Seleccione las magnitudes a calibrar ({procesosSel.length} de {PROCESOS.length}).
              </p>
            </div>
            <div className="divide-y divide-slate-100 overflow-y-auto max-h-[420px]">
              {PROCESOS.map((p) => {
                const selected = procesosSel.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className={`flex items-start gap-3 px-5 sm:px-6 py-3.5 cursor-pointer transition-colors ${
                      selected ? 'bg-[#2464A3]/5' : 'hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleProceso(p.id)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-[#2464A3] focus:ring-[#2464A3]/30"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-900">
                        {p.nombre.replace('Proceso ', '').replace(':', '')}
                      </span>
                      <span className="block text-xs text-slate-500 mt-0.5 leading-relaxed line-clamp-2">
                        {p.descripcion}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </section>

          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-5 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/80">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Users size={18} style={{ color: AG_BLUE }} />
                3. Personal asignado
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Metrólogos que firmarán el permiso ({metrologosSel.length} seleccionados).
              </p>
            </div>
            <div className="p-5 sm:px-6 sm:py-4 flex-1">
              {metrologos.length === 0 ? (
                <p className="text-sm text-slate-500 py-8 text-center">No hay metrólogos registrados en el sistema.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[280px] overflow-y-auto pr-1">
                  {metrologos.map((m) => {
                    const selected = metrologosSel.includes(m.id);
                    return (
                      <label
                        key={m.id}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                          selected
                            ? 'border-[#2464A3]/40 bg-[#2464A3]/5'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleMetrologo(m.id)}
                          className="h-4 w-4 rounded border-slate-300 text-[#2464A3] focus:ring-[#2464A3]/30"
                        />
                        <span className="text-sm font-medium text-slate-800 truncate">{m.nombre}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              <div className="mt-4 p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed flex gap-2.5">
                <ShieldCheck size={16} className="text-slate-400 shrink-0 mt-0.5" />
                <span>
                  Las casillas de EPP se llenan manualmente en planta. El documento incluye automáticamente la leyenda de <strong>Bata Antiestática</strong>.
                </span>
              </div>
            </div>
          </section>
        </div>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="text-sm text-slate-600">
            <p>
              <span className="font-medium text-slate-800">{procesosSel.length}</span> proceso(s) ·{' '}
              <span className="font-medium text-slate-800">{metrologosSel.length}</span> metrólogo(s)
            </p>
            {!puedeGenerar && (
              <p className="text-xs text-amber-700 mt-1">Seleccione al menos un proceso y un metrólogo para continuar.</p>
            )}
          </div>
          <button
            type="button"
            onClick={generarPDF}
            disabled={!puedeGenerar}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-white text-sm font-semibold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors hover:opacity-95"
            style={{ backgroundColor: AG_BLUE }}
          >
            <Printer size={18} />
            Generar documento PDF
          </button>
        </section>
      </div>
    </OperationalScreenShell>
  );
};

export default PermisosTrabajoScreen;