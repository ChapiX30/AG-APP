import React, { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.js?url";
import { ChevronLeft, ChevronRight, Loader2, RotateCw, ZoomIn, ZoomOut } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

type Props = {
  url: string;
  pdfData?: Uint8Array;
  fileName?: string;
};

export const PdfReactFallback: React.FC<Props> = ({ url, pdfData }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < 768 ? 0.85 : 1
  );
  const [rotation, setRotation] = useState(0);
  const [fitWidth, setFitWidth] = useState<number | undefined>(undefined);

  const fileSource = useMemo(() => {
    if (pdfData?.byteLength) {
      const copy = new Uint8Array(pdfData.byteLength);
      copy.set(pdfData);
      return { data: copy.buffer };
    }
    return url;
  }, [pdfData, url]);

  useEffect(() => {
    setNumPages(null);
    setPageNumber(1);
  }, [url, pdfData]);

  useEffect(() => {
    const measure = () => {
      const w = scrollRef.current?.clientWidth || window.innerWidth;
      if (w > 0) setFitWidth(Math.max(220, w - 40));
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (scrollRef.current) ro?.observe(scrollRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [numPages]);

  const pageWidth = fitWidth ? Math.round(fitWidth * zoom) : undefined;
  const pages = numPages && numPages > 0 ? Array.from({ length: numPages }, (_, i) => i + 1) : [];

  return (
    <div className="ag-pdf-viewer-scroll relative flex h-full min-h-0 w-full flex-col" data-ag-no-swipe-back>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto bg-[#eceff3] py-3 text-center"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <Document
          file={fileSource}
          onLoadSuccess={({ numPages: n }) => {
            setNumPages(n);
            setPageNumber(1);
          }}
          loading={
            <div className="flex items-center justify-center gap-2 p-8 text-slate-500">
              <Loader2 size={22} className="animate-spin text-[#2464A3]" />
              Cargando PDF…
            </div>
          }
          error={
            <div className="p-6 text-sm text-red-700">
              No se pudo cargar el PDF. Usa «Abrir en nueva pestaña» o descárgalo.
            </div>
          }
        >
          {pages.map((n) => (
            <div key={n} className="mb-3 inline-block max-w-full px-2" data-pdf-page={n}>
              <Page
                pageNumber={n}
                width={pageWidth}
                rotate={rotation}
                renderTextLayer
                renderAnnotationLayer={false}
                loading={
                  <div className="p-4">
                    <Loader2 size={18} className="animate-spin text-[#2464A3]" />
                  </div>
                }
              />
            </div>
          ))}
        </Document>
      </div>
      <div className="mx-auto mb-2 mt-1 flex w-fit flex-shrink-0 items-center gap-3 rounded-lg bg-black/85 px-3 py-1.5 text-sm text-white shadow-lg">
        {numPages && numPages > 1 ? (
          <>
            <button
              type="button"
              disabled={pageNumber <= 1}
              className="disabled:text-white/30"
              onClick={() => {
                const next = Math.max(1, pageNumber - 1);
                setPageNumber(next);
                scrollRef.current
                  ?.querySelector(`[data-pdf-page="${next}"]`)
                  ?.scrollIntoView({ block: "start", behavior: "smooth" });
              }}
            >
              <ChevronLeft size={18} />
            </button>
            <span>
              {pageNumber} / {numPages}
            </span>
            <button
              type="button"
              disabled={pageNumber >= numPages}
              className="disabled:text-white/30"
              onClick={() => {
                const next = Math.min(numPages, pageNumber + 1);
                setPageNumber(next);
                scrollRef.current
                  ?.querySelector(`[data-pdf-page="${next}"]`)
                  ?.scrollIntoView({ block: "start", behavior: "smooth" });
              }}
            >
              <ChevronRight size={18} />
            </button>
            <span className="h-4 w-px bg-white/30" />
          </>
        ) : null}
        <button type="button" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.15).toFixed(2)))}>
          <ZoomOut size={18} />
        </button>
        <span className="min-w-[3rem] text-center text-xs font-semibold">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom((z) => Math.min(2.6, +(z + 0.15).toFixed(2)))}>
          <ZoomIn size={18} />
        </button>
        <span className="h-4 w-px bg-white/30" />
        <button type="button" onClick={() => setRotation((r) => (r + 90) % 360)}>
          <RotateCw size={18} />
        </button>
      </div>
    </div>
  );
};
