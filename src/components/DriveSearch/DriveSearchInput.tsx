import React, { useDeferredValue, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import clsx from "clsx";

export type DriveSearchInputProps = {
  inputRef: React.RefObject<HTMLInputElement | null>;
  clearSignal: number;
  catalogActive: boolean;
  dropdownOpen: boolean;
  catalogLoading: boolean;
  onFilterQueryChange: (query: string) => void;
  onFilterPendingChange: (pending: boolean) => void;
  onHasTextChange: (hasText: boolean) => void;
  onFocus: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
};

/** Input aislado: cada tecla solo re-renderiza este bloque, no todo DriveScreen. */
export const DriveSearchInput = React.memo(function DriveSearchInput({
  inputRef,
  clearSignal,
  catalogActive,
  dropdownOpen,
  catalogLoading,
  onFilterQueryChange,
  onFilterPendingChange,
  onHasTextChange,
  onFocus,
  onKeyDown,
}: DriveSearchInputProps) {
  const [value, setValue] = useState("");
  const deferredValue = useDeferredValue(value);

  useEffect(() => {
    onFilterQueryChange(deferredValue);
  }, [deferredValue, onFilterQueryChange]);

  useEffect(() => {
    onFilterPendingChange(value.trim() !== deferredValue.trim());
  }, [value, deferredValue, onFilterPendingChange]);

  useEffect(() => {
    onHasTextChange(value.trim().length > 0);
  }, [value, onHasTextChange]);

  useEffect(() => {
    setValue("");
  }, [clearSignal]);

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        placeholder="Buscar en el Drive — Ctrl+K"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onFocus();
        }}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        autoComplete="off"
        className={clsx(
          "w-full bg-slate-100/80 hover:bg-slate-100 focus:bg-white focus:ring-2 focus:ring-[#2464A3]/30 border border-slate-200/60 focus:border-[#2464A3] py-2.5 pl-9 pr-8 text-sm outline-none transition-all text-slate-800 placeholder-slate-400 shadow-sm relative z-10",
          dropdownOpen
            ? "rounded-t-xl rounded-b-none border-b-transparent shadow-md"
            : "rounded-full"
        )}
      />
      {catalogLoading && catalogActive && (
        <Loader2
          size={14}
          className="absolute right-8 top-1/2 -translate-y-1/2 text-[#2464A3] animate-spin z-20"
        />
      )}
      {value && (
        <button
          type="button"
          onClick={() => {
            setValue("");
            onFocus();
            inputRef.current?.focus();
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-200 transition-colors z-20"
        >
          <X size={13} />
        </button>
      )}
    </>
  );
});
