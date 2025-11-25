import React, { useState, useEffect, useRef, useCallback } from "react";
import { ref, listAll, getDownloadURL, uploadBytes, deleteObject, getMetadata } from "firebase/storage";
import { doc, getDoc, updateDoc, deleteDoc, setDoc, collection, addDoc, query, where, limit, getDocs } from "firebase/firestore";
import { storage, db, auth } from "../utils/firebase"; // Asegúrate que la ruta sea correcta
import { useAuthState } from "react-firebase-hooks/auth";
import { useNavigation } from "../hooks/useNavigation"; // Asegúrate que la ruta sea correcta
import {
  Typography, Box, Grid, Button, Chip, IconButton, Tooltip, Paper, useTheme, alpha, TextField,
  Zoom, useMediaQuery, Stack, Dialog, DialogTitle, DialogContent, DialogActions, Breadcrumbs, Link,
  Alert, Select, FormControl, MenuItem, Menu, ListItemIcon, ListItemText, Divider, Container, Drawer,
  InputBase, Checkbox, LinearProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Skeleton, Avatar
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
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ImageIcon from '@mui/icons-material/Image';

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
  starred?: boolean;
  size?: number;
  contentType?: string;
  type: 'file';
}

interface DriveFolder {
  name: string;
  fullPath: string;
  type: 'folder';
}

type DriveItem = DriveFile | DriveFolder;

interface ActivityLog {
  action: string;
  fileName?: string;
  folderName?: string;
  userName: string;
  timestamp: string;
  details?: string;
}

interface UserData {
  name?: string;
  correo?: string;
  puesto?: string;
  [key: string]: any;
}

// --- HELPERS ---
const formatFileSize = (bytes?: number): string => {
  if (!bytes) return '-';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(1) + ' GB';
};

const extractFileInfo = (fileName: string, updatedDate?: string) => {
  // Elimina extensiones comunes para visualización
  const baseName = fileName.replace(/\.(pdf|xlsx|docx|jpg|png|pptx)$/i, "").replace(/_/g, " ");
  const displayDate = updatedDate
    ? new Date(updatedDate).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })
    : '-';
  return { displayName: baseName, displayDate };
};

const getFileColor = (fileName: string) => {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return '#EA4335';
  if (lower.endsWith('.xls') || lower.endsWith('.xlsx') || lower.endsWith('.csv')) return '#34A853';
  if (lower.endsWith('.doc') || lower.endsWith('.docx')) return '#4285F4';
  if (lower.endsWith('.ppt') || lower.endsWith('.pptx')) return '#FBBC04';
  if (lower.match(/\.(jpg|jpeg|png|gif)$/)) return '#A142F4';
  return '#5f6368';
};

const getFileIcon = (fileName: string, fontSize: number = 24) => {
    const color = getFileColor(fileName);
    const style = { fontSize, color };
    const lower = fileName.toLowerCase();

    if (lower.endsWith('.pdf')) return <PictureAsPdfIcon style={style} />;
    if (lower.endsWith('.xls') || lower.endsWith('.xlsx')) return <TableChartIcon style={style} />;
    if (lower.endsWith('.doc') || lower.endsWith('.docx')) return <DescriptionIcon style={style} />;
    if (lower.match(/\.(jpg|jpeg|png|gif)$/)) return <ImageIcon style={style} />;
    return <InsertDriveFileIcon style={style} />;
};

const ROOT_PATH = "worksheets";

// ============================================================================
// ========================= COMPONENT: COMPACT FILE CARD =====================
// ============================================================================
const FileCard = ({ 
    file, isSelected, selectionMode, onSelect, onMenuOpen, onClick 
}: {
    file: DriveFile;
    isSelected: boolean;
    selectionMode: boolean;
    onSelect: (path: string, e: any) => void;
    onMenuOpen: (e: React.MouseEvent, file: DriveFile) => void;
    onClick: () => void;
}) => {
    const { displayName, displayDate } = extractFileInfo(file.name, file.originalUpdated || file.updated);

    return (
        <Paper
            elevation={isSelected ? 3 : 0}
            onClick={onClick}
            onContextMenu={(e) => { e.preventDefault(); onMenuOpen(e, file); }}
            sx={{
                position: 'relative',
                borderRadius: '12px',
                border: isSelected ? '2px solid #1a73e8' : '1px solid #e0e0e0',
                bgcolor: isSelected ? alpha('#1a73e8', 0.04) : 'white',
                overflow: 'hidden',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
                height: 160, // Altura fija más compacta
                display: 'flex',
                flexDirection: 'column',
                '&:hover': {
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    transform: 'translateY(-2px)',
                    '& .more-btn': { opacity: 1 }
                }
            }}
        >
            {selectionMode && (
                <Checkbox
                    checked={isSelected}
                    onChange={(e) => onSelect(file.fullPath, e)}
                    onClick={(e) => e.stopPropagation()}
                    size="small"
                    sx={{ position: 'absolute', top: 4, left: 4, zIndex: 2, p: 0.5, bgcolor: 'rgba(255,255,255,0.8)', borderRadius: '50%' }}
                />
            )}

            {/* Icon Area */}
            <Box sx={{ 
                height: 90, 
                bgcolor: alpha(getFileColor(file.name), 0.08),
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                position: 'relative'
            }}>
                {getFileIcon(file.name, 48)}
                
                {/* Badges */}
                <Stack direction="row" spacing={0.5} sx={{ position: 'absolute', bottom: 6, right: 6 }}>
                    {file.reviewed && <CheckCircleIcon sx={{ fontSize: 16, color: '#34A853', bgcolor: 'white', borderRadius: '50%' }} />}
                    {file.completed && <AssignmentTurnedInIcon sx={{ fontSize: 16, color: '#1a73e8', bgcolor: 'white', borderRadius: '50%' }} />}
                    {file.starred && <StarIcon sx={{ fontSize: 16, color: '#fbbc04', bgcolor: 'white', borderRadius: '50%' }} />}
                </Stack>
            </Box>

            {/* Info Area */}
            <Box sx={{ p: 1.5, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
                    <Typography variant="body2" fontWeight={600} noWrap title={displayName} sx={{ fontSize: '0.85rem' }}>
                        {displayName}
                    </Typography>
                    <IconButton 
                        className="more-btn"
                        size="small" 
                        onClick={(e) => { e.stopPropagation(); onMenuOpen(e, file); }}
                        sx={{ opacity: 0, transition: 'opacity 0.2s', p: 0.5, mt: -0.5, mr: -0.5 }}
                    >
                        <MoreVertIcon fontSize="small" />
                    </IconButton>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                    {displayDate}
                </Typography>
            </Box>
        </Paper>
    );
};

// ============================================================================
// =========================== MAIN COMPONENT =================================
// ============================================================================

export default function DriveScreen({ onBack }: { onBack?: () => void }) {
  const [user] = useAuthState(auth);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { goBack } = useNavigation();

  // --- DATA STATES ---
  const [currentFiles, setCurrentFiles] = useState<DriveFile[]>([]);
  const [currentFolders, setCurrentFolders] = useState<DriveFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPath, setLoadingPath] = useState(false); // Para mostrar loading al cambiar carpeta
  const [error, setError] = useState<string | null>(null);

  // --- UI STATES ---
  const [selectedPath, setSelectedPath] = useState<string[]>([]);
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<'name' | 'date'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // --- ACTION STATES ---
  const [selectedIds, setSelectedIds] = useState<string[]>([]); // Usar fullPath como ID
  const [selectionMode, setSelectionMode] = useState(false);
  
  // Menus
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: DriveItem | null } | null>(null);
  const [actionAnchor, setActionAnchor] = useState<HTMLElement | null>(null);
  const [activeItem, setActiveItem] = useState<DriveItem | null>(null); // Item interactuado
  const [newMenuAnchor, setNewMenuAnchor] = useState<HTMLElement | null>(null);

  // Dialogs
  const [infoOpen, setInfoOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveDestPath, setMoveDestPath] = useState<string[]>([]);
  const [moveFoldersList, setMoveFoldersList] = useState<DriveFolder[]>([]);

  const [activities, setActivities] = useState<ActivityLog[]>([]);
  
  // Permissions
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isQuality, setIsQuality] = useState(false);
  const [isMetrologist, setIsMetrologist] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- LOAD PERMISSIONS ---
  useEffect(() => {
    const initUser = async () => {
        if (!user?.email) return;
        try {
            const q = query(collection(db, 'usuarios'), where('correo', '==', user.email), limit(1));
            const snap = await getDocs(q);
            if (!snap.empty) {
                const data = snap.docs[0].data() as UserData;
                setUserData(data);
                setIsQuality(['calidad', 'quality'].includes(data.puesto?.toLowerCase() || ''));
                setIsMetrologist(['metrólogo', 'metrologist', 'metrologo'].includes(data.puesto?.toLowerCase() || ''));
            }
        } catch (e) { console.error("Err permisos", e); }
    };
    initUser();
  }, [user]);

  // --- FETCHING LOGIC (LAZY LOAD) ---
  const fetchCurrentDirectory = useCallback(async () => {
      setLoadingPath(true);
      setError(null);
      const fullPath = [ROOT_PATH, ...selectedPath].join("/");
      const dirRef = ref(storage, fullPath);

      try {
          const res = await listAll(dirRef);
          
          // 1. Carpetas
          const foldersData: DriveFolder[] = res.prefixes.map(p => ({
              name: p.name,
              fullPath: p.fullPath,
              type: 'folder'
          }));

          // Filtrado por permisos de carpeta (si no es calidad)
          let filteredFolders = foldersData;
          if (selectedPath.length === 0 && !isQuality && userData) {
             const uName = userData.name?.toLowerCase() || '';
             filteredFolders = foldersData.filter(f => 
                 f.name.toLowerCase().includes(uName) || uName.includes(f.name.toLowerCase()) || f.name === userData.name
             );
          }

          // 2. Archivos
          const filesPromises = res.items.map(async (itemRef) => {
              // Obtenemos URL y Metadatos básicos del Storage
              const [url, metaStorage] = await Promise.all([
                  getDownloadURL(itemRef),
                  getMetadata(itemRef)
              ]);

              // Obtenemos Metadatos extendidos de Firestore (status, reviews, etc)
              const metaId = itemRef.fullPath.replace(/\//g, '_');
              const metaDocRef = doc(db, 'fileMetadata', metaId);
              const metaDoc = await getDoc(metaDocRef);
              const firestoreData = metaDoc.exists() ? metaDoc.data() : {};

              return {
                  name: itemRef.name,
                  url,
                  fullPath: itemRef.fullPath,
                  updated: metaStorage.updated,
                  size: metaStorage.size,
                  contentType: metaStorage.contentType,
                  type: 'file',
                  ...firestoreData, // Merge Firestore data (reviewed, completed, etc)
                  originalUpdated: firestoreData.originalUpdated || metaStorage.updated
              } as DriveFile;
          });

          const filesData = await Promise.all(filesPromises);
          
          // Filtrar el archivo placeholder .keep
          const cleanFiles = filesData.filter(f => f.name !== '.keep');

          setCurrentFolders(filteredFolders);
          setCurrentFiles(cleanFiles);
      } catch (err) {
          console.error(err);
          setError("Error cargando carpeta. Verifica tu conexión.");
      } finally {
          setLoading(false);
          setLoadingPath(false);
      }
  }, [selectedPath, isQuality, userData]);

  useEffect(() => {
      if (userData) fetchCurrentDirectory();
  }, [fetchCurrentDirectory, userData]);

  // --- SORTING & SEARCHING ---
  const processedContent = React.useMemo(() => {
    let folders = [...currentFolders];
    let files = [...currentFiles];

    // Search (Simple Client Side for current view - Idealmente Server Side para todo el drive)
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        folders = folders.filter(f => f.name.toLowerCase().includes(q));
        files = files.filter(f => f.name.toLowerCase().includes(q));
    }

    // Sort
    const sortFn = (a: any, b: any) => {
        if (sortBy === 'name') {
            return sortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        } else {
            const dateA = new Date(a.updated || 0).getTime();
            const dateB = new Date(b.updated || 0).getTime();
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        }
    };

    return { folders: folders.sort(sortFn), files: files.sort(sortFn) };
  }, [currentFolders, currentFiles, searchQuery, sortBy, sortOrder]);


  // --- OPERATIONS ---
  const handleCreateFolder = async () => {
      if (!newFolderName.trim()) return;
      setCreateFolderOpen(false);
      setLoadingPath(true);
      try {
          const path = [...selectedPath, newFolderName.trim()];
          const dummyRef = ref(storage, [ROOT_PATH, ...path, ".keep"].join("/"));
          await uploadBytes(dummyRef, new Uint8Array([0]));
          logActivity('create_folder', undefined, newFolderName);
          setNewFolderName("");
          fetchCurrentDirectory();
      } catch (e) { console.error(e); setLoadingPath(false); }
  };

  const handleDelete = async () => {
      if (!activeItem || activeItem.type === 'folder') return; // Simple folder deletion blocked for safety in this demo
      setDeleteOpen(false);
      try {
          await deleteObject(ref(storage, activeItem.fullPath));
          const metaId = activeItem.fullPath.replace(/\//g, '_');
          await deleteDoc(doc(db, 'fileMetadata', metaId));
          logActivity('delete', activeItem.name);
          // Optimistic update
          setCurrentFiles(prev => prev.filter(f => f.fullPath !== activeItem.fullPath));
      } catch (e) { console.error(e); fetchCurrentDirectory(); }
  };

  const handleRename = async () => {
      if (!activeItem || !renameName.trim() || activeItem.type === 'folder') return; // Folder rename complex in Firebase Storage
      setRenameOpen(false);
      const oldPath = activeItem.fullPath;
      const folderPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
      const extension = activeItem.name.split('.').pop();
      const newFileName = renameName.endsWith(`.${extension}`) ? renameName : `${renameName}.${extension}`;
      const newPath = `${folderPath}/${newFileName}`;

      try {
          setLoadingPath(true);
          // 1. Copy
          const oldRef = ref(storage, oldPath);
          const newRef = ref(storage, newPath);
          const url = await getDownloadURL(oldRef);
          const blob = await (await fetch(url)).blob();
          await uploadBytes(newRef, blob);
          
          // 2. Move Metadata
          const oldMetaId = oldPath.replace(/\//g, '_');
          const newMetaId = newPath.replace(/\//g, '_');
          const oldMetaSnap = await getDoc(doc(db, 'fileMetadata', oldMetaId));
          if (oldMetaSnap.exists()) {
              await setDoc(doc(db, 'fileMetadata', newMetaId), { ...oldMetaSnap.data(), filePath: newPath });
              await deleteDoc(doc(db, 'fileMetadata', oldMetaId));
          }

          // 3. Delete Old
          await deleteObject(oldRef);
          
          logActivity('rename', activeItem.name, undefined, undefined, undefined, `a ${newFileName}`);
          fetchCurrentDirectory();
      } catch (e) { console.error(e); setLoadingPath(false); }
  };

  const handleUpdateStatus = async (field: 'reviewed' | 'completed', value: boolean) => {
      if (!activeItem || activeItem.type !== 'file' || !user) return;
      const file = activeItem as DriveFile;
      
      // Optimistic UI
      const updatedFiles = currentFiles.map(f => {
          if (f.fullPath === file.fullPath) {
              return { ...f, [field]: value, [`${field}ByName`]: userData?.name || user.email };
          }
          return f;
      });
      setCurrentFiles(updatedFiles);

      try {
          const metaId = file.fullPath.replace(/\//g, '_');
          await setDoc(doc(db, 'fileMetadata', metaId), {
              [field]: value,
              [`${field}By`]: value ? user.email : null,
              [`${field}ByName`]: value ? (userData?.name || user.email) : null,
              [`${field}At`]: value ? new Date().toISOString() : null
          }, { merge: true });
          logActivity(value ? field : `un${field}`, file.name);
      } catch (e) { fetchCurrentDirectory(); } // Revert on error
  };

  const logActivity = async (action: string, fileName?: string, folderName?: string, fromPath?: string, toPath?: string, details?: string) => {
      if (!user) return;
      await addDoc(collection(db, 'driveActivity'), {
          action, fileName, folderName, userEmail: user.email, userName: userData?.name || 'Usuario', timestamp: new Date().toISOString(), path: selectedPath.join('/'), details
      });
  };

  // --- RENDER HELPERS ---
  if (loading && selectedPath.length === 0) return (
     <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
         <Stack alignItems="center" spacing={2}>
            <LinearProgress sx={{ width: 200 }} />
            <Typography variant="body2" color="text.secondary">Cargando Drive...</Typography>
         </Stack>
     </Box>
  );

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8f9fa' }}>
        {/* ================= HEADER ================= */}
        <Paper elevation={0} sx={{ borderBottom: '1px solid #e0e0e0', position: 'sticky', top: 0, zIndex: 10, px: 2, py: 1.5 }}>
            <Stack direction="row" alignItems="center" spacing={2}>
                <IconButton onClick={() => selectedPath.length ? setSelectedPath(prev => prev.slice(0, -1)) : (onBack ? onBack() : goBack())}>
                    <ArrowBackIcon />
                </IconButton>
                <Typography variant="h6" fontWeight={600} color="primary" sx={{ display: { xs: 'none', sm: 'block' } }}>
                    Drive
                </Typography>
                
                {/* Search Bar */}
                <Paper component="form" elevation={0} sx={{ 
                    p: '2px 12px', display: 'flex', alignItems: 'center', 
                    width: { xs: '100%', md: 500 }, bgcolor: '#f1f3f4', borderRadius: '24px' 
                }}>
                    <SearchIcon color="action" />
                    <InputBase 
                        sx={{ ml: 1, flex: 1 }} 
                        placeholder="Buscar en esta carpeta..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </Paper>

                <Box flexGrow={1} />
                
                {isQuality && (
                    <Button 
                        variant="contained" 
                        startIcon={<AddIcon />} 
                        sx={{ borderRadius: 8, textTransform: 'none', px: 3 }}
                        onClick={(e) => setNewMenuAnchor(e.currentTarget)}
                    >
                        Nuevo
                    </Button>
                )}
                
                <IconButton onClick={() => setView(view === 'grid' ? 'table' : 'grid')}>
                    {view === 'grid' ? <ViewListIcon /> : <GridViewIcon />}
                </IconButton>
            </Stack>

            {/* Breadcrumbs & Filters */}
            <Stack direction="row" alignItems="center" justifyContent="space-between" mt={2}>
                <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />}>
                    <Link 
                        component="button" variant="body2" underline="hover" color="inherit"
                        onClick={() => setSelectedPath([])}
                        sx={{ display: 'flex', alignItems: 'center' }}
                    >
                        <HomeIcon sx={{ mr: 0.5, fontSize: 20 }} /> Mi Unidad
                    </Link>
                    {selectedPath.map((folder, idx) => (
                        <Link 
                            key={idx} component="button" variant="body2" underline="hover" 
                            color={idx === selectedPath.length - 1 ? "text.primary" : "inherit"}
                            fontWeight={idx === selectedPath.length - 1 ? 700 : 400}
                            onClick={() => setSelectedPath(selectedPath.slice(0, idx + 1))}
                        >
                            {folder}
                        </Link>
                    ))}
                </Breadcrumbs>

                <FormControl size="small" variant="standard">
                    <Select 
                        value={`${sortBy}-${sortOrder}`} 
                        onChange={(e) => {
                            const [s, o] = (e.target.value as string).split('-');
                            setSortBy(s as 'name' | 'date'); 
                            setSortOrder(o as 'asc' | 'desc');
                        }}
                        disableUnderline IconComponent={SortIcon} sx={{ fontSize: 14 }}
                    >
                        <MenuItem value="name-asc">Nombre (A-Z)</MenuItem>
                        <MenuItem value="name-desc">Nombre (Z-A)</MenuItem>
                        <Divider />
                        <MenuItem value="date-desc">Más reciente</MenuItem>
                        <MenuItem value="date-asc">Más antiguo</MenuItem>
                    </Select>
                </FormControl>
            </Stack>
        </Paper>

        {loadingPath && <LinearProgress sx={{ height: 2 }} />}

        {/* ================= CONTENT ================= */}
        <Container maxWidth={false} sx={{ py: 3, maxWidth: '1800px' }}>
            
            {/* CARPETAS */}
            {!searchQuery && processedContent.folders.length > 0 && (
                <Box mb={4}>
                    <Typography variant="subtitle2" color="text.secondary" mb={2}>Carpetas</Typography>
                    <Grid container spacing={2}>
                        {processedContent.folders.map((folder) => (
                            <Grid item xs={6} sm={4} md={3} lg={2} key={folder.fullPath}>
                                <Paper 
                                    elevation={0}
                                    onClick={() => setSelectedPath([...selectedPath, folder.name])}
                                    sx={{ 
                                        p: 1.5, display: 'flex', alignItems: 'center', cursor: 'pointer',
                                        border: '1px solid #e0e0e0', borderRadius: '12px',
                                        '&:hover': { bgcolor: '#e8f0fe', borderColor: '#1a73e8' }
                                    }}
                                >
                                    <FolderIcon sx={{ color: '#5f6368', mr: 1.5 }} />
                                    <Typography variant="body2" fontWeight={500} noWrap>{folder.name}</Typography>
                                </Paper>
                            </Grid>
                        ))}
                    </Grid>
                </Box>
            )}

            {/* ARCHIVOS */}
            <Box>
                <Typography variant="subtitle2" color="text.secondary" mb={2}>
                    Archivos ({processedContent.files.length})
                </Typography>

                {view === 'grid' ? (
                    <Grid container spacing={2}>
                        {processedContent.files.map((file) => (
                            <Grid item xs={6} sm={4} md={3} lg={2} key={file.fullPath}>
                                <FileCard 
                                    file={file}
                                    isSelected={selectedIds.includes(file.fullPath)}
                                    selectionMode={selectionMode}
                                    onSelect={(id, e) => {
                                        const newIds = e.target.checked ? [...selectedIds, id] : selectedIds.filter(i => i !== id);
                                        setSelectedIds(newIds);
                                        setSelectionMode(newIds.length > 0);
                                    }}
                                    onMenuOpen={(e, f) => { setActiveItem(f); setActionAnchor(e.currentTarget); }}
                                    onClick={() => selectionMode ? null : window.open(file.url, '_blank')}
                                />
                            </Grid>
                        ))}
                    </Grid>
                ) : (
                    <TableContainer component={Paper} elevation={0} variant="outlined" sx={{ borderRadius: 2 }}>
                        <Table size="small">
                            <TableHead sx={{ bgcolor: '#f8f9fa' }}>
                                <TableRow>
                                    <TableCell>Nombre</TableCell>
                                    <TableCell width={150}>Estado</TableCell>
                                    <TableCell width={120}>Fecha</TableCell>
                                    <TableCell width={80}>Tamaño</TableCell>
                                    <TableCell width={50}></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {processedContent.files.map((file) => {
                                    const { displayName, displayDate } = extractFileInfo(file.name, file.originalUpdated || file.updated);
                                    return (
                                        <TableRow 
                                            key={file.fullPath} 
                                            hover 
                                            sx={{ cursor: 'pointer' }}
                                            onClick={() => window.open(file.url, '_blank')}
                                            onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, item: file }); }}
                                        >
                                            <TableCell>
                                                <Stack direction="row" alignItems="center" spacing={2}>
                                                    {getFileIcon(file.name, 20)}
                                                    <Typography variant="body2" fontWeight={500}>{displayName}</Typography>
                                                </Stack>
                                            </TableCell>
                                            <TableCell>
                                                <Stack direction="row" spacing={0.5}>
                                                    {file.reviewed && <Tooltip title="Revisado"><CheckCircleIcon sx={{ fontSize: 18, color: '#34A853' }} /></Tooltip>}
                                                    {file.completed && <Tooltip title="Realizado"><AssignmentTurnedInIcon sx={{ fontSize: 18, color: '#1a73e8' }} /></Tooltip>}
                                                </Stack>
                                            </TableCell>
                                            <TableCell><Typography variant="caption">{displayDate}</Typography></TableCell>
                                            <TableCell><Typography variant="caption">{formatFileSize(file.size)}</Typography></TableCell>
                                            <TableCell>
                                                <IconButton size="small" onClick={(e) => { e.stopPropagation(); setActiveItem(file); setActionAnchor(e.currentTarget); }}>
                                                    <MoreVertIcon fontSize="small" />
                                                </IconButton>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
                
                {processedContent.files.length === 0 && !loadingPath && (
                    <Box textAlign="center" py={8} sx={{ opacity: 0.5 }}>
                        <InsertDriveFileIcon sx={{ fontSize: 60, mb: 2, color: '#dadce0' }} />
                        <Typography>No hay archivos aquí</Typography>
                    </Box>
                )}
            </Box>
        </Container>

        {/* ================= MODALS & MENUS ================= */}
        
        {/* NEW MENU */}
        <Menu anchorEl={newMenuAnchor} open={Boolean(newMenuAnchor)} onClose={() => setNewMenuAnchor(null)}>
            <MenuItem onClick={() => { setNewMenuAnchor(null); setCreateFolderOpen(true); }}>
                <ListItemIcon><CreateNewFolderIcon fontSize="small" /></ListItemIcon> Nueva Carpeta
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => { setNewMenuAnchor(null); fileInputRef.current?.click(); }}>
                <ListItemIcon><FileUploadIcon fontSize="small" /></ListItemIcon> Subir Archivo
            </MenuItem>
        </Menu>
        <input type="file" hidden ref={fileInputRef} multiple onChange={(e) => { /* Tu logica de upload existente */ }} />

        {/* ACTION MENU */}
        <Menu 
            anchorEl={actionAnchor} 
            open={Boolean(actionAnchor)} 
            onClose={() => { setActionAnchor(null); setActiveItem(null); }}
        >
            <MenuItem onClick={() => { setInfoOpen(true); setActionAnchor(null); }}>
                <ListItemIcon><InfoIcon fontSize="small" /></ListItemIcon> Detalles
            </MenuItem>
            {activeItem?.type === 'file' && (
                <>
                    <MenuItem onClick={() => { window.open((activeItem as DriveFile).url, '_blank'); setActionAnchor(null); }}>
                        <ListItemIcon><DownloadIcon fontSize="small" /></ListItemIcon> Descargar
                    </MenuItem>
                    <Divider />
                    {isQuality && (
                         <MenuItem onClick={() => { handleUpdateStatus('reviewed', !(activeItem as DriveFile).reviewed); setActionAnchor(null); }}>
                            <ListItemIcon><CheckCircleIcon fontSize="small" color={(activeItem as DriveFile).reviewed ? 'success' : 'action'} /></ListItemIcon>
                            {(activeItem as DriveFile).reviewed ? 'Desmarcar Revisado' : 'Marcar Revisado'}
                        </MenuItem>
                    )}
                    {(isQuality || isMetrologist) && (
                         <MenuItem onClick={() => { handleUpdateStatus('completed', !(activeItem as DriveFile).completed); setActionAnchor(null); }}>
                            <ListItemIcon><AssignmentTurnedInIcon fontSize="small" color={(activeItem as DriveFile).completed ? 'primary' : 'action'} /></ListItemIcon>
                            {(activeItem as DriveFile).completed ? 'Desmarcar Realizado' : 'Marcar Realizado'}
                        </MenuItem>
                    )}
                </>
            )}
            {isQuality && (
                <>
                    <Divider />
                    <MenuItem onClick={() => { setRenameName(activeItem?.name || ''); setRenameOpen(true); setActionAnchor(null); }}>
                        <ListItemIcon><DriveFileRenameOutlineIcon fontSize="small" /></ListItemIcon> Cambiar nombre
                    </MenuItem>
                    <MenuItem onClick={() => { setDeleteOpen(true); setActionAnchor(null); }} sx={{ color: 'error.main' }}>
                        <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon> Eliminar
                    </MenuItem>
                </>
            )}
        </Menu>

        {/* DIALOGS SIMPLIFIED */}
        <Dialog open={createFolderOpen} onClose={() => setCreateFolderOpen(false)} maxWidth="xs" fullWidth>
            <DialogTitle>Nueva Carpeta</DialogTitle>
            <DialogContent>
                <TextField autoFocus margin="dense" label="Nombre" fullWidth value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} />
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setCreateFolderOpen(false)}>Cancelar</Button>
                <Button variant="contained" onClick={handleCreateFolder}>Crear</Button>
            </DialogActions>
        </Dialog>

        <Dialog open={renameOpen} onClose={() => setRenameOpen(false)} maxWidth="xs" fullWidth>
            <DialogTitle>Cambiar nombre</DialogTitle>
            <DialogContent>
                <TextField autoFocus margin="dense" fullWidth value={renameName} onChange={(e) => setRenameName(e.target.value)} />
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setRenameOpen(false)}>Cancelar</Button>
                <Button variant="contained" onClick={handleRename}>Aceptar</Button>
            </DialogActions>
        </Dialog>

        <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
            <DialogTitle>¿Eliminar elemento?</DialogTitle>
            <DialogActions>
                <Button onClick={() => setDeleteOpen(false)}>No</Button>
                <Button color="error" onClick={handleDelete}>Eliminar</Button>
            </DialogActions>
        </Dialog>

        {/* INFO DRAWER */}
        <Drawer anchor="right" open={infoOpen} onClose={() => setInfoOpen(false)}>
            {activeItem && (
                <Box width={320} p={3}>
                    <Typography variant="h6" mb={2}>Detalles</Typography>
                    <Stack spacing={2}>
                        <Box sx={{ p: 2, bgcolor: '#f1f3f4', borderRadius: 2, display: 'flex', justifyContent: 'center' }}>
                            {getFileIcon(activeItem.name, 60)}
                        </Box>
                        <Box>
                            <Typography variant="caption" color="text.secondary">Nombre</Typography>
                            <Typography variant="body2">{activeItem.name}</Typography>
                        </Box>
                        {activeItem.type === 'file' && (
                            <>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Realizado por</Typography>
                                    <Typography variant="body2">{(activeItem as DriveFile).completedByName || '-'}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Revisado por</Typography>
                                    <Typography variant="body2">{(activeItem as DriveFile).reviewedByName || '-'}</Typography>
                                </Box>
                            </>
                        )}
                    </Stack>
                </Box>
            )}
        </Drawer>

    </Box>
  );
}