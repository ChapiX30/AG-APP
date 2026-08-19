import React, { lazy, Suspense, useEffect, useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { DocxViewer } from "./AgDocumentViewer/DocxViewer";
import { SpreadsheetViewer } from "./AgDocumentViewer/SpreadsheetViewer";
import { ImageViewer } from "./AgDocumentViewer/ImageViewer";
import "./AgDocumentViewer/ag-document-viewer.css";

const PdfEngineViewer = lazy(() =>
  import("./AgDocumentViewer/PdfEngineViewer").then((m) => ({
    default: m.PdfEngineViewer,
  }))
);

type Props = {
  url: string;
  fileName?: string;
  pdfData?: Uint8Array;
  style?: React.CSSProperties;
  maxHeight?: string | number;
};

const getExtension = (fileName: string) =>
  (fileName || "").split("?")[0].split(".").pop()?.toLowerCase() || "";

const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "svg"];
const SPREADSHEET_EXTS = ["xls", "xlsx"];
const DOCX_EXTS = ["docx"];

async function fetchBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, { mode: "cors", cache: "force-cache" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.arrayBuffer();
}

const Fallback: React.FC<{
  url: string;
  fileName: string;
  ext: string;
  message: string;
  style?: React.CSSProperties;
  maxHeight?: string | number;
}> = ({ url, fileName, ext, message, style, maxHeight }) => (
  <div
    className="flex w-full flex-col items-center justify-center rounded-lg bg-[#f0f0f0] p-6"
    style={{ height: "100%", minHeight: 280, maxHeight, ...style }}
  >
    <FileText size={48} className="text-slate-400" />
    <p className="mt-4 max-w-md text-center text-sm leading-relaxed text-slate-600">
      {message}
    </p>
    {ext ? (
      <p className="mt-2 font-mono text-xs text-slate-400">
        .{ext.toUpperCase()}
        {fileName ? ` · ${fileName}` : ""}
      </p>
    ) : null}
    <a
      href={url}
      download={fileName || true}
      target="_blank"
      rel="noreferrer"
      className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#2464A3] px-5 py-2.5 text-sm font-semibold text-white"
    >
      <Download size={16} /> Descargar
    </a>
  </div>
);

const BufferPreview: React.FC<{
  url: string;
  fileName: string;
  ext: string;
  style?: React.CSSProperties;
  maxHeight?: string | number;
}> = ({ url, fileName, ext, style, maxHeight }) => {
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBuffer(null);
    setError(false);
    fetchBuffer(url)
      .then((data) => {
        if (!cancelled) setBuffer(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) {
    return (
      <Fallback
        url={url}
        fileName={fileName}
        ext={ext}
        message="No se pudo cargar la vista previa. Descarga el archivo para abrirlo."
        style={style}
        maxHeight={maxHeight}
      />
    );
  }

  if (!buffer) {
    return (
      <div
        className="flex w-full flex-col items-center justify-center gap-3"
        style={{ height: "100%", minHeight: 280, maxHeight, ...style }}
      >
        <Loader2 size={32} className="animate-spin text-[#2464A3]" />
        <p className="text-sm text-slate-500">Cargando vista previa…</p>
      </div>
    );
  }

  if (DOCX_EXTS.includes(ext)) {
    return <DocxViewer buffer={buffer} fileName={fileName} downloadUrl={url} />;
  }
  return <SpreadsheetViewer buffer={buffer} />;
};

export const FileViewer: React.FC<Props> = ({
  url,
  fileName = "",
  pdfData,
  style = {},
  maxHeight = "80vh",
}) => {
  const ext = getExtension(fileName || url);
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (!["txt", "csv", "md"].includes(ext)) return;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.text();
      })
      .then(setText)
      .catch(() => setText("No se pudo cargar el archivo de texto."));
  }, [url, ext]);

  const shellStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    minHeight: 0,
    maxHeight,
    display: "flex",
    flexDirection: "column",
    ...style,
  };

  if (ext === "pdf" && (url || pdfData?.byteLength)) {
    return (
      <div style={shellStyle}>
        <Suspense
          fallback={
            <div className="flex h-full min-h-[280px] w-full flex-col items-center justify-center gap-3">
              <Loader2 size={32} className="animate-spin text-[#2464A3]" />
              <p className="text-sm text-slate-500">Cargando visor PDF…</p>
            </div>
          }
        >
          <PdfEngineViewer
            src={url}
            fileName={fileName}
            fallbackUrl={url}
            pdfData={pdfData}
          />
        </Suspense>
      </div>
    );
  }

  if (IMAGE_EXTS.includes(ext) && url) {
    return (
      <div style={shellStyle}>
        <ImageViewer url={url} fileName={fileName} />
      </div>
    );
  }

  if (["txt", "csv", "md"].includes(ext)) {
    return (
      <pre
        className="w-full overflow-auto rounded-lg bg-slate-100 p-4 text-sm text-slate-800"
        style={{ maxHeight, ...style }}
      >
        {text || "Cargando..."}
      </pre>
    );
  }

  if (DOCX_EXTS.includes(ext) || SPREADSHEET_EXTS.includes(ext)) {
    return (
      <div style={shellStyle}>
        <BufferPreview
          url={url}
          fileName={fileName}
          ext={ext}
          style={style}
          maxHeight={maxHeight}
        />
      </div>
    );
  }

  return (
    <Fallback
      url={url}
      fileName={fileName}
      ext={ext}
      message={
        ["doc", "ppt", "pptx"].includes(ext)
          ? `Vista previa no disponible para .${ext}. Descarga el archivo para abrirlo.`
          : `Vista previa no disponible para este archivo${ext ? ` (.${ext})` : ""}.`
      }
      style={style}
      maxHeight={maxHeight}
    />
  );
};

export default FileViewer;
