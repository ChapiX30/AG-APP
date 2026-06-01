import React, { useCallback, useEffect, useState } from "react";
import {
  Download,
  ExternalLink,
  File,
  FileText,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Share2,
  X,
} from "lucide-react";
import clsx from "clsx";
import { FileViewer } from "./FileViewer";

const IMAGE_EXTS = ["jpg", "jpeg", "png", "svg", "webp", "gif"];

const formatFileSize = (bytes?: number) => {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const getExtension = (fileName?: string) =>
  fileName?.split(".").pop()?.toLowerCase() || "";

const getFileIcon = (fileName?: string, size: number = 24) => {
  if (!fileName || typeof fileName !== "string")
    return <File size={size} className="text-slate-400" strokeWidth={1.5} />;
  const ext = getExtension(fileName);
  const p = { size, strokeWidth: 1.5 };
  if (ext === "pdf") return <FileText {...p} className="text-red-500" />;
  if (IMAGE_EXTS.includes(ext))
    return <ImageIcon {...p} className="text-violet-500" />;
  return <File {...p} className="text-slate-400" />;
};

const getFileColorBg = (fileName?: string) => {
  if (!fileName) return "bg-slate-50";
  const ext = getExtension(fileName);
  if (ext === "pdf") return "bg-red-50";
  if (IMAGE_EXTS.includes(ext)) return "bg-violet-50";
  return "bg-slate-50";
};

export interface DrivePreviewFile {
  name: string;
  url: string;
  blobUrl?: string;
  fullPath: string;
  size?: number;
}

interface DrivePreviewModalProps {
  file: DrivePreviewFile;
  onClose: () => void;
  onDownload: () => void;
  onResolveUrl?: (file: DrivePreviewFile) => Promise<string>;
}

async function fetchPdfBytes(sourceUrl: string, retries = 2): Promise<Uint8Array> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(sourceUrl, {
        mode: "cors",
        cache: "force-cache",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

async function fetchImageBlobUrl(sourceUrl: string, retries = 2): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(sourceUrl, {
        mode: "cors",
        cache: "force-cache",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      return URL.createObjectURL(blob);
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

const NativeImagePreview: React.FC<{
  url: string;
  alt: string;
  fallbackUrl?: string;
}> = ({ url, alt, fallbackUrl }) => {
  const [useFallback, setUseFallback] = useState(false);
  const src = useFallback && fallbackUrl ? fallbackUrl : url;

  return (
    <div className="w-full h-full flex items-center justify-center overflow-auto touch-pan-y p-3 sm:p-6">
      <img
        src={src}
        alt={alt}
        className="max-w-full max-h-full object-contain shadow-lg rounded-lg select-none"
        onError={() => {
          if (!useFallback && fallbackUrl) setUseFallback(true);
        }}
      />
    </div>
  );
};

export const DrivePreviewModal: React.FC<DrivePreviewModalProps> = ({
  file,
  onClose,
  onDownload,
  onResolveUrl,
}) => {
  const ext = getExtension(file.name);
  const isPdf = ext === "pdf";
  const isImage = IMAGE_EXTS.includes(ext);

  const [directUrl, setDirectUrl] = useState(file.url);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [pdfData, setPdfData] = useState<Uint8Array | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPdfData(undefined);

    setImagePreviewUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });

    try {
      let sourceUrl = file.url;
      if (!sourceUrl && onResolveUrl) {
        sourceUrl = await onResolveUrl(file);
      }
      if (!sourceUrl) throw new Error("Sin URL");

      setDirectUrl(sourceUrl);

      if (isPdf) {
        const bytes = await fetchPdfBytes(sourceUrl);
        setPdfData(bytes);
      } else if (isImage) {
        const blobUrl = await fetchImageBlobUrl(sourceUrl);
        setImagePreviewUrl(blobUrl);
      }
    } catch {
      setError(
        "No se pudo cargar la vista previa. Usa «Ver PDF» o descarga el archivo."
      );
    } finally {
      setLoading(false);
    }
  }, [file.fullPath, file.url, onResolveUrl, isPdf, isImage]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview, retryKey]);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  /** En WebView/Capacitor la URL HTTPS abre el visor nativo del sistema */
  const openInNewTab = () => {
    const target = directUrl || file.url;
    if (!target) return;
    window.open(target, "_blank", "noopener,noreferrer");
  };

  const handleShare = async () => {
    const target = directUrl || file.url;
    if (!target) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: file.name, url: target });
        return;
      } catch {
        /* cancelado */
      }
    }
    openInNewTab();
  };

  const renderPreviewBody = () => {
    if (isPdf && pdfData) {
      return (
        <div className="flex-1 min-h-0 w-full flex flex-col">
          <FileViewer
            key={`${file.fullPath}-${pdfData.byteLength}`}
            url={directUrl || file.url}
            fileName={file.name}
            pdfData={pdfData}
            maxHeight="100%"
            style={{ height: "100%", minHeight: 0, flex: 1 }}
          />
        </div>
      );
    }

    if (isImage && imagePreviewUrl) {
      return (
        <NativeImagePreview
          url={imagePreviewUrl}
          alt={file.name}
          fallbackUrl={directUrl !== imagePreviewUrl ? directUrl : undefined}
        />
      );
    }

    if (!isPdf && !isImage && directUrl) {
      return (
        <div className="flex-1 min-h-0 w-full">
          <FileViewer
            url={directUrl}
            fileName={file.name}
            maxHeight="100%"
            style={{ height: "100%", minHeight: 0 }}
          />
        </div>
      );
    }

    return null;
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Vista previa: ${file.name}`}
    >
      <div
        className={clsx(
          "bg-white w-full flex flex-col shadow-2xl overflow-hidden",
          "h-[100dvh] sm:h-[88vh] sm:max-w-5xl sm:rounded-2xl"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-14 border-b border-slate-200 flex items-center justify-between px-3 sm:px-5 bg-white flex-shrink-0 gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <div
              className={clsx(
                "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border border-slate-100",
                getFileColorBg(file.name)
              )}
            >
              {getFileIcon(file.name, 18)}
            </div>
            <div className="min-w-0">
              <span className="text-sm font-semibold text-slate-800 truncate block">
                {file.name}
              </span>
              <span className="text-[10px] text-slate-400 font-mono hidden sm:block">
                {formatFileSize(file.size)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={openInNewTab}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-2 min-h-[40px] text-slate-600 hover:bg-slate-100 rounded-lg text-xs font-medium transition-colors"
              title="Abrir en el visor del sistema"
            >
              <ExternalLink size={14} />
              <span className="hidden md:inline">Abrir en nueva pestaña</span>
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
              title="Compartir"
              aria-label="Compartir"
            >
              <Share2 size={16} />
            </button>
            <button
              type="button"
              onClick={onDownload}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 min-h-[44px] bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Descargar</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 bg-[#f8f9fa] flex flex-col overflow-hidden relative min-h-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3">
              <Loader2 size={36} className="animate-spin text-blue-500" />
              <p className="text-sm text-slate-500">Cargando vista previa...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-4 px-6 text-center">
              <p className="text-sm text-slate-600 max-w-md">{error}</p>
              <div className="flex flex-col w-full max-w-sm gap-2">
                {isPdf && (
                  <button
                    type="button"
                    onClick={openInNewTab}
                    className="flex items-center justify-center gap-2 px-4 py-3 min-h-[48px] bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 shadow-sm"
                  >
                    <ExternalLink size={16} /> Ver PDF
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setRetryKey((k) => k + 1)}
                  className="flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw size={14} /> Reintentar
                </button>
                <button
                  type="button"
                  onClick={onDownload}
                  className="flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-900"
                >
                  <Download size={14} /> Descargar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
              {renderPreviewBody()}
            </div>
          )}
        </div>

        <div className="sm:hidden border-t border-slate-200 bg-white px-3 py-2.5 flex gap-2 flex-shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={openInNewTab}
            className="flex-1 flex items-center justify-center gap-2 py-3 min-h-[48px] bg-[#e8f0fe] text-blue-700 rounded-xl text-xs font-bold active:bg-blue-100"
          >
            <ExternalLink size={15} /> {isPdf ? "Ver PDF" : "Abrir archivo"}
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="flex-1 flex items-center justify-center gap-2 py-3 min-h-[48px] bg-blue-600 text-white rounded-xl text-xs font-semibold active:bg-blue-700"
          >
            <Download size={14} /> Descargar
          </button>
        </div>
      </div>
    </div>
  );
};

export default DrivePreviewModal;
