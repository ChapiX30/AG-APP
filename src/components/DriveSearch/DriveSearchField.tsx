import React, { useCallback } from "react";
import { Search } from "lucide-react";
import { DriveSearchDropdown } from "./DriveSearchDropdown";
import { DriveSearchInput } from "./DriveSearchInput";
import type { SearchSuggestion } from "./types";

export type DriveSearchFieldProps = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  clearSignal: number;
  catalogActive: boolean;
  dropdownOpen: boolean;
  catalogLoading: boolean;
  activeSearchTerm: string;
  isFilterPending: boolean;
  resultCount: number;
  suggestions: SearchSuggestion[];
  activeIndex: number;
  searchFocused: boolean;
  onFilterQueryChange: (query: string) => void;
  onFilterPendingChange: (pending: boolean) => void;
  onHasTextChange: (hasText: boolean) => void;
  onFocusBrowse: () => void;
  onActiveIndexChange: (index: number) => void;
  onSelectSuggestion: (item: SearchSuggestion) => void;
  onCloseDropdown: () => void;
  onViewAllResults: () => void;
  onClearAndBlur: () => void;
};

export const DriveSearchField = React.memo(function DriveSearchField({
  containerRef,
  inputRef,
  clearSignal,
  catalogActive,
  dropdownOpen,
  catalogLoading,
  activeSearchTerm,
  isFilterPending,
  resultCount,
  suggestions,
  activeIndex,
  searchFocused,
  onFilterQueryChange,
  onFilterPendingChange,
  onHasTextChange,
  onFocusBrowse,
  onActiveIndexChange,
  onSelectSuggestion,
  onCloseDropdown,
  onViewAllResults,
  onClearAndBlur,
}: DriveSearchFieldProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!searchFocused || suggestions.length === 0) {
        if (e.key === "Escape") {
          onClearAndBlur();
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        onActiveIndexChange((activeIndex + 1) % suggestions.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        onActiveIndexChange(
          activeIndex <= 0 ? suggestions.length - 1 : activeIndex - 1
        );
      } else if (e.key === "Enter") {
        if (activeIndex >= 0 && activeIndex < suggestions.length) {
          e.preventDefault();
          onSelectSuggestion(suggestions[activeIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCloseDropdown();
        onActiveIndexChange(-1);
      }
    },
    [
      searchFocused,
      suggestions,
      activeIndex,
      onSelectSuggestion,
      onClearAndBlur,
      onCloseDropdown,
      onActiveIndexChange,
    ]
  );

  return (
    <div ref={containerRef} className="relative flex-1 max-w-xl overflow-visible z-[70]">
      <Search
        size={15}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#2464A3] transition-colors z-10 pointer-events-none"
      />
      <DriveSearchInput
        inputRef={inputRef}
        clearSignal={clearSignal}
        catalogActive={catalogActive}
        dropdownOpen={dropdownOpen}
        catalogLoading={catalogLoading}
        onFilterQueryChange={onFilterQueryChange}
        onFilterPendingChange={onFilterPendingChange}
        onHasTextChange={onHasTextChange}
        onFocus={onFocusBrowse}
        onKeyDown={handleKeyDown}
      />
      <DriveSearchDropdown
        open={dropdownOpen}
        activeSearchTerm={activeSearchTerm}
        isFilterPending={isFilterPending}
        resultCount={resultCount}
        suggestions={suggestions}
        activeIndex={activeIndex}
        catalogLoading={catalogLoading}
        onActiveIndexChange={onActiveIndexChange}
        onSelectSuggestion={onSelectSuggestion}
        onClose={onCloseDropdown}
        onViewAllResults={onViewAllResults}
      />
    </div>
  );
});
