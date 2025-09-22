import React, { useState, useEffect, useMemo } from "react";
import { ref, listAll, getDownloadURL, uploadBytes, deleteObject, getMetadata } from "firebase/storage";
import { doc, getDoc, updateDoc, deleteDoc, setDoc, collection, addDoc, query, orderBy, limit, where, getDocs } from "firebase/firestore";
import { storage, db, auth } from "../utils/firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { useNavigation } from "../hooks/useNavigation";
import {
  Card, CardContent, Typography, Box, Grid, Button, CircularProgress, Chip,
  IconButton, Tooltip, Paper, useTheme, alpha, TextField, InputAdornment,
  Zoom, useMediaQuery, Stack, ToggleButton, ToggleButtonGroup, Dialog,
  DialogTitle, DialogContent, DialogActions, Breadcrumbs, Link,
  Alert, Snackbar, Select, FormControl, Badge, MenuItem, Fab, Menu,
  ListItemIcon, ListItemText, Divider, Avatar, Container, Drawer,
  List, ListItem, ListItemAvatar, ListItemButton, Collapse, Tab, Tabs,
  Timeline, TimelineItem, TimelineSeparator, TimelineConnector, TimelineContent,
  TimelineDot, TimelineOppositeContent, Switch, FormControlLabel
} from "@mui/material";

// Iconos actualizados siguiendo Google Drive
import FolderIcon from '@mui/icons-material/Folder';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloudIcon from '@mui/icons-material/Cloud';
import DescriptionIcon from '@mui/icons-material/Description';
import SearchIcon from '@mui/icons-material/Search';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewListIcon from '@mui/icons-material/ViewList';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import DriveFileMoveIcon from '@mui/icons-material/DriveFileMove';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DownloadIcon from '@mui/icons-material/Download';
import VisibilityIcon from '@mui/icons-material/Visibility';
import SearchOffIcon from '@mui/icons-material/SearchOff';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ShareIcon from '@mui/icons-material/Share';
import StarIcon from '@mui/icons-material/Star';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import GridViewIcon from '@mui/icons-material/GridView';
import SortIcon from '@mui/icons-material/Sort';
import FilterListIcon from '@mui/icons-material/FilterList';
import InfoIcon from '@mui/icons-material/Info';
import HistoryIcon from '@mui/icons-material/History';
import PersonIcon from '@mui/icons-material/Person';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import WorkIcon from '@mui/icons-material/Work';
import FolderSharedIcon from '@mui/icons-material/FolderShared';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import SecurityIcon from '@mui/icons-material/Security';
import LockIcon from '@mui/icons-material/Lock';

// Interfaces
interface DriveFile {
  name: string;
  url: string;
  fullPath: string;
  updated: string;
  reviewed?: boolean;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
}

interface DriveFolder {
  name: string;
  fullPath: string;
  folders: DriveFolder[];
  files: DriveFile[];
}

interface ActivityLog {
  id: string;
  action: 'create' | 'delete' | 'move' | 'review' | 'unreview' | 'view' | 'download' | 'create_folder';
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

// NUEVA INTERFAZ: Para datos del usuario con rol
interface UserData {
  name?: string;
  correo?: string;
  puesto?: string;
  [key: string]: any;
}

const extractFileInfo = (fileName: string, updatedDate?: string) => {
  const baseName = fileName.replace(/\.pdf$/i, "").replace(/_/g, " ");
  const displayDate = updatedDate
    ? new Date(updatedDate).toLocaleDateString('es-ES', {
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

const getFileIcon = (fileName: string) => {
  if (fileName.toLowerCase().includes('.pdf')) return <PictureAsPdfIcon />;
  return <InsertDriveFileIcon />;
};

const getActivityIcon = (action: string) => {
  switch (action) {
    case 'create': return <FileUploadIcon sx={{ color: '#34a853' }} />;
    case 'delete': return <DeleteIcon sx={{ color: '#ea4335' }} />;
    case 'move': return <DriveFileMoveIcon sx={{ color: '#fbbc04' }} />;
    case 'review': return <CheckCircleIcon sx={{ color: '#34a853' }} />;
    case 'unreview': return <CheckCircleIcon sx={{ color: '#9aa0a6' }} />;
    case 'view': return <VisibilityIcon sx={{ color: '#4285f4' }} />;
    case 'download': return <DownloadIcon sx={{ color: '#4285f4' }} />;
    case 'create_folder': return <CreateNewFolderIcon sx={{ color: '#34a853' }} />;
    default: return <WorkIcon sx={{ color: '#9aa0a6' }} />;
  }
};

const getActivityDescription = (activity: ActivityLog) => {
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

// NUEVA FUNCIÓN: Obtener datos completos del usuario incluyendo rol
const getCurrentUserData = async (email: string): Promise<UserData | null> => {
  if (!email) return null;
  
  try {
    console.log(`Obteniendo datos del usuario: ${email}`);
    
    const usuariosQuery = query(
      collection(db, 'usuarios'),
      where('correo', '==', email),
      limit(1)
    );
    
    const querySnapshot = await getDocs(usuariosQuery);
    
    if (!querySnapshot.empty) {
      const userData = querySnapshot.docs[0].data() as UserData;
      console.log('Datos del usuario encontrados:', userData);
      return userData;
    }
    
    console.log('Usuario no encontrado en la colección usuarios');
    return null;
    
  } catch (error) {
    console.error('Error obteniendo datos del usuario:', error);
    return null;
  }
};

// NUEVA FUNCIÓN: Verificar si el usuario tiene rol de calidad
const isQualityUser = (userData: UserData | null): boolean => {
  if (!userData) return false;
  
  // Verificar el campo 'puesto' para rol de calidad
  const puesto = userData.puesto?.toLowerCase();
  return puesto === 'calidad' || puesto === 'quality';
};

// FUNCIÓN MEJORADA: Buscar usuario por email en la colección 'usuarios'
const getUserNameByEmail = async (email: string): Promise<string> => {
  if (!email) return 'Usuario desconocido';
  
  try {
    console.log(`Buscando usuario con email: ${email}`);
    
    const usuariosQuery = query(
      collection(db, 'usuarios'),
      where('correo', '==', email),
      limit(1)
    );
    
    const querySnapshot = await getDocs(usuariosQuery);
    
    if (!querySnapshot.empty) {
      const userData = querySnapshot.docs[0].data();
      console.log('Usuario encontrado:', userData);
      
      if (userData.name) {
        return userData.name;
      }
      if (userData.nombre) {
        return userData.nombre;
      }
    }
    
    console.log('Usuario no encontrado en colección usuarios');
    
    if (email.includes('@')) {
      const emailPart = email.split('@')[0];
      return emailPart.charAt(0).toUpperCase() + emailPart.slice(1);
    }
    
    return email.charAt(0).toUpperCase() + email.slice(1);
    
  } catch (error) {
    console.error('Error buscando usuario por email:', error);
    
    if (email.includes('@')) {
      const emailPart = email.split('@')[0];
      return emailPart.charAt(0).toUpperCase() + emailPart.slice(1);
    }
    
    return email.charAt(0).toUpperCase() + email.slice(1);
  }
};

// FUNCIÓN MEJORADA: Obtener nombre de usuario actual
const getUserDisplayName = async (user: any): Promise<string> => {
  if (!user) return 'Usuario desconocido';
  
  if (user.displayName && user.displayName.trim()) {
    return user.displayName.trim();
  }
  
  if (user.email) {
    const realName = await getUserNameByEmail(user.email);
    return realName;
  }
  
  return 'Usuario desconocido';
};

// NUEVA FUNCIÓN: Filtrar carpetas según permisos del usuario
const filterFoldersByPermissions = (folders: DriveFolder[], userIsQuality: boolean, userName: string): DriveFolder[] => {
  if (userIsQuality) {
    console.log('Usuario tiene rol de calidad - puede ver todas las carpetas');
    return folders;
  }
  
  console.log(`Usuario regular - filtrando carpetas para: ${userName}`);
  
  // Filtrar solo las carpetas que coincidan con el nombre del usuario
  const userFolders = folders.filter(folder => {
    const folderNameLower = folder.name.toLowerCase();
    const userNameLower = userName.toLowerCase();
    
    // Verificar coincidencia exacta o parcial
    return folderNameLower.includes(userNameLower) || 
           userNameLower.includes(folderNameLower) ||
           folder.name === userName;
  });
  
  console.log(`Carpetas filtradas para ${userName}:`, userFolders.map(f => f.name));
  return userFolders;
};

const ROOT_PATH = "worksheets";

export default function DriveScreen({ onBack }: { onBack?: () => void }) {
  const [user] = useAuthState(auth);
  const [tree, setTree] = useState<DriveFolder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string[]>([]);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<'name' | 'date'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [globalSearch, setGlobalSearch] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [moveFile, setMoveFile] = useState<DriveFile | null>(null);
  const [deleteFile, setDeleteFile] = useState<DriveFile | null>(null);
  const [moveLoading, setMoveLoading] = useState(false);
  const [moveSuccess, setMoveSuccess] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [actionMenuAnchor, setActionMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  
  // Estados para el panel de actividad
  const [activityPanelOpen, setActivityPanelOpen] = useState(false);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityTab, setActivityTab] = useState(0);
  const [showMyActivityOnly, setShowMyActivityOnly] = useState(false);

  // NUEVOS ESTADOS: Para control de acceso por roles
  const [currentUserData, setCurrentUserData] = useState<UserData | null>(null);
  const [userIsQuality, setUserIsQuality] = useState(false);
  const [accessLoading, setAccessLoading] = useState(true);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isTablet = useMediaQuery(theme.breakpoints.between('md', 'lg'));
  const { goBack, navigateTo } = useNavigation();

  // NUEVO EFECTO: Cargar datos del usuario y verificar permisos
  useEffect(() => {
    const loadUserPermissions = async () => {
      if (!user?.email) {
        setAccessLoading(false);
        return;
      }

      try {
        setAccessLoading(true);
        const userData = await getCurrentUserData(user.email);
        setCurrentUserData(userData);
        
        const isQuality = isQualityUser(userData);
        setUserIsQuality(isQuality);
        
        console.log('Permisos del usuario:', {
          email: user.email,
          isQuality,
          userData
        });
        
      } catch (error) {
        console.error('Error cargando permisos del usuario:', error);
      } finally {
        setAccessLoading(false);
      }
    };

    loadUserPermissions();
  }, [user]);

  // FUNCIÓN MEJORADA: Registrar actividad con nombre real
  const logActivity = async (
    action: ActivityLog['action'],
    fileName?: string,
    folderName?: string,
    fromPath?: string,
    toPath?: string,
    details?: string
  ) => {
    if (!user) return;

    try {
      const currentPath = selectedPath.length > 0 ? selectedPath.join('/') : 'root';
      const userName = await getUserDisplayName(user);
      
      const activityData: Omit<ActivityLog, 'id'> = {
        action,
        fileName,
        folderName,
        fromPath,
        toPath,
        userEmail: user.email!,
        userName,
        timestamp: new Date().toISOString(),
        path: currentPath,
        details
      };

      await addDoc(collection(db, 'driveActivity'), activityData);
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  };

  // Función para cargar actividades
  const loadActivities = async () => {
    setActivityLoading(true);
    try {
      let q = query(
        collection(db, 'driveActivity'),
        orderBy('timestamp', 'desc'),
        limit(50)
      );

      if (showMyActivityOnly && user) {
        q = query(
          collection(db, 'driveActivity'),
          where('userEmail', '==', user.email),
          orderBy('timestamp', 'desc'),
          limit(50)
        );
      }

      const querySnapshot = await getDocs(q);
      const activitiesData: ActivityLog[] = [];
      
      querySnapshot.forEach((doc) => {
        activitiesData.push({
          id: doc.id,
          ...doc.data()
        } as ActivityLog);
      });

      setActivities(activitiesData);
    } catch (error) {
      console.error('Error loading activities:', error);
    }
    setActivityLoading(false);
  };

  // FUNCIÓN MEJORADA: Cargar metadatos con nombres reales
  const loadFileMetadata = async (file: DriveFile): Promise<DriveFile> => {
    try {
      const metadataDoc = await getDoc(doc(db, 'fileMetadata', file.fullPath.replace(/\//g, '_')));
      if (metadataDoc.exists()) {
        const metadata = metadataDoc.data();
        let reviewedByName = metadata.reviewedByName;
        
        if (metadata.reviewed && metadata.reviewedBy && !reviewedByName) {
          reviewedByName = await getUserNameByEmail(metadata.reviewedBy);
          
          try {
            await updateDoc(doc(db, 'fileMetadata', file.fullPath.replace(/\//g, '_')), {
              reviewedByName: reviewedByName
            });
          } catch (updateError) {
            console.log('No se pudo actualizar el nombre del revisor');
          }
        }
        
        return {
          ...file,
          reviewed: metadata.reviewed || false,
          reviewedBy: metadata.reviewedBy,
          reviewedByName: reviewedByName,
          reviewedAt: metadata.reviewedAt,
        };
      }
    } catch (error) {
      console.error("Error loading file metadata:", error);
    }
    return file;
  };

  // FUNCIÓN MEJORADA: Cargar carpetas con filtrado por permisos
  async function fetchFolder(pathArr: string[]): Promise<DriveFolder> {
    const fullPath = [ROOT_PATH, ...pathArr].join("/");
    const dirRef = ref(storage, fullPath);
    const res = await listAll(dirRef);

    const folders: DriveFolder[] = await Promise.all(
      res.prefixes.map(async (prefix) => fetchFolder([...pathArr, prefix.name]))
    );

    const files: DriveFile[] = await Promise.all(
      res.items.map(async (itemRef) => {
        const url = await getDownloadURL(itemRef);
        const metadata = await getMetadata(itemRef);
        const file: DriveFile = {
          name: itemRef.name,
          url,
          fullPath: itemRef.fullPath,
          updated: metadata.updated,
        };
        return await loadFileMetadata(file);
      })
    );

    return {
      name: pathArr[pathArr.length - 1] || "Drive",
      fullPath,
      folders,
      files
    };
  }

  // FUNCIÓN MEJORADA: Recargar árbol con filtrado por permisos
  async function reloadTree() {
    setLoading(true);
    setError(null);
    try {
      const rootTree = await fetchFolder([]);
      setTree(rootTree);
    } catch (e: any) {
      console.error("Error loading files:", e);
      setError("No se pudieron cargar los archivos.");
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!accessLoading && currentUserData !== null) {
      reloadTree();
    }
  }, [accessLoading, currentUserData]);

  useEffect(() => {
    if (activityPanelOpen) {
      loadActivities();
    }
  }, [activityPanelOpen, showMyActivityOnly]);

  function getCurrentFolder(): DriveFolder | null {
    if (!tree) return null;
    let folder: DriveFolder = tree;
    for (const seg of selectedPath) {
      const next = folder.folders.find(f => f.name === seg);
      if (!next) return null;
      folder = next;
    }
    return folder;
  }

  // Funciones para archivos
  const handleOpenFile = async (file: DriveFile) => {
    await logActivity('view', file.name);
    window.open(file.url, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadFile = async (file: DriveFile) => {
    const { displayName } = extractFileInfo(file.name);
    const link = document.createElement('a');
    link.href = file.url;
    link.download = displayName + '.pdf';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    await logActivity('download', file.name);
  };

  const getAllFiles = (folder: DriveFolder): DriveFile[] => {
    let allFiles: DriveFile[] = [...folder.files];
    folder.folders.forEach(subFolder => {
      allFiles = allFiles.concat(getAllFiles(subFolder));
    });
    return allFiles;
  };

  // FUNCIÓN MEJORADA: Marcar como revisado con nombre real
  const handleMarkReviewed = async (file: DriveFile) => {
    if (!user) return;
    try {
      const metadataId = file.fullPath.replace(/\//g, '_');
      const metadataRef = doc(db, 'fileMetadata', metadataId);
      const metadataDoc = await getDoc(metadataRef);

      const isCurrentlyReviewed = file.reviewed || false;
      const newReviewedState = !isCurrentlyReviewed;
      
      const userName = await getUserDisplayName(user);

      if (metadataDoc.exists()) {
        await updateDoc(metadataRef, {
          reviewed: newReviewedState,
          reviewedBy: newReviewedState ? user.email : null,
          reviewedByName: newReviewedState ? userName : null,
          reviewedAt: newReviewedState ? new Date().toISOString() : null
        });
      } else {
        await setDoc(metadataRef, {
          reviewed: newReviewedState,
          reviewedBy: newReviewedState ? user.email : null,
          reviewedByName: newReviewedState ? userName : null,
          reviewedAt: newReviewedState ? new Date().toISOString() : null,
          filePath: file.fullPath
        });
      }

      await logActivity(
        newReviewedState ? 'review' : 'unreview', 
        file.name,
        undefined,
        undefined,
        undefined,
        `Estado cambiado a ${newReviewedState ? 'revisado' : 'no revisado'} por ${userName}`
      );

      reloadTree();
    } catch (error) {
      console.error("Error updating review status:", error);
      setError("Error al actualizar el estado de revisión");
    }
  };

  // Eliminar archivo
  const handleDeleteFile = async () => {
    if (!deleteFile) return;
    try {
      setLoading(true);
      await deleteObject(ref(storage, deleteFile.fullPath));
      
      try {
        const metadataId = deleteFile.fullPath.replace(/\//g, '_');
        await deleteDoc(doc(db, 'fileMetadata', metadataId));
      } catch (metaError) {
        console.log("No metadata to delete");
      }
      
      await logActivity('delete', deleteFile.name);
      
      setDeleteFile(null);
      setTimeout(() => reloadTree(), 600);
    } catch (error) {
      console.error("Error deleting file:", error);
      setError("Error al eliminar el archivo");
    }
    setLoading(false);
  };

  // Mover archivo
  async function handleMoveFile(targetPathArr: string[]) {
    if (!moveFile) return;
    const fileToMove = moveFile;
    const fromPath = selectedPath.join('/') || 'root';
    const toPath = targetPathArr.join('/') || 'root';
    setMoveFile(null);

    try {
      setMoveLoading(true);
      
      const blob = await new Promise<Blob>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.responseType = 'blob';
        xhr.timeout = 60000;
        xhr.onload = () => {
          if (xhr.status === 200) {
            resolve(xhr.response);
          } else {
            reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
          }
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.ontimeout = () => reject(new Error('Request timeout'));
        xhr.open('GET', fileToMove.url);
        xhr.send();
      });

      const newPath = [ROOT_PATH, ...targetPathArr, fileToMove.name].join("/");
      const newRef = ref(storage, newPath);
      await uploadBytes(newRef, blob);

      const oldMetadataId = fileToMove.fullPath.replace(/\//g, '_');
      const newMetadataId = newPath.replace(/\//g, '_');

      try {
        const oldMetadata = await getDoc(doc(db, 'fileMetadata', oldMetadataId));
        if (oldMetadata.exists()) {
          const userName = user ? await getUserDisplayName(user) : null;
          
          await setDoc(doc(db, 'fileMetadata', newMetadataId), {
            ...oldMetadata.data(),
            filePath: newPath,
            movedBy: user?.email,
            movedByName: userName,
            movedAt: new Date().toISOString()
          });
          await deleteDoc(doc(db, 'fileMetadata', oldMetadataId));
        }
      } catch (metaError) {
        console.log("No metadata to move");
      }

      await deleteObject(ref(storage, fileToMove.fullPath));
      
      await logActivity('move', fileToMove.name, undefined, fromPath, toPath);
      
      setMoveSuccess(true);
      setTimeout(() => reloadTree(), 600);
    } catch (e: any) {
      console.error("Failed to move file:", e);
      setMoveError("Error al mover el archivo: " + e.message);
    }
    setMoveLoading(false);
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    setCreateFolderOpen(false);
    
    const pathArr = [...selectedPath, newFolderName.trim()];
    const fakeFileRef = ref(storage, [ROOT_PATH, ...pathArr, ".keep"].join("/"));
    await uploadBytes(fakeFileRef, new Uint8Array([0]));
    
    await logActivity('create_folder', undefined, newFolderName.trim());
    
    setNewFolderName("");
    setTimeout(() => reloadTree(), 500);
  }

  const sortFiles = (files: DriveFile[]) => {
    return [...files].sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'name') {
        const nameA = extractFileInfo(a.name).displayName.toLowerCase();
        const nameB = extractFileInfo(b.name).displayName.toLowerCase();
        comparison = nameA.localeCompare(nameB);
      } else if (sortBy === 'date') {
        comparison = new Date(a.updated).getTime() - new Date(b.updated).getTime();
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  };

  const sortFolders = (folders: DriveFolder[]) => {
    return [...folders].sort((a, b) => {
      const comparison = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  };

  // Funciones para el menú de acciones
  const handleActionMenuOpen = (event: React.MouseEvent<HTMLElement>, file: DriveFile) => {
    event.stopPropagation();
    setActionMenuAnchor(event.currentTarget);
    setSelectedFile(file);
  };

  const handleActionMenuClose = () => {
    setActionMenuAnchor(null);
    setSelectedFile(null);
  };

  const currentFolder = getCurrentFolder();

  // MEMOIZADO MEJORADO: Filtrar carpetas según permisos del usuario
  const filteredFolders = useMemo(() => {
    if (!currentFolder) return [];
    if (globalSearch && query) return [];
    
    let folders = currentFolder.folders;
    
    // APLICAR FILTRO DE PERMISOS SOLO EN LA RAÍZ
    if (selectedPath.length === 0 && currentUserData) {
      const userName = currentUserData.name || 'Usuario';
      folders = filterFoldersByPermissions(folders, userIsQuality, userName);
    }
    
    // Filtrar por búsqueda
    if (query) {
      folders = folders.filter(f =>
        f.name.toLowerCase().includes(query.toLowerCase())
      );
    }
    
    return sortFolders(folders);
  }, [currentFolder, query, globalSearch, sortOrder, currentUserData, userIsQuality, selectedPath]);

  const filteredFiles = useMemo(() => {
    if (!currentFolder) return [];
    let files = globalSearch && query ? getAllFiles(tree!) : currentFolder.files;
    if (query) {
      files = files.filter(f => {
        const { displayName } = extractFileInfo(f.name);
        return displayName.toLowerCase().includes(query.toLowerCase()) ||
               f.fullPath.toLowerCase().includes(query.toLowerCase());
      });
    }
    return sortFiles(files);
  }, [currentFolder, query, globalSearch, tree, sortBy, sortOrder]);

  const filteredActivities = useMemo(() => {
    if (!activities) return [];
    
    let filtered = activities;
    
    if (selectedPath.length > 0 && activityTab === 1) {
      const currentPathStr = selectedPath.join('/');
      filtered = filtered.filter(activity => 
        activity.path === currentPathStr || 
        activity.fromPath === currentPathStr || 
        activity.toPath === currentPathStr
      );
    }
    
    return filtered;
  }, [activities, selectedPath, activityTab]);

  // PANTALLA DE CARGA MIENTRAS SE VERIFICAN PERMISOS
  if (accessLoading) {
    return (
      <Container maxWidth={false} disableGutters sx={{ height: '100vh', bgcolor: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Stack alignItems="center" spacing={3}>
          <CircularProgress size={48} />
          <Typography variant="h6" color="text.secondary">
            Verificando permisos de acceso...
          </Typography>
          <Stack direction="row" alignItems="center" spacing={1}>
            <SecurityIcon sx={{ color: '#1a73e8' }} />
            <Typography variant="body2" color="text.secondary">
              Cargando configuración de seguridad
            </Typography>
          </Stack>
        </Stack>
      </Container>
    );
  }

  // MENSAJE DE ACCESO DENEGADO
  if (!currentUserData) {
    return (
      <Container maxWidth={false} disableGutters sx={{ height: '100vh', bgcolor: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Paper sx={{ p: 4, textAlign: 'center', maxWidth: 400, borderRadius: 3 }}>
          <LockIcon sx={{ fontSize: 64, color: '#ea4335', mb: 2 }} />
          <Typography variant="h5" sx={{ mb: 2, color: '#ea4335' }}>
            Acceso Denegado
          </Typography>
          <Typography variant="body1" sx={{ mb: 3, color: '#5f6368' }}>
            No tienes permisos para acceder al Drive interno. 
            Contacta al administrador del sistema.
          </Typography>
          <Button 
            variant="contained" 
            startIcon={<ArrowBackIcon />} 
            onClick={() => {
              if (onBack) onBack();
              else try { window.history.state.idx > 0 ? goBack() : navigateTo("menu"); } catch { navigateTo("menu"); }
            }}
            sx={{ borderRadius: 2 }}
          >
            Volver al Menú
          </Button>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth={false} disableGutters sx={{ height: '100vh', bgcolor: '#f8f9fa', display: 'flex' }}>
      {/* Contenido principal */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Header mejorado estilo Google Drive */}
        <Paper 
          elevation={0} 
          sx={{ 
            p: { xs: 2, md: 3 }, 
            bgcolor: '#fff',
            borderBottom: '1px solid #e8eaed',
            position: 'sticky',
            top: 0,
            zIndex: 100
          }}
        >
          {/* Barra superior con logo y acciones principales */}
          <Stack 
            direction="row" 
            alignItems="center" 
            spacing={2} 
            sx={{ mb: 2 }}
          >
            <Stack direction="row" alignItems="center" spacing={2} sx={{ flex: 1 }}>
              <IconButton
                onClick={() => {
                  if (selectedPath.length) setSelectedPath(selectedPath.slice(0, -1));
                  else if (onBack) onBack();
                  else try { window.history.state.idx > 0 ? goBack() : navigateTo("menu"); } catch { navigateTo("menu"); }
                }}
                sx={{ 
                  color: '#5f6368',
                  '&:hover': { bgcolor: alpha('#5f6368', 0.08) }
                }}
              >
                <ArrowBackIcon />
              </IconButton>
              
              {/* Logo de Drive con indicador de rol */}
              <Stack direction="row" alignItems="center" spacing={1}>
                <FolderIcon sx={{ color: '#1a73e8', fontSize: 28 }} />
                <Typography variant="h6" sx={{ color: '#202124', fontWeight: 400 }}>
                  Drive Interno
                </Typography>
                {userIsQuality && (
                  <Chip 
                    icon={<SecurityIcon />}
                    label="Calidad"
                    size="small"
                    sx={{ 
                      bgcolor: alpha('#34a853', 0.12),
                      color: '#137333',
                      fontWeight: 500
                    }}
                  />
                )}
              </Stack>
            </Stack>

            {/* Acciones rápidas */}
            <Stack direction="row" spacing={1}>
              <Tooltip title="Ver Actividad">
                <IconButton 
                  onClick={() => setActivityPanelOpen(true)} 
                  size="small"
                  sx={{
                    color: '#5f6368',
                    '&:hover': { bgcolor: alpha('#5f6368', 0.08) }
                  }}
                >
                  <HistoryIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Actualizar">
                <IconButton onClick={reloadTree} size="small">
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Vista">
                <ToggleButtonGroup
                  value={view}
                  exclusive
                  onChange={(_, v) => v && setView(v)}
                  size="small"
                  sx={{
                    '& .MuiToggleButton-root': {
                      border: 'none',
                      '&.Mui-selected': {
                        bgcolor: alpha('#1a73e8', 0.12),
                        color: '#1a73e8'
                      }
                    }
                  }}
                >
                  <ToggleButton value="grid">
                    <GridViewIcon fontSize="small" />
                  </ToggleButton>
                  <ToggleButton value="list">
                    <ViewListIcon fontSize="small" />
                  </ToggleButton>
                </ToggleButtonGroup>
              </Tooltip>
            </Stack>
          </Stack>

          {/* Breadcrumbs mejorados */}
          <Breadcrumbs 
            separator={<NavigateNextIcon fontSize="small" />}
            sx={{ mb: 2, color: '#5f6368' }}
          >
            <Link
              component="button"
              variant="body2"
              onClick={() => setSelectedPath([])}
              sx={{ 
                textDecoration: 'none',
                color: selectedPath.length === 0 ? '#1a73e8' : '#5f6368',
                fontWeight: selectedPath.length === 0 ? 500 : 400,
                '&:hover': { textDecoration: 'underline' }
              }}
            >
              Mi unidad
            </Link>
            {selectedPath.map((seg, idx) => (
              <Link
                key={idx}
                component="button"
                variant="body2"
                onClick={() => setSelectedPath(selectedPath.slice(0, idx + 1))}
                sx={{ 
                  textDecoration: 'none',
                  color: idx === selectedPath.length - 1 ? '#1a73e8' : '#5f6368',
                  fontWeight: idx === selectedPath.length - 1 ? 500 : 400,
                  '&:hover': { textDecoration: 'underline' }
                }}
              >
                {seg}
              </Link>
            ))}
          </Breadcrumbs>

          {/* Barra de búsqueda y controles */}
          <Stack 
            direction={{ xs: 'column', md: 'row' }} 
            spacing={2} 
            alignItems={{ xs: 'stretch', md: 'center' }}
          >
            {/* Barra de búsqueda estilo Google */}
            <Box sx={{ flex: 1, maxWidth: { md: 600 } }}>
              <TextField
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={globalSearch ? "Buscar en Drive" : "Buscar en la carpeta actual"}
                fullWidth
                size="small"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: '#5f6368' }} />
                    </InputAdornment>
                  ),
                  sx: {
                    bgcolor: '#f1f3f4',
                    borderRadius: 3,
                    '& .MuiOutlinedInput-notchedOutline': {
                      border: 'none'
                    },
                    '&:hover': {
                      bgcolor: '#e8eaed'
                    },
                    '&.Mui-focused': {
                      bgcolor: '#fff',
                      boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
                    }
                  }
                }}
              />
            </Box>

            {/* Controles adicionales */}
            <Stack direction="row" spacing={1}>
              <Tooltip title={globalSearch ? "Búsqueda global activa" : "Búsqueda local"}>
                <IconButton
                  onClick={() => setGlobalSearch(!globalSearch)}
                  sx={{
                    color: globalSearch ? '#1a73e8' : '#5f6368',
                    bgcolor: globalSearch ? alpha('#1a73e8', 0.12) : 'transparent'
                  }}
                >
                  {globalSearch ? <SearchIcon /> : <SearchOffIcon />}
                </IconButton>
              </Tooltip>

              <FormControl size="small" sx={{ minWidth: 120 }}>
                <Select
                  value={`${sortBy}-${sortOrder}`}
                  onChange={(e) => {
                    const [newSortBy, newSortOrder] = e.target.value.split('-') as [typeof sortBy, typeof sortOrder];
                    setSortBy(newSortBy);
                    setSortOrder(newSortOrder);
                  }}
                  sx={{
                    bgcolor: 'transparent',
                    '& .MuiOutlinedInput-notchedOutline': { border: 'none' }
                  }}
                >
                  <MenuItem value="name-asc">Nombre A-Z</MenuItem>
                  <MenuItem value="name-desc">Nombre Z-A</MenuItem>
                  <MenuItem value="date-desc">Más reciente</MenuItem>
                  <MenuItem value="date-asc">Más antiguo</MenuItem>
                </Select>
              </FormControl>
            </Stack>
          </Stack>

          {/* Estadísticas y información de acceso */}
          <Stack direction="row" spacing={2} sx={{ mt: 2 }} alignItems="center">
            <Chip 
              icon={<FolderIcon />}
              label={`${filteredFolders.length} carpetas`}
              size="small"
              variant="outlined"
              sx={{ color: '#5f6368', borderColor: '#dadce0' }}
            />
            <Chip 
              icon={<InsertDriveFileIcon />}
              label={`${filteredFiles.length} archivos`}
              size="small"
              variant="outlined"
              sx={{ color: '#5f6368', borderColor: '#dadce0' }}
            />
            {filteredFiles.some(f => f.reviewed) && (
              <Chip 
                icon={<CheckCircleIcon />}
                label={`${filteredFiles.filter(f => f.reviewed).length} revisados`}
                size="small"
                sx={{ 
                  bgcolor: alpha('#34a853', 0.12),
                  color: '#137333'
                }}
              />
            )}
            
            {/* Información del usuario y permisos */}
            <Box sx={{ flex: 1 }} />
            {!userIsQuality && selectedPath.length === 0 && (
              <Chip 
                icon={<LockIcon />}
                label="Vista limitada"
                size="small"
                sx={{ 
                  bgcolor: alpha('#fbbc04', 0.12),
                  color: '#b8860b'
                }}
              />
            )}
          </Stack>
        </Paper>

        {/* Contenido principal */}
        <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 2, md: 3 } }}>
          {loading && (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
              <Stack alignItems="center" spacing={2}>
                <CircularProgress />
                <Typography color="text.secondary">Cargando archivos...</Typography>
              </Stack>
            </Box>
          )}

          {error && !loading && (
            <Paper sx={{ p: 4, textAlign: 'center', bgcolor: '#fef7e0' }}>
              <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>
              <Button 
                variant="contained" 
                startIcon={<RefreshIcon />} 
                onClick={reloadTree}
                sx={{ borderRadius: 2 }}
              >
                Reintentar
              </Button>
            </Paper>
          )}

          {!loading && !error && currentFolder && (
            <>
              {globalSearch && query && (
                <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
                  Mostrando {filteredFiles.length} resultados para "{query}" en todo el drive
                </Alert>
              )}

              {/* Mensaje informativo para usuarios no calidad */}
              {!userIsQuality && selectedPath.length === 0 && filteredFolders.length > 0 && (
                <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <PersonIcon />
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        Acceso Personalizado
                      </Typography>
                      <Typography variant="body2">
                        Solo puedes ver tus carpetas asignadas. Los usuarios con rol "Calidad" pueden ver todas las carpetas.
                      </Typography>
                    </Box>
                  </Stack>
                </Alert>
              )}

              {/* Vista Grid mejorada */}
              {view === "grid" ? (
                <Grid container spacing={2}>
                  {/* Carpetas */}
                  {filteredFolders.map((folder, idx) => (
                    <Grid item xs={6} sm={4} md={3} lg={2} key={idx}>
                      <Card
                        onClick={() => setSelectedPath([...selectedPath, folder.name])}
                        sx={{
                          cursor: "pointer",
                          transition: 'all 0.2s ease-in-out',
                          borderRadius: 3,
                          border: '1px solid #dadce0',
                          '&:hover': {
                            transform: 'translateY(-2px)',
                            boxShadow: '0 4px 8px rgba(0,0,0,0.12)',
                            borderColor: '#1a73e8'
                          }
                        }}
                      >
                        <CardContent sx={{ textAlign: 'center', p: 2 }}>
                          <FolderIcon 
                            sx={{ 
                              fontSize: 48, 
                              color: '#1a73e8',
                              mb: 1
                            }} 
                          />
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              fontWeight: 500,
                              color: '#202124',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {folder.name}
                          </Typography>
                          <Typography 
                            variant="caption" 
                            color="text.secondary"
                            sx={{ mt: 0.5 }}
                          >
                            {folder.files.length} elemento{folder.files.length !== 1 ? 's' : ''}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}

                  {/* Archivos */}
                  {filteredFiles.map((file, idx) => {
                    const { displayName, displayDate } = extractFileInfo(file.name, file.updated);
                    return (
                      <Grid item xs={6} sm={4} md={3} lg={2} key={idx}>
                        <Card
                          onClick={() => handleOpenFile(file)}
                          sx={{
                            cursor: 'pointer',
                            position: 'relative',
                            transition: 'all 0.2s ease-in-out',
                            borderRadius: 3,
                            border: '1px solid #dadce0',
                            '&:hover': {
                              transform: 'translateY(-2px)',
                              boxShadow: '0 4px 8px rgba(0,0,0,0.12)',
                              borderColor: '#1a73e8'
                            }
                          }}
                        >
                          <CardContent sx={{ textAlign: 'center', p: 2 }}>
                            {/* Icono del archivo */}
                            <Box sx={{ position: 'relative', display: 'inline-block', mb: 1 }}>
                              <Box sx={{ fontSize: 48, color: '#ea4335' }}>
                                {getFileIcon(file.name)}
                              </Box>
                              {file.reviewed && (
                                <CheckCircleIcon 
                                  sx={{ 
                                    position: 'absolute',
                                    top: -4,
                                    right: -4,
                                    fontSize: 16,
                                    color: '#34a853'
                                  }} 
                                />
                              )}
                            </Box>

                            <Typography 
                              variant="body2" 
                              sx={{ 
                                fontWeight: 500,
                                color: '#202124',
                                mt: 1,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {displayName}
                            </Typography>
                            
                            <Typography 
                              variant="caption" 
                              color="text.secondary"
                              sx={{ mt: 0.5, display: 'block' }}
                            >
                              {displayDate}
                            </Typography>

                            {/* Mostrar nombre del revisor */}
                            {file.reviewed && (
                              <Typography 
                                variant="caption" 
                                sx={{ 
                                  color: '#34a853',
                                  display: 'block',
                                  fontSize: '0.7rem'
                                }}
                              >
                                ✓ {file.reviewedByName || 'Usuario'}
                              </Typography>
                            )}

                            {/* Botón de menú de acciones */}
                            <IconButton
                              onClick={(e) => handleActionMenuOpen(e, file)}
                              sx={{
                                position: 'absolute',
                                top: 8,
                                right: 8,
                                opacity: 0,
                                transition: 'opacity 0.2s',
                                '.MuiCard-root:hover &': {
                                  opacity: 1
                                }
                              }}
                              size="small"
                            >
                              <MoreVertIcon fontSize="small" />
                            </IconButton>
                          </CardContent>
                        </Card>
                      </Grid>
                    );
                  })}
                </Grid>
              ) : (
                // Vista Lista mejorada
                <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
                  {/* Carpetas en lista */}
                  {filteredFolders.map((folder, idx) => (
                    <Box
                      key={idx}
                      onClick={() => setSelectedPath([...selectedPath, folder.name])}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        p: 2,
                        cursor: 'pointer',
                        borderBottom: '1px solid #f1f3f4',
                        '&:hover': {
                          bgcolor: '#f8f9fa'
                        }
                      }}
                    >
                      <FolderIcon sx={{ color: '#1a73e8', mr: 3 }} />
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body1" sx={{ fontWeight: 500 }}>
                          {folder.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {folder.files.length} elemento{folder.files.length !== 1 ? 's' : ''}
                        </Typography>
                      </Box>
                    </Box>
                  ))}

                  {/* Archivos en lista */}
                  {filteredFiles.map((file, idx) => {
                    const { displayName, displayDate } = extractFileInfo(file.name, file.updated);
                    return (
                      <Box
                        key={idx}
                        onClick={() => handleOpenFile(file)}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          p: 2,
                          cursor: 'pointer',
                          borderBottom: '1px solid #f1f3f4',
                          '&:hover': {
                            bgcolor: '#f8f9fa'
                          }
                        }}
                      >
                        <Box sx={{ position: 'relative', mr: 3 }}>
                          <Box sx={{ color: '#ea4335' }}>
                            {getFileIcon(file.name)}
                          </Box>
                          {file.reviewed && (
                            <CheckCircleIcon 
                              sx={{ 
                                position: 'absolute',
                                top: -4,
                                right: -4,
                                fontSize: 16,
                                color: '#34a853'
                              }} 
                            />
                          )}
                        </Box>
                        
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="body1" sx={{ fontWeight: 500 }}>
                            {displayName}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {displayDate}
                          </Typography>
                          {globalSearch && (
                            <Typography variant="caption" color="text.secondary">
                              📁 {file.fullPath.replace('worksheets/', '').replace('/' + file.name, '')}
                            </Typography>
                          )}
                          {/* Mostrar información de revisión */}
                          {file.reviewed && (
                            <Typography variant="caption" sx={{ color: '#34a853', display: 'block' }}>
                              ✅ Revisado por <strong>{file.reviewedByName || 'Usuario'}</strong> el {new Date(file.reviewedAt!).toLocaleDateString('es-ES')}
                            </Typography>
                          )}
                        </Box>

                        <IconButton
                          onClick={(e) => handleActionMenuOpen(e, file)}
                          size="small"
                        >
                          <MoreVertIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    );
                  })}
                </Paper>
              )}

              {/* Mensaje cuando no hay carpetas disponibles */}
              {filteredFolders.length === 0 && filteredFiles.length === 0 && !query && (
                <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 3 }}>
                  <FolderOpenIcon sx={{ fontSize: 64, color: '#9aa0a6', mb: 2 }} />
                  <Typography variant="h6" sx={{ mb: 1, color: '#5f6368' }}>
                    {!userIsQuality ? 'No tienes carpetas asignadas' : 'Esta carpeta está vacía'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {!userIsQuality 
                      ? 'Contacta al administrador para obtener acceso a carpetas específicas.'
                      : 'Puedes crear carpetas y subir archivos usando el botón de agregar.'
                    }
                  </Typography>
                </Paper>
              )}
            </>
          )}
        </Box>
      </Box>

      {/* Panel de Actividad Deslizante */}
      <Drawer
        anchor="right"
        open={activityPanelOpen}
        onClose={() => setActivityPanelOpen(false)}
        PaperProps={{
          sx: {
            width: { xs: '100%', md: 420 },
            bgcolor: '#f8f9fa'
          }
        }}
      >
        {/* Header del panel */}
        <Paper 
          elevation={0} 
          sx={{ 
            p: 2, 
            bgcolor: '#fff',
            borderBottom: '1px solid #e8eaed',
            position: 'sticky',
            top: 0,
            zIndex: 1
          }}
        >
          <Stack direction="row" alignItems="center" spacing={2}>
            <HistoryIcon sx={{ color: '#1a73e8' }} />
            <Typography variant="h6" sx={{ flex: 1, color: '#202124' }}>
              Actividad
            </Typography>
            <IconButton onClick={() => setActivityPanelOpen(false)} size="small">
              <CloseIcon />
            </IconButton>
          </Stack>
          
          {/* Tabs de actividad */}
          <Tabs 
            value={activityTab} 
            onChange={(_, newValue) => setActivityTab(newValue)}
            sx={{ mt: 1 }}
          >
            <Tab label="Todo" />
            <Tab label="Esta carpeta" />
          </Tabs>

          {/* Control para filtrar solo mi actividad */}
          <FormControlLabel
            control={
              <Switch
                checked={showMyActivityOnly}
                onChange={(e) => setShowMyActivityOnly(e.target.checked)}
                size="small"
              />
            }
            label="Solo mi actividad"
            sx={{ mt: 1 }}
          />
        </Paper>

        {/* Lista de actividad */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
          {activityLoading ? (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
              <CircularProgress />
            </Box>
          ) : (
            <List>
              {filteredActivities.map((activity, idx) => (
                <Paper 
                  key={activity.id} 
                  sx={{ 
                    mb: 1, 
                    borderRadius: 2,
                    overflow: 'hidden'
                  }}
                >
                  <ListItem>
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: alpha('#1a73e8', 0.1) }}>
                        {getActivityIcon(activity.action)}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {activity.userName || 'Usuario'}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {getActivityDescription(activity)}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <Box sx={{ mt: 1 }}>
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <AccessTimeIcon sx={{ fontSize: 12, color: '#9aa0a6' }} />
                            <Typography variant="caption" color="text.secondary">
                              {new Date(activity.timestamp).toLocaleDateString('es-ES', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </Typography>
                          </Stack>
                          {activity.path !== 'root' && (
                            <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.5 }}>
                              <FolderIcon sx={{ fontSize: 12, color: '#9aa0a6' }} />
                              <Typography variant="caption" color="text.secondary">
                                {activity.path}
                              </Typography>
                            </Stack>
                          )}
                        </Box>
                      }
                    />
                  </ListItem>
                </Paper>
              ))}
              
              {filteredActivities.length === 0 && (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <HistoryIcon sx={{ fontSize: 48, color: '#9aa0a6', mb: 2 }} />
                  <Typography variant="body1" color="text.secondary">
                    No hay actividad reciente
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Las acciones aparecerán aquí cuando se realicen
                  </Typography>
                </Box>
              )}
            </List>
          )}
        </Box>
      </Drawer>

      {/* FAB para crear carpeta (solo para usuarios con permisos) */}
      {userIsQuality && (
        <Fab
          color="primary"
          onClick={() => setCreateFolderOpen(true)}
          sx={{
            position: 'fixed',
            bottom: { xs: 16, md: 24 },
            right: { xs: 16, md: 24 },
            bgcolor: '#1a73e8',
            '&:hover': {
              bgcolor: '#1557b0'
            }
          }}
        >
          <AddIcon />
        </Fab>
      )}

      {/* Menú de acciones mejorado */}
      <Menu
        anchorEl={actionMenuAnchor}
        open={Boolean(actionMenuAnchor)}
        onClose={handleActionMenuClose}
        PaperProps={{
          sx: { 
            borderRadius: 2,
            minWidth: 200,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
          }
        }}
      >
        <MenuItem onClick={() => {
          if (selectedFile) handleOpenFile(selectedFile);
          handleActionMenuClose();
        }}>
          <ListItemIcon>
            <VisibilityIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Abrir</ListItemText>
        </MenuItem>
        
        <MenuItem onClick={() => {
          if (selectedFile) handleDownloadFile(selectedFile);
          handleActionMenuClose();
        }}>
          <ListItemIcon>
            <DownloadIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Descargar</ListItemText>
        </MenuItem>
        
        <Divider />
        
        {userIsQuality && (
          <>
            <MenuItem onClick={() => {
              if (selectedFile) setMoveFile(selectedFile);
              handleActionMenuClose();
            }}>
              <ListItemIcon>
                <DriveFileMoveIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Mover</ListItemText>
            </MenuItem>
          </>
        )}
        
        <MenuItem onClick={() => {
          if (selectedFile) handleMarkReviewed(selectedFile);
          handleActionMenuClose();
        }}>
          <ListItemIcon>
            <CheckCircleIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>
            {selectedFile?.reviewed ? 'Marcar como no revisado' : 'Marcar como revisado'}
          </ListItemText>
        </MenuItem>
        
        {userIsQuality && (
          <>
            <Divider />
            <MenuItem 
              onClick={() => {
                if (selectedFile) setDeleteFile(selectedFile);
                handleActionMenuClose();
              }}
              sx={{ color: '#d93025' }}
            >
              <ListItemIcon>
                <DeleteIcon fontSize="small" sx={{ color: '#d93025' }} />
              </ListItemIcon>
              <ListItemText>Eliminar</ListItemText>
            </MenuItem>
          </>
        )}
      </Menu>

      {/* Diálogo para crear carpeta (solo calidad) */}
      <Dialog 
        open={createFolderOpen} 
        onClose={() => setCreateFolderOpen(false)}
        PaperProps={{ sx: { borderRadius: 3, minWidth: 400 } }}
      >
        <DialogTitle sx={{ pb: 1 }}>Crear nueva carpeta</DialogTitle>
        <DialogContent>
          <TextField
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            label="Nombre de la carpeta"
            fullWidth
            autoFocus
            margin="normal"
            variant="outlined"
          />
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button onClick={() => setCreateFolderOpen(false)}>
            Cancelar
          </Button>
          <Button 
            variant="contained" 
            onClick={handleCreateFolder}
            sx={{ borderRadius: 2 }}
          >
            Crear
          </Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo para eliminar archivo (solo calidad) */}
      <Dialog 
        open={!!deleteFile} 
        onClose={() => setDeleteFile(null)}
        PaperProps={{ sx: { borderRadius: 3, minWidth: 400 } }}
      >
        <DialogTitle sx={{ pb: 1 }}>Eliminar archivo</DialogTitle>
        <DialogContent>
          <Typography>
            ¿Estás seguro de que quieres eliminar "{deleteFile?.name}"?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Esta acción no se puede deshacer.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button onClick={() => setDeleteFile(null)}>
            Cancelar
          </Button>
          <Button 
            variant="contained" 
            color="error"
            onClick={handleDeleteFile}
            sx={{ borderRadius: 2 }}
          >
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo para mover archivo (solo calidad) */}
      <Dialog 
        open={!!moveFile} 
        onClose={() => !moveLoading && setMoveFile(null)}
        maxWidth="sm" 
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          Mover "{moveFile?.name}"
        </DialogTitle>
        <DialogContent>
          {moveError && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {moveError}
            </Alert>
          )}
          <Typography sx={{ mb: 2 }}>
            Selecciona la carpeta de destino:
          </Typography>
          <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
            <FolderMoveTree
              tree={tree}
              onSelect={handleMoveFile}
              excludePath={selectedPath}
              disabled={moveLoading}
            />
          </Box>
          {moveLoading && (
            <Box sx={{ mt: 2, textAlign: 'center' }}>
              <CircularProgress size={24} />
              <Typography variant="body2" sx={{ mt: 1 }}>
                Moviendo archivo...
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button 
            onClick={() => setMoveFile(null)} 
            disabled={moveLoading}
          >
            Cancelar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar para éxito */}
      <Snackbar
        open={moveSuccess}
        autoHideDuration={3000}
        onClose={() => setMoveSuccess(false)}
      >
        <Alert 
          onClose={() => setMoveSuccess(false)} 
          severity="success"
          sx={{ borderRadius: 2 }}
        >
          Archivo movido exitosamente
        </Alert>
      </Snackbar>
    </Container>
  );
}

// Componente auxiliar para el árbol de carpetas
function FolderMoveTree({
  tree,
  path = [],
  onSelect,
  excludePath = [],
  disabled = false
}: {
  tree: DriveFolder | null;
  path?: string[];
  onSelect: (path: string[]) => void;
  excludePath?: string[];
  disabled?: boolean;
}) {
  if (!tree) return null;

  const isRoot = tree.name === "Drive";
  const currentPath = isRoot ? [] : [...path, tree.name];
  const shouldExclude = JSON.stringify(currentPath) === JSON.stringify(excludePath);

  return (
    <Box>
      {!shouldExclude && (
        <Button
          onClick={() => !disabled && onSelect(currentPath)}
          disabled={disabled}
          sx={{
            justifyContent: 'flex-start',
            textAlign: 'left',
            mb: 0.5,
            pl: path.length * 2,
            textTransform: 'none',
            borderRadius: 2,
            '&:hover': {
              bgcolor: alpha('#1a73e8', 0.08)
            }
          }}
          startIcon={<FolderIcon />}
          fullWidth
        >
          {isRoot ? "📁 Carpeta raíz" : tree.name}
        </Button>
      )}
      {tree.folders.map((folder, idx) => (
        <FolderMoveTree
          key={idx}
          tree={folder}
          path={currentPath}
          onSelect={onSelect}
          excludePath={excludePath}
          disabled={disabled}
        />
      ))}
    </Box>
  );
}
