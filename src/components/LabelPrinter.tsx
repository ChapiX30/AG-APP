import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { Printer, Loader2, Download, Share2 } from 'lucide-react';
import logoAg from '../assets/lab_logo.png'; // <--- ASEGURATE QUE ESTA RUTA SEA CORRECTA

interface LabelData {
  id: string;
  fechaCal: string;
  fechaSug: string;
  calibro: string;
  certificado: string;
}

export const LabelPrinter: React.FC<{ data: LabelData }> = ({ data }) => {
  const labelRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handlePrintAction = async () => {
    if (!labelRef.current) return;
    setIsGenerating(true);

    try {
      // 1. Generar la imagen de alta calidad
      const canvas = await html2canvas(labelRef.current, {
        scale: 6, // Escala alta para que el texto pequeño se vea nítido
        backgroundColor: '#ffffff',
        useCORS: true
      });

      // Convertir a blob para compartir o descargar
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        
        const fileName = `ETIQUETA_${data.id.replace(/\s+/g, '-')}.png`;
        const file = new File([blob], fileName, { type: "image/png" });

        // 2. DETECTAR SI ES MOVIL (Tiene API de compartir)
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: 'Imprimir Etiqueta',
              text: 'Enviar a Epson iLabel'
            });
          } catch (error) {
            console.log("El usuario canceló compartir o no soportado:", error);
          }
        } 
        // 3. SI ES PC (O no soporta compartir) -> DESCARGAR
        else {
          const link = document.createElement('a');
          link.download = fileName;
          link.href = canvas.toDataURL('image/png');
          link.click();
          alert("Imagen descargada. Abrela e imprímela con tu software Epson.");
        }
        setIsGenerating(false);
      }, 'image/png');

    } catch (error) {
      console.error("Error:", error);
      alert("Error generando la etiqueta");
      setIsGenerating(false);
    }
  };

  return (
    <>
      <button 
        onClick={handlePrintAction}
        disabled={isGenerating}
        className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg shadow hover:bg-slate-700 transition-all active:scale-95 disabled:opacity-50"
      >
        {isGenerating ? <Loader2 className="animate-spin w-5 h-5"/> : <Printer className="w-5 h-5"/>}
        <span className="font-bold text-sm">
           {isGenerating ? "GENERANDO..." : "IMPRIMIR ETIQUETA"}
        </span>
      </button>

      {/* --- LIENZO OCULTO (PLANTILLA EXACTA) --- */}
      {/* Lo posicionamos fuera de la pantalla pero renderizado para poder capturarlo */}
      <div style={{ position: 'fixed', top: '-10000px', left: '-10000px' }}>
        <div 
          ref={labelRef} 
          style={{
            width: '500px',   // Ancho fijo para mantener proporción
            height: '210px',  // Proporción aproximada para cinta 24mm
            backgroundColor: 'white',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'Arial, sans-serif',
            border: '1px solid #ddd' // Borde solo técnico
          }}
        >
          {/* HEADER NEGRO */}
          <div style={{ backgroundColor: 'black', color: 'white', textAlign: 'center', padding: '6px 0' }}>
            <h1 style={{ margin: 0, fontSize: '32px', letterSpacing: '8px', fontWeight: '900', textTransform: 'uppercase' }}>
              CALIBRADO
            </h1>
          </div>

          {/* CONTENIDO PRINCIPAL */}
          <div style={{ display: 'flex', flex: 1, padding: '10px 15px' }}>
            
            {/* IZQUIERDA: LOGO */}
            <div style={{ width: '35%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
               {/* Ajusta el width/height según tu logo real */}
               <img src={logoAg} alt="Logo" style={{ maxWidth: '100%', maxHeight: '90px', objectFit: 'contain' }} />
            </div>

            {/* DERECHA: DATOS */}
            <div style={{ width: '65%', paddingLeft: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontSize: '24px', color: 'black', fontWeight: 'bold', lineHeight: '1.2' }}>
                ID: <span style={{ fontFamily: 'monospace' }}>{data.id}</span>
              </div>
              <div style={{ fontSize: '22px', color: 'black', fontWeight: 'bold', lineHeight: '1.2' }}>
                F.CAL: {data.fechaCal}
              </div>
              <div style={{ fontSize: '22px', color: 'black', fontWeight: 'bold', lineHeight: '1.2' }}>
                F.SUG: {data.fechaSug}
              </div>
              <div style={{ fontSize: '24px', color: 'black', fontWeight: 'bold', lineHeight: '1.2' }}>
                CALIBRÓ: {data.calibro}
              </div>
            </div>
          </div>

          {/* FOOTER */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 15px 8px 15px', alignItems: 'flex-end' }}>
             <span style={{ fontSize: '18px', fontStyle: 'italic', color: '#444' }}>AG-CAL-F14-00</span>
             <span style={{ fontSize: '26px', fontWeight: '900', color: 'black' }}>
               CERT: {data.certificado}
             </span>
          </div>
        </div>
      </div>
    </>
  );
};