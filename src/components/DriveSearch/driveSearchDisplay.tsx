import React from "react";
import { File, FileText, Image as ImageIcon } from "lucide-react";
import { parseDateRobust } from "../../utils/calibrationShared";
import { resolveFileWorkDate } from "../../utils/driveFileMetadata";
import type { DriveSearchFile } from "../../utils/driveSearch";

export const getFileWorkDate = (file: DriveSearchFile) =>
  file.workDate || resolveFileWorkDate(file, [file.created, file.updated]) || file.created;

export const formatFileSize = (bytes?: number) => {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export const formatDate = (dateStr: unknown) => {
  const d = parseDateRobust(dateStr);
  if (!d) return "—";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return "Hoy";
  if (diffDays === -1) return "Ayer";
  if (diffDays === 1) return "Mañana";
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
};

export const getFileIcon = (fileName?: string, size = 24) => {
  if (!fileName || typeof fileName !== "string") {
    return <File size={size} className="text-slate-400" strokeWidth={1.5} />;
  }
  const ext = fileName.split(".").pop()?.toLowerCase();
  const p = { size, strokeWidth: 1.5 };
  if (ext === "pdf") return <FileText {...p} className="text-red-500" />;
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext || "")) {
    return <ImageIcon {...p} className="text-purple-500" />;
  }
  return <File {...p} className="text-slate-400" />;
};

export const getFileColorBg = (fileName?: string) => {
  if (!fileName) return "bg-slate-50";
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "bg-red-50";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext || "")) return "bg-purple-50";
  return "bg-slate-50";
};
