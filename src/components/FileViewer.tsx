import React, { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import * as XLSX from "xlsx";

import "pdfjs-dist/web/pdf_viewer.css";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.js?url";

import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Loader2,
} from "lucide-react";

/** Worker local: en Capacitor/Android el CDN suele fallar y el PDF no renderiza */
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

type Props = {
  url: string;
  fileName?: string;
  /** PDF bytes — más fiable que blob:/iframe en móvil y Capacitor WebView */
  pdfData?: Uint8Array;
  style?: React.CSSProperties;
  maxHeight?: string | number;
};

const getExtension = (fileName: string) =>
  (fileName || "").split("?")[0].split(".").pop()?.toLowerCase() || "";

const SPREADSHEET_EXTS = ["xls", "xlsx"];
const DOCX_EXTS = ["docx"];
const OFFICE_UNSUPPORTED_EXTS = ["doc", "ppt", "pptx"];
const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "svg"];
const MAX_PREVIEW_ROWS = 100;

type OfficePreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "spreadsheet";
      rows: string[][];
      sheetName: string;
      totalRows: number;
    }
  | { status: "document"; html: string }
  | { status: "unsupported" }
  | { status: "error" };

async function fetchFileBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.arrayBuffer();
}

async function previewSpreadsheet(buffer: ArrayBuffer): Promise<{
  rows: string[][];
  sheetName: string;
  totalRows: number;
}> {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Sin hojas");
  }
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: "",
  }) as string[][];
  const normalized = rows.map((row) =>
    row.map((cell) => (cell == null ? "" : String(cell)))
  );
  return {
    rows: normalized,
    sheetName,
    totalRows: normalized.length,
  };
}

async function previewDocx(buffer: ArrayBuffer): Promise<string | null> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
    return result.value;
  } catch {
    return null;
  }
}

const downloadButtonStyle: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 20px",
  background: "#2464A3",
  color: "white",
  textDecoration: "none",
  borderRadius: 8,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontSize: 14,
  fontWeight: 600,
};

const FileDownloadFallback: React.FC<{
  url: string;
  fileName: string;
  ext: string;
  message: string;
  style?: React.CSSProperties;
  maxHeight?: string | number;
}> = ({ url, fileName, ext, message, style, maxHeight }) => (
  <div
    style={{
      width: "100%",
      height: "100%",
      minHeight: 280,
      maxHeight,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "#f0f0f0",
      borderRadius: 8,
      padding: 24,
      ...style,
    }}
  >
    <FileText size={48} color="#888" />
    <p
      style={{
        marginTop: 16,
        color: "#555",
        textAlign: "center",
        maxWidth: 420,
        lineHeight: 1.5,
      }}
    >
      {message}
    </p>
    {ext ? (
      <p
        style={{
          marginTop: 8,
          color: "#999",
          fontSize: 12,
          fontFamily: "monospace",
        }}
      >
        .{ext.toUpperCase()}
        {fileName ? ` · ${fileName}` : ""}
      </p>
    ) : null}
    <a
      href={url}
      download={fileName || true}
      target="_blank"
      rel="noreferrer"
      style={downloadButtonStyle}
    >
      <Download size={16} /> Descargar
    </a>
  </div>
);

const SpreadsheetPreview: React.FC<{
  rows: string[][];
  sheetName: string;
  totalRows: number;
  maxHeight?: string | number;
  style?: React.CSSProperties;
}> = ({ rows, sheetName, totalRows, maxHeight, style }) => {
  if (!rows.length) {
    return <p style={{ padding: 24, color: "#666" }}>La hoja está vacía.</p>;
  }

  const headerRow = rows[0] ?? [];
  const bodyRows = rows.slice(1, MAX_PREVIEW_ROWS + 1);
  const colCount = Math.max(
    headerRow.length,
    ...bodyRows.map((r) => r.length),
    1
  );
  const padRow = (row: string[]) => {
    const padded = [...row];
    while (padded.length < colCount) padded.push("");
    return padded;
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        maxHeight,
        minHeight: 0,
        overflow: "hidden",
        ...style,
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #e5e7eb",
          background: "#fff",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
          {sheetName}
        </span>
        {totalRows > MAX_PREVIEW_ROWS + 1 && (
          <span style={{ marginLeft: 12, fontSize: 12, color: "#9ca3af" }}>
            Mostrando {MAX_PREVIEW_ROWS} de {totalRows - 1} filas
          </span>
        )}
      </div>
      <div style={{ flex: 1, overflow: "auto", background: "#fff" }}>
        <table
          style={{
            minWidth: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
          }}
        >
          <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
            <tr style={{ background: "#f9fafb" }}>
              {padRow(headerRow).map((cell, i) => (
                <th
                  key={i}
                  style={{
                    padding: "8px 12px",
                    textAlign: "left",
                    fontWeight: 600,
                    color: "#374151",
                    borderBottom: "1px solid #e5e7eb",
                    borderRight: "1px solid #f3f4f6",
                    whiteSpace: "nowrap",
                  }}
                >
                  {cell || `Col ${i + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bodyRows.map((row, ri) => (
              <tr
                key={ri}
                style={{ background: ri % 2 ? "#f9fafb" : "#fff" }}
              >
                {padRow(row).map((cell, ci) => (
                  <td
                    key={ci}
                    style={{
                      padding: "8px 12px",
                      borderBottom: "1px solid #f3f4f6",
                      borderRight: "1px solid #f3f4f6",
                      color: "#111827",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const OfficeFilePreview: React.FC<{
  url: string;
  fileName: string;
  ext: string;
  maxHeight?: string | number;
  style?: React.CSSProperties;
}> = ({ url, fileName, ext, maxHeight, style }) => {
  const [preview, setPreview] = useState<OfficePreviewState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (OFFICE_UNSUPPORTED_EXTS.includes(ext)) {
        setPreview({ status: "unsupported" });
        return;
      }

      if (!SPREADSHEET_EXTS.includes(ext) && !DOCX_EXTS.includes(ext)) {
        setPreview({ status: "unsupported" });
        return;
      }

      setPreview({ status: "loading" });

      try {
        const buffer = await fetchFileBuffer(url);
        if (cancelled) return;

        if (SPREADSHEET_EXTS.includes(ext)) {
          const data = await previewSpreadsheet(buffer);
          if (!cancelled) {
            setPreview({ status: "spreadsheet", ...data });
          }
          return;
        }

        if (DOCX_EXTS.includes(ext)) {
          const html = await previewDocx(buffer);
          if (cancelled) return;
          if (html) {
            setPreview({ status: "document", html });
          } else {
            setPreview({ status: "unsupported" });
          }
        }
      } catch {
        if (!cancelled) setPreview({ status: "error" });
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [url, ext]);

  if (preview.status === "loading" || preview.status === "idle") {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          minHeight: 280,
          maxHeight,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#f0f0f0",
          borderRadius: 8,
          ...style,
        }}
      >
        <Loader2
          size={36}
          color="#2464A3"
          className="animate-spin"
        />
        <p style={{ marginTop: 12, color: "#666" }}>Cargando vista previa…</p>
      </div>
    );
  }

  if (preview.status === "spreadsheet") {
    return (
      <SpreadsheetPreview
        rows={preview.rows}
        sheetName={preview.sheetName}
        totalRows={preview.totalRows}
        maxHeight={maxHeight}
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          minHeight: 0,
          background: "#f0f0f0",
          borderRadius: 8,
          overflow: "hidden",
          ...style,
        }}
      />
    );
  }

  if (preview.status === "document") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          minHeight: 0,
          maxHeight,
          background: "#fff",
          borderRadius: 8,
          overflow: "hidden",
          ...style,
        }}
      >
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: 24,
            lineHeight: 1.6,
            color: "#1f2937",
          }}
        >
          <div
            className="file-viewer-docx"
            dangerouslySetInnerHTML={{ __html: preview.html }}
          />
        </div>
      </div>
    );
  }

  const fallbackMessage =
    preview.status === "error"
      ? "No se pudo cargar la vista previa. Descarga el archivo para abrirlo."
      : ext === "docx"
        ? "Vista previa de Word no disponible. Descarga el archivo para abrirlo."
        : ["doc", "ppt", "pptx"].includes(ext)
          ? `Vista previa no disponible para .${ext}. Descarga el archivo para abrirlo.`
          : "Vista previa no disponible. Descarga el archivo para abrirlo.";

  return (
    <FileDownloadFallback
      url={url}
      fileName={fileName}
      ext={ext}
      message={fallbackMessage}
      style={style}
      maxHeight={maxHeight}
    />
  );
};

export const FileViewer: React.FC<Props> = ({
  url,
  fileName = "",
  pdfData,
  style = {},
  maxHeight = "80vh",
}) => {
  const pdfScrollRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [text, setText] = useState<string | null>(null);
  const defaultPdfZoom = () =>
    typeof window !== "undefined" && window.innerWidth < 768 ? 0.75 : 0.92;

  const [escalaZoom, setEscalaZoom] = useState<number>(() => defaultPdfZoom());
  const [rotacionPDF, setRotacionPDF] = useState<number>(0);
  const [fitWidth, setFitWidth] = useState<number | undefined>(undefined);

  const ext = getExtension(fileName || url);
  const isOffice =
    SPREADSHEET_EXTS.includes(ext) ||
    DOCX_EXTS.includes(ext) ||
    OFFICE_UNSUPPORTED_EXTS.includes(ext);

  const pdfFileSource = useMemo(() => {
    if (pdfData?.byteLength) {
      return {
        data: pdfData.buffer.slice(
          pdfData.byteOffset,
          pdfData.byteOffset + pdfData.byteLength
        ),
      };
    }
    return url;
  }, [pdfData, url]);

  useEffect(() => {
    if (["txt", "csv", "md"].includes(ext)) {
      fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error();
          return r.text();
        })
        .then(setText)
        .catch(() => setText("No se pudo cargar el archivo de texto."));
    }
  }, [url, ext]);

  useEffect(() => {
    if (ext !== "pdf") return;
    setNumPages(null);
    setPageNumber(1);
    setEscalaZoom(defaultPdfZoom());
  }, [ext, url, pdfData]);

  useEffect(() => {
    if (ext !== "pdf") return;
    const measure = () => {
      const el = pdfScrollRef.current;
      const w = el?.clientWidth || window.innerWidth;
      if (w > 0) setFitWidth(Math.max(200, w - 48));
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (pdfScrollRef.current) ro?.observe(pdfScrollRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [ext, numPages]);

  const pageRenderWidth = fitWidth
    ? Math.round(fitWidth * escalaZoom)
    : undefined;

  if (IMAGE_EXTS.includes(ext)) {
    return (
      <ImageFilePreview
        url={url}
        fileName={fileName}
        maxHeight={maxHeight}
        style={style}
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
          width: "100%",
          ...style,
        }}
      >
        {text || "Cargando..."}
      </pre>
    );
  }

  if (isOffice) {
    return (
      <OfficeFilePreview
        url={url}
        fileName={fileName}
        ext={ext}
        maxHeight={maxHeight}
        style={style}
      />
    );
  }

  if (ext === "pdf") {
    return (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          ...style,
        }}
      >
        <div
          ref={pdfScrollRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            background: "#f0f0f0",
            padding: "12px 0",
            borderRadius: "8px",
            width: "100%",
            textAlign: "center",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <div
            style={{
              padding: "8px",
              display: "inline-block",
              height: "fit-content",
              maxWidth: "100%",
            }}
          >
            <Document
              key={typeof pdfFileSource === "string" ? pdfFileSource : `bytes-${pdfData?.byteLength ?? 0}`}
              file={pdfFileSource}
              onLoadSuccess={({ numPages: n }) => {
                setNumPages(n);
                setPageNumber(1);
                setEscalaZoom(defaultPdfZoom());
              }}
              onLoadError={() => setNumPages(null)}
              loading={
                <div style={{ padding: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <Loader2 size={22} className="animate-spin" style={{ color: "#2464A3" }} />
                  Cargando PDF…
                </div>
              }
              error={
                <div style={{ color: "#b91c1c", padding: 20, fontSize: 14 }}>
                  No se pudo cargar el PDF. Usa «Abrir en nueva pestaña» o descarga el archivo.
                </div>
              }
            >
              {numPages !== null && numPages > 0 && (
                <Page
                  key={`page-${pageNumber}-${pageRenderWidth ?? 0}-${Math.round(escalaZoom * 100)}`}
                  pageNumber={Math.min(pageNumber, numPages)}
                  width={pageRenderWidth}
                  scale={pageRenderWidth ? undefined : escalaZoom}
                  rotate={rotacionPDF}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  loading={
                    <div style={{ padding: 16 }}>
                      <Loader2 size={20} className="animate-spin" style={{ color: "#2464A3" }} />
                    </div>
                  }
                />
              )}
            </Document>
          </div>
        </div>

        <div
          style={{
            zIndex: 10,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "16px",
            background: "rgba(40, 40, 40, 0.9)",
            color: "white",
            padding: "8px 12px",
            borderRadius: "8px",
            boxShadow: "0 -2px 8px rgba(0,0,0,0.3)",
            width: "fit-content",
            margin: "8px auto 0 auto",
            flexShrink: 0,
          }}
        >
          {numPages !== null && numPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                style={
                  pageNumber <= 1 ? disabledControlStyle : controlButtonStyle
                }
                disabled={pageNumber <= 1}
                onClick={() => setPageNumber((n) => Math.max(1, n - 1))}
              >
                <ChevronLeft size={18} />
              </button>
              <span>
                {pageNumber} / {numPages}
              </span>
              <button
                style={
                  numPages !== null && pageNumber >= numPages
                    ? disabledControlStyle
                    : controlButtonStyle
                }
                disabled={numPages !== null && pageNumber >= numPages}
                onClick={() =>
                  setPageNumber((n) => Math.min(numPages, n + 1))
                }
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}

          {numPages !== null && numPages > 1 && (
            <div style={{ borderLeft: "1px solid #666", height: "20px" }} />
          )}

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={() => setEscalaZoom((z) => Math.max(0.35, +(z - 0.15).toFixed(2)))}
              title="Alejar"
              style={controlButtonStyle}
            >
              <ZoomOut size={18} />
            </button>
            <button
              type="button"
              onClick={() => setEscalaZoom(defaultPdfZoom())}
              title="Restablecer zoom"
              style={{
                ...controlButtonStyle,
                minWidth: 44,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {(escalaZoom * 100).toFixed(0)}%
            </button>
            <button
              onClick={() => setEscalaZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))}
              title="Acercar"
              style={controlButtonStyle}
            >
              <ZoomIn size={18} />
            </button>
          </div>

          <div style={{ borderLeft: "1px solid #666", height: "20px" }} />

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

  return (
    <FileDownloadFallback
      url={url}
      fileName={fileName}
      ext={ext}
      message={`Vista previa no disponible para este archivo${ext ? ` (.${ext})` : ""}.`}
      style={style}
      maxHeight={maxHeight}
    />
  );
};

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

const ZoomControlsBar: React.FC<{
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  minZoom?: number;
  children?: React.ReactNode;
}> = ({ zoom, onZoomIn, onZoomOut, minZoom = 0.2, children }) => (
  <div
    style={{
      zIndex: 10,
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      gap: "16px",
      background: "rgba(40, 40, 40, 0.9)",
      color: "white",
      padding: "8px 12px",
      borderRadius: "8px",
      boxShadow: "0 -2px 8px rgba(0,0,0,0.3)",
      width: "fit-content",
      margin: "8px auto 0 auto",
      flexShrink: 0,
    }}
  >
    {children}
    {children ? (
      <div style={{ borderLeft: "1px solid #666", height: "20px" }} />
    ) : null}
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <button
        onClick={onZoomOut}
        title="Alejar"
        style={zoom <= minZoom ? disabledControlStyle : controlButtonStyle}
        disabled={zoom <= minZoom}
      >
        <ZoomOut size={18} />
      </button>
      <span>{(zoom * 100).toFixed(0)}%</span>
      <button onClick={onZoomIn} title="Acercar" style={controlButtonStyle}>
        <ZoomIn size={18} />
      </button>
    </div>
  </div>
);

const ImageFilePreview: React.FC<{
  url: string;
  fileName: string;
  maxHeight?: string | number;
  style?: React.CSSProperties;
}> = ({ url, fileName, maxHeight, style }) => {
  const [zoom, setZoom] = useState(1);
  const [fitSize, setFitSize] = useState<{ w: number; h: number } | null>(
    null
  );
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setZoom(1);
    setFitSize(null);
  }, [url]);

  const computeFitSize = (img: HTMLImageElement) => {
    const viewport = viewportRef.current;
    if (!viewport || !img.naturalWidth || !img.naturalHeight) return;

    const padding = 32;
    const maxW = Math.max(viewport.clientWidth - padding, 1);
    const maxH = Math.max(viewport.clientHeight - padding, 1);
    const scale = Math.min(
      maxW / img.naturalWidth,
      maxH / img.naturalHeight,
      1
    );
    setFitSize({
      w: Math.round(img.naturalWidth * scale),
      h: Math.round(img.naturalHeight * scale),
    });
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 280,
        maxHeight,
        display: "flex",
        flexDirection: "column",
        ...style,
      }}
    >
      <div
        ref={viewportRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          background: "#f0f0f0",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
      >
        <img
          src={url}
          alt={fileName}
          draggable={false}
          onLoad={(e) => computeFitSize(e.currentTarget)}
          style={{
            display: "block",
            width: fitSize ? fitSize.w * zoom : "auto",
            height: fitSize ? fitSize.h * zoom : "auto",
            maxWidth: fitSize ? "none" : "100%",
            maxHeight: fitSize ? "none" : "100%",
            objectFit: "contain",
            objectPosition: "center",
          }}
        />
      </div>
      <ZoomControlsBar
        zoom={zoom}
        onZoomOut={() => setZoom((z) => Math.max(0.2, z - 0.2))}
        onZoomIn={() => setZoom((z) => z + 0.2)}
      />
    </div>
  );
};

export default FileViewer;
