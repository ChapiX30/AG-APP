import React, { useEffect, useRef, useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { renderAsync } from "docx-preview";

type Props = {
  buffer: ArrayBuffer;
  fileName: string;
  downloadUrl?: string;
};

export const DocxViewer: React.FC<Props> = ({
  buffer,
  fileName,
  downloadUrl,
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    host.innerHTML = "";
    setStatus("loading");

    renderAsync(buffer, host, undefined, {
      className: "docx",
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      breakPages: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      useBase64URL: true,
      experimental: true,
    })
      .then(() => {
        if (!cancelled) setStatus("ready");
      })
      .catch((err) => {
        console.error("[DocxViewer]", err);
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      host.innerHTML = "";
    };
  }, [buffer]);

  if (status === "error") {
    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 px-6 text-center">
        <FileText size={40} className="text-slate-400" />
        <p className="max-w-sm text-sm text-slate-600">
          No se pudo previsualizar este Word. Descárgalo para abrirlo.
        </p>
        {downloadUrl ? (
          <a
            href={downloadUrl}
            download={fileName}
            className="inline-flex items-center gap-2 rounded-lg bg-[#2464A3] px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Download size={16} /> Descargar
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden" data-ag-no-swipe-back>
      {status === "loading" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#e8eaed]">
          <Loader2 size={28} className="animate-spin text-[#2464A3]" />
          <p className="text-sm text-slate-500">Preparando documento Word…</p>
        </div>
      )}
      <div ref={hostRef} className="ag-docx-preview h-full overflow-auto" />
    </div>
  );
};
