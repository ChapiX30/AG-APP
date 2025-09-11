import React, { useState, useEffect, useMemo } from "react";
import { ref, listAll, getDownloadURL, uploadBytes, deleteObject, getMetadata, getBlob } from "firebase/storage";
import { storage } from "../utils/firebase";
import { useNavigation } from "../hooks/useNavigation";
import {
  Card, CardContent, Typography, Box, Grid, Button, CircularProgress, Chip,
  IconButton, Tooltip, Paper, useTheme, alpha, TextField, InputAdornment, Fade,
  Zoom, useMediaQuery, Stack, ToggleButton, ToggleButtonGroup, Dialog,
  DialogTitle, DialogContent, DialogActions, Breadcrumbs, Link, Divider, Menu, MenuItem,
  Alert, Snackbar,
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
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';

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

interface DriveFile {
  name: string;
  url: string;
  fullPath: string;
  updated: string;
}

interface DriveFolder {
  name: string;
  fullPath: string;
  folders: DriveFolder[];
  files: DriveFile[];
}

const ROOT_PATH = "worksheets";

export default function DriveScreen({ onBack }: { onBack?: () => void }) {
  const [tree, setTree] = useState<DriveFolder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string[]>([]);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [query, setQuery] = useState("");
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  
  // Estados mejorados para mover archivos
  const [moveFile, setMoveFile] = useState<DriveFile | null>(null);
  const [moveLoading, setMoveLoading] = useState(false);
  const [moveSuccess, setMoveSuccess] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { goBack, navigateTo } = useNavigation();

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
        return {
          name: itemRef.name,
          url,
          fullPath: itemRef.fullPath,
          updated: metadata.updated,
        };
      })
    );

    return { name: pathArr[pathArr.length - 1] || "Drive", fullPath, folders, files };
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

  useEffect(() => { reloadTree(); }, []);

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

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    setCreateFolderOpen(false);
    const pathArr = [...selectedPath, newFolderName.trim()];
    const fakeFileRef = ref(storage, [ROOT_PATH, ...pathArr, ".keep"].join("/"));
    await uploadBytes(fakeFileRef, new Uint8Array([0]));
    setNewFolderName("");
    setTimeout(() => reloadTree(), 500);
  }

  // FUNCIÓN CORREGIDA para mover archivos
async function handleMoveFile(targetPathArr: string[]) {
  if (!moveFile) return;
  
  const fileToMove = moveFile;
  setMoveFile(null);
  
  try {
    setLoading(true);
    
    // ✅ ALTERNATIVA: XMLHttpRequest funciona siempre
    const blob = await new Promise<Blob>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.responseType = 'blob';
      xhr.timeout = 60000; // 60 segundos timeout
      
      xhr.onload = () => {
        if (xhr.status === 200) {
          resolve(xhr.response);
        } else {
          reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
        }
      };
      
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.ontimeout = () => reject(new Error('Request timeout'));
      
      // Usar la URL directa de Firebase
      xhr.open('GET', fileToMove.url);
      xhr.send();
    });
    
    // Subir a nueva ubicación
    const newPath = [ROOT_PATH, ...targetPathArr, fileToMove.name].join("/");
    const newRef = ref(storage, newPath);
    await uploadBytes(newRef, blob);
    
    // Eliminar archivo original
    const sourceRef = ref(storage, fileToMove.fullPath);
    await deleteObject(sourceRef);
    
    setTimeout(() => reloadTree(), 600);
    
  } catch (e: any) {
    console.error("Failed to move file:", e);
    setError("Error al mover el archivo: " + e.message);
  }
    
    setLoading(false);
  }

  const currentFolder = getCurrentFolder();
  const filteredFolders = useMemo(() =>
    currentFolder?.folders.filter(f => f.name.toLowerCase().includes(query.toLowerCase())) || [],
    [currentFolder, query]
  );
  const filteredFiles = useMemo(() =>
    currentFolder?.files.filter(f => {
      const { displayName } = extractFileInfo(f.name);
      return displayName.toLowerCase().includes(query.toLowerCase())
    }) || [],
    [currentFolder, query]
  );

  return (
    <Box sx={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: '#fff',
      p: { xs: 2, md: 3 }
    }}>
      {/* Header */}
      <Paper elevation={3} sx={{
        p: 3, mb: 3, borderRadius: 3,
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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

        {/* Breadcrumbs */}
        <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} 
          aria-label="breadcrumb" sx={{ color: "#fff" }}>
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

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mt={3} alignItems="center">
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

          <Button startIcon={<AddIcon />} onClick={() => setCreateFolderOpen(true)}
            sx={{
              color: "#fff", backgroundColor: alpha("#fff", 0.15),
              border: `1px solid ${alpha("#fff", 0.2)}`,
              "&:hover": { backgroundColor: alpha("#fff", 0.25) }
            }}>
            Nueva Carpeta
          </Button>

          <TextField value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar archivo o carpeta..."
            fullWidth size={isMobile ? "small" : "medium"}
            InputProps={{
              startAdornment: (<InputAdornment position="start"><SearchIcon sx={{ color: "#fff" }} /></InputAdornment>),
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
          </Stack>
        </Stack>
      </Paper>

      {/* Loading/Error states */}
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

      {/* Current folder view */}
      {!loading && !error && currentFolder && (
        <Box>
          {view === "grid" ? (
            <Grid container spacing={2}>
              {/* Carpetas */}
              {filteredFolders.map((folder, idx) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={idx}>
                  <Zoom in timeout={300 + idx * 50}>
                    <Card onClick={() => setSelectedPath([...selectedPath, folder.name])} 
                      sx={{ cursor: "pointer", borderRadius: 3, transition: 'transform 0.2s',
                            '&:hover': { transform: 'translateY(-4px)' } }}>
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

              {/* Archivos */}
              {filteredFiles.map((file, idx) => {
                const { displayName, displayDate } = extractFileInfo(file.name, file.updated);
                return (
                  <Grid item xs={12} sm={6} md={4} lg={3} key={idx}>
                    <Zoom in timeout={300 + (filteredFolders.length + idx) * 50}>
                      <Card sx={{ borderRadius: 3, position: 'relative' }}>
                        <CardContent>
                          <Stack direction="row" alignItems="center" spacing={2}>
                            <PictureAsPdfIcon color="error" sx={{ fontSize: 40 }} />
                            <Box flexGrow={1}>
                              <Typography variant="subtitle1" fontWeight={600}>{displayName}</Typography>
                              <Typography variant="caption" color="text.secondary">{displayDate}</Typography>
                            </Box>
                            <IconButton onClick={() => setMoveFile(file)} size="small">
                              <DriveFileMoveIcon />
                            </IconButton>
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
              {/* Carpetas en vista lista */}
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

              {/* Archivos en vista lista */}
              {filteredFiles.map(file => {
                const { displayName, displayDate } = extractFileInfo(file.name, file.updated);
                return (
                  <Box key={file.name} sx={{ p: 2, borderBottom: '1px solid #eee' }}>
                    <Stack direction="row" alignItems="center" spacing={2}>
                      <PictureAsPdfIcon color="error" />
                      <Box flexGrow={1}>
                        <Typography variant="body1" fontWeight={600}>{displayName}</Typography>
                        <Typography variant="caption" color="text.secondary">{displayDate}</Typography>
                      </Box>
                      <IconButton onClick={() => setMoveFile(file)} size="small">
                        <DriveFileMoveIcon />
                      </IconButton>
                    </Stack>
                  </Box>
                );
              })}
            </Paper>
          )}
        </Box>
      )}

      {/* Dialog crear carpeta */}
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

      {/* DIÁLOGO MEJORADO para mover archivos */}
      <Dialog open={Boolean(moveFile)} onClose={() => !moveLoading && setMoveFile(null)} 
        maxWidth="sm" fullWidth>
        <DialogTitle>
          Mover "{moveFile?.name}"
        </DialogTitle>
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
          <Button onClick={() => setMoveFile(null)} disabled={moveLoading}>
            Cancelar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar para éxito */}
      <Snackbar open={moveSuccess} autoHideDuration={3000} onClose={() => setMoveSuccess(false)}>
        <Alert onClose={() => setMoveSuccess(false)} severity="success">
          Archivo movido exitosamente
        </Alert>
      </Snackbar>
    </Box>
  );
}

// COMPONENTE CORREGIDO para seleccionar carpeta destino
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
  
  // Verificar si esta es la ruta que debe excluirse
  const shouldExclude = JSON.stringify(currentPath) === JSON.stringify(excludePath);

  return (
    <Box>
      {/* Mostrar la carpeta actual como opción si no es la excluida */}
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
      
      {/* Mostrar subcarpetas */}
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
