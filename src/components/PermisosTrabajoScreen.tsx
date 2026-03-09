import React, { useState, useEffect } from 'react';
import { FileText, Settings, CheckCircle2, Printer, Users, Calendar as CalendarIcon, Building, ShieldCheck, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { saveAs } from 'file-saver';
import { collection, query, where, getDocs } from 'firebase/firestore'; 
import { db } from '../utils/firebase'; 
import { useNavigation } from '../hooks/useNavigation';

const PROCESOS = [
  { id: 'electrica', nombre: 'Proceso eléctrica:', descripcion: 'Simulación de patrón a instrumento o viceversa dependiendo el equipo a calibrar hasta 580 VDC, VAC etc.' },
  { id: 'presion', nombre: 'Proceso presión:', descripcion: 'Calibración directa entre bomba hidráulica manual de 1,000 PSI a 5,000 PSI.' },
  { id: 'temperatura', nombre: 'Proceso temperatura:', descripcion: 'Comparación directa mediante termocople tipo J o K dependiendo de la condición del instrumento.' },
  { id: 'dimensional', nombre: 'Proceso dimensional:', descripcion: 'Comparacion directa contra bloques patron' },
  { id: 'flujo', nombre: 'Proceso flujo:', descripcion: 'Comparación directa entre patrón e instrumento regulando la presión en máquina.' },
  { id: 'par', nombre: 'Proceso par torsional:', descripcion: 'Comparación directa en analizador torque e instrumento entre 90 lbin y 50 ftlb.' }
];

export const PermisosTrabajoScreen: React.FC = () => {
  const { navigateTo } = useNavigation(); 
  
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

  // =========================================================================
  // LÓGICA DEL PDF - INTACTA (NO SE MODIFICÓ NADA)
  // =========================================================================
  const generarPDF = async () => {
    if (metrologosSel.length === 0 || procesosSel.length === 0) {
      alert("Por favor selecciona al menos un metrólogo y un proceso.");
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
      const magnitudesNombres = procesosActivos.map(p => p.nombre.replace('Proceso ', '').replace(':', '').toUpperCase()).join(', ');

      const dibujar = (pageIndex: number, texto: string, x: number, y: number, isBold = false, size = 9) => {
        const pagina = pages[pageIndex];
        const { height } = pagina.getSize();
        pagina.drawText(texto, { x, y: height - y, size, font: isBold ? fontBold : font, color });
      };

      const p1_y_base = 265; 
      const row_spacing = 16; 
      
      dibujar(0, compania, 110, p1_y_base); 
      dibujar(0, jefe, 355, p1_y_base); 
      dibujar(0, lugar, 95, p1_y_base + row_spacing); 
      dibujar(0, 'Ver anexo', 355, p1_y_base + row_spacing); 
      
      const horas_y = p1_y_base + (row_spacing * 2) - 6; 
      dibujar(0, horaInicio, 140, horas_y); 
      dibujar(0, horaFin, 440, horas_y); 
      
      const fecha_y = p1_y_base + (row_spacing * 3) - 7; 
      const [dd, mm, yyyy] = fecha.split('/'); 
      dibujar(0, dd, 172, fecha_y);   
      dibujar(0, mm, 220, fecha_y);   
      dibujar(0, yyyy, 245, fecha_y); 

      const desc_y = 352; 
      dibujar(0, `Servicio de calibración en las magnitudes:`, 50, desc_y);
      dibujar(0, magnitudesNombres, 50, desc_y + 15, true);

      let startY = 415; 
      const table1_spacing = 15.5; 

      dibujar(0, 'Revisión de equipo', 70, startY);
      dibujar(0, 'Caída de equipo', 245, startY); 
      dibujar(0, 'Uso de zapatones', 420, startY);

      procesosActivos.forEach((p, i) => {
        const y = startY + ((i + 1) * table1_spacing); 
        dibujar(0, p.nombre, 70, y);
        
        const desc = p.descripcion;
        const maxLen = 42; 
        if (desc.length > maxLen) {
          let splitIndex = desc.lastIndexOf(' ', maxLen);
          if (splitIndex === -1) splitIndex = maxLen;
          const line1 = desc.substring(0, splitIndex);
          const line2 = desc.substring(splitIndex + 1);
          
          dibujar(0, line1, 245, y - 4, false, 7.5);
          dibujar(0, line2, 245, y + 4, false, 7.5);
        } else {
          dibujar(0, desc, 245, y, false, 7.5);
        }
      });

      const p2_metrologos_y = 157; 
      const p2_row_gap = 15.5; 
      
      metrologosActivos.forEach((m, i) => {
        const row_y = p2_metrologos_y + (i * p2_row_gap);
        dibujar(1, m.nombre, 80, row_y);
        dibujar(1, m.ocupacion, 395, row_y); 
      });

      const p2_herr_y = 336; 
      dibujar(1, 'Ver anexo', 50, p2_herr_y);
      dibujar(1, 'SI', 300, p2_herr_y);
      dibujar(1, 'N/A', 440, p2_herr_y);

      const p2_epp_y = 570; 
      dibujar(1, 'BATA ANTIESTATICA', 160, p2_epp_y + 70); 

      const p3_otro_y = 455; 
      dibujar(2, 'Servicio de calibración', 150, p3_otro_y); 
      
      const p3_firma_y = 495;
      dibujar(2, 'Metrólogo', 230, p3_firma_y);

      const ehs_y = 585;
      dibujar(2, 'X', 405, ehs_y, true, 10); 
      dibujar(2, 'X', 405, ehs_y + 25, true, 10); 
      dibujar(2, 'X', 405, ehs_y + 50, true, 10); 

      const pdfBytes = await pdfDoc.save();
      saveAs(new Blob([pdfBytes]), `Permiso_TR_${fecha.replace(/\//g, '-')}_${metrologosActivos[0]?.nombre.split(' ')[0]}.pdf`);
    } catch (e) {
      alert('Error al generar PDF. Revisa la consola.');
    }
  };

  // =========================================================================
  // INTERFAZ DE USUARIO MEJORADA (100% RESPONSIVE Y FULL-WIDTH)
  // =========================================================================
  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-200 selection:bg-blue-500/30 p-4 sm:p-6 lg:p-8 flex flex-col gap-6 font-sans">
      
      {/* HEADER CON BOTÓN DE REGRESO */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigateTo('menu')} 
            className="p-2.5 rounded-full bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 hover:border-slate-500 transition-all shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            title="Regresar al Menú Principal"
          >
            <ArrowLeft size={22} />
          </button>
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold flex items-center gap-3 text-slate-100 tracking-tight">
              <div className="p-2 bg-rose-500/10 rounded-xl text-rose-500">
                <FileText size={24}/>
              </div>
              Permisos No Rutinarios
            </h1>
            <p className="text-slate-500 text-sm font-medium mt-1 ml-14 hidden sm:block">
              Generador de Formato Oficial DOC0040218
            </p>
          </div>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL FLEXIBLE */}
      <main className="flex-1 flex flex-col gap-6 lg:gap-8">
        
        {/* PUNTO 1: DATOS GENERALES (Múltiples columnas responsivas) */}
        <section className="bg-slate-900 p-6 md:p-8 rounded-2xl border border-slate-800/60 shadow-xl relative overflow-hidden shrink-0">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500 opacity-40"></div>
          <h2 className="text-base font-bold text-slate-200 flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400"><Building size={18}/></div> 
            1. Datos Generales del Servicio
          </h2>
          
          {/* Grid adaptable: 1 en móvil, 2 en tablet, 5 en pantallas super anchas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 lg:gap-6">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Fecha</label>
              <input type="text" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"/>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Compañía / Empresa</label>
              <input type="text" value={compania} onChange={(e) => setCompania(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"/>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Lugar</label>
              <input type="text" value={lugar} onChange={(e) => setLugar(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"/>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Jefe Inmediato</label>
              <input type="text" value={jefe} onChange={(e) => setJefe(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"/>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:col-span-2 lg:col-span-1 xl:col-span-1">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Inicio</label>
                <input type="text" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-center"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Término</label>
                <input type="text" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-center"/>
              </div>
            </div>
          </div>
        </section>

        {/* CONTENEDOR DIVIDIDO PARA ACTIVIDADES Y PERSONAL */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 flex-1">
          
          {/* PUNTO 2: ACTIVIDADES */}
          <section className="bg-slate-900 p-6 md:p-8 rounded-2xl border border-slate-800/60 shadow-xl relative overflow-hidden flex flex-col">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 to-orange-500 opacity-40"></div>
            <h2 className="text-base font-bold text-slate-200 flex items-center gap-3 mb-6 shrink-0">
              <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400"><Settings size={18}/></div>
              2. Pasos y Actividades
            </h2>
            <label className="block text-xs font-bold text-slate-400 mb-4 uppercase tracking-wider shrink-0">Selecciona los procesos a calibrar:</label>
            
            <div className="grid grid-cols-1 gap-3 overflow-y-auto custom-scrollbar pr-2 pb-2 flex-1">
              {PROCESOS.map(p => (
                <button 
                  key={p.id} 
                  onClick={() => toggleProceso(p.id)} 
                  className={`text-left px-5 py-4 rounded-xl border text-sm font-medium flex justify-between items-center transition-all duration-200 w-full ${
                    procesosSel.includes(p.id) 
                    ? 'bg-amber-500/10 border-amber-500/50 text-amber-300 shadow-[0_0_15px_-3px_rgba(245,158,11,0.15)]' 
                    : 'bg-slate-950 border-slate-800 hover:bg-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <span className="truncate pr-4">{p.nombre.replace('Proceso', '')}</span>
                  {procesosSel.includes(p.id) ? (
                    <CheckCircle2 size={20} className="text-amber-400 drop-shadow-md shrink-0"/>
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-slate-700 shrink-0"></div>
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* PUNTO 4: METRÓLOGOS Y EPP */}
          <section className="bg-slate-900 p-6 md:p-8 rounded-2xl border border-slate-800/60 shadow-xl relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-500 opacity-40"></div>
            
            <div className="flex flex-col flex-1">
              <h2 className="text-base font-bold text-slate-200 flex items-center gap-3 mb-6 shrink-0">
                <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400"><Users size={18}/></div>
                4. Personal Asignado
              </h2>
              <label className="block text-xs font-bold text-slate-400 mb-4 uppercase tracking-wider shrink-0">Selecciona uno o más metrólogos:</label>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 overflow-y-auto custom-scrollbar pr-2 flex-1 max-h-[350px]">
                {metrologos.map(m => (
                  <button 
                    key={m.id} 
                    onClick={() => toggleMetrologo(m.id)} 
                    className={`text-left px-4 py-4 rounded-xl border text-sm font-medium flex justify-between items-center transition-all duration-200 w-full ${
                      metrologosSel.includes(m.id) 
                      ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-300 shadow-[0_0_15px_-3px_rgba(16,185,129,0.15)]' 
                      : 'bg-slate-950 border-slate-800 hover:bg-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <span className="truncate pr-2">{m.nombre}</span>
                    {metrologosSel.includes(m.id) ? (
                      <CheckCircle2 size={18} className="text-emerald-400 shrink-0 drop-shadow-md"/>
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-slate-700 shrink-0"></div>
                    )}
                  </button>
                ))}
              </div>
              
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800/80 shrink-0">
                <p className="text-xs text-slate-400 flex items-start gap-3 leading-relaxed">
                  <ShieldCheck className="text-slate-500 shrink-0 mt-0.5" size={16} />
                  <span>
                    <strong>Aviso EPP:</strong> Las casillas ("X") del Equipo de Protección Personal fueron removidas de la plantilla para llenado manual en planta, con excepción del texto automático de <em>Bata Antiestática</em>.
                  </span>
                </p>
              </div>
            </div>
            
            <div className="pt-6 mt-6 border-t border-slate-800/80 shrink-0">
              <button 
                onClick={generarPDF} 
                disabled={metrologosSel.length === 0 || procesosSel.length === 0} 
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white px-8 py-4.5 rounded-xl font-bold flex items-center justify-center gap-3 transition-all duration-300 shadow-[0_0_20px_-5px_rgba(37,99,235,0.4)] hover:shadow-[0_0_25px_-5px_rgba(37,99,235,0.6)] disabled:shadow-none text-lg"
              >
                <Printer size={24} /> Generar Documento Oficial
              </button>
            </div>
          </section>
        </div>

      </main>
    </div>
  );
};

export default PermisosTrabajoScreen;