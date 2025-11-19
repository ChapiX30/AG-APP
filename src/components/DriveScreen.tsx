import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { ref, listAll, getDownloadURL, uploadBytes, deleteObject, getMetadata } from "firebase/storage";
import { doc, getDoc, updateDoc, deleteDoc, setDoc, collection, addDoc, query, orderBy, limit, where, getDocs } from "firebase/firestore";
import { storage, db, auth } from "../utils/firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { useNavigation } from "../hooks/useNavigation";
import {
  Typography, Box, Grid, Button, CircularProgress, Chip,
  IconButton, Tooltip, Paper, useTheme, alpha, TextField,
  Zoom, useMediaQuery, Stack, Dialog,
  DialogTitle, DialogContent, DialogActions, Breadcrumbs, Link,
  Alert, Select, FormControl, MenuItem, Fab, Menu,
  ListItemIcon, ListItemText, Divider, Container, Drawer,
  List, ListItemButton, InputBase, Checkbox,
  LinearProgress
} from "@mui/material";

import Timeline from '@mui/lab/Timeline';
import TimelineItem from '@mui/lab/TimelineItem';
import TimelineSeparator from '@mui/lab/TimelineSeparator';
import TimelineConnector from '@mui/lab/TimelineConnector';
import TimelineContent from '@mui/lab/TimelineContent';
import TimelineDot from '@mui/lab/TimelineDot';
import TimelineOppositeContent from '@mui/lab/TimelineOppositeContent';

// Icons
import FolderIcon from '@mui/icons-material/Folder';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloudIcon from '@mui/icons-material/Cloud';
import SearchIcon from '@mui/icons-material/Search';
import ViewListIcon from '@mui/icons-material/ViewList';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import DriveFileMoveIcon from '@mui/icons-material/DriveFileMove';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DownloadIcon from '@mui/icons-material/Download';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import StarIcon from '@mui/icons-material/Star';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import GridViewIcon from '@mui/icons-material/GridView';
import SortIcon from '@mui/icons-material/Sort';
import InfoIcon from '@mui/icons-material/Info';
import HistoryIcon from '@mui/icons-material/History';
import CloseIcon from '@mui/icons-material/Close';
import SecurityIcon from '@mui/icons-material/Security';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import HomeIcon from '@mui/icons-material/Home';
import TableChartIcon from '@mui/icons-material/TableChart';
import DescriptionIcon from '@mui/icons-material/Description';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';
import FileUploadIcon from '@mui/icons-material/FileUpload';

// --- INTERFACES ---
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
  id?: string;
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

// --- HELPERS & UTILS ---

const formatFileSize = (bytes?: number): string => {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(1) + ' GB';
};

const extractFileInfo = (fileName: string, updatedDate?: string, originalDate?: string) => {
  const baseName = fileName.replace(/\.pdf$/i, "").replace(/_/g, " ");
  const effectiveDate = originalDate || updatedDate;
  const displayDate = effectiveDate
    ? new Date(effectiveDate).toLocaleDateString('es-MX', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'Fecha desconocida';
  return {
    displayName: baseName,
    displayDate: displayDate
  };
};

const getFileColor = (fileName: string) => {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return '#EA4335'; 
  if (lower.endsWith('.xls') || lower.endsWith('.xlsx') || lower.endsWith('.csv')) return '#34A853';
  if (lower.endsWith('.doc') || lower.endsWith('.docx')) return '#4285F4';
  if (lower.endsWith('.ppt') || lower.endsWith('.pptx')) return '#FBBC04';
  if (lower.endsWith('.jpg') || lower.endsWith('.png') || lower.endsWith('.jpeg')) return '#A142F4';
  return '#5f6368'; 
};

const getFileIconComponent = (fileName: string, fontSize: number = 24) => {
    const color = getFileColor(fileName);
    const lower = fileName.toLowerCase();
    const props = { style: { fontSize, color } };

    if (lower.endsWith('.pdf')) return <PictureAsPdfIcon {...props} />;
    if (lower.endsWith('.xls') || lower.endsWith('.xlsx')) return <TableChartIcon {...props} />;
    if (lower.endsWith('.doc') || lower.endsWith('.docx')) return <DescriptionIcon {...props} />;
    return <InsertDriveFileIcon {...props} />;
};

const getActivityDescription = (activity: ActivityLog) => {
  const isBulk = activity.fileName?.includes('archivos');
  switch (activity.action) {
    case 'create': return `Subió ${isBulk ? activity.fileName : `"${activity.fileName}"`}`;
    case 'delete': return `Eliminó ${isBulk ? activity.fileName : `"${activity.fileName}"`}`;
    case 'move': return `Movió "${activity.fileName}"`;
    case 'review': return `Revisó "${activity.fileName}"`;
    case 'unreview': return `Quitó revisión de "${activity.fileName}"`;
    case 'complete': return `Completó "${activity.fileName}"`;
    case 'uncomplete': return `Marcó como no realizado "${activity.fileName}"`;
    case 'view': return `Visualizó "${activity.fileName}"`;
    case 'create_folder': return `Creó carpeta "${activity.folderName}"`;
    case 'rename': return `Renombró ${activity.details}`;
    default: return `Acción en "${activity.fileName || activity.folderName}"`;
  }
};

// --- FIREBASE HELPERS ---
const getFileParentPath = (filePath: string): string[] => {
  const pathParts = filePath.replace('worksheets/', '').split('/');
  pathParts.pop();
  return pathParts.filter(part => part && part !== '.keep');
};

const getCurrentUserData = async (email: string): Promise<UserData | null> => {
  if (!email) return null;
  try {
    const q = query(collection(db, 'usuarios'), where('correo', '==', email), limit(1));
    const querySnapshot = await getDocs(q);
    return querySnapshot.empty ? null : querySnapshot.docs[0].data() as UserData;
  } catch (e) { return null; }
};

const isQualityUser = (userData: UserData | null) => ['calidad', 'quality'].includes(userData?.puesto?.toLowerCase() || '');
const isMetrologistUser = (userData: UserData | null) => ['metrólogo', 'metrologist', 'metrologo'].includes(userData?.puesto?.toLowerCase() || '');

const getUserNameByEmail = async (email: string): Promise<string> => {
    if (!email) return 'Desconocido';
    const q = query(collection(db, 'usuarios'), where('correo', '==', email), limit(1));
    const snap = await getDocs(q);
    return !snap.empty ? (snap.docs[0].data().name || email.split('@')[0]) : email.split('@')[0];
};

const getUserDisplayName = async (user: any) => {
  if (!user) return 'Usuario';
  if (user.displayName) return user.displayName;
  if (user.email) return await getUserNameByEmail(user.email);
  return 'Usuario';
};

const updateFileInTree = (folder: DriveFolder, filePath: string, updates: Partial<DriveFile>): DriveFolder => {
  const fileIndex = folder.files.findIndex(f => f.fullPath === filePath);
  if (fileIndex > -1) {
    const updatedFiles = [...folder.files];
    updatedFiles[fileIndex] = { ...updatedFiles[fileIndex], ...updates };
    return { ...folder, files: updatedFiles };
  }
  const folderIndex = folder.folders.findIndex(f => filePath.startsWith(f.fullPath));
  if (folderIndex > -1) {
    const updatedFolders = [...folder.folders];
    updatedFolders[folderIndex] = updateFileInTree(updatedFolders[folderIndex], filePath, updates);
    return { ...folder, folders: updatedFolders };
  }
  return folder;
};

const ROOT_PATH = "worksheets";

// ============================================================================
// ========================= COMPONENT: FILE CARD =============================
// ============================================================================
const FileCard = ({ 
    file, 
    isSelected, 
    selectionMode, 
    onSelect, 
    onToggleStar, 
    onMenuOpen, 
    onClick 
}: {
    file: DriveFile;
    isSelected: boolean;
    selectionMode: boolean;
    onSelect: (path: string, e: any) => void;
    onToggleStar: (file: DriveFile) => void;
    onMenuOpen: (e: React.MouseEvent, file: DriveFile) => void;
    onClick: () => void;
}) => {
    const { displayName, displayDate } = extractFileInfo(file.name, file.updated, file.originalUpdated);

    const tooltipContent = (
        <Box sx={{ p: 0.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, borderBottom: '1px solid rgba(255,255,255,0.2)', pb: 0.5, color: '#fff' }}>
                Estado del archivo
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                <AssignmentTurnedInIcon sx={{ fontSize: 16, color: file.completed ? '#90caf9' : '#bdbdbd' }} />
                <Typography variant="caption" sx={{ color: file.completed ? '#fff' : '#bdbdbd' }}>
                    {file.completedByName ? `Realizó: ${file.completedByName}` : 'No realizado aún'}
                </Typography>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
                <CheckCircleIcon sx={{ fontSize: 16, color: file.reviewed ? '#a5d6a7' : '#bdbdbd' }} />
                <Typography variant="caption" sx={{ color: file.reviewed ? '#fff' : '#bdbdbd' }}>
                    {file.reviewedByName ? `Revisó: ${file.reviewedByName}` : 'No revisado aún'}
                </Typography>
            </Stack>
        </Box>
    );

    return (
        <Tooltip 
            title={tooltipContent} 
            arrow 
            placement="top" 
            enterDelay={400} 
            componentsProps={{
                tooltip: { sx: { bgcolor: 'rgba(33, 33, 33, 0.95)', borderRadius: 2, boxShadow: 4, padding: '8px 12px' } },
                arrow: { sx: { color: 'rgba(33, 33, 33, 0.95)' } }
            }}
        >
            <Paper
                elevation={isSelected ? 4 : 0}
                onClick={onClick}
                onContextMenu={(e) => { e.preventDefault(); onMenuOpen(e, file); }}
                sx={{
                    position: 'relative',
                    borderRadius: '16px',
                    border: isSelected ? '2px solid #1a73e8' : '1px solid #dadce0',
                    bgcolor: isSelected ? alpha('#1a73e8', 0.08) : 'white',
                    overflow: 'hidden',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    cursor: 'pointer',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    '&:hover': {
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        transform: 'translateY(-2px)',
                        borderColor: isSelected ? '#1a73e8' : '#1a73e8',
                        '& .file-actions': { opacity: 1 }
                    }
                }}
            >
                {selectionMode && (
                    <Checkbox
                        checked={isSelected}
                        onChange={(e) => onSelect(file.fullPath, e)}
                        onClick={(e) => e.stopPropagation()}
                        sx={{ position: 'absolute', top: 8, left: 8, zIndex: 2 }}
                    />
                )}

                <Box sx={{ 
                    height: 140, 
                    bgcolor: alpha(getFileColor(file.name), 0.04),
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    borderBottom: '1px solid #f0f0f0',
                    position: 'relative'
                }}>
                    {getFileIconComponent(file.name, 64)}
                    <Stack direction="row" spacing={0.5} sx={{ position: 'absolute', bottom: 8, left: 8 }}>
                        {file.reviewed && <CheckCircleIcon sx={{ fontSize: 18, color: '#34A853', bgcolor: 'white', borderRadius: '50%' }} />}
                        {file.completed && <AssignmentTurnedInIcon sx={{ fontSize: 18, color: '#1a73e8', bgcolor: 'white', borderRadius: '50%' }} />}
                    </Stack>
                </Box>

                <Box sx={{ p: 2, flex: 1 }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Typography variant="body2" fontWeight={600} noWrap title={displayName} sx={{ flex: 1 }}>
                            {displayName}
                        </Typography>
                        <Box className="file-actions" sx={{ opacity: 0, transition: 'opacity 0.2s', ml: 1 }}>
                             <IconButton size="small" onClick={(e) => { e.stopPropagation(); onMenuOpen(e, file); }}>
                                <MoreVertIcon fontSize="small" />
                            </IconButton>
                        </Box>
                    </Stack>
                    
                    <Stack direction="row" alignItems="center" spacing={1} mt={1}>
                        {getFileIconComponent(file.name, 16)}
                        <Typography variant="caption" color="text.secondary">
                            {displayDate}
                        </Typography>
                        
                        <IconButton 
                            size="small" 
                            sx={{ ml: 'auto !important', p: 0.5 }}
                            onClick={(e) => { e.stopPropagation(); onToggleStar(file); }}
                        >
                            {file.starred ? <StarIcon sx={{ fontSize: 18, color: '#fbbc04' }} /> : <StarBorderIcon sx={{ fontSize: 18, color: '#dadce0' }} />}
                        </IconButton>
                    </Stack>
                </Box>
            </Paper>
        </Tooltip>
    );
};

// ============================================================================
// =========================== MAIN COMPONENT =================================
// ============================================================================

export default function DriveScreen({ onBack }: { onBack?: () => void }) {
  const [user] = useAuthState(auth);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { goBack, navigateTo } = useNavigation();

  // Data States
  const [tree, setTree] = useState<DriveFolder | null>(null);
  const [allFilesCache, setAllFilesCache] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI States (OPTIMIZADO: Debounce search)
  const [selectedPath, setSelectedPath] = useState<string[]>([]);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState(""); // Lo que escribes
  const [debouncedSearch, setDebouncedSearch] = useState(""); // Lo que filtra realmente
  
  const [sortBy, setSortBy] = useState<'name' | 'date'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // Action States
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: DriveFile | null } | null>(null);
  const [actionMenuAnchor, setActionMenuAnchor] = useState<HTMLElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const [newMenuAnchor, setNewMenuAnchor] = useState<HTMLElement | null>(null);
  
  // Dialog/Panel States
  const [fileInfoOpen, setFileInfoOpen] = useState(false);
  const [fileInfoTarget, setFileInfoTarget] = useState<DriveFile | null>(null);
  const [activityPanelOpen, setActivityPanelOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<DriveFile | null>(null);
  const [newName, setNewName] = useState("");
  const [deleteFile, setDeleteFile] = useState<DriveFile | null>(null);

  // Process States
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [activities, setActivities] = useState<ActivityLog[]>([]);

  // Permissions
  const [currentUserData, setCurrentUserData] = useState<UserData | null>(null);
  const [userIsQuality, setUserIsQuality] = useState(false);
  const [userIsMetrologist, setUserIsMetrologist] = useState(false);
  const [accessLoading, setAccessLoading] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // --- INITIALIZATION ---
  useEffect(() => {
    const loadUserPermissions = async () => {
      if (!user?.email) { setAccessLoading(false); return; }
      try {
        setAccessLoading(true);
        const userData = await getCurrentUserData(user.email);
        setCurrentUserData(userData);
        setUserIsQuality(isQualityUser(userData));
        setUserIsMetrologist(isMetrologistUser(userData));
      } catch (error) { console.error(error); } 
      finally { setAccessLoading(false); }
    };
    loadUserPermissions();
  }, [user]);

  useEffect(() => {
    if (!accessLoading && currentUserData !== null) reloadTree();
  }, [accessLoading, currentUserData]);

  // --- DEBOUNCE SEARCH EFFECT ---
  useEffect(() => {
      const timer = setTimeout(() => {
          setDebouncedSearch(searchQuery);
      }, 500); // Espera 500ms después de que dejes de escribir para filtrar
      return () => clearTimeout(timer);
  }, [searchQuery]);

  // --- CORE DATA LOGIC ---
  const loadFileMetadata = async (file: DriveFile): Promise<DriveFile> => {
    try {
      const metadataId = file.fullPath.replace(/\//g, '_');
      const metadataRef = doc(db, 'fileMetadata', metadataId);
      const metadataDoc = await getDoc(metadataRef);
      if (metadataDoc.exists()) {
        const metadata = metadataDoc.data();
        return {
          ...file,
          ...metadata,
          originalUpdated: metadata.originalUpdated || file.updated,
          folderPath: getFileParentPath(file.fullPath).join('/'),
        };
      } else {
        await setDoc(metadataRef, { filePath: file.fullPath, originalUpdated: file.updated }).catch(() => {});
      }
    } catch (error) { console.error(error); }
    return { ...file, originalUpdated: file.updated, folderPath: getFileParentPath(file.fullPath).join('/') };
  };

  async function fetchFolder(pathArr: string[]): Promise<DriveFolder> {
    const fullPath = [ROOT_PATH, ...pathArr].join("/");
    const dirRef = ref(storage, fullPath);
    const res = await listAll(dirRef);
    
    const folders: DriveFolder[] = await Promise.all(res.prefixes.map(prefix => fetchFolder([...pathArr, prefix.name])));
    
    const files: DriveFile[] = await Promise.all(res.items.map(async itemRef => {
        const url = await getDownloadURL(itemRef);
        const metadata = await getMetadata(itemRef);
        const file: DriveFile = { name: itemRef.name, url, fullPath: itemRef.fullPath, updated: metadata.updated, size: metadata.size, contentType: metadata.contentType };
        return await loadFileMetadata(file);
    }));
    return { name: pathArr[pathArr.length - 1] || "Drive", fullPath, folders, files };
  }

  const fetchAllFiles = useCallback((initialFolder: DriveFolder) => {
    const allFiles: DriveFile[] = [];
    const queue: DriveFolder[] = [initialFolder];
    while (queue.length > 0) {
      const current = queue.shift()!;
      allFiles.push(...current.files);
      queue.push(...current.folders);
    }
    setAllFilesCache(allFiles);
  }, []);

  async function reloadTree() {
    setLoading(true);
    setError(null);
    try {
      const rootTree = await fetchFolder([]);
      setTree(rootTree);
      fetchAllFiles(rootTree);
    } catch (e) { console.error(e); setError("No se pudieron cargar los archivos."); }
    setLoading(false);
  }

  const logActivity = async (action: ActivityLog['action'], fileName?: string, folderName?: string, fromPath?: string, toPath?: string, details?: string) => {
    if (!user) return;
    try {
      const userName = await getUserDisplayName(user);
      await addDoc(collection(db, 'driveActivity'), {
        action, fileName, folderName, fromPath, toPath, userEmail: user.email!, userName, timestamp: new Date().toISOString(), path: selectedPath.join('/') || 'root', details
      });
    } catch (e) { console.error(e); }
  };

  // --- FILTERING & NAVIGATION ---
  const getCurrentFolder = (): DriveFolder | null => {
    if (!tree) return null;
    let folder: DriveFolder = tree;
    for (const seg of selectedPath) {
      const next = folder.folders.find(f => f.name === seg);
      if (!next) return null;
      folder = next;
    }
    return folder;
  };

  const filterFoldersByPermissions = (folders: DriveFolder[]) => {
    if (userIsQuality) return folders;
    const userNameLower = currentUserData?.name?.toLowerCase() || '';
    return folders.filter(folder => {
      const folderNameLower = folder.name.toLowerCase();
      return folderNameLower.includes(userNameLower) || userNameLower.includes(folderNameLower) || folder.name === currentUserData?.name;
    });
  };

  const currentFolder = getCurrentFolder();
  
  const getAllFilesFromTree = (folder: DriveFolder): DriveFile[] => folder.files.concat(...folder.folders.map(getAllFilesFromTree));

  const filteredFolders = useMemo(() => {
    if (debouncedSearch) return [];
    if (!currentFolder) return [];
    
    let folders = currentFolder.folders;
    if (selectedPath.length === 0 && currentUserData) folders = filterFoldersByPermissions(folders);
    
    return folders.sort((a, b) => sortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));
  }, [currentFolder, debouncedSearch, sortOrder, currentUserData, userIsQuality, selectedPath]);

  const filteredFiles = useMemo(() => {
    if (!tree) return [];
    
    // Usa debouncedSearch en lugar de searchQuery directo
    let files = debouncedSearch ? allFilesCache : (currentFolder?.files || []);
    
    files = files.filter(f => f.name !== '.keep'); 

    if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        files = files.filter(f => f.name.toLowerCase().includes(q) || f.fullPath.toLowerCase().includes(q));
        
        // *** OPTIMIZACIÓN CRÍTICA ***
        // Limitar resultados a 100 para evitar congelar el navegador (INP Issue)
        if (files.length > 100) {
            files = files.slice(0, 100);
        }
    }
    
    return files.sort((a, b) => {
      if (sortBy === 'name') return sortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      const dateA = new Date(a.originalUpdated || a.updated).getTime();
      const dateB = new Date(b.originalUpdated || b.updated).getTime();
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });
  }, [currentFolder, debouncedSearch, tree, allFilesCache, sortBy, sortOrder]);

  // --- ACTIONS ---
  const handleToggleStar = async (file: DriveFile) => {
      if (!user) return;
      const newStarred = !file.starred;
      try {
          const id = file.fullPath.replace(/\//g, '_');
          await setDoc(doc(db, 'fileMetadata', id), { starred: newStarred }, { merge: true });
          logActivity(newStarred ? 'star' : 'unstar', file.name);
          reloadTree();
      } catch (e) { reloadTree(); }
  };

  const handleMarkReviewed = async (file: DriveFile) => {
      if (!user) return;
      const newReviewed = !file.reviewed;
      const userName = await getUserDisplayName(user);

      try {
          const id = file.fullPath.replace(/\//g, '_');
          await setDoc(doc(db, 'fileMetadata', id), { 
              reviewed: newReviewed, 
              reviewedBy: newReviewed ? user.email : null,
              reviewedByName: newReviewed ? userName : null,
              reviewedAt: newReviewed ? new Date().toISOString() : null
          }, { merge: true });
          logActivity(newReviewed ? 'review' : 'unreview', file.name);
          reloadTree();
      } catch (e) { console.error(e); reloadTree(); }
  };

  const handleMarkCompleted = async (file: DriveFile) => {
      if (!user) return;
      const newCompleted = !file.completed;
      const userName = await getUserDisplayName(user);

      try {
          const id = file.fullPath.replace(/\//g, '_');
          await setDoc(doc(db, 'fileMetadata', id), { 
              completed: newCompleted,
              completedBy: newCompleted ? user.email : null,
              completedByName: newCompleted ? userName : null,
              completedAt: newCompleted ? new Date().toISOString() : null
          }, { merge: true });
          logActivity(newCompleted ? 'complete' : 'uncomplete', file.name);
          reloadTree();
      } catch (e) { console.error(e); reloadTree(); }
  };

  const handleOpenFile = (file: DriveFile) => {
      logActivity('view', file.name);
      window.open(file.url, '_blank');
  };

  const handleShowInfo = (file: DriveFile) => {
      setFileInfoTarget(file);
      setFileInfoOpen(true);
  };

  const handleContextMenu = (event: React.MouseEvent, file: DriveFile) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, file });
  };

  const handleDeleteFile = async () => {
    if (!deleteFile) return;
    setLoading(true);
    try {
        await deleteObject(ref(storage, deleteFile.fullPath));
        await deleteDoc(doc(db, 'fileMetadata', deleteFile.fullPath.replace(/\//g, '_'))).catch(() => {});
        logActivity('delete', deleteFile.name);
        setDeleteFile(null);
        reloadTree();
    } catch (e) { console.error(e); setError("Error al eliminar"); setLoading(false); }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setCreateFolderOpen(false);
    setLoading(true);
    const pathArr = [...selectedPath, newFolderName.trim()];
    try {
        const fakeFileRef = ref(storage, [ROOT_PATH, ...pathArr, ".keep"].join("/"));
        await uploadBytes(fakeFileRef, new Uint8Array([0]));
        logActivity('create_folder', undefined, newFolderName.trim());
        setNewFolderName("");
        // Wait a bit for consistency
        await new Promise(resolve => setTimeout(resolve, 500));
        reloadTree();
    } catch(e) { console.error(e); setLoading(false); }
  };

  if (accessLoading) return (
    <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f8f9fa' }}>
        <CircularProgress size={48} />
    </Box>
  );

  if (!currentUserData) return (
      <Container maxWidth="sm" sx={{ py: 10, textAlign: 'center' }}>
          <SecurityIcon sx={{ fontSize: 80, color: 'error.main', mb: 2 }} />
          <Typography variant="h4" fontWeight={600} gutterBottom>Acceso Restringido</Typography>
          <Button variant="contained" onClick={() => onBack ? onBack() : goBack()} startIcon={<ArrowBackIcon />}>Volver</Button>
      </Container>
  );

  return (
    <Box 
        sx={{ minHeight: '100vh', bgcolor: '#f8f9fa' }}
        ref={dropZoneRef}
        onDragEnter={(e) => { e.preventDefault(); if(userIsQuality) setIsDragging(true); }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => { e.preventDefault(); if(e.currentTarget === dropZoneRef.current) setIsDragging(false); }}
        onDrop={async (e) => {
            e.preventDefault(); setIsDragging(false);
            // File upload logic would go here
        }}
    >
        {/* DRAG OVERLAY */}
        <Zoom in={isDragging}>
            <Box sx={{ position: 'fixed', inset: 0, bgcolor: alpha('#1a73e8', 0.1), border: '4px dashed #1a73e8', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 4 }}>
                    <CloudUploadIcon sx={{ fontSize: 80, color: '#1a73e8' }} />
                    <Typography variant="h5" fontWeight={600} mt={2}>Suelta los archivos</Typography>
                </Paper>
            </Box>
        </Zoom>

        {/* PROGRESS BAR */}
        {(loading || uploadProgress > 0) && (
            <LinearProgress variant={uploadProgress > 0 ? "determinate" : "indeterminate"} value={uploadProgress} sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, height: 4 }} />
        )}

        {/* ================= NAVBAR / TOOLBAR ================= */}
        <Paper 
            elevation={0} 
            sx={{ 
                borderBottom: '1px solid #e0e0e0', 
                bgcolor: 'white', 
                position: 'sticky', 
                top: 0, 
                zIndex: 1100,
                px: 2,
                py: 1.5
            }}
        >
            <Stack direction="row" alignItems="center" spacing={2}>
                <IconButton onClick={() => selectedPath.length ? setSelectedPath(prev => prev.slice(0, -1)) : (onBack ? onBack() : goBack())}>
                    <ArrowBackIcon />
                </IconButton>
                
                <Stack direction="row" alignItems="center" spacing={1} sx={{ display: { xs: 'none', md: 'flex' } }}>
                    <CloudIcon sx={{ color: '#1a73e8', fontSize: 32 }} />
                    <Typography variant="h6" color="text.primary" fontWeight={500}>Drive</Typography>
                </Stack>

                <Paper
                    component="form"
                    elevation={0}
                    sx={{ 
                        p: '2px 4px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        width: { xs: '100%', sm: 400, md: 600 }, 
                        bgcolor: '#f1f3f4',
                        borderRadius: '24px',
                        transition: 'box-shadow 0.2s',
                        '&:focus-within': { bgcolor: 'white', boxShadow: '0 1px 2px rgba(0,0,0,0.2), 0 1px 3px rgba(0,0,0,0.1)' }
                    }}
                >
                    <IconButton sx={{ p: '10px' }}><SearchIcon /></IconButton>
                    <InputBase
                        sx={{ ml: 1, flex: 1 }}
                        placeholder="Buscar en todo el Drive..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </Paper>

                <Box sx={{ flexGrow: 1 }} />

                <Stack direction="row" spacing={1}>
                    {userIsQuality && (
                        <>
                             <Tooltip title="Crear Carpeta">
                                <IconButton onClick={() => setCreateFolderOpen(true)}>
                                    <CreateNewFolderIcon />
                                </IconButton>
                            </Tooltip>
                            <Button
                                variant="contained"
                                startIcon={<AddIcon />}
                                onClick={(e) => setNewMenuAnchor(e.currentTarget)}
                                sx={{ borderRadius: '24px', textTransform: 'none', px: 3, bgcolor: '#1a73e8' }}
                            >
                                Nuevo
                            </Button>
                        </>
                    )}
                    <Tooltip title="Vista">
                        <IconButton onClick={() => setView(v => v === 'grid' ? 'list' : 'grid')}>
                            {view === 'grid' ? <ViewListIcon /> : <GridViewIcon />}
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Actividad">
                        <IconButton onClick={() => setActivityPanelOpen(true)}><HistoryIcon /></IconButton>
                    </Tooltip>
                </Stack>
            </Stack>

            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 2, px: 1 }}>
                <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />}>
                    <Link 
                        underline="hover" 
                        color="inherit" 
                        onClick={() => setSelectedPath([])} 
                        sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                    >
                        <HomeIcon sx={{ mr: 0.5 }} fontSize="inherit" /> Mi unidad
                    </Link>
                    {selectedPath.map((seg, idx) => (
                        <Link
                            key={idx}
                            underline="hover"
                            color={idx === selectedPath.length - 1 ? "text.primary" : "inherit"}
                            fontWeight={idx === selectedPath.length - 1 ? 600 : 400}
                            onClick={() => setSelectedPath(selectedPath.slice(0, idx + 1))}
                            sx={{ cursor: 'pointer' }}
                        >
                            {seg}
                        </Link>
                    ))}
                </Breadcrumbs>

                <Stack direction="row" spacing={2} alignItems="center">
                    <FormControl size="small" variant="standard">
                        <Select
                            value={`${sortBy}-${sortOrder}`}
                            onChange={(e) => {
                                const [s, o] = (e.target.value as string).split('-');
                                setSortBy(s as any); setSortOrder(o as any);
                            }}
                            disableUnderline
                            IconComponent={SortIcon}
                            sx={{ fontSize: '0.875rem' }}
                        >
                            <MenuItem value="name-asc">Nombre (A-Z)</MenuItem>
                            <MenuItem value="date-desc">Última modificación</MenuItem>
                        </Select>
                    </FormControl>
                </Stack>
            </Stack>
        </Paper>

        <input ref={fileInputRef} type="file" multiple hidden onChange={() => {}} />

        {/* ================= NEW MENU ================= */}
        <Menu
            anchorEl={newMenuAnchor}
            open={Boolean(newMenuAnchor)}
            onClose={() => setNewMenuAnchor(null)}
        >
            <MenuItem onClick={() => { setNewMenuAnchor(null); setCreateFolderOpen(true); }}>
                <ListItemIcon><CreateNewFolderIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Nueva Carpeta</ListItemText>
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => { setNewMenuAnchor(null); fileInputRef.current?.click(); }}>
                <ListItemIcon><FileUploadIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Subir Archivo</ListItemText>
            </MenuItem>
        </Menu>

        {/* ================= CONTENT AREA ================= */}
        <Container maxWidth={false} sx={{ py: 3, maxWidth: '1800px' }}>
            {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

            {/* EMPTY STATE */}
            {!loading && filteredFolders.length === 0 && filteredFiles.length === 0 && (
                <Box sx={{ textAlign: 'center', py: 10, opacity: 0.7 }}>
                    <img src="https://cdn-icons-png.flaticon.com/512/7486/7486754.png" alt="Empty" width={150} style={{ filter: 'grayscale(100%) opacity(0.5)' }} />
                    <Typography variant="h6" color="text.secondary" sx={{ mt: 3 }}>
                        {searchQuery ? "No se encontraron resultados" : "Esta carpeta está vacía"}
                    </Typography>
                </Box>
            )}

            {/* FOLDERS GRID (Ocultar si estamos buscando) */}
            {!debouncedSearch && filteredFolders.length > 0 && (
                <Box sx={{ mb: 4 }}>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2, fontWeight: 500 }}>Carpetas</Typography>
                    <Grid container spacing={2}>
                        {filteredFolders.map((folder, idx) => (
                            <Grid item xs={12} sm={6} md={4} lg={3} xl={2} key={idx}>
                                <Paper
                                    onClick={() => setSelectedPath([...selectedPath, folder.name])}
                                    elevation={0}
                                    sx={{
                                        p: 1.5,
                                        display: 'flex',
                                        alignItems: 'center',
                                        cursor: 'pointer',
                                        border: '1px solid #e0e0e0',
                                        borderRadius: '12px',
                                        '&:hover': { bgcolor: '#f1f3f4' }
                                    }}
                                >
                                    <FolderIcon sx={{ color: '#5f6368', mr: 2 }} />
                                    <Typography variant="body2" fontWeight={500} noWrap>{folder.name}</Typography>
                                </Paper>
                            </Grid>
                        ))}
                    </Grid>
                </Box>
            )}

            {/* FILES GRID/LIST */}
            {filteredFiles.length > 0 && (
                <Box>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" color="text.secondary" fontWeight={500}>
                            {debouncedSearch ? `Resultados de búsqueda (${filteredFiles.length})` : `Archivos (${filteredFiles.length})`}
                        </Typography>
                        {userIsQuality && selectionMode && (
                            <Button size="small" color="error" onClick={() => setSelectedFiles([])}>Cancelar selección</Button>
                        )}
                    </Stack>

                    {view === 'grid' ? (
                        <Grid container spacing={2}>
                            {filteredFiles.map((file, idx) => (
                                <Grid item xs={12} sm={6} md={4} lg={3} xl={2} key={idx}>
                                    <FileCard
                                        file={file}
                                        isSelected={selectedFiles.includes(file.fullPath)}
                                        selectionMode={selectionMode}
                                        onSelect={(path, e) => {
                                            const newSel = e.target.checked ? [...selectedFiles, path] : selectedFiles.filter(p => p !== path);
                                            setSelectedFiles(newSel);
                                            setSelectionMode(newSel.length > 0);
                                        }}
                                        onToggleStar={handleToggleStar}
                                        onMenuOpen={(e, f) => {
                                            setSelectedFile(f);
                                            setActionMenuAnchor(e.currentTarget);
                                        }}
                                        onClick={() => selectionMode ? null : handleOpenFile(file)}
                                    />
                                </Grid>
                            ))}
                        </Grid>
                    ) : (
                        <Paper elevation={0} variant="outlined" sx={{ borderRadius: 2 }}>
                            <List disablePadding>
                                {filteredFiles.map((file, idx) => {
                                    const { displayName, displayDate } = extractFileInfo(file.name, file.updated, file.originalUpdated);
                                    return (
                                        <React.Fragment key={idx}>
                                            <ListItemButton
                                                onClick={() => handleOpenFile(file)}
                                                onContextMenu={(e) => handleContextMenu(e, file)}
                                                sx={{ borderBottom: '1px solid #f0f0f0', '&:hover': { bgcolor: '#f8f9fa' } }}
                                            >
                                                <ListItemIcon>{getFileIconComponent(file.name)}</ListItemIcon>
                                                <ListItemText 
                                                    primary={<Typography variant="body2" fontWeight={500}>{displayName}</Typography>}
                                                    secondary={
                                                        <Stack direction="column" spacing={0.5} component="span">
                                                            <Stack direction="row" spacing={1} alignItems="center">
                                                                <Typography variant="caption">{displayDate}</Typography>
                                                                <Typography variant="caption">•</Typography>
                                                                <Typography variant="caption">{formatFileSize(file.size)}</Typography>
                                                            </Stack>
                                                            
                                                            {(file.completedByName || file.reviewedByName) && (
                                                                <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 0.5 }}>
                                                                    {file.completedByName && (
                                                                        <Typography variant="caption" sx={{ color: '#1a73e8', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                           <AssignmentTurnedInIcon sx={{ fontSize: 14 }} /> {file.completedByName}
                                                                        </Typography>
                                                                    )}
                                                                    {file.reviewedByName && (
                                                                        <Typography variant="caption" sx={{ color: '#34A853', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                           <CheckCircleIcon sx={{ fontSize: 14 }} /> {file.reviewedByName}
                                                                        </Typography>
                                                                    )}
                                                                </Stack>
                                                            )}
                                                        </Stack>
                                                    }
                                                />
                                                {file.starred && <StarIcon fontSize="small" sx={{ color: '#fbbc04', mr: 2 }} />}
                                                <IconButton size="small" onClick={(e) => { e.stopPropagation(); setSelectedFile(file); setActionMenuAnchor(e.currentTarget); }}>
                                                    <MoreVertIcon fontSize="small" />
                                                </IconButton>
                                            </ListItemButton>
                                        </React.Fragment>
                                    );
                                })}
                            </List>
                        </Paper>
                    )}
                </Box>
            )}
        </Container>

        {/* ================= SIDE DRAWER (DETAILS) ================= */}
        <Drawer
            anchor="right"
            open={fileInfoOpen}
            onClose={() => setFileInfoOpen(false)}
            variant="persistent"
            PaperProps={{ sx: { width: { xs: '100%', md: 360 }, borderLeft: '1px solid #e0e0e0', mt: 8, height: 'calc(100% - 64px)', boxShadow: 'none' } }}
        >
            {fileInfoTarget && (
                <Box sx={{ p: 3 }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3}>
                        <Typography variant="h6" fontWeight={600}>Detalles</Typography>
                        <IconButton onClick={() => setFileInfoOpen(false)}><CloseIcon /></IconButton>
                    </Stack>

                    <Box sx={{ height: 180, borderRadius: 3, bgcolor: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3, border: '1px solid #eee' }}>
                        {getFileIconComponent(fileInfoTarget.name, 80)}
                    </Box>

                    <Stack spacing={2.5}>
                        <Box>
                            <Typography variant="caption" color="text.secondary">Nombre</Typography>
                            <Typography variant="body2" fontWeight={500} sx={{ wordBreak: 'break-all' }}>{fileInfoTarget.name}</Typography>
                        </Box>
                        <Box>
                            <Typography variant="caption" color="text.secondary">Tamaño</Typography>
                            <Typography variant="body2">{formatFileSize(fileInfoTarget.size)}</Typography>
                        </Box>
                        <Box>
                            <Typography variant="caption" color="text.secondary">Ubicación</Typography>
                            <Typography variant="body2">{fileInfoTarget.folderPath || 'Mi unidad'}</Typography>
                        </Box>
                        
                        <Divider />
                        
                        <Typography variant="subtitle2" fontWeight={600}>Estado de Calidad</Typography>
                        
                        <Stack direction="row" spacing={1}>
                            <Chip 
                                icon={<CheckCircleIcon />} 
                                label={fileInfoTarget.reviewed ? "Revisado" : "Pendiente"} 
                                color={fileInfoTarget.reviewed ? "success" : "default"} 
                                size="small" variant={fileInfoTarget.reviewed ? "filled" : "outlined"}
                            />
                            <Chip 
                                icon={<AssignmentTurnedInIcon />} 
                                label={fileInfoTarget.completed ? "Realizado" : "En proceso"} 
                                color={fileInfoTarget.completed ? "primary" : "default"} 
                                size="small" variant={fileInfoTarget.completed ? "filled" : "outlined"}
                            />
                        </Stack>

                        {fileInfoTarget.completedByName && (
                            <Alert severity="info" icon={<AssignmentTurnedInIcon fontSize="inherit"/>} sx={{ py: 0.5, '& .MuiAlert-message': { width: '100%' } }}>
                                <Typography variant="caption" display="block" sx={{ lineHeight: 1.2, mb: 0.5 }}>Realizado por:</Typography>
                                <Typography variant="body2" fontWeight={600}>{fileInfoTarget.completedByName}</Typography>
                                {fileInfoTarget.completedAt && (
                                    <Typography variant="caption" color="text.secondary">
                                       {new Date(fileInfoTarget.completedAt).toLocaleDateString()}
                                    </Typography>
                                )}
                            </Alert>
                        )}

                        {fileInfoTarget.reviewedByName && (
                            <Alert severity="success" icon={<CheckCircleIcon fontSize="inherit"/>} sx={{ py: 0.5, '& .MuiAlert-message': { width: '100%' } }}>
                                <Typography variant="caption" display="block" sx={{ lineHeight: 1.2, mb: 0.5 }}>Revisado por:</Typography>
                                <Typography variant="body2" fontWeight={600}>{fileInfoTarget.reviewedByName}</Typography>
                                {fileInfoTarget.reviewedAt && (
                                    <Typography variant="caption" color="text.secondary">
                                       {new Date(fileInfoTarget.reviewedAt).toLocaleDateString()}
                                    </Typography>
                                )}
                            </Alert>
                        )}
                    </Stack>
                </Box>
            )}
        </Drawer>

        {/* ================= ACTIVITY DRAWER ================= */}
        <Drawer anchor="right" open={activityPanelOpen} onClose={() => setActivityPanelOpen(false)}>
            <Box sx={{ width: { xs: '100%', sm: 400 }, p: 2 }}>
                <Typography variant="h6" sx={{ mb: 2, px: 2 }}>Historial de Actividad</Typography>
                <Timeline position="right">
                    {activities.map((act, idx) => (
                        <TimelineItem key={idx}>
                            <TimelineOppositeContent color="text.secondary" sx={{ fontSize: 10, flex: 0.2 }}>
                                {new Date(act.timestamp).toLocaleDateString()}
                            </TimelineOppositeContent>
                            <TimelineSeparator>
                                <TimelineDot color="primary" variant="outlined" sx={{ p: 0.5 }} />
                                <TimelineConnector />
                            </TimelineSeparator>
                            <TimelineContent>
                                <Typography variant="body2" fontWeight={600}>{act.userName}</Typography>
                                <Typography variant="caption" color="text.secondary">{getActivityDescription(act)}</Typography>
                            </TimelineContent>
                        </TimelineItem>
                    ))}
                </Timeline>
            </Box>
        </Drawer>

        {/* ================= MAIN ACTION MENU (3 DOTS) ================= */}
        <Menu
            anchorEl={actionMenuAnchor}
            open={Boolean(actionMenuAnchor)}
            onClose={() => { setActionMenuAnchor(null); setSelectedFile(null); }}
            PaperProps={{ sx: { minWidth: 220, borderRadius: 2, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' } }}
        >
            <MenuItem onClick={() => { if(selectedFile) handleShowInfo(selectedFile); setActionMenuAnchor(null); }}>
                <ListItemIcon><InfoIcon fontSize="small" /></ListItemIcon> Detalle
            </MenuItem>
            <MenuItem onClick={() => { if(selectedFile) handleOpenFile(selectedFile); setActionMenuAnchor(null); }}>
                <ListItemIcon><DownloadIcon fontSize="small" /></ListItemIcon> Descargar
            </MenuItem>

            <Divider />

            {/* BOTONES DE ACCIÓN POR ROL */}
            {userIsQuality && (
                <MenuItem onClick={() => { if(selectedFile) handleMarkReviewed(selectedFile); setActionMenuAnchor(null); }}>
                    <ListItemIcon>
                        <CheckCircleIcon fontSize="small" color={selectedFile?.reviewed ? "success" : "action"} />
                    </ListItemIcon>
                    <ListItemText>
                        {selectedFile?.reviewed ? "Desmarcar Revisado" : "Marcar Revisado"}
                    </ListItemText>
                </MenuItem>
            )}

            {/* AQUI ESTA EL CAMBIO: AHORA METROLOGO O CALIDAD PUEDEN MARCAR REALIZADO */}
            {(userIsMetrologist || userIsQuality) && (
                <MenuItem onClick={() => { if(selectedFile) handleMarkCompleted(selectedFile); setActionMenuAnchor(null); }}>
                    <ListItemIcon>
                        <AssignmentTurnedInIcon fontSize="small" color={selectedFile?.completed ? "primary" : "action"} />
                    </ListItemIcon>
                    <ListItemText>
                        {selectedFile?.completed ? "Desmarcar Realizado" : "Marcar Realizado"}
                    </ListItemText>
                </MenuItem>
            )}

            {userIsQuality && (
                <Box>
                    <Divider />
                    <MenuItem onClick={() => { setRenameTarget(selectedFile); setRenameDialogOpen(true); setActionMenuAnchor(null); }}>
                        <ListItemIcon><DriveFileRenameOutlineIcon fontSize="small" /></ListItemIcon> Cambiar nombre
                    </MenuItem>
                    <MenuItem sx={{ color: 'error.main' }} onClick={() => { setDeleteFile(selectedFile); setActionMenuAnchor(null); }}>
                        <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon> Eliminar
                    </MenuItem>
                </Box>
            )}
        </Menu>

        {/* ================= CONTEXT MENU (RIGHT CLICK) ================= */}
        <Menu
            open={contextMenu !== null}
            onClose={() => setContextMenu(null)}
            anchorReference="anchorPosition"
            anchorPosition={
                contextMenu !== null
                    ? { top: contextMenu.y, left: contextMenu.x }
                    : undefined
            }
            PaperProps={{ sx: { minWidth: 220, borderRadius: 2 } }}
        >
            <MenuItem onClick={() => { if(contextMenu?.file) handleShowInfo(contextMenu.file); setContextMenu(null); }}>
                <ListItemIcon><InfoIcon fontSize="small" /></ListItemIcon> Detalle
            </MenuItem>
            <MenuItem onClick={() => { if(contextMenu?.file) handleOpenFile(contextMenu.file); setContextMenu(null); }}>
                <ListItemIcon><DownloadIcon fontSize="small" /></ListItemIcon> Descargar
            </MenuItem>
            
            <Divider />

            {userIsQuality && contextMenu?.file && (
                <MenuItem onClick={() => { handleMarkReviewed(contextMenu.file!); setContextMenu(null); }}>
                    <ListItemIcon>
                        <CheckCircleIcon fontSize="small" color={contextMenu.file.reviewed ? "success" : "action"} />
                    </ListItemIcon>
                    <ListItemText>{contextMenu.file.reviewed ? "Desmarcar Revisado" : "Marcar Revisado"}</ListItemText>
                </MenuItem>
            )}

            {/* AQUI TAMBIEN ESTA EL CAMBIO: AHORA METROLOGO O CALIDAD PUEDEN MARCAR REALIZADO */}
            {(userIsMetrologist || userIsQuality) && contextMenu?.file && (
                <MenuItem onClick={() => { handleMarkCompleted(contextMenu.file!); setContextMenu(null); }}>
                    <ListItemIcon>
                        <AssignmentTurnedInIcon fontSize="small" color={contextMenu.file.completed ? "primary" : "action"} />
                    </ListItemIcon>
                    <ListItemText>{contextMenu.file.completed ? "Desmarcar Realizado" : "Marcar Realizado"}</ListItemText>
                </MenuItem>
            )}

            {userIsQuality && (
                <Box>
                    <Divider />
                    <MenuItem onClick={() => { setRenameTarget(contextMenu?.file || null); setRenameDialogOpen(true); setContextMenu(null); }}>
                        <ListItemIcon><DriveFileRenameOutlineIcon fontSize="small" /></ListItemIcon> Cambiar nombre
                    </MenuItem>
                    <MenuItem sx={{ color: 'error.main' }} onClick={() => { setDeleteFile(contextMenu?.file || null); setContextMenu(null); }}>
                        <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon> Eliminar
                    </MenuItem>
                </Box>
            )}
        </Menu>
        
        {/* Rename Dialog */}
        <Dialog open={renameDialogOpen} onClose={() => setRenameDialogOpen(false)} maxWidth="xs" fullWidth>
            <DialogTitle>Renombrar</DialogTitle>
            <DialogContent>
                <TextField 
                    fullWidth margin="dense" 
                    label="Nuevo nombre" 
                    value={newName} 
                    onChange={(e) => setNewName(e.target.value)} 
                    variant="outlined"
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setRenameDialogOpen(false)}>Cancelar</Button>
                <Button variant="contained" onClick={() => {/* Implement Logic */}}>Aceptar</Button>
            </DialogActions>
        </Dialog>
        
        {/* Delete Dialog */}
        <Dialog open={Boolean(deleteFile)} onClose={() => setDeleteFile(null)} maxWidth="xs" fullWidth>
            <DialogTitle>¿Eliminar archivo?</DialogTitle>
            <DialogContent>
                <Typography variant="body2">Esta acción no se puede deshacer.</Typography>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setDeleteFile(null)}>Cancelar</Button>
                <Button variant="contained" color="error" onClick={handleDeleteFile}>Eliminar</Button>
            </DialogActions>
        </Dialog>

        {/* Create Folder Dialog */}
        <Dialog open={createFolderOpen} onClose={() => setCreateFolderOpen(false)} maxWidth="xs" fullWidth>
            <DialogTitle>Nueva Carpeta</DialogTitle>
            <DialogContent>
                <TextField
                    autoFocus margin="dense" label="Nombre" fullWidth variant="outlined"
                    value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setCreateFolderOpen(false)}>Cancelar</Button>
                <Button variant="contained" onClick={handleCreateFolder}>Crear</Button>
            </DialogActions>
        </Dialog>

        {/* Floating Action Button for Mobile */}
        {isMobile && userIsQuality && (
            <Fab color="primary" sx={{ position: 'fixed', bottom: 16, right: 16 }} onClick={() => setCreateFolderOpen(true)}>
                <AddIcon />
            </Fab>
        )}
    </Box>
  );
}