// src/utils/fileUtils.ts

import React from 'react';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from './firebase'; // Asegúrate que la ruta a tu config de firebase sea correcta

// Iconos que podrías necesitar para las funciones de ayuda
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
      return `subió el archivo "${activity.fileName}"`;
    case 'delete':
      return `eliminó el archivo "${activity.fileName}"`;
    case 'move':
      return `movió "${activity.fileName}" de ${activity.fromPath} a ${activity.toPath}`;
    case 'review':
      return `marcó como revisado "${activity.fileName}"`;
    case 'unreview':
      return `marcó como no revisado "${activity.fileName}"`;
    case 'complete':
      return `marcó como realizado "${activity.fileName}"`;
    case 'uncomplete':
      return `marcó como no realizado "${activity.fileName}"`;
    case 'view':
      return `abrió el archivo "${activity.fileName}"`;
    case 'download':
      return `descargó el archivo "${activity.fileName}"`;
    case 'create_folder':
      return `creó la carpeta "${activity.folderName}"`;
    default:
      return `realizó una acción en "${activity.fileName || activity.folderName}"`;
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
  return puesto === 'metrólogo' || puesto === 'metrologist' || puesto === 'metrologo';
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
  const userNameLower = userName.toLowerCase();
  return folders.filter(folder => {
    const folderNameLower = folder.name.toLowerCase();
    return folderNameLower.includes(userNameLower) || userNameLower.includes(folderNameLower) || folder.name === userName;
  });
};