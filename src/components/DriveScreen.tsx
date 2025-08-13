import React, { useEffect, useMemo, useState } from 'react';
import { ref, listAll, getDownloadURL } from 'firebase/storage';
import { storage } from '../utils/firebase';
import { useNavigation } from '../hooks/useNavigation';

// Icons (MUI)
import FolderIcon from '@mui/icons-material/Folder';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloudIcon from '@mui/icons-material/Cloud';
import DescriptionIcon from '@mui/icons-material/Description';
import SearchIcon from '@mui/icons-material/Search';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewListIcon from '@mui/icons-material/ViewList';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

// MUI
import {
  Card,
  CardContent,
  Typography,
  Box,
  Grid,
  Button,
  CircularProgress,
  Chip,
  IconButton,
  Tooltip,
  Paper,
  useTheme,
  alpha,
  Container,
  Fade,
  Zoom,
  useMediaQuery,
  Stack,
  TextField,
  InputAdornment,
  ToggleButtonGroup,
  ToggleButton,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Link,
  Breadcrumbs,
  CardActionArea,
  Skeleton,
} from '@mui/material';

interface UserFile { name: string; url: string; size?: number }
interface UserFolder { user: string; files: UserFile[] }

interface DriveScreenProps {
  onBack?: () => void; // opcional
}

export const DriveScreen: React.FC<DriveScreenProps> = ({ onBack }) => {
  const [folders, setFolders] = useState<UserFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid'); // solo para el nivel carpetas (desktop)
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null); // null = nivel carpetas
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { goBack, navigateTo } = useNavigation();

  // --------- Carga desde Firebase Storage ----------
  const fetchFolders = async () => {
    setLoading(true);
    setError(null);
    try {
      const worksheetsRef = ref(storage, 'worksheets');
      const worksheetsList = await listAll(worksheetsRef);

      const foldersData: UserFolder[] = [];

      for (const folderRef of worksheetsList.prefixes) {
        const userName = folderRef.name;
        try {
          const filesList = await listAll(folderRef);
          const files = await Promise.all(
            filesList.items.map(async (itemRef) => {
              try {
                const url = await getDownloadURL(itemRef);
                return { name: itemRef.name, url };
              } catch (e) {
                console.error(`Error getDownloadURL(${itemRef.name}):`, e);
                return null;
              }
            })
          );
          const validFiles = (files.filter(Boolean) as UserFile[]).sort((a, b) =>
            a.name.localeCompare(b.name)
          );
          foldersData.push({ user: userName, files: validFiles });
        } catch (e) {
          console.error(`Error listAll(${userName}):`, e);
          foldersData.push({ user: userName, files: [] });
        }
      }

      foldersData.sort((a, b) => a.user.localeCompare(b.user));
      setFolders(foldersData);
    } catch (e) {
      console.error('Error fetching folders:', e);
      setError('Error al cargar las carpetas. Intenta nuevamente.');
      setFolders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFolders();
  }, []);

  // --------- Helpers ----------
  const formatFileName = (fileName: string) => fileName.replace(/\.[^/.]+$/, '');

  const handleEnterFolder = (name: string) => {
    setSelectedFolder(name);
    setQuery(''); // opcional: limpiar búsqueda al entrar
  };

  const handleBackClick = () => {
    if (selectedFolder) {
      setSelectedFolder(null); // salir de la carpeta → volver al listado
      return;
    }
    if (typeof onBack === 'function') {
      onBack();
      return;
    }
    try {
      const hasHistory = (window as any)?.history?.state?.idx > 0;
      if (hasHistory) goBack();
      else navigateTo('menu');
    } catch {
      navigateTo('menu');
    }
  };

  // --------- Filtros ----------
  // Nivel carpetas: muestra carpetas cuyo nombre o archivos dentro coinciden
  const filteredFolders = useMemo(() => {
    if (!query.trim()) return folders;
    const q = query.toLowerCase();
    return folders.filter((f) => {
      const inUser = f.user.toLowerCase().includes(q);
      const inFiles = f.files.some((file) =>
        formatFileName(file.name).toLowerCase().includes(q)
      );
      return inUser || inFiles;
    });
  }, [folders, query]);

  // Nivel archivos: obtiene carpeta actual y filtra archivos por nombre
  const currentFolder = useMemo(
    () => folders.find((f) => f.user === selectedFolder) || null,
    [folders, selectedFolder]
  );

  const filteredFiles = useMemo(() => {
    if (!currentFolder) return [];
    if (!query.trim()) return currentFolder.files;
    const q = query.toLowerCase();
    return currentFolder.files.filter((file) =>
      formatFileName(file.name).toLowerCase().includes(q)
    );
    // Nota: si quieres filtrar también por extensión, cambia el formatFileName
  }, [currentFolder, query]);

  // --------- UI: Header ----------
  const Header = (
    <Fade in timeout={500}>
      <Paper
        elevation={8}
        sx={{
          p: isMobile ? 2 : 4,
          mb: isMobile ? 2 : 4,
          borderRadius: 4,
          background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
          color: '#ffffff',
        }}
      >
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={isMobile ? 1.5 : 2.5}>
          {/* Back + Icono + Migas */}
          <Box display="flex" alignItems="center">
            <Tooltip title={selectedFolder ? 'Volver a carpetas' : 'Regresar'}>
              <IconButton
                onClick={handleBackClick}
                sx={{
                  color: '#ffffff',
                  mr: isMobile ? 1.5 : 2.5,
                  backgroundColor: alpha('#ffffff', 0.15),
                  border: `1px solid ${alpha('#ffffff', 0.2)}`,
                  '&:hover': { backgroundColor: alpha('#ffffff', 0.25) },
                }}
              >
                <ArrowBackIcon />
              </IconButton>
            </Tooltip>

            <Box
              sx={{
                backgroundColor: alpha('#ffffff', 0.15),
                borderRadius: 2,
                p: isMobile ? 1.2 : 1.6,
                mr: isMobile ? 1.5 : 2.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CloudIcon sx={{ fontSize: isMobile ? 28 : 40 }} />
            </Box>

            <Breadcrumbs
              separator={<NavigateNextIcon htmlColor="#fff" fontSize="small" />}
              aria-label="breadcrumb"
              sx={{ color: '#fff' }}
            >
              <Link
                underline="hover"
                color="inherit"
                onClick={() => setSelectedFolder(null)}
                sx={{ cursor: 'pointer', fontWeight: 700 }}
              >
                Drive Interno
              </Link>
              {selectedFolder && (
                <Typography color="#fff" fontWeight={700}>
                  {selectedFolder}
                </Typography>
              )}
            </Breadcrumbs>
          </Box>

          {/* Acciones derechas */}
          <Stack direction="row" spacing={1} alignItems="center">
            {!selectedFolder && !isMobile && (
              <ToggleButtonGroup
                value={view}
                exclusive
                onChange={(_, v) => v && setView(v)}
                size="small"
                sx={{
                  backgroundColor: alpha('#ffffff', 0.15),
                  borderRadius: 2,
                  '& .MuiToggleButton-root': {
                    color: '#fff',
                    borderColor: alpha('#ffffff', 0.2),
                    '&.Mui-selected': { backgroundColor: alpha('#ffffff', 0.25) },
                  },
                }}
              >
                <ToggleButton value="grid">
                  <ViewModuleIcon fontSize="small" />
                </ToggleButton>
                <ToggleButton value="list">
                  <ViewListIcon fontSize="small" />
                </ToggleButton>
              </ToggleButtonGroup>
            )}

            <Tooltip title="Actualizar contenido">
              <span>
                <IconButton
                  onClick={fetchFolders}
                  disabled={loading}
                  sx={{
                    color: '#ffffff',
                    backgroundColor: alpha('#ffffff', 0.15),
                    border: `1px solid ${alpha('#ffffff', 0.2)}`,
                    '&:hover': { backgroundColor: alpha('#ffffff', 0.25) },
                    '&:disabled': { backgroundColor: alpha('#ffffff', 0.1), color: alpha('#ffffff', 0.5) },
                  }}
                >
                  <RefreshIcon />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </Box>

        {/* Buscador + stats */}
        <Stack direction={isMobile ? 'column' : 'row'} spacing={isMobile ? 1.5 : 2} alignItems={isMobile ? 'stretch' : 'center'}>
          <TextField
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={selectedFolder ? 'Buscar archivo...' : 'Buscar (carpeta o archivo)...'}
            fullWidth
            size={isMobile ? 'small' : 'medium'}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon htmlColor="#ffffff" />
                </InputAdornment>
              ),
            }}
            sx={{
              '& .MuiInputBase-root': {
                color: '#fff',
                backgroundColor: alpha('#ffffff', 0.15),
              },
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: alpha('#ffffff', 0.2),
              },
            }}
          />

          <Stack direction="row" spacing={1} flexWrap="wrap">
            {!selectedFolder ? (
              <>
                <Chip icon={<FolderIcon />} label={`${filteredFolders.length} carpetas`} sx={{ color: '#fff', backgroundColor: alpha('#ffffff', 0.2), fontWeight: 600 }} />
                <Chip icon={<DescriptionIcon />} label={`${filteredFolders.reduce((n, f) => n + f.files.length, 0)} archivos`} sx={{ color: '#fff', backgroundColor: alpha('#ffffff', 0.2), fontWeight: 600 }} />
              </>
            ) : (
              <>
                <Chip icon={<FolderIcon />} label={selectedFolder} sx={{ color: '#fff', backgroundColor: alpha('#ffffff', 0.2), fontWeight: 600 }} />
                <Chip icon={<DescriptionIcon />} label={`${filteredFiles.length} archivos`} sx={{ color: '#fff', backgroundColor: alpha('#ffffff', 0.2), fontWeight: 600 }} />
              </>
            )}
          </Stack>
        </Stack>
      </Paper>
    </Fade>
  );

  // --------- Estados de carga / error ----------
  const LoadingState = (
    <Fade in timeout={400}>
      <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" py={isMobile ? 6 : 10}>
        <Box sx={{ position: 'relative', mb: 3 }}>
          <CircularProgress size={isMobile ? 56 : 72} thickness={4} sx={{ color: theme.palette.primary.main }} />
          <CloudIcon
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: isMobile ? 22 : 28,
              color: theme.palette.primary.main,
            }}
          />
        </Box>
        <Typography variant={isMobile ? 'h6' : 'h5'}>Cargando...</Typography>
        <Grid container spacing={2} sx={{ mt: 2, width: '100%' }}>
          {[...Array(isMobile ? 3 : 6)].map((_, i) => (
            <Grid key={i} item xs={12} sm={6} md={4}>
              <Skeleton variant="rounded" height={isMobile ? 80 : 120} sx={{ borderRadius: 3 }} />
            </Grid>
          ))}
        </Grid>
      </Box>
    </Fade>
  );

  const ErrorState = (
    <Zoom in timeout={400}>
      <Paper elevation={4} sx={{ p: isMobile ? 4 : 6, textAlign: 'center', borderRadius: 4 }}>
        <CloudIcon sx={{ fontSize: isMobile ? 48 : 72, color: theme.palette.error.main, mb: 1 }} />
        <Typography color="error" variant={isMobile ? 'h6' : 'h5'} fontWeight={700} gutterBottom>
          {error}
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          No se pudieron cargar los archivos del drive
        </Typography>
        <Button variant="contained" onClick={fetchFolders} startIcon={<RefreshIcon />} sx={{ borderRadius: 3 }}>
          Reintentar
        </Button>
      </Paper>
    </Zoom>
  );

  // --------- VISTAS ---------

  // 1) Nivel CARPETAS (root)
  const FoldersGrid = (
    <Grid container spacing={isMobile ? 1.5 : 3}>
      {filteredFolders.map((folder, idx) => (
        <Grid key={folder.user} item xs={12} sm={6} md={6} lg={4}>
          <Zoom in timeout={300 + idx * 60}>
            <Card
              elevation={4}
              sx={{
                borderRadius: 4,
                border: `1px solid ${alpha(theme.palette.divider, 0.12)}`,
                transition: 'transform .25s ease, box-shadow .25s ease',
                '&:hover': { transform: 'translateY(-6px)', boxShadow: theme.shadows[10] },
                height: '100%',
              }}
            >
              <CardActionArea onClick={() => handleEnterFolder(folder.user)} sx={{ height: '100%' }}>
                <CardContent sx={{ p: isMobile ? 2 : 3 }}>
                  <Box display="flex" alignItems="center" mb={isMobile ? 1 : 2}>
                    <Box
                      sx={{
                        backgroundColor: alpha(theme.palette.primary.main, 0.12),
                        borderRadius: 2,
                        p: isMobile ? 1 : 1.5,
                        mr: isMobile ? 1.5 : 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <FolderIcon sx={{ color: theme.palette.primary.main, fontSize: isMobile ? 28 : 36 }} />
                    </Box>
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Typography variant={isMobile ? 'subtitle1' : 'h6'} fontWeight={700} noWrap>
                        {folder.user}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {folder.files.length} archivo{folder.files.length === 1 ? '' : 's'}
                      </Typography>
                    </Box>
                  </Box>

                  {/* Mini preview de hasta 3 archivos */}
                  <Stack spacing={0.5}>
                    {folder.files.slice(0, 3).map((file) => (
                      <Typography
                        key={file.name}
                        variant="caption"
                        sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}
                        noWrap
                        title={formatFileName(file.name)}
                      >
                        <PictureAsPdfIcon sx={{ fontSize: 16, color: '#d32f2f' }} />
                        {formatFileName(file.name)}
                      </Typography>
                    ))}
                    {folder.files.length > 3 && (
                      <Typography variant="caption" color="text.secondary">
                        +{folder.files.length - 3} más
                      </Typography>
                    )}
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>
          </Zoom>
        </Grid>
      ))}
    </Grid>
  );

  const FoldersList = (
    <Stack spacing={1.2}>
      {filteredFolders.map((folder) => (
        <Paper
          key={folder.user}
          variant="outlined"
          onClick={() => handleEnterFolder(folder.user)}
          sx={{
            p: isMobile ? 1.5 : 2,
            borderRadius: 3,
            cursor: 'pointer',
            borderColor: alpha(theme.palette.divider, 0.2),
            '&:hover': { backgroundColor: alpha(theme.palette.action.hover, 0.4) },
          }}
        >
          <Box display="flex" alignItems="center" gap={1.5}>
            <Box
              sx={{
                backgroundColor: alpha(theme.palette.primary.main, 0.12),
                borderRadius: 2,
                p: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FolderIcon sx={{ color: theme.palette.primary.main }} />
            </Box>
            <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1 }} noWrap>
              {folder.user}
            </Typography>
            <Chip size="small" label={`${folder.files.length} archivos`} />
          </Box>
        </Paper>
      ))}
    </Stack>
  );

  // 2) Nivel ARCHIVOS dentro de una carpeta
  const FilesGrid = (
    <Grid container spacing={isMobile ? 1.2 : 2.4}>
      {filteredFiles.map((file, idx) => (
        <Grid key={file.name} item xs={12} sm={6} md={4} lg={3}>
          <Zoom in timeout={250 + idx * 50}>
            <Card
              variant="outlined"
              sx={{
                borderRadius: 3,
                height: '100%',
                borderColor: alpha(theme.palette.divider, 0.2),
                transition: 'transform .2s ease',
                '&:hover': { transform: 'translateY(-4px)' },
              }}
            >
              <CardContent sx={{ p: isMobile ? 1.5 : 2 }}>
                <Box display="flex" alignItems="center" gap={1.5} mb={1}>
                  <Box
                    sx={{
                      backgroundColor: alpha('#d32f2f', 0.1),
                      borderRadius: 2,
                      p: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <PictureAsPdfIcon sx={{ color: '#d32f2f' }} />
                  </Box>
                  <Typography variant="subtitle2" fontWeight={700} noWrap title={formatFileName(file.name)} sx={{ flex: 1 }}>
                    {formatFileName(file.name)}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                  <Button
                    fullWidth
                    size="small"
                    variant="contained"
                    color="primary"
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ textTransform: 'none', borderRadius: 2 }}
                  >
                    Ver
                  </Button>
                  <Button
                    fullWidth
                    size="small"
                    variant="outlined"
                    onClick={() => setPreview({ url: file.url, name: formatFileName(file.name) })}
                    sx={{ textTransform: 'none', borderRadius: 2 }}
                  >
                    Previsualizar
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Zoom>
        </Grid>
      ))}
    </Grid>
  );

  const FilesEmpty = (
    <Paper variant="outlined" sx={{ p: isMobile ? 3 : 5, textAlign: 'center', borderRadius: 3 }}>
      <PictureAsPdfIcon sx={{ fontSize: isMobile ? 40 : 56, opacity: 0.5, mb: 1 }} />
      <Typography variant={isMobile ? 'body1' : 'h6'} fontWeight={700}>Esta carpeta está vacía</Typography>
      <Typography variant="body2" color="text.secondary">No se encontraron archivos</Typography>
    </Paper>
  );

  // --------- Render principal ----------
  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.07)} 0%, ${alpha(
          theme.palette.secondary.main,
          0.07
        )} 50%, ${alpha(theme.palette.primary.main, 0.04)} 100%)`,
      }}
    >
      <Container maxWidth="xl" sx={{ py: isMobile ? 2 : 4 }}>
        {Header}

        {loading ? (
          LoadingState
        ) : error ? (
          ErrorState
        ) : !selectedFolder ? (
          // Nivel CARPETAS
          view === 'list' && !isMobile ? FoldersList : FoldersGrid
        ) : (
          // Nivel ARCHIVOS
          <>
            {filteredFiles.length > 0 ? FilesGrid : FilesEmpty}
          </>
        )}
      </Container>

      {/* Modal de previsualización */}
      <Dialog open={!!preview} onClose={() => setPreview(null)} fullWidth maxWidth="lg">
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <PictureAsPdfIcon color="error" />
          {preview?.name}
        </DialogTitle>
        <DialogContent dividers sx={{ height: '70vh', p: 0 }}>
          {preview && (
            <Box sx={{ width: '100%', height: '100%' }}>
              <iframe
                src={preview.url}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title={preview.name}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          {preview && (
            <Button
              href={preview.url}
              target="_blank"
              rel="noopener noreferrer"
              variant="contained"
              sx={{ textTransform: 'none' }}
            >
              Abrir en nueva pestaña
            </Button>
          )}
          <Button onClick={() => setPreview(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DriveScreen;
