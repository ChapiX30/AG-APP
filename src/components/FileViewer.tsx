import React, { useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

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
  const ext = getExtension(fileName || url);

  // Para TXT/CSV
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

  // Render según tipo de archivo
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

  if (["txt", "csv", "md"].includes(ext)) {
    return (
      <pre
        style={{
          background: "#f5f5f5",
          borderRadius: 8,
          padding: 16,
          overflow: "auto",
          maxHeight,
          ...style,
        }}
      >
        {text || "Cargando..."}
      </pre>
    );
  }

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

  if (ext === "pdf") {
    return (
      <div style={{ width: "100%", maxWidth: 900, margin: "auto" }}>
        <Document
          file={url}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          loading={<div>Cargando PDF…</div>}
          error={
            <div style={{ color: "red" }}>
              No se pudo cargar el PDF. Verifica el enlace o permisos.
            </div>
          }
        >
          <Page pageNumber={pageNumber} width={window.innerWidth > 700 ? 800 : undefined} />
        </Document>
        {/* Navegación de páginas */}
        {numPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 8, margin: 12 }}>
            <button
              disabled={pageNumber <= 1}
              onClick={() => setPageNumber((n) => Math.max(1, n - 1))}
            >
              ⬅️ Anterior
            </button>
            <span>
              Página {pageNumber} de {numPages}
            </span>
            <button
              disabled={pageNumber >= numPages}
              onClick={() => setPageNumber((n) => Math.min(numPages, n + 1))}
            >
              Siguiente ➡️
            </button>
          </div>
        )}
      </div>
    );
  }

  // Por defecto, intenta abrir en un iframe (puede funcionar para CSV, HTML, etc)
  return (
    <iframe
      src={url}
      title={fileName}
      style={{ width: "100%", height: maxHeight, border: "none", ...style }}
      sandbox="allow-scripts allow-same-origin"
    />
  );
};

export default FileViewer;
