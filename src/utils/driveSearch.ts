import {
  driveFileMatchesEquipmentId,
  isEquipmentIdSearchTerm,
} from "./worksheetDriveSync";

/** Campos mínimos que usa el motor de búsqueda del Drive. */
export interface DriveSearchFile {
  name: string;
  rawName: string;
  fullPath: string;
  updated: string;
  created: string;
  size?: number;
  notas?: string;
  parentFolder?: string;
  uploadedBy?: string;
  worksheetId?: string;
  worksheetDocId?: string;
  worksheetCliente?: string;
  worksheetEquipo?: string;
  worksheetTechnician?: string;
  ubicacion?: string;
  ubicacion_real?: string;
  workDate?: string;
  keywords?: string[];
  isPendingWorksheet?: boolean;
  reviewed?: boolean;
  completed?: boolean;
}

export type FileSearchIndex = { haystack: string; tokens: string[] };

export const normalizeText = (text: string) =>
  text ? text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() : "";

export const generateSearchTokens = (text: string): string[] => {
  if (!text) return [];
  const normalized = normalizeText(text);
  const parts = normalized.split(/[_ \-\.]+/).filter((p) => p.length > 0);
  return [...new Set([normalized, ...parts])];
};

const compactAlphanumeric = (text: string) =>
  normalizeText(text).replace(/[^a-z0-9]/g, "");

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const tokenizeSearchText = (text: string): string[] => {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  return normalized.split(/[\s_\-./\\]+/).filter((t) => t.length > 0);
};

const parseSearchTerms = (query: string): string[] => {
  const trimmed = query.trim();
  const q = normalizeText(trimmed);
  if (!q) return [];
  if (isEquipmentIdSearchTerm(trimmed)) return [q];
  return [...new Set(q.split(/[\s_\-./\\]+/).filter((t) => t.length > 0))];
};

const buildFileSearchHaystack = (file: DriveSearchFile): string =>
  normalizeText(
    [
      file.name,
      file.rawName,
      file.notas || "",
      file.parentFolder || "",
      file.uploadedBy || "",
      file.worksheetId || "",
      file.worksheetDocId || "",
      file.worksheetCliente || "",
      file.worksheetEquipo || "",
      file.worksheetTechnician || "",
      file.ubicacion || "",
      file.ubicacion_real || "",
      ...(file.keywords || []),
    ].join(" ")
  );

export const getFileSearchIndex = (
  file: DriveSearchFile,
  cache: Map<string, FileSearchIndex>
): FileSearchIndex => {
  const cached = cache.get(file.fullPath);
  if (cached) return cached;
  const haystack = buildFileSearchHaystack(file);
  const entry = { haystack, tokens: tokenizeSearchText(haystack) };
  cache.set(file.fullPath, entry);
  return entry;
};

const hasDelimitedMatch = (haystack: string, term: string): boolean => {
  const t = normalizeText(term);
  if (!t) return false;
  const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(t)}([^a-z0-9]|$)`);
  return re.test(haystack);
};

const termMatchesHaystack = (haystack: string, tokens: string[], term: string): boolean => {
  const termNorm = normalizeText(term);
  if (!termNorm) return false;

  if (tokens.includes(termNorm)) return true;
  if (hasDelimitedMatch(haystack, termNorm)) return true;

  const compactTerm = compactAlphanumeric(term);
  const compactHay = compactAlphanumeric(haystack);
  if (compactTerm.length >= 4 && /^[a-z]+$/.test(compactTerm)) {
    return compactHay.includes(compactTerm);
  }

  if (/^\d+$/.test(term)) {
    return hasDelimitedMatch(haystack, term);
  }

  return false;
};

export const matchDriveSearch = (
  file: DriveSearchFile,
  query: string,
  cache?: Map<string, FileSearchIndex>
): boolean => {
  const trimmed = query.trim();
  if (!trimmed) return true;

  const { haystack, tokens } = cache
    ? getFileSearchIndex(file, cache)
    : {
        haystack: buildFileSearchHaystack(file),
        tokens: tokenizeSearchText(buildFileSearchHaystack(file)),
      };
  const fullQuery = normalizeText(trimmed);
  const compactHay = compactAlphanumeric(haystack);
  const compactQuery = compactAlphanumeric(trimmed);

  if (isEquipmentIdSearchTerm(trimmed)) {
    if (file.isPendingWorksheet) return false;
    if (driveFileMatchesEquipmentId(file.rawName || file.name, trimmed)) return true;
    const idNorm = fullQuery;
    if (file.worksheetId && normalizeText(file.worksheetId) === idNorm) return true;
    if (tokens.includes(idNorm)) return true;
    if (hasDelimitedMatch(haystack, idNorm)) return true;
    if (compactQuery.length >= 4 && compactHay.includes(compactQuery)) return true;
    return false;
  }

  if (fullQuery.length >= 2 && hasDelimitedMatch(haystack, fullQuery)) return true;
  if (compactQuery.length >= 4 && compactHay.includes(compactQuery)) return true;

  const terms = parseSearchTerms(trimmed);
  if (terms.length === 0) return true;

  return terms.every((term) => termMatchesHaystack(haystack, tokens, term));
};

export const matchDriveSearchText = (text: string, query: string): boolean =>
  matchDriveSearch(
    { name: text, rawName: text, fullPath: "", updated: "", created: "" },
    query
  );

export const isEquipmentIdQuery = isEquipmentIdSearchTerm;
