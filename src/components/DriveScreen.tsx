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
  TimelineDot, TimelineOppositeContent, Switch, FormControlLabel, Checkbox,
  Slide, BottomNavigation, BottomNavigationAction, Skeleton, SpeedDial, SpeedDialIcon, SpeedDialAction
} from "@mui/material";

// Iconos (con adiciones para nuevas funcionalidades)
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
import LaunchIcon from '@mui/icons-material/Launch';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import CloseIcon from '@mui/icons-material/Close';
import InfoIcon from '@mui/icons-material/Info';
import HistoryIcon from '@mui/icons-material/History';
import SecurityIcon from '@mui/icons-material/Security';
import WorkIcon from '@mui/icons-material/Work';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';

// Interfaces (sin cambios a tu estructura original)
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
}

interface DriveFolder {
  name: string;
  fullPath: string;
  folders: DriveFolder[];
  files: DriveFile[];
}

interface ActivityLog {
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

interface UserData {
  name?: string;
  correo?: string;
  puesto?: string;
  [key: string]: any;
}

// --- NUEVO: Componentes Skeleton para la Carga Visual ---
const CardSkeleton = () => (
  <Grid item xs={12} sm={6} md={4} lg={3}>
    <Card sx={{ borderRadius: 3, border: '1px solid #dadce0' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Skeleton variant="circular" width={24} height={24} sx={{ mr: 1.5 }}/>
          <Skeleton variant="text" sx={{ fontSize: '1.2rem' }} width="80%" />
        </Box>
        <Skeleton variant="text" sx={{ fontSize: '0.9rem' }} width="50%" />
      </CardContent>
    </Card>
  </Grid>
);

const ListSkeleton = () => (
  <ListItem sx={{ p: 2, borderBottom: '1px solid #f1f3f4' }}>
    <ListItemIcon>
       <Skeleton variant="circular" width={24} height={24} />
    </ListItemIcon>
    <ListItemText
      primary={<Skeleton variant="text" width="40%" />}
      secondary={<Skeleton variant="text" width="20%" />}
    />
  </ListItem>
);


// --- Funciones de ayuda (Tu lógica original sin cambios) ---
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
    : 'Fecha no disponible';
  return {
    displayName: baseName,
    displayDate: displayDate
  };
};

const getFileIcon = (fileName: string) => {
  if (fileName.toLowerCase().includes('.pdf')) return <PictureAsPdfIcon sx={{ color: '#db4437' }} />;
  return <InsertDriveFileIcon color="action" />;
};

const getActivityIcon = (action: string) => {
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

const getActivityDescription = (activity: ActivityLog) => {
    // Lógica original...
    switch (activity.action) {
        case 'create': return `subió el archivo "${activity.fileName}"`;
        case 'delete': return `eliminó el archivo "${activity.fileName}"`;
        case 'move': return `movió "${activity.fileName}" de ${activity.fromPath} a ${activity.toPath}`;
        case 'review': return `marcó como revisado "${activity.fileName}"`;
        case 'unreview': return `marcó como no revisado "${activity.fileName}"`;
        case 'complete': return `marcó como realizado "${activity.fileName}"`;
        case 'uncomplete': return `marcó como no realizado "${activity.fileName}"`;
        case 'view': return `abrió el archivo "${activity.fileName}"`;
        case 'download': return `descargó el archivo "${activity.fileName}"`;
        case 'create_folder': return `creó la carpeta "${activity.folderName}"`;
        default: return `realizó una acción en "${activity.fileName || activity.folderName}"`;
    }
};

const getFileParentPath = (filePath: string): string[] => {
    // Lógica original...
    const pathParts = filePath.replace('worksheets/', '').split('/');
    pathParts.pop(); 
    return pathParts.filter(part => part && part !== '.keep');
};

const getCurrentUserData = async (email: string): Promise<UserData | null> => {
    // Lógica original...
    if (!email) return null;
    try {
        const usuariosQuery = query(collection(db, 'usuarios'), where('correo', '==', email), limit(1));
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
    // Lógica original...
    if (!userData) return false;
    const puesto = userData.puesto?.toLowerCase();
    return puesto === 'calidad' || puesto === 'quality';
};

const isMetrologistUser = (userData: UserData | null): boolean => {
    // Lógica original...
    if (!userData) return false;
    const puesto = userData.puesto?.toLowerCase();
    return puesto === 'metrólogo' || puesto === 'metrologist' || puesto === 'metrologo';
};

const getUserNameByEmail = async (email: string): Promise<string> => {
    // Lógica original...
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
    // Lógica original...
    if (!user) return 'Usuario desconocido';
    if (user.displayName && user.displayName.trim()) return user.displayName.trim();
    if (user.email) return await getUserNameByEmail(user.email);
    return 'Usuario desconocido';
};

const filterFoldersByPermissions = (folders: DriveFolder[], userIsQuality: boolean, userName: string): DriveFolder[] => {
    // Lógica original...
    if (userIsQuality) return folders;
    const userNameLower = userName.toLowerCase();
    return folders.filter(folder => {
        const folderNameLower = folder.name.toLowerCase();
        return folderNameLower.includes(userNameLower) || userNameLower.includes(folderNameLower) || folder.name === userName;
    });
};

const ROOT_PATH = "worksheets";

export default function DriveScreen({ onBack }: { onBack?: () => void }) {
  // --- ESTADOS (Tu lógica de estado original) ---
  const [user] = useAuthState(auth);
  const [tree, setTree] = useState<DriveFolder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string[]>([]);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState("");
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
  
  // --- ESTADO MODIFICADO: Se elimina actionMenuAnchor y selectedFile, se reemplaza por contextMenu ---
  const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number; file: DriveFile } | null>(null);

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

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { goBack, navigateTo } = useNavigation();
  
  // --- Tus funciones de lógica y efectos (sin cambios) ---
  const navigateToFileFolder = (file: DriveFile) => {
    // ...
    const folderPath = getFileParentPath(file.fullPath);
    setSelectedPath(folderPath);
    setSearchQuery("");
    setGlobalSearch(false);
  };
  
  useEffect(() => {
    // ...
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
    // ...
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
    // ...
    setActivityLoading(true);
    try {
      let q = query(
        collection(db, 'driveActivity'),
        orderBy('timestamp', 'desc'),
        limit(50)
      );
      if (showMyActivityOnly && user) {
        q = query(q, where('userEmail', '==', user.email));
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
    // ...
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

  async function fetchFolder(pathArr: string[]): Promise<DriveFolder> {
    // ...
    const fullPath = [ROOT_PATH, ...pathArr].join("/");
    const dirRef = ref(storage, fullPath);
    const res = await listAll(dirRef);
    
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

  async function reloadTree() {
    // ...
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
    // ...
    if (!accessLoading && currentUserData !== null) {
      reloadTree();
    }
  }, [accessLoading, currentUserData]);

  useEffect(() => {
    // ...
    if (activityPanelOpen) {
      loadActivities();
    }
  }, [activityPanelOpen, showMyActivityOnly]);

  function getCurrentFolder(): DriveFolder | null {
    // ...
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
    // ...
    await logActivity('view', file.name);
    window.open(file.url, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadFile = async (file: DriveFile) => {
    // ...
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
    // ...
    return folder.files.concat(...folder.folders.map(getAllFiles));
  };
  
  const handleMarkReviewed = async (file: DriveFile) => {
    // ...
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

      await logActivity( newReviewedState ? 'review' : 'unreview', file.name, undefined, undefined, undefined, `Estado cambiado por ${userName}`);
      reloadTree();
    } catch (error) {
      console.error("Error updating review status:", error);
      setError("Error al actualizar el estado de revisión");
    }
  };

  const handleMarkCompleted = async (file: DriveFile) => {
    // ...
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

      await logActivity( newCompletedState ? 'complete' : 'uncomplete', file.name, undefined, undefined, undefined, `Estado cambiado por ${userName}`);
      reloadTree();
    } catch (error) {
      console.error("Error updating completed status:", error);
      setError("Error al actualizar el estado de realización");
    }
  };

  const handleFileSelection = (filePath: string, event: React.ChangeEvent<HTMLInputElement>) => {
    // ...
    event.stopPropagation();
    const newSelectedFiles = event.target.checked
      ? [...selectedFiles, filePath]
      : selectedFiles.filter(path => path !== filePath);
    setSelectedFiles(newSelectedFiles);
    if (newSelectedFiles.length > 0 && !selectionMode) setSelectionMode(true);
    if (newSelectedFiles.length === 0) setSelectionMode(false);
  };

  const handleSelectAll = () => {
    // ...
    if (selectedFiles.length === filteredFiles.length) {
      setSelectedFiles([]);
      setSelectionMode(false);
    } else {
      setSelectedFiles(filteredFiles.map(file => file.fullPath));
      setSelectionMode(true);
    }
  };

  const handleBulkDelete = async () => {
    // ...
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
    // ...
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

  const _moveFile = async (filePath: string, targetPathArr: string[]): Promise<void> => {
    // ...
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
              const originalFile = getAllFiles(tree!).find(f => f.fullPath === filePath);
              if (originalFile) metadataToMove.originalUpdated = originalFile.updated;
          }
          
          await setDoc(doc(db, 'fileMetadata', newMetadataId), {
              ...metadataToMove,
              filePath: newPath,
              movedBy: user?.email,
              movedByName: userName,
              movedAt: new Date().toISOString()
          });
          await deleteDoc(oldMetadataRef);
      }

      await deleteObject(fileRef);
  };
  
  async function handleMoveFile(targetPathArr: string[]) {
    // ...
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
    // ...
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
    // ...
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
    // ...
    if (!newFolderName.trim()) return;
    setCreateFolderOpen(false);
    const pathArr = [...selectedPath, newFolderName.trim()];
    const fakeFileRef = ref(storage, [ROOT_PATH, ...pathArr, ".keep"].join("/"));
    await uploadBytes(fakeFileRef, new Uint8Array([0]));
    await logActivity('create_folder', undefined, newFolderName.trim());
    setNewFolderName("");
    reloadTree();
  }

  // --- Lógica de ordenado (sin cambios) ---
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

  // --- NUEVO: Manejadores para el Menú Contextual ---
  const handleContextMenu = (event: React.MouseEvent, file: DriveFile) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu(
      contextMenu === null
        ? {
            mouseX: event.clientX + 2,
            mouseY: event.clientY - 6,
            file: file,
          }
        : null
    );
  };
  
  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };


  const currentFolder = getCurrentFolder();
  
  const filteredFolders = useMemo(() => {
    // Lógica de filtrado original...
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
    // Lógica de filtrado original...
    if (!tree) return [];
    let files = (globalSearch && searchQuery) ? getAllFiles(tree) : (currentFolder?.files || []);
    if (searchQuery) {
      files = files.filter(f => 
        f.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        f.fullPath.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return sortFiles(files);
  }, [currentFolder, searchQuery, globalSearch, tree, sortBy, sortOrder]);

  const filteredActivities = useMemo(() => {
    // Lógica de filtrado original...
    if (!activities) return [];
    if (selectedPath.length > 0 && activityTab === 1) {
      const currentPathStr = selectedPath.join('/');
      return activities.filter(activity => activity.path === currentPathStr || activity.fromPath === currentPathStr || activity.toPath === currentPathStr);
    }
    return activities;
  }, [activities, selectedPath, activityTab]);

  // --- Renderizado principal (con mejoras visuales) ---

  if (accessLoading) {
    return (
      <Container maxWidth="sm" sx={{ mt: 8, textAlign: 'center' }}>
        <CircularProgress size={60} />
        <Typography variant="h6" sx={{ mt: 2 }}>Verificando permisos de acceso...</Typography>
      </Container>
    );
  }

  if (!currentUserData) {
    return (
      <Container maxWidth="sm" sx={{ mt: 8, textAlign: 'center' }}>
        <Alert severity="error" sx={{ mb: 3 }}>
          <Typography variant="h6">Acceso Denegado</Typography>
          <Typography>No tienes permisos para acceder. Contacta al administrador.</Typography>
        </Alert>
        <Button variant="contained" onClick={() => onBack ? onBack() : navigateTo("menu")} startIcon={<ArrowBackIcon />}>
          Volver
        </Button>
      </Container>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8f9fa' }}>
      <Container maxWidth="xl" sx={{ py: 2 }}>
        <Paper sx={{ mb: 3, borderRadius: 3, border: '1px solid #dadce0' }}>
          {/* Header y Barra de acciones (Tu lógica original) */}
          <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f3f4' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <IconButton onClick={() => selectedPath.length ? setSelectedPath(selectedPath.slice(0, -1)) : (onBack ? onBack() : goBack())}>
                    <ArrowBackIcon />
                </IconButton>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CloudIcon sx={{ color: '#1a73e8', fontSize: 28 }} />
                    <Typography variant="h6" sx={{ color: '#202124', fontWeight: 500 }}>Drive Interno</Typography>
                    {userIsQuality && <Chip icon={<SecurityIcon />} label="Calidad" size="small" color="success" variant="outlined" />}
                    {userIsMetrologist && <Chip icon={<WorkIcon />} label="Metrólogo" size="small" color="primary" variant="outlined" />}
                </Box>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <IconButton onClick={() => setActivityPanelOpen(true)}><HistoryIcon /></IconButton>
                <ToggleButtonGroup value={view} exclusive onChange={(e, v) => v && setView(v)} size="small">
                    <ToggleButton value="grid"><ViewModuleIcon /></ToggleButton>
                    <ToggleButton value="list"><ViewListIcon /></ToggleButton>
                </ToggleButtonGroup>
            </Box>
          </Box>
          
          <Box sx={{ px: 2, py: 1 }}>
            <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />}>
              <Link component="button" onClick={() => setSelectedPath([])}>Mi unidad</Link>
              {selectedPath.map((seg, idx) => (
                <Link key={idx} component="button" onClick={() => setSelectedPath(selectedPath.slice(0, idx + 1))}>
                  {seg}
                </Link>
              ))}
            </Breadcrumbs>
          </Box>

          <Box sx={{ p: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={globalSearch ? "Buscar en todo el Drive" : "Buscar en esta carpeta"}
              fullWidth
              size="small"
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
                sx: { bgcolor: '#f1f3f4', borderRadius: 3, '& .MuiOutlinedInput-notchedOutline': { border: 'none' } }
              }}
            />
            <Tooltip title={globalSearch ? "Buscar solo en carpeta actual" : "Buscar en todo el drive"}>
                <IconButton onClick={() => setGlobalSearch(!globalSearch)} color={globalSearch ? "primary" : "default"}><SearchIcon /></IconButton>
            </Tooltip>
            <Select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [newSortBy, newSortOrder] = e.target.value.split('-') as [typeof sortBy, typeof sortOrder];
                setSortBy(newSortBy);
                setSortOrder(newSortOrder);
              }}
              size="small"
              sx={{ bgcolor: 'transparent', '& .MuiOutlinedInput-notchedOutline': { border: 'none' } }}
            >
              <MenuItem value="name-asc">Nombre A-Z</MenuItem>
              <MenuItem value="name-desc">Nombre Z-A</MenuItem>
              <MenuItem value="date-desc">Más reciente</MenuItem>
              <MenuItem value="date-asc">Más antiguo</MenuItem>
            </Select>
          </Box>

          {filteredFiles.length > 0 && (
            <Box sx={{ px: 2, pb: 2 }}>
              <FormControlLabel
                control={<Checkbox checked={selectedFiles.length === filteredFiles.length && filteredFiles.length > 0} indeterminate={selectedFiles.length > 0 && selectedFiles.length < filteredFiles.length} onChange={handleSelectAll} />}
                label={`Seleccionar todo (${selectedFiles.length} seleccionados)`}
              />
            </Box>
          )}
        </Paper>

        {/* === CAMBIO: Lógica de carga ahora muestra SKELETONS === */}
        {loading ? (
          view === "grid" ? (
            <Grid container spacing={2}>
              {Array.from(new Array(8)).map((_, index) => <CardSkeleton key={index} />)}
            </Grid>
          ) : (
            <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
              <List sx={{ p:0 }}>{Array.from(new Array(5)).map((_, index) => <ListSkeleton key={index} />)}</List>
            </Paper>
          )
        ) : error ? (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error} <Button onClick={reloadTree} sx={{ ml: 1 }}>Reintentar</Button>
          </Alert>
        ) : currentFolder ? (
          <>
            {globalSearch && searchQuery && (
              <Alert severity="info" sx={{ mb: 3 }}>
                Mostrando {filteredFiles.length} resultados para "{searchQuery}" en todo el drive.
              </Alert>
            )}

            {view === "grid" ? (
              <Grid container spacing={2}>
                {/* --- Carpetas con Estilo Mejorado --- */}
                {filteredFolders.map((folder, idx) => (
                  <Grid item xs={12} sm={6} md={4} lg={3} key={idx}>
                    <Card onClick={() => setSelectedPath([...selectedPath, folder.name])} sx={{ cursor: "pointer", borderRadius: 3, '&:hover': { bgcolor: alpha(theme.palette.action.hover, 0.5), boxShadow: 2 } }}>
                      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <FolderIcon color="primary" /> <Typography variant="subtitle1" noWrap>{folder.name}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
                {/* --- Archivos con Estilo Mejorado y Menú Contextual --- */}
                {filteredFiles.map((file, idx) => {
                  const { displayName } = extractFileInfo(file.name, file.updated, file.originalUpdated);
                  const isSelected = selectedFiles.includes(file.fullPath);
                  return (
                    <Grid item xs={12} sm={6} md={4} lg={3} key={idx}>
                      <Card 
                        onContextMenu={(e) => handleContextMenu(e, file)}
                        sx={{ 
                          cursor: 'pointer', 
                          position: 'relative', 
                          borderRadius: 3, 
                          border: isSelected ? `2px solid ${theme.palette.primary.main}` : `1px solid ${theme.palette.divider}`, 
                          '&:hover': { bgcolor: alpha(theme.palette.action.hover, 0.5), boxShadow: 2 } 
                        }}
                      >
                        <CardContent onClick={() => handleOpenFile(file)}>
                          <Checkbox checked={isSelected} onChange={(e) => handleFileSelection(file.fullPath, e)} onClick={(e) => e.stopPropagation()} sx={{ position: 'absolute', top: 4, left: 4 }}/>
                          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, pl: 4 }}>
                            {getFileIcon(file.name)}
                            <Typography variant="subtitle2" noWrap sx={{ ml: 1.5, flexGrow: 1 }}>{displayName}</Typography>
                          </Box>
                          
                          {globalSearch && searchQuery && file.folderPath && (
                            <Chip label={file.folderPath} onClick={(e) => { e.stopPropagation(); navigateToFileFolder(file); }} size="small" sx={{ mt: 1 }}/>
                          )}

                          <Stack direction="row" spacing={1} mt={1} pl={4}>
                            {file.reviewed && <Chip icon={<CheckCircleIcon/>} label={`Revisado: ${file.reviewedByName || ''}`} size="small" color="success" variant="outlined"/>}
                            {file.completed && <Chip icon={<AssignmentTurnedInIcon/>} label={`Realizado: ${file.completedByName || ''}`} size="small" color="primary" variant="outlined"/>}
                          </Stack>
                        </CardContent>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>
            ) : (
              <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
                 {filteredFolders.map((folder, idx) => (
                  <ListItemButton key={idx} onClick={() => setSelectedPath([...selectedPath, folder.name])}>
                    <ListItemIcon><FolderIcon color="primary" /></ListItemIcon>
                    <ListItemText primary={folder.name} secondary={`${folder.files.length} elementos`} />
                  </ListItemButton>
                ))}
                {filteredFiles.map((file, idx) => {
                  const { displayName, displayDate } = extractFileInfo(file.name, file.updated, file.originalUpdated);
                  const isSelected = selectedFiles.includes(file.fullPath);
                  return (
                    <ListItemButton key={idx} onClick={() => handleOpenFile(file)} selected={isSelected} onContextMenu={(e) => handleContextMenu(e, file)}>
                        <ListItemIcon>
                            <Checkbox edge="start" checked={isSelected} onChange={(e) => handleFileSelection(file.fullPath, e)} onClick={(e) => e.stopPropagation()}/>
                            {getFileIcon(file.name)}
                        </ListItemIcon>
                        <ListItemText 
                            primary={displayName}
                            secondary={
                                <>
                                    {displayDate}
                                    {globalSearch && searchQuery && file.folderPath && 
                                        <Button size="small" onClick={(e) => { e.stopPropagation(); navigateToFileFolder(file); }} sx={{ ml: 1 }}>Ir a carpeta</Button>
                                    }
                                </>
                            }
                        />
                        <Stack direction="row" spacing={1.5} alignItems="center">
                            {file.reviewed && <Tooltip title={`Revisado por ${file.reviewedByName}`}><CheckCircleIcon color="success" fontSize="small"/></Tooltip>}
                            {file.completed && <Tooltip title={`Realizado por ${file.completedByName}`}><AssignmentTurnedInIcon color="primary" fontSize="small"/></Tooltip>}
                        </Stack>
                    </ListItemButton>
                  );
                })}
              </Paper>
            )}

            {filteredFolders.length === 0 && filteredFiles.length === 0 && (
              <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 3 }}>
                <FolderOpenIcon sx={{ fontSize: 64, color: '#dadce0', mb: 2 }} />
                <Typography variant="h6">{!userIsQuality && selectedPath.length === 0 ? 'No tienes carpetas asignadas' : 'Esta carpeta está vacía'}</Typography>
                <Typography color="text.secondary">{!userIsQuality && selectedPath.length === 0 ? 'Contacta al administrador.' : 'Puedes crear carpetas y subir archivos.'}</Typography>
              </Paper>
            )}
          </>
        ) : null}
      </Container>
      
      {/* --- Elementos flotantes y diálogos (Tu lógica original sin cambios) --- */}
      <Slide direction="up" in={selectionMode && selectedFiles.length > 0}>
        <Paper sx={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 2, p: 2, borderRadius: 3, boxShadow: 6, zIndex: 1000 }}>
          {userIsQuality && (
            <>
              <Button startIcon={<DeleteIcon />} onClick={handleBulkDelete} color="error" variant="outlined" disabled={bulkMoveLoading}>Eliminar ({selectedFiles.length})</Button>
              <Button startIcon={<CheckCircleIcon />} onClick={handleBulkMarkReviewed} color="success" variant="contained" disabled={bulkMoveLoading}>Marcar Revisado</Button>
              <Button startIcon={<DriveFileMoveIcon />} onClick={() => setBulkMoveOpen(true)} variant="contained" disabled={bulkMoveLoading}>Mover</Button>
            </>
          )}
          <Button startIcon={<CloseIcon />} onClick={() => { setSelectedFiles([]); setSelectionMode(false); }} variant="outlined" disabled={bulkMoveLoading}>Cancelar</Button>
        </Paper>
      </Slide>

      <Drawer anchor="right" open={activityPanelOpen} onClose={() => setActivityPanelOpen(false)} PaperProps={{ sx: { width: { xs: '100%', md: 420 } } }}>
          {/* Lógica del panel de actividad sin cambios */}
          <Box sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">Actividad</Typography>
                <IconButton onClick={() => setActivityPanelOpen(false)}><CloseIcon /></IconButton>
            </Box>
            <Tabs value={activityTab} onChange={(e, newValue) => setActivityTab(newValue)}><Tab label="General" /><Tab label="Esta carpeta" /></Tabs>
            <FormControlLabel control={<Switch checked={showMyActivityOnly} onChange={(e) => setShowMyActivityOnly(e.target.checked)} />} label="Solo mi actividad" />
            {activityLoading ? <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress /></Box> : (
            <List>
              {filteredActivities.map((activity, idx) => (
                <ListItem key={idx}>
                  <ListItemAvatar><Avatar>{getActivityIcon(activity.action)}</Avatar></ListItemAvatar>
                  <ListItemText primary={`${activity.userName} ${getActivityDescription(activity)}`} secondary={new Date(activity.timestamp).toLocaleString('es-ES')} />
                </ListItem>
              ))}
              {filteredActivities.length === 0 && <Typography align="center" color="text.secondary" sx={{ py: 4 }}>No hay actividad reciente.</Typography>}
            </List>
          )}
        </Box>
      </Drawer>

      {/* === CAMBIO: Botón FAB ahora es un SpeedDial === */}
      {userIsQuality && (
        <SpeedDial
            ariaLabel="Acciones rápidas"
            sx={{ position: 'fixed', bottom: 24, right: 24 }}
            icon={<SpeedDialIcon />}
        >
            <SpeedDialAction key="folder" icon={<CreateNewFolderIcon />} tooltipTitle="Crear Carpeta" onClick={() => setCreateFolderOpen(true)} />
            <SpeedDialAction key="upload" icon={<FileUploadIcon />} tooltipTitle="Subir Archivo" onClick={() => alert("Funcionalidad de subida no implementada")} />
        </SpeedDial>
      )}

      {/* --- NUEVO: Menú contextual que reemplaza al menú de tres puntos --- */}
      <Menu
        open={contextMenu !== null}
        onClose={handleCloseContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={contextMenu !== null ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined}
      >
        {contextMenu?.file && [
          <MenuItem key="open" onClick={() => { handleOpenFile(contextMenu.file); handleCloseContextMenu(); }}><ListItemIcon><VisibilityIcon fontSize="small" /></ListItemIcon>Abrir</MenuItem>,
          <MenuItem key="download" onClick={() => { handleDownloadFile(contextMenu.file); handleCloseContextMenu(); }}><ListItemIcon><DownloadIcon fontSize="small" /></ListItemIcon>Descargar</MenuItem>,
          globalSearch && searchQuery && <MenuItem key="goto" onClick={() => { navigateToFileFolder(contextMenu.file); handleCloseContextMenu(); }}><ListItemIcon><LaunchIcon fontSize="small" /></ListItemIcon>Ir a carpeta</MenuItem>,
          userIsQuality && <Divider key="div1" />,
          userIsQuality && <MenuItem key="move" onClick={() => { setMoveFile(contextMenu.file); handleCloseContextMenu(); }}><ListItemIcon><DriveFileMoveIcon fontSize="small" /></ListItemIcon>Mover</MenuItem>,
          userIsQuality && <MenuItem key="review" onClick={() => { handleMarkReviewed(contextMenu.file); handleCloseContextMenu(); }}><ListItemIcon><CheckCircleIcon fontSize="small" color="success"/></ListItemIcon>{contextMenu.file.reviewed ? 'Marcar no revisado' : 'Marcar revisado'}</MenuItem>,
          userIsMetrologist && <MenuItem key="complete" onClick={() => { handleMarkCompleted(contextMenu.file); handleCloseContextMenu(); }}><ListItemIcon><AssignmentTurnedInIcon fontSize="small" color="primary"/></ListItemIcon>{contextMenu.file.completed ? 'Marcar no realizado' : 'Marcar realizado'}</MenuItem>,
          userIsQuality && <Divider key="div2" />,
          userIsQuality && <MenuItem key="delete" onClick={() => { setDeleteFile(contextMenu.file); handleCloseContextMenu(); }} sx={{ color: 'error.main' }}><ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>Eliminar</MenuItem>
        ]}
      </Menu>

      {/* --- Diálogos (Tu lógica original sin cambios) --- */}
      <Dialog open={createFolderOpen} onClose={() => setCreateFolderOpen(false)}><DialogTitle>Crear nueva carpeta</DialogTitle><DialogContent><TextField value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} label="Nombre de la carpeta" fullWidth autoFocus margin="normal" /></DialogContent><DialogActions><Button onClick={() => setCreateFolderOpen(false)}>Cancelar</Button><Button onClick={handleCreateFolder} variant="contained">Crear</Button></DialogActions></Dialog>
      <Dialog open={Boolean(deleteFile)} onClose={() => setDeleteFile(null)}><DialogTitle>Eliminar archivo</DialogTitle><DialogContent><Typography>¿Seguro que quieres eliminar "{deleteFile?.name}"? Esta acción no se puede deshacer.</Typography></DialogContent><DialogActions><Button onClick={() => setDeleteFile(null)}>Cancelar</Button><Button onClick={handleDeleteFile} color="error" variant="contained">Eliminar</Button></DialogActions></Dialog>
      <Dialog open={Boolean(moveFile)} onClose={() => !moveLoading && setMoveFile(null)} maxWidth="sm" fullWidth><DialogTitle>Mover "{moveFile?.name}"</DialogTitle><DialogContent>{moveError && <Alert severity="error">{moveError}</Alert>}<Typography sx={{ mb: 2 }}>Selecciona la carpeta de destino:</Typography><FolderMoveTree tree={tree} onSelect={handleMoveFile} excludePath={selectedPath} disabled={moveLoading} />{moveLoading && <Box sx={{ textAlign: 'center', mt: 2 }}><CircularProgress /><Typography>Moviendo...</Typography></Box>}</DialogContent><DialogActions><Button onClick={() => setMoveFile(null)} disabled={moveLoading}>Cancelar</Button></DialogActions></Dialog>
      <Dialog open={bulkMoveOpen} onClose={() => !bulkMoveLoading && setBulkMoveOpen(false)} maxWidth="sm" fullWidth><DialogTitle>Mover {selectedFiles.length} archivos</DialogTitle><DialogContent>{moveError && <Alert severity="error">{moveError}</Alert>}<Typography sx={{ mb: 2 }}>Selecciona la carpeta de destino:</Typography><FolderMoveTree tree={tree} onSelect={handleBulkMove} excludePath={selectedPath} disabled={bulkMoveLoading} />{bulkMoveLoading && <Box sx={{ textAlign: 'center', mt: 2 }}><CircularProgress /><Typography>Moviendo archivos...</Typography></Box>}</DialogContent><DialogActions><Button onClick={() => setBulkMoveOpen(false)} disabled={bulkMoveLoading}>Cancelar</Button></DialogActions></Dialog>
      <Snackbar open={moveSuccess} autoHideDuration={3000} onClose={() => setMoveSuccess(false)}><Alert onClose={() => setMoveSuccess(false)} severity="success">¡Movido con éxito!</Alert></Snackbar>
    </Box>
  );
}

// Componente de árbol para mover archivos (Tu lógica original sin cambios)
function FolderMoveTree({ tree, path = [], onSelect, excludePath = [], disabled = false }: { tree: DriveFolder | null; path?: string[]; onSelect: (path: string[]) => void; excludePath?: string[]; disabled?: boolean; }) {
  if (!tree) return null;
  const isRoot = tree.name === "Drive";
  const currentPath = isRoot ? [] : [...path, tree.name];
  const shouldExclude = JSON.stringify(currentPath) === JSON.stringify(excludePath);

  return (
    <Box>
      {!shouldExclude && (
        <Button onClick={() => !disabled && onSelect(currentPath)} disabled={disabled} sx={{ justifyContent: 'flex-start', pl: path.length * 2, textTransform: 'none' }} startIcon={<FolderIcon />} fullWidth>
          {isRoot ? "Carpeta raíz" : tree.name}
        </Button>
      )}
      {tree.folders.map((folder, idx) => (
        <FolderMoveTree key={idx} tree={folder} path={currentPath} onSelect={onSelect} excludePath={excludePath} disabled={disabled} />
      ))}
    </Box>
  );
}