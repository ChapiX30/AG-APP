import React, { useState, useEffect, useMemo } from "react";
import { ref, listAll, getDownloadURL, uploadBytes, deleteObject, getMetadata } from "firebase/storage";
import { doc, getDoc, updateDoc, deleteDoc, setDoc } from "firebase/firestore";
import { storage, db, auth } from "../utils/firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { useNavigation } from "../hooks/useNavigation";

import {
  Card, CardContent, Typography, Box, Grid, Button, CircularProgress, Chip,
  IconButton, Tooltip, Paper, useTheme, alpha, TextField, InputAdornment,
  Zoom, useMediaQuery, Stack, ToggleButton, ToggleButtonGroup, Dialog,
  DialogTitle, DialogContent, DialogActions, Breadcrumbs, Link,
  Alert, Snackbar, Select, FormControl, Badge, MenuItem,
} from "@mui/material";

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

// Tipos de datos
interface DriveFile {
  name: string;
  url: string;
  fullPath: string;
  updated: string;
  reviewed?: boolean;
  reviewedBy?: string;
  reviewedAt?: string;
}

interface DriveFolder {
  name: string;
  fullPath: string;
  folders: DriveFolder[];
  files: DriveFile[];
}

const extractFileInfo = (fileName: string, updatedDate?: string) => {
  const baseName = fileName.replace(/\.pdf$/i, "").replace(/_/g, " ");
  const displayDate = updatedDate
    ? new Date(updatedDate).toLocaleDateString()
    : 'Fecha no disponible';
  return {
    displayName: baseName,
    displayDate: displayDate
  };
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

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { goBack, navigateTo } = useNavigation();

  // Función para cargar metadatos de revisión
  const loadFileMetadata = async (file: DriveFile): Promise<DriveFile> => {
    try {
      const metadataDoc = await getDoc(doc(db, 'fileMetadata', file.fullPath.replace(/\//g, '_')));
      if (metadataDoc.exists()) {
        const metadata = metadataDoc.data();
        return {
          ...file,
          reviewed: metadata.reviewed || false,
          reviewedBy: metadata.reviewedBy,
          reviewedAt: metadata.reviewedAt,
        };
      }
    } catch (error) {
      console.error("Error loading file metadata:", error);
    }
    return file;
  };

  // Función recursiva para cargar carpetas
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
    reloadTree();
  }, []);

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
  const handleOpenFile = (file: DriveFile) => {
    window.open(file.url, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadFile = (file: DriveFile) => {
    const { displayName } = extractFileInfo(file.name);
    const link = document.createElement('a');
    link.href = file.url;
    link.download = displayName + '.pdf';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getAllFiles = (folder: DriveFolder): DriveFile[] => {
    let allFiles: DriveFile[] = [...folder.files];
    folder.folders.forEach(subFolder => {
      allFiles = allFiles.concat(getAllFiles(subFolder));
    });
    return allFiles;
  };

  // Marcar archivo como revisado (ahora disponible para todos)
  const handleMarkReviewed = async (file: DriveFile) => {
    if (!user) return;
    
    try {
      const metadataId = file.fullPath.replace(/\//g, '_');
      const metadataRef = doc(db, 'fileMetadata', metadataId);
      
      const metadataDoc = await getDoc(metadataRef);
      
      if (metadataDoc.exists()) {
        await updateDoc(metadataRef, {
          reviewed: !file.reviewed,
          reviewedBy: user.email,
          reviewedAt: new Date().toISOString()
        });
      } else {
        await setDoc(metadataRef, {
          reviewed: true,
          reviewedBy: user.email,
          reviewedAt: new Date().toISOString(),
          filePath: file.fullPath
        });
      }
      
      reloadTree();
    } catch (error) {
      console.error("Error updating review status:", error);
      setError("Error al actualizar el estado de revisión");
    }
  };

  // Eliminar archivo (ahora disponible para todos)
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
      
      setDeleteFile(null);
      setTimeout(() => reloadTree(), 600);
    } catch (error) {
      console.error("Error deleting file:", error);
      setError("Error al eliminar el archivo");
    }
    setLoading(false);
  };

  // Mover archivo (ahora disponible para todos)
  async function handleMoveFile(targetPathArr: string[]) {
    if (!moveFile) return;
    
    const fileToMove = moveFile;
    setMoveFile(null);
    
    try {
      setLoading(true);
      
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
          await setDoc(doc(db, 'fileMetadata', newMetadataId), {
            ...oldMetadata.data(),
            filePath: newPath,
            movedBy: user?.email,
            movedAt: new Date().toISOString()
          });
          await deleteDoc(doc(db, 'fileMetadata', oldMetadataId));
        }
      } catch (metaError) {
        console.log("No metadata to move");
      }
      
      await deleteObject(ref(storage, fileToMove.fullPath));
      setMoveSuccess(true);
      setTimeout(() => reloadTree(), 600);
      
    } catch (e: any) {
      console.error("Failed to move file:", e);
      setMoveError("Error al mover el archivo: " + e.message);
    }
    
    setLoading(false);
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    setCreateFolderOpen(false);
    const pathArr = [...selectedPath, newFolderName.trim()];
    const fakeFileRef = ref(storage, [ROOT_PATH, ...pathArr, ".keep"].join("/"));
    await uploadBytes(fakeFileRef, new Uint8Array([0]));
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

  const currentFolder = getCurrentFolder();
  const filteredFolders = useMemo(() => {
    if (!currentFolder) return [];
    if (globalSearch && query) return [];
    return sortFolders(
      currentFolder.folders.filter(f => 
        f.name.toLowerCase().includes(query.toLowerCase())
      )
    );
  }, [currentFolder, query, globalSearch, sortOrder]);

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

  return (
    <Box sx={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: '#fff',
      p: { xs: 2, md: 3 }
    }}>
      <Paper elevation={3} sx={{
        p: 3, mb: 3, borderRadius: 3,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        color: '#fff'
      }}>
        <Stack direction="row" alignItems="center" spacing={2} mb={2}>
          <IconButton onClick={() => {
            if (selectedPath.length) setSelectedPath(selectedPath.slice(0, -1));
            else if (onBack) onBack();
            else try { window.history.state.idx > 0 ? goBack() : navigateTo("menu"); } catch { navigateTo("menu"); }
          }} sx={{
            color: "#fff", mr: isMobile ? 1.5 : 2.5,
            backgroundColor: alpha("#fff", 0.15),
            border: `1px solid ${alpha("#fff", 0.2)}`,
            "&:hover": { backgroundColor: alpha("#fff", 0.25) }
          }}>
            <ArrowBackIcon />
          </IconButton>

          <Typography variant="h4" component="h1" fontWeight={700} flexGrow={1}>
            <CloudIcon sx={{ mr: 1, verticalAlign: 'middle', fontSize: 40 }} />
            Drive Interno
          </Typography>

          <IconButton onClick={reloadTree} sx={{
            color: "#fff",
            backgroundColor: alpha("#fff", 0.15),
            border: `1px solid ${alpha("#fff", 0.2)}`,
            "&:hover": { backgroundColor: alpha("#fff", 0.25) }
          }}>
            <RefreshIcon />
          </IconButton>
        </Stack>

        <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} 
          aria-label="breadcrumb" sx={{ color: "#fff", mb: 2 }}>
          <Link color="inherit" onClick={() => setSelectedPath([])} 
            sx={{ cursor: "pointer", fontWeight: 700 }}>
            Drive Interno
          </Link>
          {selectedPath.map((seg, idx) => (
            <Link key={idx} color="inherit"
              onClick={() => setSelectedPath(selectedPath.slice(0, idx + 1))}
              sx={{ cursor: "pointer", fontWeight: 700 }}>
              {seg}
            </Link>
          ))}
        </Breadcrumbs>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
          <ToggleButtonGroup value={view} exclusive onChange={(e, v) => v && setView(v)} size="small"
            sx={{
              backgroundColor: alpha("#fff", 0.15), borderRadius: 2,
              "& .MuiToggleButton-root": {
                color: "#fff", borderColor: alpha("#fff", 0.2),
                "&.Mui-selected": { backgroundColor: alpha("#fff", 0.25) }
              }
            }}>
            <ToggleButton value="grid"><ViewModuleIcon /></ToggleButton>
            <ToggleButton value="list"><ViewListIcon /></ToggleButton>
          </ToggleButtonGroup>

          <FormControl size="small" sx={{ minWidth: 120 }}>
            <Select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [newSortBy, newSortOrder] = e.target.value.split('-') as [typeof sortBy, typeof sortOrder];
                setSortBy(newSortBy);
                setSortOrder(newSortOrder);
              }}
              sx={{
                color: "#fff",
                backgroundColor: alpha("#fff", 0.15),
                "& .MuiOutlinedInput-notchedOutline": { borderColor: alpha("#fff", 0.2) },
                "& .MuiSvgIcon-root": { color: "#fff" }
              }}
            >
              <MenuItem value="name-asc">Nombre A-Z</MenuItem>
              <MenuItem value="name-desc">Nombre Z-A</MenuItem>
              <MenuItem value="date-asc">Fecha ↑</MenuItem>
              <MenuItem value="date-desc">Fecha ↓</MenuItem>
            </Select>
          </FormControl>

          <ToggleButtonGroup value={globalSearch} exclusive onChange={(e, v) => setGlobalSearch(v)} size="small">
            <ToggleButton value={true} sx={{ color: "#fff", borderColor: alpha("#fff", 0.2) }}>
              {globalSearch ? <SearchIcon /> : <SearchOffIcon />}
              {globalSearch ? 'Global' : 'Local'}
            </ToggleButton>
          </ToggleButtonGroup>

          <Button startIcon={<AddIcon />} onClick={() => setCreateFolderOpen(true)}
            sx={{
              color: "#fff", backgroundColor: alpha("#fff", 0.15),
              border: `1px solid ${alpha("#fff", 0.2)}`,
              "&:hover": { backgroundColor: alpha("#fff", 0.25) }
            }}>
            Nueva Carpeta
          </Button>

          <TextField value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={globalSearch ? "Buscar en todo el drive..." : "Buscar en carpeta actual..."}
            fullWidth size={isMobile ? "small" : "medium"}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: "#fff" }} />
                </InputAdornment>
              ),
            }}
            sx={{
              "& .MuiInputBase-root": { color: "#fff", backgroundColor: alpha("#fff", 0.15) },
              "& .MuiOutlinedInput-notchedOutline": { borderColor: alpha("#fff", 0.2) }
            }}
          />

          <Stack direction="row" spacing={1}>
            <Chip icon={<FolderIcon />} label={`${filteredFolders.length} carpetas`} sx={{
              color: "#fff", backgroundColor: alpha("#fff", 0.2), fontWeight: 600
            }} />
            <Chip icon={<DescriptionIcon />} label={`${filteredFiles.length} archivos`} sx={{
              color: "#fff", backgroundColor: alpha("#fff", 0.2), fontWeight: 600
            }} />
            <Chip 
              icon={<CheckCircleIcon />} 
              label={`${filteredFiles.filter(f => f.reviewed).length} revisados`} 
              sx={{ color: "#fff", backgroundColor: alpha("#4caf50", 0.7), fontWeight: 600 }}
            />
          </Stack>
        </Stack>
      </Paper>

      {loading && (
        <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 3 }}>
          <CircularProgress size={60} />
          <Typography variant="h6" mt={2}>Cargando...</Typography>
        </Paper>
      )}

      {error && !loading && (
        <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 3 }}>
          <Typography color="error" gutterBottom>{error}</Typography>
          <Button variant="contained" startIcon={<RefreshIcon />} onClick={reloadTree}
            sx={{ borderRadius: 3 }}>
            Reintentar
          </Button>
        </Paper>
      )}

      {!loading && !error && currentFolder && (
        <Box>
          {globalSearch && query && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Mostrando {filteredFiles.length} resultados para "{query}" en todo el drive
            </Alert>
          )}
          
          {view === "grid" ? (
            <Grid container spacing={2}>
              {filteredFolders.map((folder, idx) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={idx}>
                  <Zoom in timeout={300 + idx * 50}>
                    <Card onClick={() => setSelectedPath([...selectedPath, folder.name])} 
                      sx={{ cursor: "pointer", borderRadius: 3, transition: 'transform 0.2s', backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            '&:hover': { transform: 'translateY(-4px)', backgroundColor: 'rgba(255, 255, 255, 1)' } }}>
                      <CardContent>
                        <Stack direction="row" alignItems="center" spacing={2}>
                          <FolderIcon color="primary" sx={{ fontSize: 40 }} />
                          <Box>
                            <Typography variant="h6" fontWeight={600}>{folder.name}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {folder.files.length} archivo{folder.files.length === 1 ? "" : "s"}
                              {folder.folders.length > 0 && `, ${folder.folders.length} carpeta${folder.folders.length === 1 ? "" : "s"}`}
                            </Typography>
                          </Box>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Zoom>
                </Grid>
              ))}

              {filteredFiles.map((file, idx) => {
                const { displayName, displayDate } = extractFileInfo(file.name, file.updated);
                return (
                  <Grid item xs={12} sm={6} md={4} lg={3} key={idx}>
                    <Zoom in timeout={300 + (filteredFolders.length + idx) * 50}>
                      <Card sx={{ 
                        borderRadius: 3, 
                        position: 'relative',
                        border: file.reviewed ? '2px solid #4caf50' : 'none',
                        backgroundColor: file.reviewed ? alpha('#4caf50', 0.2) : 'rgba(255, 255, 255, 0.9)',
                        cursor: 'pointer',
                        '&:hover': { 
                          transform: 'translateY(-2px)',
                          boxShadow: theme.shadows[8]
                        },
                        transition: 'all 0.2s ease-in-out'
                      }}>
                        <CardContent>
                          <Box onClick={() => handleOpenFile(file)} sx={{ cursor: 'pointer' }}>
                            <Stack direction="row" alignItems="center" spacing={2} mb={2}>
                              <Badge
                                badgeContent={file.reviewed ? <CheckCircleIcon sx={{ fontSize: 16 }} /> : null}
                                color="success"
                              >
                                <PictureAsPdfIcon color="error" sx={{ fontSize: 40 }} />
                              </Badge>
                              <Box flexGrow={1}>
                                <Typography variant="subtitle1" fontWeight={600} 
                                  sx={{ '&:hover': { color: 'primary.main' } }}>
                                  {displayName}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {displayDate}
                                </Typography>
                                {globalSearch && (
                                  <Typography variant="caption" display="block" color="primary">
                                    📁 {file.fullPath.replace('worksheets/', '').replace('/' + file.name, '')}
                                  </Typography>
                                )}
                                {file.reviewed && (
                                  <Typography variant="caption" display="block" color="success.main">
                                    ✅ Revisado por {file.reviewedBy}
                                  </Typography>
                                )}
                              </Box>
                            </Stack>
                          </Box>
                          
                          <Stack direction="row" spacing={1} justifyContent="center">
                            <Tooltip title="Ver archivo">
                              <IconButton 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenFile(file);
                                }} 
                                size="small" 
                                color="primary"
                                sx={{ 
                                  backgroundColor: alpha('#2196f3', 0.1),
                                  '&:hover': { backgroundColor: alpha('#2196f3', 0.2) }
                                }}
                              >
                                <VisibilityIcon />
                              </IconButton>
                            </Tooltip>

                            <Tooltip title="Descargar archivo">
                              <IconButton 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownloadFile(file);
                                }} 
                                size="small"
                                color="secondary"
                                sx={{ 
                                  backgroundColor: alpha('#9c27b0', 0.1),
                                  '&:hover': { backgroundColor: alpha('#9c27b0', 0.2) }
                                }}
                              >
                                <DownloadIcon />
                              </IconButton>
                            </Tooltip>

                            <Tooltip title="Mover archivo">
                              <IconButton 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMoveFile(file);
                                }} 
                                size="small"
                                sx={{ 
                                  backgroundColor: alpha('#ff9800', 0.1),
                                  '&:hover': { backgroundColor: alpha('#ff9800', 0.2) }
                                }}
                              >
                                <DriveFileMoveIcon />
                              </IconButton>
                            </Tooltip>

                            <Tooltip title={file.reviewed ? "Marcar como no revisado" : "Marcar como revisado"}>
                              <IconButton 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMarkReviewed(file);
                                }} 
                                size="small"
                                color={file.reviewed ? "success" : "default"}
                                sx={{ 
                                  backgroundColor: file.reviewed ? alpha('#4caf50', 0.1) : alpha('#757575', 0.1),
                                  '&:hover': { backgroundColor: file.reviewed ? alpha('#4caf50', 0.2) : alpha('#757575', 0.2) }
                                }}
                              >
                                <CheckCircleIcon />
                              </IconButton>
                            </Tooltip>

                            <Tooltip title="Eliminar archivo">
                              <IconButton 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteFile(file);
                                }} 
                                size="small" 
                                color="error"
                                sx={{ 
                                  backgroundColor: alpha('#f44336', 0.1),
                                  '&:hover': { backgroundColor: alpha('#f44336', 0.2) }
                                }}
                              >
                                <DeleteIcon />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </CardContent>
                      </Card>
                    </Zoom>
                  </Grid>
                );
              })}
            </Grid>
          ) : (
            <Paper sx={{ borderRadius: 3 }}>
              {filteredFolders.map(folder => (
                <Box key={folder.name} sx={{ p: 2, borderBottom: '1px solid #eee' }}>
                  <Stack direction="row" alignItems="center" spacing={2} 
                    onClick={() => setSelectedPath([...selectedPath, folder.name])}
                    sx={{ cursor: 'pointer' }}>
                    <FolderIcon color="primary" />
                    <Typography variant="body1" fontWeight={600} flexGrow={1}>{folder.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {folder.files.length} archivo{folder.files.length === 1 ? "" : "s"}
                    </Typography>
                  </Stack>
                </Box>
              ))}

              {filteredFiles.map(file => {
                const { displayName, displayDate } = extractFileInfo(file.name, file.updated);
                return (
                  <Box key={file.name} sx={{ 
                    p: 2, 
                    borderBottom: '1px solid #eee',
                    backgroundColor: file.reviewed ? alpha('#4caf50', 0.05) : 'inherit',
                    '&:hover': {
                      backgroundColor: alpha('#2196f3', 0.05),
                      cursor: 'pointer'
                    },
                    transition: 'background-color 0.2s ease'
                  }}>
                    <Stack direction="row" alignItems="center" spacing={2}>
                      <Badge
                        badgeContent={file.reviewed ? <CheckCircleIcon sx={{ fontSize: 12 }} /> : null}
                        color="success"
                      >
                        <PictureAsPdfIcon color="error" />
                      </Badge>
                      
                      <Box 
                        flexGrow={1} 
                        onClick={() => handleOpenFile(file)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <Typography variant="body1" fontWeight={600}
                          sx={{ '&:hover': { color: 'primary.main' } }}>
                          {displayName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {displayDate}
                        </Typography>
                        {globalSearch && (
                          <Typography variant="caption" display="block" color="primary">
                            📁 {file.fullPath.replace('worksheets/', '').replace('/' + file.name, '')}
                          </Typography>
                        )}
                        {file.reviewed && (
                          <Typography variant="caption" display="block" color="success.main">
                            ✅ Revisado por {file.reviewedBy}
                          </Typography>
                        )}
                      </Box>
                      
                      <Stack direction="row" spacing={1}>
                        <Tooltip title="Ver archivo">
                          <IconButton 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenFile(file);
                            }} 
                            size="small" 
                            color="primary"
                          >
                            <VisibilityIcon />
                          </IconButton>
                        </Tooltip>

                        <Tooltip title="Descargar">
                          <IconButton 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadFile(file);
                            }} 
                            size="small" 
                            color="secondary"
                          >
                            <DownloadIcon />
                          </IconButton>
                        </Tooltip>

                        <IconButton 
                          onClick={(e) => {
                            e.stopPropagation();
                            setMoveFile(file);
                          }} 
                          size="small"
                        >
                          <DriveFileMoveIcon />
                        </IconButton>
                        
                        <IconButton 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkReviewed(file);
                          }} 
                          size="small"
                          color={file.reviewed ? "success" : "default"}
                        >
                          <CheckCircleIcon />
                        </IconButton>
                        
                        <IconButton 
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteFile(file);
                          }} 
                          size="small" 
                          color="error"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Stack>
                    </Stack>
                  </Box>
                );
              })}
            </Paper>
          )}
        </Box>
      )}

      <Dialog open={createFolderOpen} onClose={() => setCreateFolderOpen(false)}>
        <DialogTitle>Crear nueva carpeta</DialogTitle>
        <DialogContent>
          <TextField value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
            label="Nombre de la carpeta" fullWidth autoFocus margin="normal" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateFolderOpen(false)}>Cancelar</Button>
          <Button onClick={handleCreateFolder} variant="contained">Crear</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteFile)} onClose={() => setDeleteFile(null)}>
        <DialogTitle>Eliminar archivo</DialogTitle>
        <DialogContent>
          <Typography>
            ¿Estás seguro de que quieres eliminar "{deleteFile?.name}"?
          </Typography>
          <Alert severity="warning" sx={{ mt: 2 }}>
            Esta acción no se puede deshacer.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteFile(null)}>Cancelar</Button>
          <Button onClick={handleDeleteFile} variant="contained" color="error">
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(moveFile)} onClose={() => !moveLoading && setMoveFile(null)} 
        maxWidth="sm" fullWidth>
        <DialogTitle>Mover "{moveFile?.name}"</DialogTitle>
        <DialogContent>
          {moveError && (
            <Alert severity="error" sx={{ mb: 2 }}>{moveError}</Alert>
          )}
          <Typography gutterBottom>Selecciona la carpeta de destino:</Typography>
          <Box sx={{ maxHeight: 400, overflowY: 'auto', border: '1px solid #ddd', borderRadius: 1, p: 1 }}>
            <FolderMoveTree 
              tree={tree} 
              onSelect={handleMoveFile}
              excludePath={selectedPath}
              disabled={moveLoading}
            />
          </Box>
          {moveLoading && (
            <Box sx={{ display: 'flex', alignItems: 'center', mt: 2 }}>
              <CircularProgress size={20} sx={{ mr: 1 }} />
              <Typography>Moviendo archivo...</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMoveFile(null)} disabled={moveLoading}>Cancelar</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={moveSuccess} autoHideDuration={3000} onClose={() => setMoveSuccess(false)}>
        <Alert onClose={() => setMoveSuccess(false)} severity="success">
          Archivo movido exitosamente
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
          fullWidth
          onClick={() => !disabled && onSelect(currentPath)}
          disabled={disabled}
          sx={{ 
            justifyContent: 'flex-start', 
            textAlign: 'left', 
            mb: 0.5,
            pl: path.length * 2,
            textTransform: 'none'
          }}
          startIcon={<FolderIcon />}
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
