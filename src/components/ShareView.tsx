import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../utils/firebase'; // Ajusta la ruta si es necesario
import { Loader2, AlertOctagon, FileText, CheckCircle2, Factory, CalendarDays, KeyRound } from 'lucide-react';

interface ShareViewProps {
  certificado: string;
}

export const ShareView: React.FC<ShareViewProps> = ({ certificado }) => {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'searching' | 'found_no_pdf' | 'not_found'>('searching');
  const [equipoInfo, setEquipoInfo] = useState<{ id: string, cliente: string, fecha: string } | null>(null);

  useEffect(() => {
    const buscarCertificado = async () => {
      if (!certificado) {
        setStatus('not_found');
        setLoading(false);
        return;
      }

      try {
        const q = query(collection(db, "hojasDeTrabajo"), where("certificado", "==", certificado));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const docData = querySnapshot.docs[0].data();
          
          setEquipoInfo({
              id: docData.id || 'N/A',
              cliente: docData.cliente || 'N/A',
              fecha: docData.fecha || 'N/A'
          });

          // Verificamos si el link pertenece a una hoja de trabajo
          const isWorksheet = docData.pdfURL && (docData.pdfURL.includes('worksheets%2F') || docData.pdfURL.includes('/worksheets/'));

          if (docData.pdfURL && !isWorksheet) {
            // Es el certificado final, hacemos el "ping" para ver si existe el archivo físico
            try {
              const response = await fetch(docData.pdfURL, { method: 'HEAD' });
              
              if (response.ok) {
                // El archivo existe, redirigimos directamente
                window.location.replace(docData.pdfURL);
              } else {
                // El PDF no se encontró (404), pero la base de datos SÍ existe,
                // mostramos la pantalla naranja con la información del equipo.
                console.warn("El documento existe en BD, pero el PDF no se encontró en Storage.");
                setStatus('found_no_pdf');
                setLoading(false);
              }
            } catch (fetchError) {
              // Si falla el ping, redirigimos como último recurso
              window.location.replace(docData.pdfURL);
            }
          } else {
            // No hay PDF o es una Hoja de Trabajo. Mostramos pantalla de "En Proceso"
            setStatus('found_no_pdf');
            setLoading(false);
          }
        } else {
          // No existe la hoja de trabajo en la base de datos
          setStatus('not_found');
          setLoading(false);
        }
      } catch (error) {
        console.error("Error buscando certificado:", error);
        setStatus('not_found');
        setLoading(false);
      }
    };

    buscarCertificado();
  }, [certificado]);

  // --- PANTALLA DE CARGANDO ---
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-10 rounded-3xl shadow-2xl max-w-lg w-full text-center border border-slate-200">
            <img src="/logo.png" alt="Logo Laboratorio" className="h-20 mx-auto mb-8 object-contain" />
            
            <Loader2 className="w-16 h-16 text-blue-600 animate-spin mb-6 mx-auto" />
            <h2 className="text-2xl font-extrabold text-slate-900 mb-2">Buscando Documento...</h2>
            <p className="text-slate-600 bg-slate-100 p-3 rounded-lg font-mono text-sm inline-block">Folio: {certificado}</p>
        </div>
      </div>
    );
  }

  // --- PANTALLA DE ERROR: CERTIFICADO NO ENCONTRADO (Base de datos vacía) ---
  if (status === 'not_found') {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-10 rounded-3xl shadow-2xl max-w-xl w-full text-center border border-slate-200">
          <img src="/logo.png" alt="Logo Laboratorio" className="h-20 mx-auto mb-8 object-contain" />

          <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-8 border-4 border-white shadow-lg">
            <AlertOctagon className="w-12 h-12 text-red-600" />
          </div>
          <h2 className="text-3xl font-extrabold text-slate-950 mb-4">Registro no localizado</h2>
          <p className="text-lg text-slate-700 mb-8 leading-relaxed">
            No pudimos encontrar una orden de servicio o certificado asociado al folio <span className="font-bold bg-slate-100 px-2 py-1 rounded-md font-mono">{certificado}</span> en nuestra base de datos central.
          </p>
          <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl text-slate-600 text-sm">
             Por favor, verifica que el código QR sea el correcto o contacta al laboratorio si el problema persiste.
          </div>
        </div>
      </div>
    );
  }

  // --- PANTALLA NARANJA: EN PROCESO DE VALIDACIÓN (Con información completa) ---
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4 md:p-8">
      <div className="bg-white p-8 md:p-12 rounded-3xl shadow-2xl max-w-3xl w-full text-center border border-slate-200">
        
        <img src="/logo.png" alt="Logo Laboratorio" className="h-24 mx-auto mb-10 object-contain" />

        {/* TARJETA 1: ESTADO PRINCIPAL */}
        <div className="bg-orange-50 rounded-2xl p-6 md:p-8 border border-orange-200 mb-10 shadow-inner">
            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-6 relative border-4 border-orange-100 shadow-lg">
              <FileText className="w-12 h-12 text-orange-600" />
              <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-white rounded-full flex items-center justify-center border border-orange-200 shadow">
                 <Loader2 className="w-5 h-5 text-orange-500 animate-spin" />
              </div>
            </div>
            
            <h2 className="text-3xl font-extrabold text-slate-950 mb-3">En Proceso de Validación</h2>
            <p className="text-lg text-slate-700 max-w-xl mx-auto mb-6 leading-relaxed">
              El servicio técnico para este equipo ya ha sido concluido, pero el certificado de calibración final está pasando por nuestros filtros de calidad y revisión.
            </p>
            
            <div className="flex items-center justify-center gap-2 text-sm text-green-800 bg-green-100 p-4 rounded-xl border border-green-200 inline-flex font-medium">
                <CheckCircle2 className="w-5 h-5" />
                <span>El equipo ha sido calibrado y está funcional.</span>
            </div>
        </div>
        
        {/* TARJETA 2: INFORMACIÓN COMPLETA DEL EQUIPO */}
        {equipoInfo && (
            <div className="bg-slate-50 rounded-2xl p-6 md:p-8 text-left border border-slate-200 mb-8 shadow-inner">
                <h3 className="text-lg font-bold text-slate-800 mb-6 pb-2 border-b border-slate-200">Detalles del Servicio</h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
                    
                    <div className="flex items-center gap-4">
                        <div className="bg-blue-100 p-3 rounded-xl border border-blue-200">
                           <FileText className="w-6 h-6 text-blue-700" />
                        </div>
                        <div>
                           <div className="text-xs text-slate-500 uppercase font-semibold tracking-wider">Folio / Certificado</div>
                           <div className="text-xl font-bold text-slate-950 font-mono">{certificado}</div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        <div className="bg-blue-100 p-3 rounded-xl border border-blue-200">
                           <KeyRound className="w-6 h-6 text-blue-700" />
                        </div>
                        <div>
                           <div className="text-xs text-slate-500 uppercase font-semibold tracking-wider">ID Único de Equipo</div>
                           <div className="text-xl font-bold text-slate-950">{equipoInfo.id}</div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 col-span-1 sm:col-span-2">
                        <div className="bg-blue-100 p-3 rounded-xl border border-blue-200">
                           <Factory className="w-6 h-6 text-blue-700" />
                        </div>
                        <div>
                           <div className="text-xs text-slate-500 uppercase font-semibold tracking-wider">Cliente / Empresa</div>
                           <div className="text-lg font-bold text-slate-950">{equipoInfo.cliente}</div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-4 col-span-1 sm:col-span-2">
                        <div className="bg-blue-100 p-3 rounded-xl border border-blue-200">
                           <CalendarDays className="w-6 h-6 text-blue-700" />
                        </div>
                        <div>
                           <div className="text-xs text-slate-500 uppercase font-semibold tracking-wider">Fecha del Servicio</div>
                           <div className="text-lg font-bold text-slate-950">{equipoInfo.fecha}</div>
                        </div>
                    </div>
                    
                </div>
            </div>
        )}

        <div className="text-slate-600 bg-slate-50 p-6 rounded-2xl border border-slate-200">
            <p className="text-sm">
                Vuelve a escanear este código QR en unas horas. En cuanto el certificado PDF esté firmado y validado por el responsable del laboratorio, este enlace te permitirá descargarlo automáticamente.
            </p>
        </div>
        
        <p className="text-xs text-slate-400 mt-10 pt-6 border-t border-slate-100">
          Servicio de Verificación de Certificados Digitales
        </p>
      </div>
    </div>
  );
};

export default ShareView;