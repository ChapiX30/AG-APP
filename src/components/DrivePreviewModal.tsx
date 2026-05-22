import React, { useCallback, useEffect, useRef, useState } from "react";
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

async function fetchBlobUrl(sourceUrl: string, retries = 2): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(sourceUrl, {
        mode: "cors",
        cache: "no-store",
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

/** iOS Safari / Android Chrome: iframe + blob works more reliably than react-pdf or object/embed */
function usePreferNativePreview() {
  const [preferNative, setPreferNative] = useState(() => {
    if (typeof window === "undefined") return false;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const narrow = window.matchMedia("(max-width: 768px)").matches;
    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    return coarse || narrow || ios;
  });

  useEffect(() => {
    const update = () => {
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const narrow = window.matchMedia("(max-width: 768px)").matches;
      setPreferNative(coarse || narrow);
    };
    const mq1 = window.matchMedia("(pointer: coarse)");
    const mq2 = window.matchMedia("(max-width: 768px)");
    mq1.addEventListener("change", update);
    mq2.addEventListener("change", update);
    return () => {
      mq1.removeEventListener("change", update);
      mq2.removeEventListener("change", update);
    };
  }, []);

  return preferNative;
}

const NativePdfPreview: React.FC<{
  url: string;
  title: string;
  onFallback: () => void;
}> = ({ url, title, onFallback }) => (
  <iframe
    src={url}
    title={title}
    className="absolute inset-0 w-full h-full border-0 bg-white"
    onError={onFallback}
  />
);

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
  const preferNativePreview = usePreferNativePreview();
  const ext = getExtension(file.name);
  const isPdf = ext === "pdf";
  const isImage = IMAGE_EXTS.includes(ext);

  const [previewUrl, setPreviewUrl] = useState(file.blobUrl || file.url);
  const [directUrl, setDirectUrl] = useState(file.url);
  const [loading, setLoading] = useState(!file.blobUrl && !file.url);
  const [error, setError] = useState<string | null>(null);
  const [useFileViewer, setUseFileViewer] = useState(
    !preferNativePreview || (!isPdf && !isImage)
  );
  const blobRef = useRef<string | null>(file.blobUrl || null);

  const revokeBlob = useCallback(() => {
    if (blobRef.current?.startsWith("blob:")) {
      URL.revokeObjectURL(blobRef.current);
      blobRef.current = null;
    }
  }, []);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    revokeBlob();

    try {
      let sourceUrl = file.url;
      if (!sourceUrl && onResolveUrl) {
        sourceUrl = await onResolveUrl(file);
      }
      if (!sourceUrl) throw new Error("Sin URL");

      setDirectUrl(sourceUrl);
      const needsBlob = isPdf || isImage;

      if (needsBlob) {
        const blobUrl = await fetchBlobUrl(sourceUrl);
        blobRef.current = blobUrl;
        setPreviewUrl(blobUrl);
      } else {
        setPreviewUrl(sourceUrl);
      }
      setUseFileViewer(!preferNativePreview || (!isPdf && !isImage));
    } catch {
      setError(
        "No se pudo cargar la vista previa. Intenta abrir en una nueva pestaña o descargar el archivo."
      );
      if (file.url) {
        setDirectUrl(file.url);
        setPreviewUrl(file.url);
      }
    } finally {
      setLoading(false);
    }
  }, [file, onResolveUrl, revokeBlob, isPdf, isImage, preferNativePreview]);

  useEffect(() => {
    if (file.blobUrl) {
      setPreviewUrl(file.blobUrl);
      blobRef.current = file.blobUrl;
      setLoading(false);
      setUseFileViewer(!preferNativePreview || (!isPdf && !isImage));
      return revokeBlob;
    }
    if (file.url || onResolveUrl) {
      loadPreview();
    }
    return revokeBlob;
  }, [
    file.fullPath,
    file.url,
    file.blobUrl,
    loadPreview,
    onResolveUrl,
    revokeBlob,
    preferNativePreview,
    isPdf,
    isImage,
  ]);

  const openInNewTab = () => {
    const target = previewUrl || directUrl || file.url;
    if (target) window.open(target, "_blank", "noopener,noreferrer");
  };

  const handleShare = async () => {
    const target = previewUrl || directUrl || file.url;
    if (!target) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: file.name, url: target });
        return;
      } catch {
        /* user cancelled or unsupported */
      }
    }
    openInNewTab();
  };

  const renderPreviewBody = () => {
    if (!previewUrl) return null;

    if (isPdf && (preferNativePreview || !useFileViewer)) {
      return (
        <div className="relative flex-1 min-h-0 w-full">
          <NativePdfPreview
            url={previewUrl}
            title={file.name}
            onFallback={() => setUseFileViewer(true)}
          />
        </div>
      );
    }

    if (isImage && preferNativePreview) {
      return (
        <NativeImagePreview
          url={previewUrl}
          alt={file.name}
          fallbackUrl={directUrl !== previewUrl ? directUrl : undefined}
        />
      );
    }

    return (
      <div className="flex-1 min-h-0 w-full">
        <FileViewer
          url={previewUrl}
          fileName={file.name}
          maxHeight="100%"
          style={{ height: "100%", minHeight: 0 }}
        />
      </div>
    );
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
              title="Abrir en nueva pestaña"
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
              <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-center gap-2 w-full max-w-sm">
                <button
                  type="button"
                  onClick={loadPreview}
                  className="flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
                >
                  <RefreshCw size={14} /> Reintentar
                </button>
                <button
                  type="button"
                  onClick={openInNewTab}
                  className="flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
                >
                  <ExternalLink size={14} /> Abrir en nueva pestaña
                </button>
                <button
                  type="button"
                  onClick={onDownload}
                  className="flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-900 transition-colors shadow-sm"
                >
                  <Download size={14} /> Descargar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col min-h-0 p-0 sm:p-2">
              {renderPreviewBody()}
            </div>
          )}
        </div>

        <div className="sm:hidden border-t border-slate-200 bg-white px-3 py-2.5 flex gap-2 flex-shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={openInNewTab}
            className="flex-1 flex items-center justify-center gap-2 py-3 min-h-[44px] bg-[#f1f3f4] text-slate-700 rounded-xl text-xs font-semibold active:bg-slate-200"
          >
            <ExternalLink size={14} /> Abrir en nueva pestaña
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="flex-1 flex items-center justify-center gap-2 py-3 min-h-[44px] bg-blue-600 text-white rounded-xl text-xs font-semibold active:bg-blue-700"
          >
            <Download size={14} /> Descargar
          </button>
        </div>
      </div>
    </div>
  );
};

export default DrivePreviewModal;
