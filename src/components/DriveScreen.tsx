import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
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
  Switch, FormControlLabel, Checkbox,
  Slide, BottomNavigation, BottomNavigationAction, Skeleton, LinearProgress
} from "@mui/material";

import Timeline from '@mui/lab/Timeline';
import TimelineItem from '@mui/lab/TimelineItem';
import TimelineSeparator from '@mui/lab/TimelineSeparator';
import TimelineConnector from '@mui/lab/TimelineConnector';
import TimelineContent from '@mui/lab/TimelineContent';
import TimelineDot from '@mui/lab/TimelineDot';
import TimelineOppositeContent from '@mui/lab/TimelineOppositeContent';

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
import LaunchIcon from '@mui/icons-material/Launch';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import FileCopyIcon from '@mui/icons-material/FileCopy';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import StorageIcon from '@mui/icons-material/Storage';
import LinkIcon from '@mui/icons-material/Link'; // Icono para compartir

interface DriveFile {
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
  starred?: boolean;
  size?: number;
  contentType?: string;
}

interface DriveFolder {
  name: string;
  fullPath: string;
  folders: DriveFolder[];
  files: DriveFile[];
}

interface ActivityLog {
  id: string;
  action: 'create' | 'delete' | 'move' | 'review' | 'unreview' | 'complete' | 'uncomplete' | 'view' | 'download' | 'create_folder' | 'star' | 'unstar' | 'rename' | 'duplicate';
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

interface UserData {
  name?: string;
  correo?: string;
  puesto?: string;
  [key: string]: any;
}

const CardSkeleton = () => (
  <Card sx={{ 
    borderRadius: 2, 
    border: '1px solid #e0e0e0',
    boxShadow: 'none',
    '&:hover': { boxShadow: 'none' }
  }}>
    <CardContent sx={{ p: 2.5 }}>
      <Skeleton variant="circular" width={48} height={48} sx={{ mb: 2 }} />
      <Skeleton variant="text" width="80%" height={24} sx={{ mb: 1 }} />
      <Skeleton variant="text" width="60%" height={20} />
    </CardContent>
  </Card>
);

const ListSkeleton = () => (
  <ListItem sx={{ 
    borderRadius: 2, 
    mb: 0.5,
    border: '1px solid transparent'
  }}>
    <ListItemAvatar>
      <Skeleton variant="circular" width={40} height={40} />
    </ListItemAvatar>
    <ListItemText
      primary={<Skeleton variant="text" width="40%" height={24} />}
      secondary={<Skeleton variant="text" width="60%" height={20} />}
    />
    <Skeleton variant="rectangular" width={24} height={24} />
  </ListItem>
);

const formatFileSize = (bytes?: number): string => {
  if (!bytes) return 'Desconocido';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(1) + ' GB';
};

const extractFileInfo = (fileName: string, updatedDate?: string, originalDate?: string) => {
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
    : 'Fecha no disponible - Desconocido';
  return {
    displayName: baseName,
    displayDate: displayDate
  };
};

const getFileIcon = (fileName: string) => {
  if (fileName.toLowerCase().includes('.pdf')) return <PictureAsPdfIcon color="error" />;
  return <InsertDriveFileIcon color="primary" />;
};

const getActivityIcon = (action: string) => {
  switch (action) {
    case 'create': return <FileUploadIcon color="success" />;
    case 'delete': return <DeleteIcon color="error" />;
    case 'move': return <DriveFileMoveIcon color="info" />;
    case 'review': return <CheckCircleIcon color="success" />;
    case 'unreview': return <CheckCircleIcon color="disabled" />;
    case 'complete': return <AssignmentTurnedInIcon color="primary" />;
    case 'uncomplete': return <AssignmentTurnedInIcon color="disabled" />;
    case 'view': return <VisibilityIcon color="action" />;
    case 'download': return <DownloadIcon color="action" />;
    case 'create_folder': return <CreateNewFolderIcon color="warning" />;
    case 'star': return <StarIcon color="warning" />;
    case 'unstar': return <StarBorderIcon color="action" />;
    case 'rename': return <DriveFileRenameOutlineIcon color="info" />;
    case 'duplicate': return <FileCopyIcon color="info" />;
    default: return <InfoIcon />;
  }
};

const getActivityDescription = (activity: ActivityLog) => {
  const isBulk = activity.fileName?.includes('archivos');
  switch (activity.action) {
    case 'create':
      return `subió ${isBulk ? activity.fileName : `el archivo "${activity.fileName}"`}`;
    case 'delete':
      return `eliminó ${isBulk ? activity.fileName : `el archivo "${activity.fileName}"`}`;
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
    case 'star':
      return `marcó como destacado "${activity.fileName}"`;
    case 'unstar':
      return `quitó de destacados "${activity.fileName}"`;
    case 'rename':
      return `renombró ${activity.details}`;
    case 'duplicate':
      return `duplicó el archivo "${activity.fileName}"`;
    default:
      return `realizó una acción en "${activity.fileName || activity.folderName}"`;
  }
};

const getFileParentPath = (filePath: string): string[] => {
  const pathParts = filePath.replace('worksheets/', '').split('/');
  pathParts.pop();
  return pathParts.filter(part => part && part !== '.keep');
};

const getCurrentUserData = async (email: string): Promise<UserData | null> => {
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

const isQualityUser = (userData: UserData | null): boolean => {
  if (!userData) return false;
  const puesto = userData.puesto?.toLowerCase();
  return puesto === 'calidad' || puesto === 'quality';
};

const isMetrologistUser = (userData: UserData | null): boolean => {
  if (!userData) return false;
  const puesto = userData.puesto?.toLowerCase();
  return puesto === 'metrólogo' || puesto === 'metrologist' || puesto === 'metrologo';
};

const getUserNameByEmail = async (email: string): Promise<string> => {
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

const getUserDisplayName = async (user: any): Promise<string> => {
  if (!user) return 'Usuario desconocido';
  if (user.displayName && user.displayName.trim()) return user.displayName.trim();
  if (user.email) return await getUserNameByEmail(user.email);
  return 'Usuario desconocido';
};

const filterFoldersByPermissions = (folders: DriveFolder[], userIsQuality: boolean, userName: string): DriveFolder[] => {
  if (userIsQuality) return folders;
  const userNameLower = userName.toLowerCase();
  return folders.filter(folder => {
    const folderNameLower = folder.name.toLowerCase();
    return folderNameLower.includes(userNameLower) || userNameLower.includes(folderNameLower) || folder.name === userName;
  });
};

const ROOT_PATH = "worksheets";

export default function DriveScreen({ onBack }: { onBack?: () => void }) {
  const [user] = useAuthState(auth);
  // Revertimos a la lógica de un solo árbol completo
  const [tree, setTree] = useState<DriveFolder | null>(null); 
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string[]>([]);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<'name' | 'date'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  // Mantenemos globalSearch pero solo como toggle, la búsqueda será LOCAL
  const [globalSearch, setGlobalSearch] = useState(false); 
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [moveFile, setMoveFile] = useState<DriveFile | null>(null);
  const [deleteFile, setDeleteFile] = useState<DriveFile | null>(null);
  const [moveLoading, setMoveLoading] = useState(false);
  const [moveSuccess, setMoveSuccess] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [actionMenuAnchor, setActionMenuAnchor] = useState<HTMLElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const [activityPanelOpen, setActivityPanelOpen] = useState(false);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityTab, setActivityTab] = useState(0);
  const [showMyActivityOnly, setShowMyActivityOnly] = useState(false);
  const [currentUserData, setCurrentUserData] = useState<UserData | null>(null);
  const [userIsQuality, setUserIsQuality] = useState(false);
  const [userIsMetrologist, setUserIsMetrologist] = useState(false);
  const [accessLoading, setAccessLoading] = useState(true);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkMoveLoading, setBulkMoveLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<DriveFile | null>(null);
  const [newName, setNewName] = useState("");
  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);
  const [fileInfoOpen, setFileInfoOpen] = useState(false);
  const [fileInfoTarget, setFileInfoTarget] = useState<DriveFile | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'starred' | 'pdf'>('all');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: DriveFile | null } | null>(null);
  const [bulkRenameOpen, setBulkRenameOpen] = useState(false);
  const [bulkRenameSuffix, setBulkRenameSuffix] = useState(" (copia)");
  const [storageUsage, setStorageUsage] = useState<number | null>(null); 
  // Cache de archivos para búsqueda global/acciones masivas (llenado en 2do plano)
  const [allFilesCache, setAllFilesCache] = useState<DriveFile[]>([]); 

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { goBack, navigateTo } = useNavigation();

  const navigateToFileFolder = (file: DriveFile) => {
    const folderPath = getFileParentPath(file.fullPath);
    setSelectedPath(folderPath);
    setSearchQuery("");
    setGlobalSearch(false);
  };

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
        const isMetrologist = isMetrologistUser(userData);
        setUserIsQuality(isQuality);
        setUserIsMetrologist(isMetrologist);
      } catch (error) {
        console.error('Error cargando permisos del usuario:', error);
      } finally {
        setAccessLoading(false);
      }
    };
    loadUserPermissions();
  }, [user]);

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

  const loadActivities = async () => {
    setActivityLoading(true);
    try {
      let q = query(
        collection(db, 'driveActivity'),
        orderBy('timestamp', 'desc'),
        limit(50)
      );
      if (showMyActivityOnly && user) {
        q = query(collection(db, 'driveActivity'), where('userEmail', '==', user.email), orderBy('timestamp', 'desc'), limit(50));
      }
      const querySnapshot = await getDocs(q);
      const activitiesData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog));
      setActivities(activitiesData);
    } catch (error) {
      console.error('Error loading activities:', error);
    }
    setActivityLoading(false);
  };

  const loadFileMetadata = async (file: DriveFile): Promise<DriveFile> => {
    try {
      const metadataId = file.fullPath.replace(/\//g, '_');
      const metadataRef = doc(db, 'fileMetadata', metadataId);
      const metadataDoc = await getDoc(metadataRef);
      if (metadataDoc.exists()) {
        const metadata = metadataDoc.data();
        let reviewedByName = metadata.reviewedByName;
        let completedByName = metadata.completedByName;
        if (metadata.reviewed && metadata.reviewedBy && !reviewedByName) {
          reviewedByName = await getUserNameByEmail(metadata.reviewedBy);
        }
        if (metadata.completed && metadata.completedBy && !completedByName) {
          completedByName = await getUserNameByEmail(metadata.completedBy);
        }
        const finalMetadata: DriveFile = {
          ...file,
          reviewed: metadata.reviewed || false,
          reviewedBy: metadata.reviewedBy,
          reviewedByName: reviewedByName,
          reviewedAt: metadata.reviewedAt,
          completed: metadata.completed || false,
          completedBy: metadata.completedBy,
          completedByName: completedByName,
          completedAt: metadata.completedAt,
          folderPath: getFileParentPath(file.fullPath).join('/'),
          originalUpdated: metadata.originalUpdated || file.updated,
          starred: metadata.starred || false,
        };
        if (!metadata.originalUpdated) {
          await updateDoc(metadataRef, { originalUpdated: file.updated }).catch(() => {});
        }
        return finalMetadata;
      } else {
        await setDoc(metadataRef, { filePath: file.fullPath, originalUpdated: file.updated }).catch(() => {});
      }
    } catch (error) {
      console.error("Error loading file metadata:", error);
    }
    return {
      ...file,
      originalUpdated: file.updated,
      folderPath: getFileParentPath(file.fullPath).join('/')
    };
  };

  // Función recursiva original (lenta, pero necesaria para obtener todo el árbol para la búsqueda global)
  async function fetchFolder(pathArr: string[]): Promise<DriveFolder> {
    const fullPath = [ROOT_PATH, ...pathArr].join("/");
    const dirRef = ref(storage, fullPath);
    const res = await listAll(dirRef);
    
    // **NOTA CLAVE:** Si esta función es el cuello de botella, se debe usar Lazy Loading. 
    // Para simplificar y restaurar la funcionalidad original, la mantenemos, pero la carga es lenta.
    const folders: DriveFolder[] = await Promise.all(
      res.prefixes.map(prefix => fetchFolder([...pathArr, prefix.name]))
    );
    
    const files: DriveFile[] = await Promise.all(
      res.items.map(async itemRef => {
        const url = await getDownloadURL(itemRef);
        const metadata = await getMetadata(itemRef);
        const file: DriveFile = {
          name: itemRef.name,
          url,
          fullPath: itemRef.fullPath,
          updated: metadata.updated,
          size: metadata.size,
          contentType: metadata.contentType,
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

  // Función para obtener TODOS los archivos (llenado de caché)
  const fetchAllFiles = useCallback(async (initialFolder?: DriveFolder) => {
    let rootFolder = initialFolder || await fetchFolder([]);
    
    const allFiles: DriveFile[] = [];
    const queue: DriveFolder[] = [rootFolder];

    while (queue.length > 0) {
      const current = queue.shift()!;
      allFiles.push(...current.files);
      queue.push(...current.folders);
    }
    
    const totalBytes = allFiles.reduce((sum, file) => sum + (file.size || 0), 0);
    setStorageUsage(totalBytes);
    setAllFilesCache(allFiles);
  }, [user]);

  async function reloadTree() {
    setLoading(true);
    setError(null);
    try {
      // Usamos fetchFolder (recursivo, lento) para cargar el árbol completo (necesario si globalSearch se usa)
      const rootTree = await fetchFolder([]);
      setTree(rootTree);
      
      // Llenamos el cache en segundo plano
      fetchAllFiles(rootTree);

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

  const handleToggleStar = async (file: DriveFile) => {
    if (!user) return;
    try {
      const metadataId = file.fullPath.replace(/\//g, '_');
      const metadataRef = doc(db, 'fileMetadata', metadataId);
      const newStarredState = !file.starred;
      await setDoc(metadataRef, { starred: newStarredState }, { merge: true });
      await logActivity(newStarredState ? 'star' : 'unstar', file.name);
      reloadTree();
    } catch (error) {
      console.error("Error toggling star:", error);
      setError("Error al marcar el archivo");
    }
  };

  const getAllFilesFromTree = (folder: DriveFolder): DriveFile[] => {
    return folder.files.concat(...folder.folders.map(getAllFilesFromTree));
  };

  const handleMarkReviewed = async (file: DriveFile) => {
    if (!user) return;
    try {
      const metadataId = file.fullPath.replace(/\//g, '_');
      const metadataRef = doc(db, 'fileMetadata', metadataId);
      const newReviewedState = !file.reviewed;
      const userName = await getUserDisplayName(user);
      const updateData = {
        reviewed: newReviewedState,
        reviewedBy: newReviewedState ? user.email : null,
        reviewedByName: newReviewedState ? userName : null,
        reviewedAt: newReviewedState ? new Date().toISOString() : null
      };
      await setDoc(metadataRef, updateData, { merge: true });
      await logActivity(
        newReviewedState ? 'review' : 'unreview',
        file.name,
        undefined,
        undefined,
        undefined,
        `Estado cambiado por ${userName}`
      );
      reloadTree();
    } catch (error) {
      console.error("Error updating review status:", error);
      setError("Error al actualizar el estado de revisión");
    }
  };

  const handleMarkCompleted = async (file: DriveFile) => {
    if (!user) return;
    try {
      const metadataId = file.fullPath.replace(/\//g, '_');
      const metadataRef = doc(db, 'fileMetadata', metadataId);
      const newCompletedState = !file.completed;
      const userName = await getUserDisplayName(user);
      const updateData = {
        completed: newCompletedState,
        completedBy: newCompletedState ? user.email : null,
        completedByName: newCompletedState ? userName : null,
        completedAt: newCompletedState ? new Date().toISOString() : null
      };
      await setDoc(metadataRef, updateData, { merge: true });
      await logActivity(
        newCompletedState ? 'complete' : 'uncomplete',
        file.name,
        undefined,
        undefined,
        undefined,
        `Estado cambiado por ${userName}`
      );
      reloadTree();
    } catch (error) {
      console.error("Error updating completed status:", error);
      setError("Error al actualizar el estado de realización");
    }
  };

  const handleFileSelection = (filePath: string, event: React.ChangeEvent<HTMLInputElement>) => {
    event.stopPropagation();
    const newSelectedFiles = event.target.checked
      ? [...selectedFiles, filePath]
      : selectedFiles.filter(path => path !== filePath);
    setSelectedFiles(newSelectedFiles);
    if (newSelectedFiles.length > 0 && !selectionMode) setSelectionMode(true);
    if (newSelectedFiles.length === 0) setSelectionMode(false);
  };

  const handleSelectAll = () => {
    if (selectedFiles.length === filteredFiles.length) {
      setSelectedFiles([]);
      setSelectionMode(false);
    } else {
      setSelectedFiles(filteredFiles.map(file => file.fullPath));
      setSelectionMode(true);
    }
  };

  const getFilesByPaths = (paths: string[]): DriveFile[] => {
    // Usamos el caché de Storage, que tiene los tamaños, fechas, etc.
    return allFilesCache.filter(file => paths.includes(file.fullPath));
  };
  
  const handleBulkDelete = async () => {
    if (!userIsQuality || selectedFiles.length === 0) return;
    setLoading(true);
    try {
      await Promise.all(selectedFiles.map(async filePath => {
        await deleteObject(ref(storage, filePath));
        const metadataId = filePath.replace(/\//g, '_');
        await deleteDoc(doc(db, 'fileMetadata', metadataId)).catch(() => {});
      }));
      await logActivity('delete', `${selectedFiles.length} archivos`, undefined, undefined, undefined, 'Eliminación múltiple');
      setSelectedFiles([]);
      setSelectionMode(false);
      reloadTree();
    } catch (error) {
      console.error("Error deleting files:", error);
      setError("Error al eliminar los archivos");
    }
    setLoading(false);
  };

  const handleBulkMarkReviewed = async () => {
    if (!userIsQuality || !user || selectedFiles.length === 0) return;
    try {
      const userName = await getUserDisplayName(user);
      await Promise.all(selectedFiles.map(async filePath => {
        const metadataId = filePath.replace(/\//g, '_');
        const metadataRef = doc(db, 'fileMetadata', metadataId);
        await setDoc(metadataRef, {
          reviewed: true,
          reviewedBy: user.email,
          reviewedByName: userName,
          reviewedAt: new Date().toISOString(),
          filePath: filePath
        }, { merge: true });
      }));
      await logActivity('review', `${selectedFiles.length} archivos`, undefined, undefined, undefined, 'Revisión múltiple');
      setSelectedFiles([]);
      setSelectionMode(false);
      reloadTree();
    } catch (error) {
      console.error("Error marking files as reviewed:", error);
      setError("Error al marcar archivos como revisados");
    }
  };
  
  const handleBulkMarkCompleted = async (completed: boolean) => {
    if (!userIsMetrologist || !user || selectedFiles.length === 0) return;
    try {
      const userName = await getUserDisplayName(user);
      await Promise.all(selectedFiles.map(async filePath => {
        const metadataId = filePath.replace(/\//g, '_');
        const metadataRef = doc(db, 'fileMetadata', metadataId);
        await setDoc(metadataRef, {
          completed: completed,
          completedBy: completed ? user.email : null,
          completedByName: completed ? userName : null,
          completedAt: completed ? new Date().toISOString() : null,
          filePath: filePath
        }, { merge: true });
      }));
      await logActivity(completed ? 'complete' : 'uncomplete', `${selectedFiles.length} archivos`, undefined, undefined, undefined, `Realización múltiple (${completed ? 'Marcado' : 'Desmarcado'})`);
      setSelectedFiles([]);
      setSelectionMode(false);
      reloadTree();
    } catch (error) {
      console.error("Error marking files as completed:", error);
      setError("Error al actualizar el estado de realización");
    }
  };

  const handleBulkToggleStar = async (starred: boolean) => {
    if (!user || selectedFiles.length === 0) return;
    try {
      await Promise.all(selectedFiles.map(async filePath => {
        const metadataId = filePath.fullPath.replace(/\//g, '_');
        const metadataRef = doc(db, 'fileMetadata', metadataId);
        await setDoc(metadataRef, { starred: starred, filePath: filePath }, { merge: true });
      }));
      await logActivity(starred ? 'star' : 'unstar', `${selectedFiles.length} archivos`, undefined, undefined, undefined, `Destacado múltiple (${starred ? 'Marcado' : 'Desmarcado'})`);
      setSelectedFiles([]);
      setSelectionMode(false);
      reloadTree();
    } catch (error) {
      console.error("Error toggling bulk star:", error);
      setError("Error al actualizar el estado de destacado");
    }
  };

  const _moveFile = async (filePath: string, targetPathArr: string[]): Promise<void> => {
    if (!user) throw new Error("Usuario no autenticado");
    const fileName = filePath.split('/').pop()!;
    const fileRef = ref(storage, filePath);
    const url = await getDownloadURL(fileRef);
    
    const blob = await new Promise<Blob>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.responseType = 'blob';
      xhr.timeout = 60000;
      xhr.onload = () => resolve(xhr.response);
      xhr.onerror = () => reject(new Error('Error de red al descargar el archivo.'));
      xhr.open('GET', url);
      xhr.send();
    });

    const newPath = [ROOT_PATH, ...targetPathArr, fileName].join("/");
    const newRef = ref(storage, newPath);
    await uploadBytes(newRef, blob);

    const oldMetadataId = filePath.replace(/\//g, '_');
    const newMetadataId = newPath.replace(/\//g, '_');
    const oldMetadataRef = doc(db, 'fileMetadata', oldMetadataId);
    const oldMetadataDoc = await getDoc(oldMetadataRef);

    if (oldMetadataDoc.exists()) {
      const metadataToMove = oldMetadataDoc.data();
      const userName = await getUserDisplayName(user);
      if (!metadataToMove.originalUpdated) {
        // Asumimos que el árbol 'tree' tiene los datos (el caché)
        const originalFile = getAllFilesFromTree(tree!).find(f => f.fullPath === filePath);
        if (originalFile) metadataToMove.originalUpdated = originalFile.updated;
      }
      await setDoc(doc(db, 'fileMetadata', newMetadataId), {
        ...metadataToMove,
        filePath: newPath,
        movedBy: user?.email,
        movedByName: userName,
        movedAt: new Date().toISOString()
      }, { merge: true });
      await deleteDoc(oldMetadataRef);
    }
    await deleteObject(fileRef);
  };

  async function handleMoveFile(targetPathArr: string[]) {
    if (!moveFile) return;
    const fileToMove = moveFile;
    const fromPath = getFileParentPath(fileToMove.fullPath).join('/') || 'root';
    const toPath = targetPathArr.join('/') || 'root';
    setMoveFile(null);
    setMoveLoading(true);
    try {
      await _moveFile(fileToMove.fullPath, targetPathArr);
      await logActivity('move', fileToMove.name, undefined, fromPath, toPath);
      setMoveSuccess(true);
      setTimeout(() => reloadTree(), 600);
    } catch (e: any) {
      console.error("Failed to move file:", e);
      setMoveError("Error al mover el archivo: " + e.message);
    } finally {
      setMoveLoading(false);
    }
  }

  const handleBulkMove = async (targetPathArr: string[]) => {
    if (!userIsQuality || selectedFiles.length === 0) return;
    const fromPath = selectedPath.join('/') || 'root';
    const toPath = targetPathArr.join('/') || 'root';
    setBulkMoveOpen(false);
    setBulkMoveLoading(true);
    try {
      await Promise.all(
        selectedFiles.map(filePath => _moveFile(filePath, targetPathArr))
      );
      await logActivity('move', `${selectedFiles.length} archivos`, undefined, fromPath, toPath, 'Movimiento múltiple');
      setSelectedFiles([]);
      setSelectionMode(false);
      setMoveSuccess(true);
      setTimeout(() => reloadTree(), 600);
    } catch (error) {
      console.error("Error moving files:", error);
      setMoveError("Error al mover los archivos: " + (error as Error).message);
    } finally {
      setBulkMoveLoading(false);
    }
  };

  const handleDeleteFile = async () => {
    if (!deleteFile) return;
    setLoading(true);
    try {
      await deleteObject(ref(storage, deleteFile.fullPath));
      const metadataId = deleteFile.fullPath.replace(/\//g, '_');
      await deleteDoc(doc(db, 'fileMetadata', metadataId)).catch(() => {});
      await logActivity('delete', deleteFile.name);
      setDeleteFile(null);
      reloadTree();
    } catch (error) {
      console.error("Error deleting file:", error);
      setError("Error al eliminar el archivo");
    }
    setLoading(false);
  };

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    setCreateFolderOpen(false);
    const pathArr = [...selectedPath, newFolderName.trim()];
    const fakeFileRef = ref(storage, [ROOT_PATH, ...pathArr, ".keep"].join("/"));
    await uploadBytes(fakeFileRef, new Uint8Array([0]));
    await logActivity('create_folder', undefined, newFolderName.trim());
    setNewFolderName("");
    reloadTree();
  }

  const handleFileUpload = async (files: File[]) => {
    if (!userIsQuality || files.length === 0) return;
    setLoading(true);
    
    try {
      const uploadPromises = files.map(async (file, index) => {
        const filePath = [ROOT_PATH, ...selectedPath, file.name].join("/");
        const fileRef = ref(storage, filePath);
        await uploadBytes(fileRef, file);
        await logActivity('create', file.name);
        setUploadProgress(((index + 1) / files.length) * 100);
      });
      
      await Promise.all(uploadPromises);
      setMoveSuccess(true);
      setTimeout(() => {
        setUploadProgress(0);
        reloadTree();
      }, 600);
    } catch (error) {
      console.error("Error uploading files:", error);
      setError("Error al subir archivos");
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!userIsQuality) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === dropZoneRef.current) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (!userIsQuality) return;
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      await handleFileUpload(files);
    }
  };

  const _renameFile = async (file: DriveFile, newFileName: string, newDisplayName: string) => {
    const oldPath = file.fullPath;
    const pathParts = oldPath.split('/');
    pathParts[pathParts.length - 1] = newFileName;
    const newPath = pathParts.join('/');
    
    const oldRef = ref(storage, oldPath);
    const url = await getDownloadURL(oldRef);
    
    const response = await fetch(url);
    const blob = await response.blob();
    
    const newRef = ref(storage, newPath);
    await uploadBytes(newRef, blob);
    
    const oldMetadataId = oldPath.replace(/\//g, '_');
    const newMetadataId = newPath.replace(/\//g, '_');
    const oldMetadataRef = doc(db, 'fileMetadata', oldMetadataId);
    const oldMetadataDoc = await getDoc(oldMetadataRef);
    
    if (oldMetadataDoc.exists()) {
      await setDoc(doc(db, 'fileMetadata', newMetadataId), {
        ...oldMetadataDoc.data(),
        filePath: newPath
      });
      await deleteDoc(oldMetadataRef);
    }
    
    await deleteObject(oldRef);
    await logActivity('rename', file.name, undefined, undefined, undefined, `"${file.name}" → "${newDisplayName}"`);
  };

  const handleRename = async () => {
    if (!renameTarget || !newName.trim() || !userIsQuality) return;
    
    try {
      if ('url' in renameTarget) {
        const file = renameTarget as DriveFile;
        const newFileName = newName.trim() + (newName.includes('.') ? '' : '.pdf');
        await _renameFile(file, newFileName, newName.trim());
      }
      
      setRenameDialogOpen(false);
      setRenameTarget(null);
      setNewName("");
      setMoveSuccess(true);
      setTimeout(() => reloadTree(), 600);
    } catch (error) {
      console.error("Error renaming:", error);
      setError("Error al renombrar");
    }
  };

  const handleBulkRename = async () => {
    if (!bulkRenameSuffix.trim() || !userIsQuality || selectedFiles.length === 0 || !tree) return;
    setBulkRenameOpen(false);
    setLoading(true);
    
    try {
      const selectedFileObjects = getAllFilesFromTree(tree).filter(file => selectedFiles.includes(file.fullPath));
      
      await Promise.all(selectedFileObjects.map(async (file, index) => {
        const { displayName } = extractFileInfo(file.name);
        const newDisplayName = `${displayName}${bulkRenameSuffix.trim()}`;
        const newFileName = newDisplayName + '.pdf';
        
        await _renameFile(file, newFileName, newDisplayName);
      }));
      
      await logActivity('rename', `${selectedFiles.length} archivos`, undefined, undefined, undefined, `Renombre múltiple con sufijo: ${bulkRenameSuffix.trim()}`);
      setSelectedFiles([]);
      setSelectionMode(false);
      setMoveSuccess(true);
      setTimeout(() => reloadTree(), 600);
    } catch (error) {
      console.error("Error bulk renaming:", error);
      setError("Error al renombrar archivos masivamente");
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicateFile = async (file: DriveFile) => {
    if (!userIsQuality) return;
    
    try {
      setLoading(true);
      const oldRef = ref(storage, file.fullPath);
      const url = await getDownloadURL(oldRef);
      const response = await fetch(url);
      const blob = await response.blob();
      
      const { displayName } = extractFileInfo(file.name);
      const newName = `${displayName} (copia).pdf`;
      const pathParts = file.fullPath.split('/');
      pathParts[pathParts.length - 1] = newName;
      const newPath = pathParts.join('/');
      
      const newRef = ref(storage, newPath);
      await uploadBytes(newRef, blob);
      
      await logActivity('duplicate', file.name);
      setMoveSuccess(true);
      setTimeout(() => reloadTree(), 600);
    } catch (error) {
      console.error("Error duplicating file:", error);
      setError("Error al duplicar el archivo");
    } finally {
      setLoading(false);
    }
  };
  
  const handleBulkDuplicate = async () => {
    if (!userIsQuality || selectedFiles.length === 0 || !tree) return;
    setLoading(true);
    
    try {
      const selectedFileObjects = getAllFilesFromTree(tree).filter(file => selectedFiles.includes(file.fullPath));

      await Promise.all(selectedFileObjects.map(async (file, index) => {
        const oldRef = ref(storage, file.fullPath);
        const url = await getDownloadURL(oldRef);
        const response = await fetch(url);
        const blob = await response.blob();
        
        const { displayName } = extractFileInfo(file.name);
        const newName = `${displayName} (copia ${index + 1}).pdf`;
        const pathParts = file.fullPath.split('/');
        pathParts[pathParts.length - 1] = newName;
        const newPath = pathParts.join('/');
        
        const newRef = ref(storage, newPath);
        await uploadBytes(newRef, blob);
      }));
      
      await logActivity('duplicate', `${selectedFiles.length} archivos`, undefined, undefined, undefined, 'Duplicación múltiple');
      setSelectedFiles([]);
      setSelectionMode(false);
      setMoveSuccess(true);
      setTimeout(() => reloadTree(), 600);
    } catch (error) {
      console.error("Error bulk duplicating files:", error);
      setError("Error al duplicar archivos masivamente");
    } finally {
      setLoading(false);
    }
  };


  const handlePreviewFile = (file: DriveFile) => {
    setPreviewFile(file);
  };

  const handleShowFileInfo = (file: DriveFile) => {
    setFileInfoTarget(file);
    setFileInfoOpen(true);
  };

  const handleContextMenu = (event: React.MouseEvent, file: DriveFile) => {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      file
    });
  };

  const sortFiles = (files: DriveFile[]) => {
    return [...files].sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortBy === 'date') {
        const dateA = new Date(a.originalUpdated || a.updated).getTime();
        const dateB = new Date(b.originalUpdated || b.updated).getTime();
        comparison = dateA - dateB;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  };

  const sortFolders = (folders: DriveFolder[]) => {
    return [...folders].sort((a, b) => {
      const comparison = a.name.localeCompare(b.name);
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  };

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

  const filteredFolders = useMemo(() => {
    if (!currentFolder || (globalSearch && searchQuery)) return [];
    let folders = currentFolder.folders;
    if (selectedPath.length === 0 && currentUserData) {
      const userName = currentUserData.name || 'Usuario';
      folders = filterFoldersByPermissions(folders, userIsQuality, userName);
    }
    if (searchQuery) {
      folders = folders.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    return sortFolders(folders);
  }, [currentFolder, searchQuery, globalSearch, sortOrder, currentUserData, userIsQuality, selectedPath]);

  const filteredFiles = useMemo(() => {
    if (!tree) return [];
    
    // Si la búsqueda es GLOBAL, usamos todos los archivos (lento, pero funcional)
    let files = (globalSearch && searchQuery) ? getAllFilesFromTree(tree) : (currentFolder?.files || []);
    
    if (searchQuery) {
      files = files.filter(f =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.fullPath.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    if (filterType === 'starred') {
      files = files.filter(f => f.starred);
    } else if (filterType === 'pdf') {
      files = files.filter(f => f.name.toLowerCase().endsWith('.pdf'));
    }
    
    return sortFiles(files);
  }, [currentFolder, searchQuery, globalSearch, tree, sortBy, sortOrder, filterType]);

  const filteredActivities = useMemo(() => {
    if (!activities) return [];
    if (selectedPath.length > 0 && activityTab === 1) {
      const currentPathStr = selectedPath.join('/');
      return activities.filter(activity =>
        activity.path === currentPathStr ||
        activity.fromPath === currentPathStr ||
        activity.toPath === currentPathStr
      );
    }
    return activities;
  }, [activities, selectedPath, activityTab]);

  if (accessLoading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4, textAlign: 'center' }}>
        <CircularProgress size={48} sx={{ mb: 2 }} />
        <Typography variant="h6" color="text.secondary">
          Verificando permisos de acceso...
        </Typography>
      </Container>
    );
  }

  if (!currentUserData) {
    return (
      <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
        <LockIcon sx={{ fontSize: 80, color: 'error.main', mb: 2 }} />
        <Typography variant="h4" gutterBottom fontWeight={600}>
          Acceso Denegado
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
          No tienes permisos para acceder. Contacta al administrador.
        </Typography>
        <Button
          variant="contained"
          onClick={() => onBack ? onBack() : navigateTo("menu")}
          startIcon={<ArrowBackIcon />}
        >
          Volver
        </Button>
      </Container>
    );
  }

  return (
    <Box 
      sx={{ minHeight: '100vh', bgcolor: '#f8f9fa' }}
      ref={dropZoneRef}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && userIsQuality && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            bgcolor: alpha('#1a73e8', 0.1),
            border: '4px dashed #1a73e8',
            zIndex: 9998,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none'
          }}
        >
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <CloudUploadIcon sx={{ fontSize: 80, color: '#1a73e8', mb: 2 }} />
            <Typography variant="h5" fontWeight={600}>
              Suelta los archivos aquí
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Se subirán a la carpeta actual
            </Typography>
          </Paper>
        </Box>
      )}

      {(loading || uploadProgress > 0) && (
        <LinearProgress 
          variant={uploadProgress > 0 ? "determinate" : "indeterminate"} 
          value={uploadProgress}
          sx={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            zIndex: 9999,
            height: 3
          }} 
        />
      )}

      <Paper 
        elevation={0} 
        sx={{ 
          borderBottom: '1px solid #e0e0e0',
          bgcolor: 'white',
          position: 'sticky',
          top: 0,
          zIndex: 1100
        }}
      >
        <Container maxWidth="xl">
          <Stack 
            direction="row" 
            alignItems="center" 
            spacing={2} 
            sx={{ py: 2 }}
          >
            <IconButton 
              onClick={() => selectedPath.length ? setSelectedPath(selectedPath.slice(0, -1)) : (onBack ? onBack() : goBack())}
              sx={{ 
                '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.08) }
              }}
            >
              <ArrowBackIcon />
            </IconButton>
            
            <CloudIcon sx={{ fontSize: 40, color: '#1a73e8' }} />
            
            <Box sx={{ flex: 1 }}>
              <Typography variant="h5" fontWeight={600} color="text.primary">
                Drive Interno
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                {userIsQuality && (
                  <Chip 
                    icon={<SecurityIcon />} 
                    label="Calidad" 
                    size="small" 
                    color="success" 
                    variant="outlined"
                  />
                )}
                {userIsMetrologist && (
                  <Chip 
                    icon={<WorkIcon />} 
                    label="Metrólogo" 
                    size="small" 
                    color="primary" 
                    variant="outlined"
                  />
                )}
                {storageUsage !== null && (
                   <Chip 
                    icon={<StorageIcon />} 
                    label={`Uso: ${formatFileSize(storageUsage)}`} 
                    size="small" 
                    color="default" 
                    variant="outlined"
                  />
                )}
              </Stack>
            </Box>

            {userIsQuality && (
              <Tooltip title="Subir archivos">
                <Button
                  variant="contained"
                  startIcon={<CloudUploadIcon />}
                  onClick={() => fileInputRef.current?.click()}
                  sx={{ 
                    borderRadius: 3,
                    textTransform: 'none',
                    bgcolor: '#1a73e8',
                    '&:hover': { bgcolor: '#1557b0' }
                  }}
                >
                  Subir
                </Button>
              </Tooltip>
            )}

            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length > 0) {
                  handleFileUpload(files);
                }
                e.target.value = '';
              }}
            />

            <Tooltip title="Actualizar">
              <IconButton 
                onClick={reloadTree}
                disabled={loading}
                sx={{ 
                  '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.08) }
                }}
              >
                <RefreshIcon />
              </IconButton>
            </Tooltip>

            <Tooltip title="Actividad">
              <IconButton 
                onClick={() => setActivityPanelOpen(true)}
                sx={{ 
                  '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.08) }
                }}
              >
                <HistoryIcon />
              </IconButton>
            </Tooltip>

            <ToggleButtonGroup
              value={view}
              exclusive
              onChange={(e, v) => v && setView(v)}
              size="small"
              sx={{ 
                '& .MuiToggleButton-root': {
                  border: 'none',
                  '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.08) }
                }
              }}
            >
              <ToggleButton value="grid">
                <GridViewIcon />
              </ToggleButton>
              <ToggleButton value="list">
                <ViewListIcon />
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          <Stack spacing={2} sx={{ pb: 2 }}>
            <Breadcrumbs 
              separator={<NavigateNextIcon fontSize="small" />}
              sx={{ 
                '& .MuiBreadcrumbs-li': { 
                  fontSize: '0.9rem' 
                }
              }}
            >
              <Link 
                underline="hover" 
                color="inherit" 
                onClick={() => setSelectedPath([])}
                sx={{ 
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  '&:hover': { color: 'primary.main' }
                }}
              >
                <CloudIcon sx={{ mr: 0.5, fontSize: 20 }} />
                Mi unidad
              </Link>
              {selectedPath.map((seg, idx) => (
                <Link
                  key={idx}
                  underline="hover"
                  color={idx === selectedPath.length - 1 ? "text.primary" : "inherit"}
                  onClick={() => setSelectedPath(selectedPath.slice(0, idx + 1))}
                  sx={{ 
                    cursor: 'pointer',
                    fontWeight: idx === selectedPath.length - 1 ? 600 : 400,
                    '&:hover': { color: 'primary.main' }
                  }}
                >
                  {seg}
                </Link>
              ))}
            </Breadcrumbs>

            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
              <TextField
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={globalSearch ? "Buscar en todo el Drive" : "Buscar en esta carpeta"}
                fullWidth
                size="small"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                  sx: { 
                    bgcolor: '#f1f3f4', 
                    borderRadius: 5,
                    '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                    '&:hover': { bgcolor: '#e8eaed' },
                    '&.Mui-focused': { bgcolor: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }
                  }
                }}
              />

              <Tooltip title={globalSearch ? "Búsqueda global activada (Lenta)" : "Buscar en esta carpeta"}>
                <IconButton 
                  onClick={() => setGlobalSearch(!globalSearch)} 
                  color={globalSearch ? "primary" : "default"}
                  sx={{ 
                    '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.08) }
                  }}
                >
                  {globalSearch ? <SearchIcon /> : <SearchOffIcon />}
                </IconButton>
              </Tooltip>

              <FormControl size="small" sx={{ minWidth: 120 }}>
                <Select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as typeof filterType)}
                  startAdornment={<FilterListIcon sx={{ mr: 1, color: 'text.secondary' }} />}
                  sx={{ 
                    bgcolor: 'transparent',
                    '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                    '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) }
                  }}
                >
                  <MenuItem value="all">Todos</MenuItem>
                  <MenuItem value="starred">Destacados</MenuItem>
                  <MenuItem value="pdf">Solo PDF</MenuItem>
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 180 }}>
                <Select
                  value={`${sortBy}-${sortOrder}`}
                  onChange={(e) => {
                    const [newSortBy, newSortOrder] = e.target.value.split('-') as [typeof sortBy, typeof sortOrder];
                    setSortBy(newSortBy);
                    setSortOrder(newSortOrder);
                  }}
                  startAdornment={<SortIcon sx={{ mr: 1, color: 'text.secondary' }} />}
                  sx={{ 
                    bgcolor: 'transparent',
                    '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                    '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) }
                  }}
                >
                  <MenuItem value="name-asc">Nombre A-Z</MenuItem>
                  <MenuItem value="name-desc">Nombre Z-A</MenuItem>
                  <MenuItem value="date-desc">Más reciente</MenuItem>
                  <MenuItem value="date-asc">Más antiguo</MenuItem>
                </Select>
              </FormControl>

              {filteredFiles.length > 0 && userIsQuality && (
                <FormControlLabel
                  control={
                    <Checkbox 
                      checked={selectedFiles.length === filteredFiles.length && filteredFiles.length > 0}
                      indeterminate={selectedFiles.length > 0 && selectedFiles.length < filteredFiles.length}
                      onChange={handleSelectAll}
                    />
                  }
                  label={`Seleccionar (${selectedFiles.length})`}
                />
              )}
            </Stack>
          </Stack>
        </Container>
      </Paper>

      <Container maxWidth="xl" sx={{ py: 3 }}>
        {loading ? (
          view === "grid" ? (
            <Grid container spacing={2}>
              {Array.from(new Array(12)).map((_, index) => (
                <Grid item xs={12} sm={6} md={4} lg={3} xl={2} key={index}>
                  <CardSkeleton />
                </Grid>
              ))}
            </Grid>
          ) : (
            <Paper elevation={0} sx={{ border: '1px solid #e0e0e0', borderRadius: 2 }}>
              <List>
                {Array.from(new Array(8)).map((_, index) => (
                  <ListSkeleton key={index} />
                ))}
              </List>
            </Paper>
          )
        ) : error ? (
          <Alert 
            severity="error" 
            action={
              <Button color="inherit" size="small" onClick={reloadTree}>
                Reintentar
              </Button>
            }
          >
            {error}
          </Alert>
        ) : currentFolder ? (
          <>
            {globalSearch && searchQuery && (
              <Alert severity="info" sx={{ mb: 3 }}>
                Mostrando {filteredFiles.length} resultados para "<strong>{searchQuery}</strong>" en todo el drive.
              </Alert>
            )}

            {view === "grid" ? (
              <Grid container spacing={2}>
                {filteredFolders.map((folder, idx) => (
                  <Grid item xs={12} sm={6} md={4} lg={3} xl={2} key={idx}>
                    <Card
                      onClick={() => setSelectedPath([...selectedPath, folder.name])}
                      sx={{
                        cursor: "pointer",
                        borderRadius: 2,
                        border: '1px solid #e0e0e0',
                        boxShadow: 'none',
                        transition: 'all 0.2s ease',
                        '&:hover': {
                          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                          transform: 'translateY(-2px)',
                          borderColor: '#1a73e8'
                        }
                      }}
                    >
                      <CardContent sx={{ p: 2.5 }}>
                        <Stack direction="row" alignItems="center" spacing={1.5}>
                          <FolderIcon sx={{ fontSize: 48, color: '#5f6368' }} />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography 
                              variant="body2" 
                              fontWeight={500} 
                              noWrap
                              sx={{ color: 'text.primary' }}
                            >
                              {folder.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {folder.files.length} elementos
                            </Typography>
                          </Box>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}

                {filteredFiles.map((file, idx) => {
                  const { displayName, displayDate } = extractFileInfo(file.name, file.updated, file.originalUpdated);
                  const isSelected = selectedFiles.includes(file.fullPath);
                  return (
                    <Grid item xs={12} sm={6} md={4} lg={3} xl={2} key={idx}>
                      <Card
                        onClick={() => handleOpenFile(file)}
                        onContextMenu={(e) => handleContextMenu(e, file)}
                        sx={{
                          cursor: 'pointer',
                          position: 'relative',
                          borderRadius: 2,
                          border: isSelected ? '2px solid #1a73e8' : '1px solid #e0e0e0',
                          boxShadow: 'none',
                          transition: 'all 0.2s ease',
                          '&:hover': {
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                            transform: 'translateY(-2px)',
                            borderColor: '#1a73e8'
                          }
                        }}
                      >
                        {selectionMode && userIsQuality && (
                          <Checkbox
                            checked={isSelected}
                            onChange={(e) => handleFileSelection(file.fullPath, e)}
                            onClick={(e) => e.stopPropagation()}
                            sx={{ position: 'absolute', top: 8, left: 8, zIndex: 1 }}
                          />
                        )}
                        
                        <CardContent sx={{ p: 2.5 }}>
                          <Stack spacing={1.5}>
                            <Stack direction="row" alignItems="center" spacing={1.5}>
                              {getFileIcon(file.name)}
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography 
                                  variant="body2" 
                                  fontWeight={500} 
                                  noWrap
                                  sx={{ color: 'text.primary' }}
                                >
                                  {displayName}
                                </Typography>
                              </Box>
                              <Tooltip title={file.starred ? "Quitar de destacados" : "Destacar"}>
                                <IconButton
                                  size="small"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleStar(file);
                                  }}
                                  sx={{ ml: 'auto' }}
                                >
                                  {file.starred ? <StarIcon color="warning" /> : <StarBorderIcon />}
                                </IconButton>
                              </Tooltip>
                            </Stack>

                            <Stack direction="row" spacing={0.5} flexWrap="wrap">
                              {file.reviewed && (
                                <Chip 
                                  icon={<CheckCircleIcon />} 
                                  label="Revisado" 
                                  size="small" 
                                  color="success" 
                                  variant="outlined"
                                />
                              )}
                              {file.completed && (
                                <Chip 
                                  icon={<AssignmentTurnedInIcon />} 
                                  label="Realizado" 
                                  size="small" 
                                  color="primary" 
                                  variant="outlined"
                                />
                              )}
                            </Stack>

                            <Typography variant="caption" color="text.secondary">
                              {displayDate} • {formatFileSize(file.size)}
                            </Typography>

                            {globalSearch && searchQuery && file.folderPath && (
                              <>
                                <Typography variant="caption" color="text.hint" sx={{ mt: 0.5 }}>
                                  Ubicación: {file.folderPath}
                                </Typography>
                                <Button
                                  size="small"
                                  startIcon={<FolderOpenIcon />}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigateToFileFolder(file);
                                  }}
                                  sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
                                >
                                  Ir a carpeta
                                </Button>
                              </>
                            )}

                            {file.reviewedByName && (
                              <Typography variant="caption" color="success.main">
                                ✓ {file.reviewedByName}
                              </Typography>
                            )}
                            {file.completedByName && (
                              <Typography variant="caption" color="primary.main">
                                ✓ Realizado por {file.completedByName}
                              </Typography>
                            )}
                          </Stack>
                        </CardContent>

                        <IconButton
                          onClick={(e) => handleActionMenuOpen(e, file)}
                          sx={{ position: 'absolute', top: 8, right: 8 }}
                          size="small"
                        >
                          <MoreVertIcon />
                        </IconButton>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>
            ) : (
              <Paper elevation={0} sx={{ border: '1px solid #e0e0e0', borderRadius: 2 }}>
                <List>
                  {filteredFolders.map((folder, idx) => (
                    <ListItemButton
                      key={idx}
                      onClick={() => setSelectedPath([...selectedPath, folder.name])}
                      sx={{
                        borderRadius: 1,
                        mb: 0.5,
                        '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) }
                      }}
                    >
                      <ListItemAvatar>
                        <FolderIcon sx={{ fontSize: 40, color: '#5f6368' }} />
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Typography variant="body2" fontWeight={500}>
                            {folder.name}
                          </Typography>
                        }
                        secondary={`${folder.files.length} elementos`}
                      />
                    </ListItemButton>
                  ))}

                  {filteredFiles.map((file, idx) => {
                    const { displayName, displayDate } = extractFileInfo(file.name, file.updated, file.originalUpdated);
                    const isSelected = selectedFiles.includes(file.fullPath);
                    return (
                      <ListItemButton
                        key={idx}
                        onClick={() => handleOpenFile(file)}
                        onContextMenu={(e) => handleContextMenu(e, file)}
                        selected={isSelected}
                        sx={{
                          borderRadius: 1,
                          mb: 0.5,
                          '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) }
                        }}
                      >
                        {selectionMode && userIsQuality && (
                          <Checkbox
                            checked={isSelected}
                            onChange={(e) => handleFileSelection(file.fullPath, e)}
                            onClick={(e) => e.stopPropagation()}
                            sx={{ mr: 1 }}
                          />
                        )}
                        <ListItemAvatar>
                          {getFileIcon(file.name)}
                        </ListItemAvatar>
                        <ListItemText
                          primary={
                            <Stack direction="row" alignItems="center" spacing={1}>
                              <Typography variant="body2" fontWeight={500}>
                                {displayName}
                              </Typography>
                              {file.reviewed && <CheckCircleIcon fontSize="small" color="success" />}
                              {file.completed && <AssignmentTurnedInIcon fontSize="small" color="primary" />}
                              {file.starred && <StarIcon fontSize="small" color="warning" />}
                            </Stack>
                          }
                          secondary={
                            <>
                              {displayDate} • {formatFileSize(file.size)}
                              {globalSearch && searchQuery && file.folderPath && (
                                <>
                                  <Typography component="span" sx={{ ml: 1, color: 'text.hint' }}>
                                    | Ubicación: {file.folderPath}
                                  </Typography>
                                  <Button
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigateToFileFolder(file);
                                    }}
                                    sx={{ ml: 1, textTransform: 'none' }}
                                  >
                                    Ir a carpeta
                                  </Button>
                                </>
                              )}
                              {file.reviewedByName && ` | Revisado por ${file.reviewedByName}`}
                              {file.completedByName && ` | Realizado por ${file.completedByName}`}
                            </>
                          }
                        />
                        <IconButton
                          onClick={(e) => handleActionMenuOpen(e, file)}
                          size="small"
                        >
                          <MoreVertIcon />
                        </IconButton>
                      </ListItemButton>
                    );
                  })}
                </List>
              </Paper>
            )}

            {filteredFolders.length === 0 && filteredFiles.length === 0 && !searchQuery && (
              <Box sx={{ textAlign: 'center', py: 8 }}>
                <FolderOpenIcon sx={{ fontSize: 80, color: 'text.disabled', mb: 2 }} />
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  {!userIsQuality ? 'No tienes carpetas asignadas' : 'Esta carpeta está vacía'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {!userIsQuality ? 'Contacta al administrador.' : userIsQuality && 'Arrastra archivos aquí o usa el botón Subir.'}
                </Typography>
              </Box>
            )}
          </>
        ) : null}
      </Container>

      <Slide direction="up" in={selectionMode && selectedFiles.length > 0}>
        <Paper
          elevation={8}
          sx={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            p: 2,
            zIndex: 1200,
            borderRadius: 3,
            minWidth: { xs: '90%', sm: 400 }
          }}
        >
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="center" flexWrap="wrap">
            <Typography variant="body2" fontWeight={600}>
              {selectedFiles.length} seleccionados
            </Typography>
            {userIsQuality && (
              <>
                <Button
                  startIcon={<DeleteIcon />}
                  onClick={handleBulkDelete}
                  color="error"
                  variant="outlined"
                  disabled={bulkMoveLoading}
                  size="small"
                >
                  Eliminar
                </Button>
                <Button
                  startIcon={<CheckCircleIcon />}
                  onClick={handleBulkMarkReviewed}
                  color="success"
                  variant="contained"
                  disabled={bulkMoveLoading}
                  size="small"
                >
                  Marcar Revisado
                </Button>
                <Button
                  startIcon={<DriveFileMoveIcon />}
                  onClick={() => setBulkMoveOpen(true)}
                  variant="contained"
                  disabled={bulkMoveLoading}
                  size="small"
                >
                  Mover
                </Button>
              </>
            )}
            <Button
              startIcon={<CloseIcon />}
              onClick={() => {
                setSelectedFiles([]);
                setSelectionMode(false);
              }}
              variant="outlined"
              disabled={bulkMoveLoading}
              size="small"
            >
              Cancelar
            </Button>
          </Stack>
        </Paper>
      </Slide>

      <Drawer
        anchor="right"
        open={activityPanelOpen}
        onClose={() => setActivityPanelOpen(false)}
        PaperProps={{
          sx:{
            width: { xs: '100%', md: 420 },
            bgcolor: '#f8f9fa'
          }
        }}
      >
        <Box sx={{ p: 3 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
            <Typography variant="h6" fontWeight={600}>
              Actividad
            </Typography>
            <IconButton onClick={() => setActivityPanelOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Stack>

          <Tabs value={activityTab} onChange={(e, newValue) => setActivityTab(newValue)} sx={{ mb: 2 }}>
            <Tab label="Todas" />
            <Tab label="Carpeta actual" />
          </Tabs>

          <FormControlLabel
            control={
              <Switch
                checked={showMyActivityOnly}
                onChange={(e) => setShowMyActivityOnly(e.target.checked)}
              />
            }
            label="Solo mi actividad"
            sx={{ mb: 2 }}
          />

          {activityLoading ? (
            <Stack spacing={2}>
              {Array.from(new Array(5)).map((_, i) => (
                <Box key={i}>
                  <Skeleton variant="circular" width={40} height={40} />
                  <Skeleton variant="text" width="80%" />
                  <Skeleton variant="text" width="60%" />
                </Box>
              ))}
            </Stack>
          ) : (
            <Timeline>
              {filteredActivities.map((activity, idx) => (
                <TimelineItem key={activity.id}>
                  <TimelineOppositeContent color="text.secondary" sx={{ flex: 0.2 }}>
                    <Typography variant="caption">
                      {new Date(activity.timestamp).toLocaleTimeString('es-ES', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </Typography>
                  </TimelineOppositeContent>
                  <TimelineSeparator>
                    <TimelineDot color={activity.action === 'delete' ? 'error' : activity.action === 'create' ? 'success' : 'primary'}>
                      {getActivityIcon(activity.action)}
                    </TimelineDot>
                    {idx < filteredActivities.length - 1 && <TimelineConnector />}
                  </TimelineSeparator>
                  <TimelineContent>
                    <Typography variant="body2" fontWeight={500}>
                      {activity.userName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {getActivityDescription(activity)}
                    </Typography>
                  </TimelineContent>
                </TimelineItem>
              ))}
              {filteredActivities.length === 0 && (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <HistoryIcon sx={{ fontSize: 60, color: 'text.disabled', mb: 1 }} />
                  <Typography variant="body2" color="text.secondary">
                    No hay actividad reciente.
                  </Typography>
                </Box>
              )}
            </Timeline>
          )}
        </Box>
      </Drawer>

      {userIsQuality && (
        <Fab
          color="primary"
          onClick={() => setCreateFolderOpen(true)}
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
          }}
        >
          <AddIcon />
        </Fab>
      )}

      <Menu
        anchorEl={actionMenuAnchor}
        open={Boolean(actionMenuAnchor)}
        onClose={handleActionMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{
          sx: { minWidth: 200, borderRadius: 2, mt: 1 }
        }}
      >
        <MenuItem onClick={() => { if (selectedFile) handleOpenFile(selectedFile); handleActionMenuClose(); }}>
          <ListItemIcon><LaunchIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Abrir</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { if (selectedFile) handlePreviewFile(selectedFile); handleActionMenuClose(); }}>
          <ListItemIcon><VisibilityIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Vista previa</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { if (selectedFile) handleDownloadFile(selectedFile); handleActionMenuClose(); }}>
          <ListItemIcon><DownloadIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Descargar</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { if (selectedFile) handleShowFileInfo(selectedFile); handleActionMenuClose(); }}>
          <ListItemIcon><InfoIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Información</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { if (selectedFile) handleToggleStar(selectedFile); handleActionMenuClose(); }}>
          <ListItemIcon>
            {selectedFile?.starred ? <StarIcon fontSize="small" color="warning" /> : <StarBorderIcon fontSize="small" />}
          </ListItemIcon>
          <ListItemText>{selectedFile?.starred ? 'Quitar de destacados' : 'Destacar'}</ListItemText>
        </MenuItem>
        {selectedFile && globalSearch && searchQuery && (
          <MenuItem onClick={() => { if (selectedFile) navigateToFileFolder(selectedFile); handleActionMenuClose(); }}>
            <ListItemIcon><FolderOpenIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Ir a carpeta</ListItemText>
          </MenuItem>
        )}
        {userIsQuality && <Divider />}
        {userIsQuality && (
          <>
            <MenuItem onClick={() => { if (selectedFile) { setRenameTarget(selectedFile); setNewName(extractFileInfo(selectedFile.name).displayName); setRenameDialogOpen(true); } handleActionMenuClose(); }}>
              <ListItemIcon><DriveFileRenameOutlineIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Renombrar</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => { if (selectedFile) handleDuplicateFile(selectedFile); handleActionMenuClose(); }}>
              <ListItemIcon><FileCopyIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Hacer una copia</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => { if (selectedFile) setMoveFile(selectedFile); handleActionMenuClose(); }}>
              <ListItemIcon><DriveFileMoveIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Mover</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => { if (selectedFile) handleMarkReviewed(selectedFile); handleActionMenuClose(); }}>
              <ListItemIcon><CheckCircleIcon fontSize="small" /></ListItemIcon>
              <ListItemText>{selectedFile?.reviewed ? 'Marcar no revisado' : 'Marcar revisado'}</ListItemText>
            </MenuItem>
          </>
        )}
        {userIsMetrologist && (
          <MenuItem onClick={() => { if (selectedFile) handleMarkCompleted(selectedFile); handleActionMenuClose(); }}>
            <ListItemIcon><AssignmentTurnedInIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{selectedFile?.completed ? 'Marcar no realizado' : 'Marcar realizado'}</ListItemText>
          </MenuItem>
        )}
        {userIsQuality && <Divider />}
        {userIsQuality && (
          <MenuItem onClick={() => { if (selectedFile) setDeleteFile(selectedFile); handleActionMenuClose(); }} sx={{ color: 'error.main' }}>
            <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
            <ListItemText>Eliminar</ListItemText>
          </MenuItem>
        )}
      </Menu>

      <Menu
        open={contextMenu !== null}
        onClose={() => setContextMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.y, left: contextMenu.x }
            : undefined
        }
        PaperProps={{
          sx: { minWidth: 200, borderRadius: 2 }
        }}
      >
        <MenuItem onClick={() => { if (contextMenu?.file) handleOpenFile(contextMenu.file); setContextMenu(null); }}>
          <ListItemIcon><LaunchIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Abrir</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { if (contextMenu?.file) handlePreviewFile(contextMenu.file); setContextMenu(null); }}>
          <ListItemIcon><VisibilityIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Vista previa</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { if (contextMenu?.file) handleDownloadFile(contextMenu.file); setContextMenu(null); }}>
          <ListItemIcon><DownloadIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Descargar</ListItemText>
        </MenuItem>
        {userIsQuality && (
          <>
            <Divider />
            <MenuItem onClick={() => { if (contextMenu?.file) { setRenameTarget(contextMenu.file); setNewName(extractFileInfo(contextMenu.file.name).displayName); setRenameDialogOpen(true); } setContextMenu(null); }}>
              <ListItemIcon><DriveFileRenameOutlineIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Renombrar</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => { if (contextMenu?.file) handleDuplicateFile(contextMenu.file); setContextMenu(null); }}>
              <ListItemIcon><FileCopyIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Hacer una copia</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => { if (contextMenu?.file) setMoveFile(contextMenu.file); setContextMenu(null); }}>
              <ListItemIcon><DriveFileMoveIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Mover</ListItemText>
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => { if (contextMenu?.file) setDeleteFile(contextMenu.file); setContextMenu(null); }} sx={{ color: 'error.main' }}>
              <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
              <ListItemText>Eliminar</ListItemText>
            </MenuItem>
          </>
        )}
      </Menu>

      <Dialog open={createFolderOpen} onClose={() => setCreateFolderOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Crear nueva carpeta</DialogTitle>
        <DialogContent>
          <TextField
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            label="Nombre de la carpeta"
            fullWidth
            autoFocus
            margin="normal"
            onKeyPress={(e) => {
              if (e.key === 'Enter' && newFolderName.trim()) {
                handleCreateFolder();
              }
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCreateFolderOpen(false)}>Cancelar</Button>
          <Button onClick={handleCreateFolder} variant="contained" disabled={!newFolderName.trim()}>
            Crear
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Diálogo de Renombre Masivo */}
      <Dialog open={bulkRenameOpen} onClose={() => setBulkRenameOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Renombrar {selectedFiles.length} archivos</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Se agregará el sufijo a todos los archivos seleccionados.
          </Typography>
          <TextField
            value={bulkRenameSuffix}
            onChange={(e) => setBulkRenameSuffix(e.target.value)}
            label="Sufijo a añadir (ej: (v2))"
            fullWidth
            autoFocus
            margin="normal"
            onKeyPress={(e) => {
              if (e.key === 'Enter' && bulkRenameSuffix.trim()) {
                handleBulkRename();
              }
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setBulkRenameOpen(false)}>Cancelar</Button>
          <Button 
            onClick={handleBulkRename} 
            variant="contained" 
            disabled={!bulkRenameSuffix.trim() || loading}
          >
            Renombrar Masivo
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={renameDialogOpen} onClose={() => setRenameDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Renombrar</DialogTitle>
        <DialogContent>
          <TextField
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            label="Nuevo nombre"
            fullWidth
            autoFocus
            margin="normal"
            onKeyPress={(e) => {
              if (e.key === 'Enter' && newName.trim()) {
                handleRename();
              }
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setRenameDialogOpen(false); setRenameTarget(null); setNewName(""); }}>Cancelar</Button>
          <Button onClick={handleRename} variant="contained" disabled={!newName.trim()}>
            Renombrar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog 
        open={Boolean(previewFile)} 
        onClose={() => setPreviewFile(null)} 
        maxWidth="lg" 
        fullWidth
        PaperProps={{ sx: { height: '90vh' } }}
      >
        <DialogTitle>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="h6">
              {previewFile && extractFileInfo(previewFile.name).displayName}
            </Typography>
            <IconButton onClick={() => setPreviewFile(null)}>
              <CloseIcon />
            </IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {previewFile && (
            <iframe
              src={previewFile.url}
              width="100%"
              height="100%"
              style={{ border: 'none' }}
              title="Vista previa"
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={fileInfoOpen} onClose={() => setFileInfoOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Información del archivo</DialogTitle>
        <DialogContent>
          {fileInfoTarget && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">Nombre</Typography>
                <Typography variant="body1" fontWeight={500}>
                  {extractFileInfo(fileInfoTarget.name).displayName}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Tipo</Typography>
                <Typography variant="body1">{fileInfoTarget.contentType || 'Desconocido'}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Tamaño</Typography>
                <Typography variant="body1">{formatFileSize(fileInfoTarget.size)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Ubicación</Typography>
                <Typography variant="body1">{fileInfoTarget.folderPath || 'Raíz'}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Última modificación</Typography>
                <Typography variant="body1">
                  {extractFileInfo(fileInfoTarget.name, fileInfoTarget.updated, fileInfoTarget.originalUpdated).displayDate}
                </Typography>
              </Box>
              {fileInfoTarget.reviewedByName && (
                <Box>
                  <Typography variant="caption" color="text.secondary">Revisado por</Typography>
                  <Typography variant="body1" color="success.main">
                    {fileInfoTarget.reviewedByName}
                    {fileInfoTarget.reviewedAt && ` - ${new Date(fileInfoTarget.reviewedAt).toLocaleDateString('es-ES')}`}
                  </Typography>
                </Box>
              )}
              {fileInfoTarget.completedByName && (
                <Box>
                  <Typography variant="caption" color="text.secondary">Realizado por</Typography>
                  <Typography variant="body1" color="primary.main">
                    {fileInfoTarget.completedByName}
                    {fileInfoTarget.completedAt && ` - ${new Date(fileInfoTarget.completedAt).toLocaleDateString('es-ES')}`}
                  </Typography>
                </Box>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setFileInfoOpen(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteFile)} onClose={() => setDeleteFile(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Eliminar archivo</DialogTitle>
        <DialogContent>
          <Typography>
            ¿Seguro que quieres eliminar "<strong>{deleteFile?.name}</strong>"? Esta acción no se puede deshacer.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteFile(null)}>Cancelar</Button>
          <Button onClick={handleDeleteFile} variant="contained" color="error">
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(moveFile)}
        onClose={() => !moveLoading && setMoveFile(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Mover "{moveFile?.name}"</DialogTitle>
        <DialogContent>
          {moveError && <Alert severity="error" sx={{ mb: 2 }}>{moveError}</Alert>}
          <Typography variant="body2" sx={{ mb: 2 }}>
            Selecciona la carpeta de destino:
          </Typography>
          {moveLoading && (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <CircularProgress />
              <Typography variant="body2" sx={{ mt: 2 }}>
                Moviendo...
              </Typography>
            </Box>
          )}
          {!moveLoading && (
            <FolderMoveTree
              tree={tree}
              onSelect={handleMoveFile}
              excludePath={moveFile ? getFileParentPath(moveFile.fullPath) : []}
              disabled={moveLoading}
            />
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setMoveFile(null)} disabled={moveLoading}>
            Cancelar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={bulkMoveOpen}
        onClose={() => !bulkMoveLoading && setBulkMoveOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Mover {selectedFiles.length} archivos</DialogTitle>
        <DialogContent>
          {moveError && <Alert severity="error" sx={{ mb: 2 }}>{moveError}</Alert>}
          <Typography variant="body2" sx={{ mb: 2 }}>
            Selecciona la carpeta de destino:
          </Typography>
          {bulkMoveLoading && (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <CircularProgress />
              <Typography variant="body2" sx={{ mt: 2 }}>
                Moviendo archivos...
              </Typography>
            </Box>
          )}
          {!bulkMoveLoading && (
            <FolderMoveTree
              tree={tree}
              onSelect={handleBulkMove}
              excludePath={selectedPath}
              disabled={bulkMoveLoading}
            />
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setBulkMoveOpen(false)} disabled={bulkMoveLoading}>
            Cancelar
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={moveSuccess}
        autoHideDuration={3000}
        onClose={() => setMoveSuccess(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setMoveSuccess(false)} severity="success" sx={{ width: '100%' }}>
          ¡Operación exitosa!
        </Alert>
      </Snackbar>
    </Box>
  );
}

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
            pl: path.length * 2,
            textTransform: 'none',
            width: '100%',
            '&:hover': { bgcolor: alpha('#1a73e8', 0.08) }
          }}
          startIcon={<FolderIcon />}
        >
          {isRoot ? "Carpeta raíz" : tree.name}
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