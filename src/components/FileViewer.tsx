import React, { useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

// === INICIO DE LA CORRECCIÓN DE RUTAS CSS ===
// Importamos el CSS directamente desde 'pdfjs-dist' que SÍ existe
import "pdfjs-dist/web/pdf_viewer.css";
// (Eliminamos las rutas incorrectas de 'react-pdf/dist/...')
// === FIN DE LA CORRECCIÓN DE RUTAS CSS ===

// Iconos para los botones
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
} from "lucide-react";

// Tu configuración del worker (está perfecta)
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/2.14.305/pdf.worker.min.js`;

type Props = {
  url: string;
  fileName?: string;
  style?: React.CSSProperties;
  maxHeight?: string | number;
};

const getExtension = (fileName: string) =>
  (fileName || "").split("?")[0].split(".").pop()?.toLowerCase() || "";

export const FileViewer: React.FC<Props> = ({
  url,
  fileName = "",
  style = {},
  maxHeight = "80vh",
}) => {
  const [numPages, setNumPages] = useState<number>(1);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [text, setText] = useState<string | null>(null);
  const [escalaZoom, setEscalaZoom] = useState<number>(1.0);
  const [rotacionPDF, setRotacionPDF] = useState<number>(0);

  const ext = getExtension(fileName || url);

  // Cargar texto para TXT/CSV
  useEffect(() => {
    if (["txt", "csv", "md"].includes(ext)) {
      fetch(url)
        .then((r) => r.text())
        .then(setText)
        .catch(() => setText("No se pudo cargar el archivo de texto."));
    }
  }, [url, ext]);

  // Google Docs Viewer para Word/Excel
  const isWord = ext === "doc" || ext === "docx";
  const isExcel = ext === "xls" || ext === "xlsx";
  const googleViewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(
    url
  )}&embedded=true`;

  // === RENDERIZADO DE ARCHIVOS ===

  // 1. Imágenes
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) {
    return (
      <img
        src={url}
        alt={fileName}
        style={{ maxWidth: "100%", maxHeight, ...style }}
        draggable={false}
      />
    );
  }

  // 2. Texto
  if (["txt", "csv", "md"].includes(ext)) {
    return (
      <pre
        style={{
          background: "#f5f5f5",
          borderRadius: 8,
          padding: 16,
          overflow: "auto",
          maxHeight,
          width: "100%",
          ...style,
        }}
      >
        {text || "Cargando..."}
      </pre>
    );
  }

  // 3. Documentos de Office
  if (isWord || isExcel) {
    return (
      <iframe
        title={fileName}
        src={googleViewerUrl}
        style={{ width: "100%", height: maxHeight, border: "none", ...style }}
        sandbox="allow-scripts allow-same-origin"
      />
    );
  }

  // 4. PDF
  if (ext === "pdf") {
    return (
      // Contenedor principal (ocupa todo el espacio de <main>)
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%", // Ocupa el 100% del <main>
          display: "flex",
          flexDirection: "column",
          ...style,
        }}
      >
        {/* === INICIO DE LA CORRECCIÓN DEL ZOOM === */}
        {/* Contenedor de Scroll:
          - Ocupa todo el espacio (flexGrow: 1).
          - TIENE EL SCROLL (overflow: auto).
          - NO USA FLEX. Es un bloque que centra su contenido con text-align.
          - Este div gris NO SE ENCOGERÁ.
        */}
        <div
          style={{
            flexGrow: 1, // Ocupa el espacio vertical disponible
            overflow: "auto",
            background: "#f0f0f0",
            padding: "16px 0",
            borderRadius: "8px",
            width: "100%", // Ocupa 100% del ancho
            textAlign: "center", // Centra el div del documento
          }}
        >
          {/* Contenedor del Documento:
            - Es 'inline-block' para que 'text-align: center' funcione.
            - Este div SÍ se encogerá con el zoom, pero no afectará
              al contenedor de scroll de arriba.
          */}
          <div style={{ padding: "16px", display: "inline-block", height: "fit-content" }}>
            <Document
              file={url}
              onLoadSuccess={({ numPages }) => {
                setNumPages(numPages);
                setPageNumber(1);
              }}
              loading={<div style={{ padding: 20 }}>Cargando PDF…</div>}
              error={
                <div style={{ color: "red", padding: 20 }}>
                  No se pudo cargar el PDF. Verifica el enlace o permisos.
                </div>
              }
            >
              <Page
                pageNumber={pageNumber}
                scale={escalaZoom}
                rotate={rotacionPDF}
              />
            </Document>
          </div>
        </div>
        {/* === FIN DE LA CORRECCIÓN DEL ZOOM === */}

        {/* Barra de Controles (Movida abajo) */}
        <div
          style={{
            zIndex: 10,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "16px", // Espacio entre grupos de botones
            background: "rgba(40, 40, 40, 0.9)",
            color: "white",
            padding: "8px 12px",
            borderRadius: "8px",
            boxShadow: "0 -2px 8px rgba(0,0,0,0.3)",
            width: "fit-content",
            margin: "8px auto 0 auto", // Margen superior
            flexShrink: 0, // Evita que se encoja
          }}
        >
          {/* Grupo de Páginas */}
          {numPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                style={pageNumber <= 1 ? disabledControlStyle : controlButtonStyle}
                disabled={pageNumber <= 1}
                onClick={() => setPageNumber((n) => Math.max(1, n - 1))}
              >
                <ChevronLeft size={18} />
              </button>
              <span>
                {pageNumber} / {numPages}
              </span>
              <button
                style={pageNumber >= numPages ? disabledControlStyle : controlButtonStyle}
                disabled={pageNumber >= numPages}
                onClick={() => setPageNumber((n) => Math.min(numPages, n + 1))}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}

          {numPages > 1 && (
            <div style={{ borderLeft: "1px solid #666", height: "20px" }} />
          )}

          {/* Grupo de Zoom */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={() => setEscalaZoom((z) => Math.max(0.2, z - 0.2))}
              title="Alejar"
              style={controlButtonStyle}
            >
              <ZoomOut size={18} />
            </button>
            <span>{(escalaZoom * 100).toFixed(0)}%</span>
            <button
              onClick={() => setEscalaZoom((z) => z + 0.2)}
              title="Acercar"
              style={controlButtonStyle}
            >
              <ZoomIn size={18} />
            </button>
          </div>

          <div style={{ borderLeft: "1px solid #666", height: "20px" }} />

          {/* Grupo de Rotación */}
          <button
            onClick={() => setRotacionPDF((r) => (r + 90) % 360)}
            title="Rotar 90°"
            style={controlButtonStyle}
          >
            <RotateCw size={18} />
          </button>
        </div>
      </div>
    );
  }

  // 5. Fallback (si no es un tipo conocido)
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: "300px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#f0f0f0",
        borderRadius: 8,
        ...style,
      }}
    >
      <FileText size={48} color="#888" />
      <p style={{ marginTop: 16, color: "#555" }}>
        Vista previa no disponible para este archivo ({ext}).
      </p>
      <a
        href={url}
        download={fileName || true}
        style={{
          marginTop: 12,
          padding: "8px 16px",
          background: "#007bff",
          color: "white",
          textDecoration: "none",
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Download size={16} /> Descargar
      </a>
    </div>
  );
};

// Estilos para los botones (para no usar Tailwind aquí)
const controlButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "white",
  cursor: "pointer",
  padding: "4px",
  borderRadius: "4px",
  display: "flex",
  alignItems: "center",
};

const disabledControlStyle: React.CSSProperties = {
  ...controlButtonStyle,
  color: "#666",
  cursor: "not-allowed",
};

export default FileViewer;