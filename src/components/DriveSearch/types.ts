import type { DriveSearchFile } from "../../utils/driveSearch";

export type DriveSearchSortType =
  | "dateDesc"
  | "dateAsc"
  | "nameAsc"
  | "nameDesc"
  | "sizeDesc"
  | "sizeAsc";

export type FolderMatch = { name: string; pathSegments: string[] };

export type SearchSuggestion =
  | { kind: "folder"; key: string; folder: FolderMatch }
  | { kind: "file"; key: string; file: DriveSearchFile };

export type { DriveSearchFile };
