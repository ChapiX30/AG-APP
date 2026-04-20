import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../utils/firebase'; 
import { Loader2, AlertOctagon, FileText, CheckCircle2, Factory, CalendarDays, KeyRound } from 'lucide-react';
// IMPORTAMOS EL LOGO CORRECTAMENTE
import labLogo from '../assets/lab_logo.png';

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
                // El PDF no se encontró (404), pero la base de datos SÍ existe
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
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-lg max-w-sm w-full text-center border border-slate-200">
            <img src={labLogo} alt="Logo Laboratorio" className="h-12 mx-auto mb-6 object-contain" />
            
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4 mx-auto" />
            <h2 className="text-lg font-bold text-slate-900 mb-2">Buscando Documento...</h2>
            <p className="text-slate-600 bg-slate-100 p-2 rounded-md font-mono text-xs inline-block">Folio: {certificado}</p>
        </div>
      </div>
    );
  }

  // --- PANTALLA DE ERROR: CERTIFICADO NO ENCONTRADO ---
  if (status === 'not_found') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-lg max-w-md w-full text-center border border-slate-200">
          <img src={labLogo} alt="Logo Laboratorio" className="h-12 md:h-14 mx-auto mb-6 object-contain" />

          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-white shadow-sm">
            <AlertOctagon className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-3">Registro no localizado</h2>
          <p className="text-sm text-slate-600 mb-6 leading-relaxed">
            No pudimos encontrar un certificado asociado al folio <span className="font-bold bg-slate-100 px-1.5 py-0.5 rounded font-mono">{certificado}</span> en nuestro sistema.
          </p>
          <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-slate-500 text-xs">
             Por favor, verifica que el código QR sea el correcto o contacta al laboratorio.
          </div>
        </div>
      </div>
    );
  }

  // --- PANTALLA NARANJA: EN PROCESO DE VALIDACIÓN (Versión Compacta y Móvil) ---
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-6 md:p-8 rounded-2xl shadow-xl max-w-xl w-full text-center border border-slate-200">
        
        {/* LOGO REDUCIDO Y CENTRADO */}
        <img src={labLogo} alt="Logo Laboratorio" className="h-12 md:h-14 mx-auto mb-6 object-contain" />

        {/* TARJETA 1: ESTADO PRINCIPAL (Compacta) */}
        <div className="bg-orange-50 rounded-xl p-5 md:p-6 border border-orange-200 mb-6 shadow-sm">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 relative border-2 border-orange-100 shadow-sm">
              <FileText className="w-8 h-8 text-orange-600" />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-white rounded-full flex items-center justify-center border border-orange-200 shadow">
                 <Loader2 className="w-3.5 h-3.5 text-orange-500 animate-spin" />
              </div>
            </div>
            
            <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-2">En Proceso de Validación</h2>
            <p className="text-sm text-slate-600 max-w-md mx-auto mb-5 leading-relaxed">
              El servicio ha concluido, pero el certificado final está en revisión por calidad.
            </p>
            
            <div className="flex items-center justify-center gap-2 text-xs text-green-800 bg-green-100 p-2.5 rounded-lg border border-green-200 font-medium w-fit mx-auto">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Equipo calibrado y funcional.</span>
            </div>
        </div>
        
        {/* TARJETA 2: INFORMACIÓN DEL EQUIPO (Grilla adaptable a móvil) */}
        {equipoInfo && (
            <div className="bg-slate-50 rounded-xl p-5 text-left border border-slate-200 mb-6">
                <h3 className="text-sm font-bold text-slate-800 mb-4 pb-2 border-b border-slate-200">Detalles del Servicio</h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-100 p-2 rounded-lg border border-blue-200 shrink-0">
                           <FileText className="w-4 h-4 text-blue-700" />
                        </div>
                        <div className="min-w-0">
                           <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Folio / Cert</div>
                           <div className="text-sm md:text-base font-bold text-slate-900 font-mono truncate">{certificado}</div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-100 p-2 rounded-lg border border-blue-200 shrink-0">
                           <KeyRound className="w-4 h-4 text-blue-700" />
                        </div>
                        <div className="min-w-0">
                           <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">ID Equipo</div>
                           <div className="text-sm md:text-base font-bold text-slate-900 truncate">{equipoInfo.id}</div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 sm:col-span-2">
                        <div className="bg-blue-100 p-2 rounded-lg border border-blue-200 shrink-0">
                           <Factory className="w-4 h-4 text-blue-700" />
                        </div>
                        <div className="min-w-0">
                           <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Cliente</div>
                           <div className="text-sm md:text-base font-bold text-slate-900 truncate">{equipoInfo.cliente}</div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3 sm:col-span-2">
                        <div className="bg-blue-100 p-2 rounded-lg border border-blue-200 shrink-0">
                           <CalendarDays className="w-4 h-4 text-blue-700" />
                        </div>
                        <div>
                           <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Fecha de Servicio</div>
                           <div className="text-sm md:text-base font-bold text-slate-900">{equipoInfo.fecha}</div>
                        </div>
                    </div>
                    
                </div>
            </div>
        )}

        <div className="text-slate-500 text-xs mt-6 px-2">
            Vuelve a escanear este código QR más tarde para descargar tu PDF firmado.
        </div>
      </div>
    </div>
  );
};

export default ShareView;