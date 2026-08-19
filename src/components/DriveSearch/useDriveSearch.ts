import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  driveFileMatchesEquipmentId,
  extractEquipmentIdFromFileName,
} from "../../utils/worksheetDriveSync";
import {
  type DriveSearchFile,
  type FileSearchIndex,
  isEquipmentIdQuery,
  matchDriveSearch,
  matchDriveSearchText,
} from "../../utils/driveSearch";
import { resolveFileWorkDate } from "../../utils/driveFileMetadata";
import type { DriveSearchSortType, FolderMatch, SearchSuggestion } from "./types";
import { useDebounce } from "./useDebounce";

const getFileWorkDate = (file: DriveSearchFile) =>
  file.workDate || resolveFileWorkDate(file, [file.created, file.updated]) || file.created;

const sortDriveFiles = (list: DriveSearchFile[], sortBy: DriveSearchSortType): DriveSearchFile[] => {
  const result = [...list];
  result.sort((a, b) => {
    switch (sortBy) {
      case "nameAsc":
        return a.name.localeCompare(b.name);
      case "nameDesc":
        return b.name.localeCompare(a.name);
      case "dateAsc":
        return new Date(getFileWorkDate(a)).getTime() - new Date(getFileWorkDate(b)).getTime();
      case "dateDesc":
        return new Date(getFileWorkDate(b)).getTime() - new Date(getFileWorkDate(a)).getTime();
      case "sizeAsc":
        return (a.size || 0) - (b.size || 0);
      case "sizeDesc":
        return (b.size || 0) - (a.size || 0);
      default:
        return 0;
    }
  });
  return result;
};

const mergeSearchPool = (
  browseFiles: DriveSearchFile[],
  catalogFiles: DriveSearchFile[]
): DriveSearchFile[] => {
  if (catalogFiles.length === 0) return browseFiles;
  if (browseFiles.length === 0) return catalogFiles;
  const seen = new Set(catalogFiles.map((f) => f.fullPath));
  const extra = browseFiles.filter((f) => !seen.has(f.fullPath));
  return extra.length ? [...extra, ...catalogFiles] : catalogFiles;
};

export type UseDriveSearchOptions = {
  files: DriveSearchFile[];
  folders: { name: string; fullPath: string }[];
  catalogFiles?: DriveSearchFile[];
  applySearchToList?: boolean;
  sortBy: DriveSearchSortType;
  pendingWorksheetFile: DriveSearchFile | null;
};

export function useDriveSearch({
  files,
  folders,
  catalogFiles = [],
  applySearchToList = false,
  sortBy,
  pendingWorksheetFile,
}: UseDriveSearchOptions) {
  const haystackCacheRef = useRef(new Map<string, FileSearchIndex>());
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [filterQuery, setFilterQuery] = useState("");
  const [searchHasText, setSearchHasText] = useState(false);
  const [searchClearSignal, setSearchClearSignal] = useState(0);
  const [isSearchFilterPending, setIsSearchFilterPending] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchActiveIndex, setSearchActiveIndex] = useState(-1);

  const debouncedSearch = useDebounce(filterQuery, 80);
  const activeSearchTerm = filterQuery.trim();
  const searchCatalogActive = activeSearchTerm.length > 0;

  const clearSearch = useCallback(() => {
    setFilterQuery("");
    setSearchHasText(false);
    setSearchClearSignal((s) => s + 1);
  }, []);

  const handleFilterQueryChange = useCallback((q: string) => {
    startTransition(() => setFilterQuery(q));
  }, []);

  useEffect(() => {
    haystackCacheRef.current.clear();
  }, [files, catalogFiles]);

  const searchPool = useMemo(
    () => mergeSearchPool(files, catalogFiles),
    [files, catalogFiles]
  );

  const matchedFiles = useMemo(() => {
    if (!activeSearchTerm) return [] as DriveSearchFile[];
    const cache = haystackCacheRef.current;
    let result = searchPool.filter((f) => matchDriveSearch(f, activeSearchTerm, cache));

    let pinnedPending: DriveSearchFile | null = null;
    const isCertQuery = /^ag[a-z]{0,4}-?\d/i.test(activeSearchTerm.replace(/\s/g, ""));
    const minPendingLen = isEquipmentIdQuery(activeSearchTerm) || isCertQuery ? 2 : 3;
    if (pendingWorksheetFile && activeSearchTerm.length >= minPendingLen) {
      const equipId =
        pendingWorksheetFile.worksheetId ||
        extractEquipmentIdFromFileName(pendingWorksheetFile.rawName || pendingWorksheetFile.name);
      const alreadyListed = result.some(
        (f) =>
          !f.isPendingWorksheet &&
          (driveFileMatchesEquipmentId(f.rawName || f.name, activeSearchTerm) ||
            (equipId && driveFileMatchesEquipmentId(f.rawName || f.name, equipId)))
      );
      if (!alreadyListed) pinnedPending = pendingWorksheetFile;
    }

    result = sortDriveFiles(result, sortBy);
    if (pinnedPending) return [pinnedPending, ...result];
    return result;
  }, [searchPool, pendingWorksheetFile, activeSearchTerm, sortBy]);

  const processedFiles = useMemo(() => {
    if (applySearchToList && activeSearchTerm) return matchedFiles;
    return sortDriveFiles(files, sortBy);
  }, [applySearchToList, activeSearchTerm, matchedFiles, files, sortBy]);

  const visibleFolders = useMemo(() => {
    if (applySearchToList && activeSearchTerm) {
      return folders.filter((f) => matchDriveSearchText(f.name, activeSearchTerm));
    }
    return folders;
  }, [folders, activeSearchTerm, applySearchToList]);

  const catalogFolderHints = useMemo(() => {
    const out: FolderMatch[] = [];
    const seen = new Set<string>();
    for (const f of searchPool) {
      const parts = (f.fullPath || "").split("/").filter(Boolean);
      for (let i = 1; i < parts.length - 1; i++) {
        const key = parts.slice(0, i + 1).join("/");
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ name: parts[i], pathSegments: parts.slice(1, i + 1) });
      }
    }
    for (const folder of folders) {
      const parts = (folder.fullPath || "").split("/").filter(Boolean);
      if (parts.length < 2) continue;
      const key = parts.join("/");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name: folder.name, pathSegments: parts.slice(1) });
    }
    return out;
  }, [searchPool, folders]);

  const folderMatches = useMemo(() => {
    if (!searchCatalogActive || !activeSearchTerm) return [] as FolderMatch[];
    return catalogFolderHints
      .filter((f) => matchDriveSearchText(f.name, activeSearchTerm))
      .slice(0, 4);
  }, [searchCatalogActive, catalogFolderHints, activeSearchTerm]);

  const searchSuggestions = useMemo<SearchSuggestion[]>(() => {
    if (!searchCatalogActive) return [];
    const folderItems: SearchSuggestion[] = folderMatches.map((f) => ({
      kind: "folder",
      key: `folder-${f.pathSegments.join("/")}`,
      folder: f,
    }));
    const browsePaths = new Set(files.map((f) => f.fullPath));
    const ranked = [...matchedFiles].sort((a, b) => {
      const aLocal = browsePaths.has(a.fullPath) ? 0 : 1;
      const bLocal = browsePaths.has(b.fullPath) ? 0 : 1;
      return aLocal - bLocal;
    });
    const fileItems: SearchSuggestion[] = ranked.slice(0, 12).map((f) => ({
      kind: "file",
      key: `file-${f.fullPath}`,
      file: f,
    }));
    return [...folderItems, ...fileItems];
  }, [searchCatalogActive, folderMatches, matchedFiles, files]);

  const showSearchDropdown = searchFocused && searchHasText;

  useEffect(() => {
    setSearchActiveIndex(-1);
  }, [activeSearchTerm]);

  return {
    searchInputRef,
    filterQuery,
    debouncedSearch,
    searchCatalogActive,
    activeSearchTerm,
    processedFiles,
    matchedFiles,
    searchResultCount: matchedFiles.length,
    visibleFolders,
    searchSuggestions,
    showSearchDropdown,
    searchFocused,
    setSearchFocused,
    searchActiveIndex,
    setSearchActiveIndex,
    searchClearSignal,
    isSearchFilterPending,
    setIsSearchFilterPending,
    setSearchHasText,
    clearSearch,
    handleFilterQueryChange,
  };
}
