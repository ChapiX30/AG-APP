import React, { useState, useEffect, useMemo } from "react";
import { ref, listAll, getDownloadURL, uploadBytes, deleteObject } from "firebase/storage";
import { storage } from "../utils/firebase";
import { useNavigation } from "../hooks/useNavigation";
import {
  Card, CardContent, Typography, Box, Grid, Button, CircularProgress, Chip,
  IconButton, Tooltip, Paper, useTheme, alpha, TextField, InputAdornment, Fade,
  Zoom, useMediaQuery, Stack, ToggleButton, ToggleButtonGroup, Dialog,
  DialogTitle, DialogContent, DialogActions, Breadcrumbs, Link, Divider, Menu, MenuItem,
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

// --- Helpers para nombres de archivo ---
const extractCertAndId = (fileName: string) => {
  // Esperado: AGAC-0001-25_ID1234.pdf
  const match = fileName.match(/^(.+?-\d{4,5}-\d{2,3})[_\- ]?ID([\w\-]+)\.pdf$/i);
  if (match) return `${match[1]} | ID${match[2]}`;
  // Fallback: busca patrón más básico
  const base = fileName.replace(/\.pdf$/i, "");
  return base.replace(/_/g, " ");
};

// --- Estructura recursiva para carpetas ---
interface DriveFile {
  name: string;
  url: string;
  fullPath: string;
}
interface DriveFolder {
  name: string;
  fullPath: string;
  folders: DriveFolder[];
  files: DriveFile[];
}
const ROOT_PATH = "worksheets";

// --- Main component ---
export default function DriveScreen({ onBack }: { onBack?: () => void }) {
  const [tree, setTree] = useState<DriveFolder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string[]>([]); // path array (["usuario"], ["usuario","carpeta"])
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [query, setQuery] = useState("");
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [moveFile, setMoveFile] = useState<{ file: DriveFile, anchorEl: HTMLElement | null } | null>(null);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { goBack, navigateTo } = useNavigation();

  // ---- Funciones para árbol recursivo ----
  async function fetchFolder(pathArr: string[]): Promise<DriveFolder> {
    const fullPath = [ROOT_PATH, ...pathArr].join("/");
    const dirRef = ref(storage, fullPath);
    const res = await listAll(dirRef);

    // Folders
    const folders: DriveFolder[] = await Promise.all(
      res.prefixes.map(async (prefix) => fetchFolder([...pathArr, prefix.name]))
    );
    // Files
    const files: DriveFile[] = await Promise.all(
      res.items.map(async (itemRef) => {
        const url = await getDownloadURL(itemRef);
        return {
          name: itemRef.name,
          url,
          fullPath: itemRef.fullPath,
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
      setError("No se pudieron cargar los archivos.");
    }
    setLoading(false);
  }

  useEffect(() => { reloadTree(); }, []);

  // ---- Helpers para navegar en árbol ----
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

  // ---- Crear carpeta ----
  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    setCreateFolderOpen(false);
    const pathArr = [...selectedPath, newFolderName.trim()];
    const fakeFileRef = ref(storage, [ROOT_PATH, ...pathArr, ".keep"].join("/"));
    await uploadBytes(fakeFileRef, new Uint8Array([0])); // Hack: Storage no guarda carpetas vacías, crea archivo .keep
    setNewFolderName("");
    setTimeout(() => reloadTree(), 500);
  }

  // ---- Mover archivo ----
  async function handleMoveFile(targetPathArr: string[]) {
    if (!moveFile?.file) return;
    const file = moveFile.file;
    // Descargar contenido actual (solo para PDFs chicos)
    const res = await fetch(file.url);
    const blob = await res.blob();
    const newRef = ref(storage, [ROOT_PATH, ...targetPathArr, file.name].join("/"));
    await uploadBytes(newRef, blob);
    await deleteObject(ref(storage, file.fullPath));
    setMoveFile(null);
    setTimeout(() => reloadTree(), 600);
  }

  // ---- Render ----
  const currentFolder = getCurrentFolder();
  const filteredFolders = useMemo(() =>
    currentFolder?.folders.filter(f => f.name.toLowerCase().includes(query.toLowerCase())) || [],
    [currentFolder, query]
  );
  const filteredFiles = useMemo(() =>
    currentFolder?.files.filter(f => extractCertAndId(f.name).toLowerCase().includes(query.toLowerCase())) || [],
    [currentFolder, query]
  );

  // ---- UI ----
  return (
    <Box sx={{ p: isMobile ? 1 : 3 }}>
      {/* Header */}
      <Fade in timeout={500}>
        <Paper elevation={8} sx={{
          p: isMobile ? 2 : 4, mb: isMobile ? 2 : 4, borderRadius: 4,
          background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
          color: "#fff"
        }}>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={isMobile ? 1.5 : 2.5}>
            <Box display="flex" alignItems="center">
              <Tooltip title={selectedPath.length ? "Volver" : "Regresar"}>
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
              </Tooltip>
              <Box sx={{
                backgroundColor: alpha("#fff", 0.15),
                borderRadius: 2, p: isMobile ? 1.2 : 1.6, mr: isMobile ? 1.5 : 2.5,
                display: "flex", alignItems: "center", justifyContent: "center"
              }}>
                <CloudIcon sx={{ fontSize: isMobile ? 28 : 40 }} />
              </Box>
              {/* Breadcrumbs */}
              <Breadcrumbs separator={<NavigateNextIcon htmlColor="#fff" fontSize="small" />}
                aria-label="breadcrumb" sx={{ color: "#fff" }}>
                <Link underline="hover" color="inherit" sx={{ cursor: "pointer", fontWeight: 700 }}
                  onClick={() => setSelectedPath([])}>Drive Interno</Link>
                {selectedPath.map((seg, idx) => (
                  <Link underline="hover" color="inherit" key={seg}
                    onClick={() => setSelectedPath(selectedPath.slice(0, idx + 1))}
                    sx={{ cursor: "pointer", fontWeight: 700 }}>
                    {seg}
                  </Link>
                ))}
              </Breadcrumbs>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <ToggleButtonGroup value={view} exclusive onChange={(_, v) => v && setView(v)} size="small"
                sx={{
                  backgroundColor: alpha("#fff", 0.15), borderRadius: 2,
                  "& .MuiToggleButton-root": {
                    color: "#fff", borderColor: alpha("#fff", 0.2),
                    "&.Mui-selected": { backgroundColor: alpha("#fff", 0.25) },
                  }
                }}>
                <ToggleButton value="grid"><ViewModuleIcon fontSize="small" /></ToggleButton>
                <ToggleButton value="list"><ViewListIcon fontSize="small" /></ToggleButton>
              </ToggleButtonGroup>
              <Tooltip title="Crear carpeta">
                <IconButton onClick={() => setCreateFolderOpen(true)}
                  sx={{
                    color: "#fff", backgroundColor: alpha("#fff", 0.15),
                    border: `1px solid ${alpha("#fff", 0.2)}`,
                    "&:hover": { backgroundColor: alpha("#fff", 0.25) }
                  }}><AddIcon /></IconButton>
              </Tooltip>
              <Tooltip title="Actualizar">
                <span>
                  <IconButton onClick={reloadTree} disabled={loading}
                    sx={{
                      color: "#fff", backgroundColor: alpha("#fff", 0.15),
                      border: `1px solid ${alpha("#fff", 0.2)}`,
                      "&:hover": { backgroundColor: alpha("#fff", 0.25) },
                      "&:disabled": { backgroundColor: alpha("#fff", 0.1), color: alpha("#fff", 0.5) },
                    }}>
                    <RefreshIcon />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          </Box>
          <Stack direction={isMobile ? "column" : "row"} spacing={isMobile ? 1.5 : 2} alignItems={isMobile ? "stretch" : "center"}>
            <TextField
              value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Buscar archivo o carpeta..."
              fullWidth size={isMobile ? "small" : "medium"}
              InputProps={{
                startAdornment: (<InputAdornment position="start"><SearchIcon htmlColor="#fff" /></InputAdornment>),
              }}
              sx={{
                "& .MuiInputBase-root": { color: "#fff", backgroundColor: alpha("#fff", 0.15) },
                "& .MuiOutlinedInput-notchedOutline": { borderColor: alpha("#fff", 0.2) }
              }}
            />
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Chip icon={<FolderIcon />} label={`${filteredFolders.length} carpetas`} sx={{
                color: "#fff", backgroundColor: alpha("#fff", 0.2), fontWeight: 600
              }} />
              <Chip icon={<DescriptionIcon />} label={`${filteredFiles.length} archivos`} sx={{
                color: "#fff", backgroundColor: alpha("#fff", 0.2), fontWeight: 600
              }} />
            </Stack>
          </Stack>
        </Paper>
      </Fade>

      {/* Estado carga/error */}
      {loading && (
        <Fade in timeout={400}>
          <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" py={isMobile ? 6 : 10}>
            <CircularProgress size={isMobile ? 56 : 72} thickness={4} sx={{ color: theme.palette.primary.main }} />
            <Typography variant={isMobile ? "h6" : "h5"}>Cargando...</Typography>
          </Box>
        </Fade>
      )}
      {error && (
        <Zoom in timeout={400}>
          <Paper elevation={4} sx={{ p: isMobile ? 4 : 6, textAlign: "center", borderRadius: 4 }}>
            <CloudIcon sx={{ fontSize: isMobile ? 48 : 72, color: theme.palette.error.main, mb: 1 }} />
            <Typography color="error" variant={isMobile ? "h6" : "h5"} fontWeight={700} gutterBottom>
              {error}
            </Typography>
            <Button variant="contained" onClick={reloadTree} startIcon={<RefreshIcon />} sx={{ borderRadius: 3 }}>
              Reintentar
            </Button>
          </Paper>
        </Zoom>
      )}

      {/* Vista carpeta actual */}
      {!loading && !error && currentFolder && (
        <Box>
          {view === "grid" ? (
            <Grid container spacing={isMobile ? 1.5 : 3}>
              {filteredFolders.map((folder, idx) => (
                <Grid key={folder.fullPath} item xs={12} sm={6} md={4} lg={3}>
                  <Zoom in timeout={300 + idx * 60}>
                    <Card elevation={4} sx={{
                      borderRadius: 4, height: "100%",
                      transition: "transform .2s", "&:hover": { transform: "translateY(-5px)" }
                    }}>
                      <CardContent sx={{ p: isMobile ? 2 : 3 }}>
                        <Box display="flex" alignItems="center" mb={1.2} onClick={() => setSelectedPath([...selectedPath, folder.name])} sx={{ cursor: "pointer" }}>
                          <FolderIcon sx={{ color: theme.palette.primary.main, fontSize: isMobile ? 28 : 36 }} />
                          <Typography variant={isMobile ? "subtitle1" : "h6"} fontWeight={700} ml={2} noWrap>{folder.name}</Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                          {folder.files.length} archivo{folder.files.length === 1 ? "" : "s"}
                        </Typography>
                        {folder.folders.length > 0 && (
                          <Chip label={`${folder.folders.length} subcarpetas`} size="small" sx={{ mt: 1 }} />
                        )}
                      </CardContent>
                    </Card>
                  </Zoom>
                </Grid>
              ))}
              {filteredFiles.map((file, idx) => (
                <Grid key={file.fullPath} item xs={12} sm={6} md={4} lg={3}>
                  <Zoom in timeout={300 + idx * 60}>
                    <Card elevation={2} sx={{ borderRadius: 3, position: "relative" }}>
                      <CardContent sx={{ p: isMobile ? 2 : 3 }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <PictureAsPdfIcon sx={{ color: "#d32f2f" }} />
                          <Box sx={{ flex: 1 }}>
                            <Typography fontWeight={600} noWrap>
                              {extractCertAndId(file.name)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" noWrap>
                              {file.name}
                            </Typography>
                          </Box>
                          <Tooltip title="Mover archivo">
                            <IconButton size="small" onClick={e => setMoveFile({ file, anchorEl: e.currentTarget })}>
                              <DriveFileMoveIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Abrir PDF">
                            <IconButton size="small" component="a" href={file.url} target="_blank">
                              <DescriptionIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Zoom>
                </Grid>
              ))}
            </Grid>
          ) : (
            <Paper elevation={2} sx={{ borderRadius: 3, p: 2, mt: 1 }}>
              <Stack spacing={1.2}>
                {filteredFolders.map(folder => (
                  <Box key={folder.fullPath} display="flex" alignItems="center" sx={{ cursor: "pointer" }}
                    onClick={() => setSelectedPath([...selectedPath, folder.name])}>
                    <FolderIcon sx={{ color: theme.palette.primary.main, fontSize: 28, mr: 2 }} />
                    <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1 }} noWrap>
                      {folder.name}
                    </Typography>
                    <Chip size="small" label={`${folder.files.length} archivos`} />
                  </Box>
                ))}
                <Divider />
                {filteredFiles.map(file => (
                  <Box key={file.fullPath} display="flex" alignItems="center" sx={{ py: 1 }}>
                    <PictureAsPdfIcon sx={{ color: "#d32f2f", mr: 1 }} />
                    <Typography fontWeight={600} noWrap sx={{ flex: 1 }}>
                      {extractCertAndId(file.name)}
                    </Typography>
                    <Tooltip title="Mover archivo">
                      <IconButton size="small" onClick={e => setMoveFile({ file, anchorEl: e.currentTarget })}>
                        <DriveFileMoveIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Abrir PDF">
                      <IconButton size="small" component="a" href={file.url} target="_blank">
                        <DescriptionIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                ))}
              </Stack>
            </Paper>
          )}
        </Box>
      )}

      {/* Dialog crear carpeta */}
      <Dialog open={createFolderOpen} onClose={() => setCreateFolderOpen(false)}>
        <DialogTitle>Crear nueva carpeta</DialogTitle>
        <DialogContent>
          <TextField
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            label="Nombre de la carpeta"
            fullWidth
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateFolderOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
            Crear
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog mover archivo */}
      <Dialog open={!!moveFile} onClose={() => setMoveFile(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Mover archivo</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Selecciona la carpeta de destino:
          </Typography>
          <FolderMoveTree
            tree={tree} excludePath={[...selectedPath, moveFile?.file.name || ""]} onSelect={p => handleMoveFile(p)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMoveFile(null)}>Cancelar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// --- Componente para seleccionar carpeta destino (árbol) ---
function FolderMoveTree({ tree, path = [], onSelect, excludePath = [] }: {
  tree: DriveFolder | null, path?: string[], onSelect: (p: string[]) => void, excludePath?: string[]
}) {
  if (!tree) return null;
  const fullPath = [...path, tree.name === "Drive" ? "" : tree.name].filter(Boolean);
  if (JSON.stringify(fullPath) === JSON.stringify(excludePath)) return null;
  return (
    <Box sx={{ ml: path.length ? 2 : 0, my: 1 }}>
      {tree.name !== "Drive" && (
        <Button variant="outlined" size="small" sx={{ mb: 1 }} onClick={() => onSelect(fullPath)}>
          {fullPath.join(" / ")}
        </Button>
      )}
      {tree.folders.map(sub =>
        <FolderMoveTree key={sub.name + sub.fullPath}
          tree={sub} path={fullPath} onSelect={onSelect} excludePath={excludePath} />
      )}
    </Box>
  );
}
