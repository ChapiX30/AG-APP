import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../utils/firebase'; // Asegúrate de que esta ruta sea correcta
import { Loader2, AlertOctagon, FileText, CheckCircle2 } from 'lucide-react';

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

          if (docData.pdfURL) {
            // NUEVO: Hacemos un "ping" al archivo para ver si realmente sigue ahí
            try {
              const response = await fetch(docData.pdfURL, { method: 'HEAD' });
              
              if (response.ok) {
                // El archivo existe y está sano, redirigimos
                window.location.replace(docData.pdfURL);
              } else {
                // El link existe en la base de datos, pero el archivo fue borrado o movido (404)
                console.warn("El documento existe en BD, pero el PDF no se encontró en Storage.");
                setStatus('not_found');
                setLoading(false);
              }
            } catch (fetchError) {
              // Si falla por reglas de seguridad del navegador (CORS), redirigimos como último recurso
              window.location.replace(docData.pdfURL);
            }
          } else {
            // No hay PDF aún
            setStatus('found_no_pdf');
            setLoading(false);
          }
        } else {
          // No existe la hoja de trabajo
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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
        <h2 className="text-xl font-bold text-slate-800">Buscando Certificado...</h2>
        <p className="text-slate-500 mt-2">Folio: {certificado}</p>
      </div>
    );
  }

  if (status === 'not_found') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-slate-200">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertOctagon className="w-10 h-10 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Certificado no encontrado</h2>
          <p className="text-slate-600 mb-6">
            No pudimos localizar el certificado con el certificado <span className="font-bold">{certificado}</span> en nuestro sistema.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-slate-200">
        
        <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6 relative">
          <FileText className="w-10 h-10 text-orange-600" />
          <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-white rounded-full flex items-center justify-center">
             <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />
          </div>
        </div>
        
        <h2 className="text-2xl font-bold text-slate-900 mb-2">En Proceso de Validación</h2>
        <p className="text-slate-600 mb-6">
          El servicio para este equipo ya fue realizado, pero el certificado final aún está en revisión por el laboratorio.
        </p>
        
        {equipoInfo && (
            <div className="bg-slate-50 rounded-xl p-4 text-left border border-slate-200 mb-6">
                <div className="grid grid-cols-2 gap-y-3 text-sm">
                    <div className="text-slate-500 font-medium">Folio:</div>
                    <div className="text-slate-900 font-bold">{certificado}</div>
                    
                    <div className="text-slate-500 font-medium">ID Equipo:</div>
                    <div className="text-slate-900 font-bold">{equipoInfo.id}</div>
                    
                    <div className="text-slate-500 font-medium">Cliente:</div>
                    <div className="text-slate-900 font-bold truncate">{equipoInfo.cliente}</div>
                    
                    <div className="text-slate-500 font-medium">Fecha Serv:</div>
                    <div className="text-slate-900 font-bold">{equipoInfo.fecha}</div>
                </div>
            </div>
        )}

        <div className="flex items-center justify-center gap-2 text-sm text-green-700 bg-green-50 p-3 rounded-lg border border-green-200">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-medium">El equipo está calibrado y funcional.</span>
        </div>
        
        <p className="text-xs text-slate-400 mt-6">
          Vuelve a escanear el código QR más tarde para descargar el PDF.
        </p>
      </div>
    </div>
  );
};

export default ShareView;