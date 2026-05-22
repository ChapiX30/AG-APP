import React from "react";
import { X } from "lucide-react";
import { useSWUpdate } from "./useSWUpdate";

const UpdateBanner: React.FC = () => {
  const { showReload, reloadPage, dismiss } = useSWUpdate();

  if (!showReload) return null;

  return (
    <div
      role="status"
      className="fixed bottom-5 right-5 z-[9999] flex max-w-sm items-center gap-3 rounded-lg border border-blue-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-lg"
    >
      <button
        type="button"
        onClick={reloadPage}
        className="flex-1 text-left font-medium text-blue-700 hover:text-blue-900"
      >
        Nueva versión disponible. Toca para actualizar.
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          dismiss();
        }}
        className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        aria-label="Cerrar aviso de actualización"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default UpdateBanner;
