import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { ViewerErrorBoundary } from "./ViewerErrorBoundary";
import { PdfReactFallback } from "./PdfReactFallback";

const EmbedPdfViewer = lazy(() =>
  import("@embedpdf/react-pdf-viewer").then((m) => ({ default: m.PDFViewer }))
);

const PDFIUM_WASM_URL = "/embedpdf/pdfium.wasm";
const ENGINE_TIMEOUT_MS = 4500;

type Props = {
  src: string;
  fileName?: string;
  fallbackUrl?: string;
  pdfData?: Uint8Array;
};

const LoadingPane = () => (
  <div className="flex h-full min-h-[280px] w-full flex-col items-center justify-center gap-3 bg-[#eceff3]">
    <Loader2 size={32} className="animate-spin text-[#2464A3]" />
    <p className="text-sm text-slate-500">Cargando visor PDF…</p>
  </div>
);

const FallbackPane: React.FC<{ url: string; fileName?: string }> = ({
  url,
  fileName,
}) => (
  <div className="flex h-full min-h-[280px] w-full flex-col items-center justify-center gap-3 bg-[#eceff3] px-6 text-center">
    <FileText size={40} className="text-slate-400" />
    <p className="max-w-sm text-sm text-slate-600">
      No se pudo iniciar el visor. Abre el PDF en una pestaña o descárgalo.
    </p>
    <a
      href={url}
      download={fileName || true}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 rounded-lg bg-[#2464A3] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1d4f82]"
    >
      <Download size={16} /> Abrir / descargar
    </a>
  </div>
);

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy.buffer;
}

export const PdfEngineViewer: React.FC<Props> = ({
  src,
  fileName,
  fallbackUrl,
  pdfData,
}) => {
  const [ready, setReady] = useState(false);
  const [useLegacy, setUseLegacy] = useState(false);
  const openUrl = fallbackUrl || src;

  const pdfBuffer = useMemo(
    () => (pdfData?.byteLength ? toArrayBuffer(pdfData) : null),
    [pdfData]
  );

  useEffect(() => {
    setReady(false);
    setUseLegacy(false);
  }, [src, pdfData]);

  useEffect(() => {
    if (ready || useLegacy) return;
    const t = window.setTimeout(() => setUseLegacy(true), ENGINE_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [ready, useLegacy, src, pdfData]);

  const config = useMemo(() => {
    const base = {
      wasmUrl: PDFIUM_WASM_URL,
      worker: false,
      tabBar: "never" as const,
      fontFallback: null,
      fonts: { ui: null, signature: null },
      theme: {
        preference: "light" as const,
        light: {
          accent: {
            primary: "#2464A3",
            primaryHover: "#1d4f82",
            primaryActive: "#163b61",
            primaryLight: "#e8f0fe",
            primaryForeground: "#ffffff",
          },
        },
      },
      zoom: { defaultZoomLevel: "fit-width" as const },
      pan: { defaultMode: "mobile" as const },
      disabledCategories: [
        "annotation",
        "redaction",
        "signature",
        "stamp",
        "capture",
      ],
      export: { defaultFileName: fileName || "documento.pdf" },
    };
    if (pdfBuffer) {
      return {
        ...base,
        documentManager: {
          initialDocuments: [
            {
              buffer: pdfBuffer,
              name: fileName || "documento.pdf",
              autoActivate: true,
            },
          ],
        },
      };
    }
    return { ...base, src };
  }, [src, fileName, pdfBuffer]);

  if (useLegacy) {
    return (
      <PdfReactFallback url={openUrl} pdfData={pdfData} fileName={fileName} />
    );
  }

  return (
    <div
      className="ag-pdf-engine ag-pdf-viewer-scroll relative h-full min-h-0 w-full"
      data-ag-no-swipe-back
    >
      {!ready && (
        <div className="pointer-events-none absolute inset-0 z-10">
          <LoadingPane />
        </div>
      )}
      <ViewerErrorBoundary
        fallback={<PdfReactFallback url={openUrl} pdfData={pdfData} fileName={fileName} />}
      >
        <Suspense fallback={<LoadingPane />}>
          <EmbedPdfViewer
            style={{ width: "100%", height: "100%", minHeight: 0 }}
            config={config}
            onInit={() => setReady(true)}
            onReady={() => setReady(true)}
          />
        </Suspense>
      </ViewerErrorBoundary>
    </div>
  );
};
