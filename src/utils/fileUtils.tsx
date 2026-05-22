// src/utils/fileUtils.ts

import React from 'react';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from './firebase'; // Aseg?rate que la ruta a tu config de firebase sea correcta

// Iconos que podr?as necesitar para las funciones de ayuda
import {
    PictureAsPdf as PictureAsPdfIcon,
    InsertDriveFile as InsertDriveFileIcon,
    FileUpload as FileUploadIcon,
    Delete as DeleteIcon,
    DriveFileMove as DriveFileMoveIcon,
    CheckCircle as CheckCircleIcon,
    AssignmentTurnedIn as AssignmentTurnedInIcon,
    Visibility as VisibilityIcon,
    Download as DownloadIcon,
    CreateNewFolder as CreateNewFolderIcon,
    Info as InfoIcon
} from '@mui/icons-material';


// --- INTERFACES (TIPOS DE DATOS) ---
export interface DriveFile {
  name: string;
  url: string;
  fullPath: string;
  updated: string;
  originalUpdated?: string;
  reviewed?: boolean;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  completed?: boolean;
  completedBy?: string;
  completedByName?: string;
  completedAt?: string;
  folderPath?: string;
}

export interface DriveFolder {
  name: string;
  fullPath: string;
  folders: DriveFolder[];
  files: DriveFile[];
}

export interface ActivityLog {
  id: string;
  action: 'create' | 'delete' | 'move' | 'review' | 'unreview' | 'complete' | 'uncomplete' | 'view' | 'download' | 'create_folder';
  fileName?: string;
  folderName?: string;
  fromPath?: string;
  toPath?: string;
  userEmail: string;
  userName: string;
  timestamp: string;
  path: string;
  details?: string;
}

export interface UserData {
  name?: string;
  correo?: string;
  puesto?: string;
  [key: string]: any;
}


// --- FUNCIONES DE AYUDA ---

export const extractFileInfo = (fileName: string, updatedDate?: string, originalDate?: string) => {
  const baseName = fileName.replace(/\.pdf$/i, "").replace(/_/g, " ");
  const effectiveDate = originalDate || updatedDate;
  const displayDate = effectiveDate
    ? new Date(effectiveDate).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'Fecha no disponible';
  return {
    displayName: baseName,
    displayDate: displayDate
  };
};

export const getFileIcon = (fileName: string): React.ReactElement => {
  if (fileName.toLowerCase().includes('.pdf')) return <PictureAsPdfIcon />;
  return <InsertDriveFileIcon />;
};

export const getActivityIcon = (action: string): React.ReactElement => {
  switch (action) {
    case 'create': return <FileUploadIcon />;
    case 'delete': return <DeleteIcon />;
    case 'move': return <DriveFileMoveIcon />;
    case 'review': return <CheckCircleIcon />;
    case 'unreview': return <CheckCircleIcon />;
    case 'complete': return <AssignmentTurnedInIcon />;
    case 'uncomplete': return <AssignmentTurnedInIcon />;
    case 'view': return <VisibilityIcon />;
    case 'download': return <DownloadIcon />;
    case 'create_folder': return <CreateNewFolderIcon />;
    default: return <InfoIcon />;
  }
};

export const getActivityDescription = (activity: ActivityLog): string => {
  switch (activity.action) {
    case 'create':
      return `subi? el archivo "${activity.fileName}"`;
    case 'delete':
      return `elimin? el archivo "${activity.fileName}"`;
    case 'move':
      return `movi? "${activity.fileName}" de ${activity.fromPath} a ${activity.toPath}`;
    case 'review':
      return `marc? como revisado "${activity.fileName}"`;
    case 'unreview':
      return `marc? como no revisado "${activity.fileName}"`;
    case 'complete':
      return `marc? como realizado "${activity.fileName}"`;
    case 'uncomplete':
      return `marc? como no realizado "${activity.fileName}"`;
    case 'view':
      return `abri? el archivo "${activity.fileName}"`;
    case 'download':
      return `descarg? el archivo "${activity.fileName}"`;
    case 'create_folder':
      return `cre? la carpeta "${activity.folderName}"`;
    default:
      return `realiz? una acci?n en "${activity.fileName || activity.folderName}"`;
  }
};

export const getFileParentPath = (filePath: string): string[] => {
  const pathParts = filePath.replace('worksheets/', '').split('/');
  pathParts.pop(); 
  return pathParts.filter(part => part && part !== '.keep');
};

export const getCurrentUserData = async (email: string): Promise<UserData | null> => {
  if (!email) return null;
  try {
    const usuariosQuery = query(
      collection(db, 'usuarios'),
      where('correo', '==', email),
      limit(1)
    );
    const querySnapshot = await getDocs(usuariosQuery);
    if (!querySnapshot.empty) {
      return querySnapshot.docs[0].data() as UserData;
    }
    return null;
  } catch (error) {
    console.error('Error obteniendo datos del usuario:', error);
    return null;
  }
};

export const isQualityUser = (userData: UserData | null): boolean => {
  if (!userData) return false;
  const puesto = userData.puesto?.toLowerCase();
  return puesto === 'calidad' || puesto === 'quality';
};

export const isMetrologistUser = (userData: UserData | null): boolean => {
  if (!userData) return false;
  const puesto = userData.puesto?.toLowerCase();
  return puesto === 'metr?logo' || puesto === 'metrologist' || puesto === 'metrologo';
};

export const getUserNameByEmail = async (email: string): Promise<string> => {
    if (!email) return 'Usuario desconocido';
    try {
        const usuariosQuery = query(collection(db, 'usuarios'), where('correo', '==', email), limit(1));
        const querySnapshot = await getDocs(usuariosQuery);
        if (!querySnapshot.empty) {
            const userData = querySnapshot.docs[0].data();
            return userData.name || userData.nombre || email.split('@')[0];
        }
        return email.split('@')[0];
    } catch (error) {
        console.error('Error buscando usuario por email:', error);
        return email.split('@')[0];
    }
};

export const getUserDisplayName = async (user: any): Promise<string> => {
  if (!user) return 'Usuario desconocido';
  if (user.displayName && user.displayName.trim()) return user.displayName.trim();
  if (user.email) return await getUserNameByEmail(user.email);
  return 'Usuario desconocido';
};

export const filterFoldersByPermissions = (folders: DriveFolder[], userIsQuality: boolean, userName: string): DriveFolder[] => {
  if (userIsQuality) return folders;
  const myName = normalizeFolderKey(userName);
  return folders.filter((folder) => normalizeFolderKey(folder.name).includes(myName));
};

const normalizeFolderKey = (name: string) =>
  name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const SHARED_FOLDER_KEYS = ["hojas de servicio", "hojas de trabajo"];

export const isSharedDriveFolder = (folderName: string): boolean => {
  const norm = normalizeFolderKey(folderName);
  return SHARED_FOLDER_KEYS.some((k) => norm.includes(k));
};

export interface FolderVisualStyle {
  bg: string;
  hoverBg: string;
  icon: string;
  fill: string;
  hoverFill: string;
}

const METROLOGIST_FOLDER_PALETTE: FolderVisualStyle[] = [
  { bg: "bg-blue-50", hoverBg: "group-hover:bg-blue-100", icon: "text-blue-600", fill: "fill-blue-100", hoverFill: "group-hover:fill-blue-200" },
  { bg: "bg-emerald-50", hoverBg: "group-hover:bg-emerald-100", icon: "text-emerald-600", fill: "fill-emerald-100", hoverFill: "group-hover:fill-emerald-200" },
  { bg: "bg-violet-50", hoverBg: "group-hover:bg-violet-100", icon: "text-violet-600", fill: "fill-violet-100", hoverFill: "group-hover:fill-violet-200" },
  { bg: "bg-rose-50", hoverBg: "group-hover:bg-rose-100", icon: "text-rose-600", fill: "fill-rose-100", hoverFill: "group-hover:fill-rose-200" },
  { bg: "bg-cyan-50", hoverBg: "group-hover:bg-cyan-100", icon: "text-cyan-600", fill: "fill-cyan-100", hoverFill: "group-hover:fill-cyan-200" },
  { bg: "bg-orange-50", hoverBg: "group-hover:bg-orange-100", icon: "text-orange-600", fill: "fill-orange-100", hoverFill: "group-hover:fill-orange-200" },
  { bg: "bg-indigo-50", hoverBg: "group-hover:bg-indigo-100", icon: "text-indigo-600", fill: "fill-indigo-100", hoverFill: "group-hover:fill-indigo-200" },
  { bg: "bg-teal-50", hoverBg: "group-hover:bg-teal-100", icon: "text-teal-600", fill: "fill-teal-100", hoverFill: "group-hover:fill-teal-200" },
];

const hashFolderName = (name: string): number => {
  let h = 0;
  const s = normalizeFolderKey(name);
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

/** Consistent folder colors: neutral for shared folders, hash palette per metrologist name. */
export const getFolderVisualStyle = (folderName: string): FolderVisualStyle => {
  if (isSharedDriveFolder(folderName)) {
    return {
      bg: "bg-slate-100",
      hoverBg: "group-hover:bg-slate-200",
      icon: "text-slate-600",
      fill: "fill-slate-200",
      hoverFill: "group-hover:fill-slate-300",
    };
  }
  return METROLOGIST_FOLDER_PALETTE[hashFolderName(folderName) % METROLOGIST_FOLDER_PALETTE.length];
};
