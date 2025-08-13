
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
import CompressIcon from '@mui/icons-material/Compress';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

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
  Badge,
  Fade,
  Zoom,
  useMediaQuery,
  Stack,
  TextField,
  InputAdornment,
  ToggleButtonGroup,
  ToggleButton,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
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

  // UI state extra
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid'); // desktop
  const [compact, setCompact] = useState(false);
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({});

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const { goBack, navigateTo } = useNavigation();

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
                console.error(`Error getting download URL for ${itemRef.name}:`, e);
                return null;
              }
            })
          );
          const validFiles = files.filter(Boolean) as UserFile[];
          foldersData.push({ user: userName, files: validFiles });
        } catch (e) {
          console.error(`Error accessing folder ${userName}:`, e);
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

  const getTotalFiles = (arr = folders) =>
    arr.reduce((total, folder) => total + folder.files.length, 0);

  const formatFileName = (fileName: string) =>
    fileName.replace(/\.[^/.]+$/, '');

  // Back robusto: si hay historial en la SPA, goBack(); si no, vete al menú
  const handleBackClick = () => {
    if (typeof onBack === 'function') {
      onBack();
      return;
    }
    try {
      const hasHistory = (window as any)?.history?.state?.idx > 0;
      if (hasHistory) {
        goBack();
      } else {
        navigateTo('menu');
      }
    } catch {
      navigateTo('menu');
    }
  };

  // Filtro por texto (usuario o nombre de archivo)
  const filteredFolders = useMemo(() => {
    if (!query.trim()) return folders;
    const q = query.toLowerCase();
    return folders
      .map((f) => ({
        user: f.user,
        files: f.files.filter(
          (file) =>
            f.user.toLowerCase().includes(q) ||
            formatFileName(file.name).toLowerCase().includes(q)
        ),
      }))
      .filter((f) => f.user.toLowerCase().includes(q) || f.files.length > 0);
  }, [folders, query]);

  // ---- UI wrappers ----

  const Header = (
    <Fade in timeout={800}>
      <Paper
        elevation={8}
        sx={{
          p: isMobile ? 2 : 4,
          mb: isMobile ? 2 : 4,
          borderRadius: 4,
          background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
          color: '#ffffff',
          position: 'relative',
          overflow: 'hidden',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            right: 0,
            width: isMobile ? '100px' : '200px',
            height: isMobile ? '100px' : '200px',
            background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)',
            transform: 'translate(50%, -50%)',
            pointerEvents: 'none',
          },
        }}
      >
        {isMobile ? (
          <Box>
            {/* Fila superior: back + título + recargar */}
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
              <Box display="flex" alignItems="center">
                <Tooltip title="Regresar a la vista anterior">
                  <IconButton
                    onClick={handleBackClick}
                    sx={{
                      color: '#ffffff',
                      mr: 2,
                      backgroundColor: alpha('#ffffff', 0.15),
                      border: `1px solid ${alpha('#ffffff', 0.2)}`,
                      '&:hover': { backgroundColor: alpha('#ffffff', 0.25), transform: 'translateX(-2px)' },
                      transition: 'all 0.3s ease',
                    }}
                  >
                    <ArrowBackIcon />
                  </IconButton>
                </Tooltip>

                <Box
                  sx={{
                    backgroundColor: alpha('#ffffff', 0.15),
                    borderRadius: 2,
                    p: 1.5,
                    mr: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CloudIcon sx={{ fontSize: 32 }} />
                </Box>

                <Typography variant="h5" fontWeight={700}>
                  Drive Interno
                </Typography>
              </Box>

              <Tooltip title="Actualizar contenido">
                <IconButton
                  onClick={fetchFolders}
                  disabled={loading}
                  sx={{
                    color: '#ffffff',
                    backgroundColor: alpha('#ffffff', 0.15),
                    border: `1px solid ${alpha('#ffffff', 0.2)}`,
                    '&:hover': { backgroundColor: alpha('#ffffff', 0.25), transform: 'rotate(180deg)' },
                    '&:disabled': { backgroundColor: alpha('#ffffff', 0.1), color: alpha('#ffffff', 0.5) },
                    transition: 'all 0.3s ease',
                  }}
                >
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
            </Box>

            {/* Fila media: buscador */}
            <TextField
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar (usuario, archivo)..."
              fullWidth
              size="small"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon htmlColor="#ffffff" />
                  </InputAdornment>
                ),
              }}
              sx={{
                mb: 1.5,
                '& .MuiInputBase-root': {
                  color: '#fff',
                  backgroundColor: alpha('#ffffff', 0.15),
                },
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: alpha('#ffffff', 0.2),
                },
              }}
            />

            {/* Fila inferior: stats */}
            <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
              <Chip
                icon={<FolderIcon />}
                label={`${filteredFolders.length} carpetas`}
                size="small"
                sx={{ backgroundColor: alpha('#ffffff', 0.2), color: '#ffffff', fontWeight: 600 }}
              />
              <Chip
                icon={<DescriptionIcon />}
                label={`${getTotalFiles(filteredFolders)} archivos`}
                size="small"
                sx={{ backgroundColor: alpha('#ffffff', 0.2), color: '#ffffff', fontWeight: 600 }}
              />
            </Box>
          </Box>
        ) : (
          // Desktop header
          <Box>
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
              <Box display="flex" alignItems="center">
                <Tooltip title="Regresar a la vista anterior">
                  <IconButton
                    onClick={handleBackClick}
                    sx={{
                      color: '#ffffff',
                      mr: 3,
                      backgroundColor: alpha('#ffffff', 0.15),
                      border: `1px solid ${alpha('#ffffff', 0.2)}`,
                      '&:hover': { backgroundColor: alpha('#ffffff', 0.25), transform: 'translateX(-2px)' },
                      transition: 'all 0.3s ease',
                    }}
                  >
                    <ArrowBackIcon />
                  </IconButton>
                </Tooltip>

                <Box
                  sx={{
                    backgroundColor: alpha('#ffffff', 0.15),
                    borderRadius: 3,
                    p: 2,
                    mr: 3,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CloudIcon sx={{ fontSize: 48 }} />
                </Box>

                <Box>
                  <Typography variant="h3" fontWeight={700} sx={{ mb: 0.5 }}>
                    Drive Interno
                  </Typography>
                  <Box display="flex" alignItems="center" gap={2}>
                    <Chip
                      icon={<FolderIcon />}
                      label={`${filteredFolders.length} carpetas`}
                      sx={{ backgroundColor: alpha('#ffffff', 0.2), color: '#ffffff', fontWeight: 600 }}
                    />
                    <Chip
                      icon={<DescriptionIcon />}
                      label={`${getTotalFiles(filteredFolders)} archivos`}
                      sx={{ backgroundColor: alpha('#ffffff', 0.2), color: '#ffffff', fontWeight: 600 }}
                    />
                  </Box>
                </Box>
              </Box>

              <Stack direction="row" spacing={1} alignItems="center">
                <Tooltip title="Actualizar contenido">
                  <span>
                    <IconButton
                      onClick={fetchFolders}
                      disabled={loading}
                      sx={{
                        color: '#ffffff',
                        backgroundColor: alpha('#ffffff', 0.15),
                        border: `1px solid ${alpha('#ffffff', 0.2)}`,
                        '&:hover': { backgroundColor: alpha('#ffffff', 0.25), transform: 'rotate(180deg)' },
                        '&:disabled': { backgroundColor: alpha('#ffffff', 0.1), color: alpha('#ffffff', 0.5) },
                        transition: 'all 0.3s ease',
                      }}
                    >
                      <RefreshIcon />
                    </IconButton>
                  </span>
                </Tooltip>

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

                <Tooltip title={compact ? 'Modo amplio' : 'Modo compacto'}>
                  <IconButton
                    onClick={() => setCompact((c) => !c)}
                    sx={{
                      color: '#ffffff',
                      backgroundColor: alpha('#ffffff', 0.15),
                      border: `1px solid ${alpha('#ffffff', 0.2)}`,
                      '&:hover': { backgroundColor: alpha('#ffffff', 0.25) },
                    }}
                  >
                    {compact ? <UnfoldMoreIcon /> : <CompressIcon />}
                  </IconButton>
                </Tooltip>
              </Stack>
            </Box>

            {/* Buscador */}
            <TextField
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar (usuario, archivo)..."
              fullWidth
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
          </Box>
        )}
      </Paper>
    </Fade>
  );

  const LoadingState = (
    <Fade in timeout={600}>
      <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" py={isMobile ? 8 : 12}>
        <Box sx={{ position: 'relative', mb: 4 }}>
          <CircularProgress size={isMobile ? 60 : 80} thickness={4} sx={{ color: theme.palette.primary.main, animationDuration: '2s' }} />
          <CloudIcon
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: isMobile ? 24 : 32,
              color: theme.palette.primary.main,
            }}
          />
        </Box>
        <Typography variant={isMobile ? 'h6' : 'h5'} sx={{ color: 'text.primary', fontWeight: 600 }}>
          Cargando archivos...
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
          Explorando el drive interno
        </Typography>
        {/* Skeletons */}
        <Grid container spacing={2} sx={{ mt: 3, width: '100%' }}>
          {[...Array(isMobile ? 3 : 6)].map((_, i) => (
            <Grid key={i} item xs={12} sm={6} md={4}>
              <Skeleton variant="rounded" height={isMobile ? 90 : 140} sx={{ borderRadius: 3 }} />
            </Grid>
          ))}
        </Grid>
      </Box>
    </Fade>
  );

  const ErrorState = (
    <Zoom in timeout={600}>
      <Paper
        elevation={4}
        sx={{
          p: isMobile ? 4 : 6,
          textAlign: 'center',
          borderRadius: 4,
          background: `linear-gradient(135deg, ${alpha(theme.palette.error.main, 0.1)} 0%, ${alpha(theme.palette.error.main, 0.05)} 100%)`,
        }}
      >
        <CloudIcon sx={{ fontSize: isMobile ? 48 : 72, color: theme.palette.error.main, mb: 2 }} />
        <Typography color="error" variant={isMobile ? 'h6' : 'h5'} fontWeight={600} gutterBottom>
          {error}
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          No se pudieron cargar los archivos del drive
        </Typography>
        <Button
          variant="contained"
          size={isMobile ? 'medium' : 'large'}
          onClick={fetchFolders}
          startIcon={<RefreshIcon />}
          sx={{ mt: 2, borderRadius: 3, px: 4, py: 1.5, textTransform: 'none', fontWeight: 600 }}
        >
          Reintentar
        </Button>
      </Paper>
    </Zoom>
  );

  // --- Vista móvil: acordeones por usuario ---
  const MobileList = (
    <Stack spacing={1.5}>
      {filteredFolders.map((folder, idx) => {
        const open = expandedUsers[folder.user] ?? idx < 2; // abre las primeras dos
        const toggle = () => setExpandedUsers((s) => ({ ...s, [folder.user]: !open }));

        return (
          <Accordion
            key={folder.user}
            expanded={open}
            onChange={toggle}
            disableGutters
            sx={{
              borderRadius: 3,
              overflow: 'hidden',
              '&:before': { display: 'none' },
              border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
              background: alpha(theme.palette.background.paper, 0.8),
            }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box display="flex" alignItems="center" gap={1.5} sx={{ width: '100%' }}>
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
                <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1 }}>
                  {folder.user}
                </Typography>
                <Chip label={`${folder.files.length} archivos`} size="small" />
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              {folder.files.length === 0 ? (
                <Box textAlign="center" py={2} color="text.secondary">
                  <PictureAsPdfIcon sx={{ opacity: 0.5, mr: 1, verticalAlign: 'middle' }} />
                  <Typography variant="body2" component="span">Sin archivos PDF</Typography>
                </Box>
              ) : (
                <Stack spacing={1} sx={{ maxHeight: 300, overflowY: 'auto', pr: 0.5 }}>
                  {folder.files.map((file) => (
                    <Box
                      key={file.name}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        p: 1,
                        borderRadius: 2,
                        border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                        backgroundColor: alpha(theme.palette.action.hover, 0.4),
                      }}
                    >
                      <Box
                        sx={{
                          backgroundColor: alpha('#d32f2f', 0.1),
                          borderRadius: 1,
                          p: 0.5,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <PictureAsPdfIcon sx={{ color: '#d32f2f', fontSize: 20 }} />
                      </Box>
                      <Typography
                        variant="body2"
                        fontWeight={600}
                        sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}
                      >
                        {formatFileName(file.name)}
                      </Typography>
                      <Button
                        size="small"
                        variant="contained"
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{ textTransform: 'none', borderRadius: 2 }}
                      >
                        Ver
                      </Button>
                    </Box>
                  ))}
                </Stack>
              )}
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Stack>
  );

  // --- Vista desktop: grid o lista, con modo compacto ---
  const DesktopContent = view === 'grid' ? (
    <Grid container spacing={compact ? 2 : 4}>
      {filteredFolders.map((folder, index) => (
        <Grid item xs={12} sm={6} md={6} lg={4} key={folder.user}>
          <Zoom in timeout={400 + index * 100}>
            <Card
              sx={{
                borderRadius: 4,
                boxShadow: theme.shadows[compact ? 4 : 6],
                height: '100%',
                transition: 'all 0.3s',
                border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                '&:hover': {
                  transform: 'translateY(-6px)',
                  boxShadow: theme.shadows[compact ? 8 : 12],
                  '& .folder-icon': { transform: 'scale(1.06)' },
                },
              }}
            >
              <CardContent sx={{ p: compact ? 2 : 4 }}>
                {/* Header de carpeta */}
                <Box display="flex" alignItems="center" mb={compact ? 1.5 : 3}>
                  <Box
                    className="folder-icon"
                    sx={{
                      backgroundColor: alpha(theme.palette.primary.main, 0.12),
                      borderRadius: 3,
                      p: compact ? 1 : 2,
                      mr: compact ? 1.5 : 2.5,
                      transition: 'transform 0.3s ease',
                    }}
                  >
                    <FolderIcon sx={{ fontSize: compact ? 26 : 36, color: theme.palette.primary.main }} />
                  </Box>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography variant={compact ? 'subtitle1' : 'h6'} fontWeight={700} noWrap sx={{ mb: compact ? 0.5 : 1 }}>
                      {folder.user}
                    </Typography>
                    <Badge
                      badgeContent={folder.files.length}
                      color={folder.files.length > 0 ? 'primary' : 'default'}
                      sx={{ '& .MuiBadge-badge': { fontWeight: 600 } }}
                    >
                      <Chip label="archivos" size="small" variant="outlined" sx={{ borderRadius: 2, fontWeight: 500 }} />
                    </Badge>
                  </Box>
                </Box>

                <Divider sx={{ mb: compact ? 1.5 : 3 }} />

                {/* Lista de archivos */}
                <Box sx={{ maxHeight: compact ? 220 : 320, overflowY: 'auto' }}>
                  {folder.files.length === 0 ? (
                    <Box textAlign="center" py={compact ? 1.5 : 3} color="text.secondary">
                      <Box
                        sx={{
                          backgroundColor: alpha(theme.palette.grey[500], 0.1),
                          borderRadius: '50%',
                          width: compact ? 56 : 80,
                          height: compact ? 56 : 80,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          mx: 'auto',
                          mb: compact ? 1 : 2,
                        }}
                      >
                        <PictureAsPdfIcon sx={{ fontSize: compact ? 26 : 40, opacity: 0.5 }} />
                      </Box>
                      <Typography variant={compact ? 'body2' : 'body1'} fontWeight={500}>
                        Sin archivos PDF
                      </Typography>
                      <Typography variant="body2" sx={{ opacity: 0.7 }}>
                        Esta carpeta está vacía
                      </Typography>
                    </Box>
                  ) : (
                    folder.files.map((file, fileIndex) => (
                      <Fade in timeout={200 + fileIndex * 40} key={file.name}>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            mb: compact ? 1 : 2,
                            p: compact ? 1 : 1.5,
                            borderRadius: 3,
                            backgroundColor: alpha(theme.palette.action.hover, 0.4),
                            border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                            transition: 'all 0.2s ease',
                            '&:hover': {
                              backgroundColor: alpha(theme.palette.action.hover, 0.6),
                              transform: 'translateX(4px)',
                              boxShadow: theme.shadows[2],
                            },
                          }}
                        >
                          <Box
                            sx={{
                              backgroundColor: alpha('#d32f2f', 0.1),
                              borderRadius: 2,
                              p: compact ? 0.5 : 1,
                              mr: compact ? 1 : 2,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <PictureAsPdfIcon sx={{ color: '#d32f2f', fontSize: compact ? 18 : 24 }} />
                          </Box>
                          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                            <Typography
                              variant={compact ? 'body2' : 'body1'}
                              fontWeight={600}
                              sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', mb: compact ? 0 : 0.3 }}
                            >
                              {formatFileName(file.name)}
                            </Typography>
                            {!compact && (
                              <Typography variant="caption" color="text.secondary" fontWeight={500}>
                                Documento PDF
                              </Typography>
                            )}
                          </Box>
                          <Button
                            size={compact ? 'small' : 'medium'}
                            variant="contained"
                            color="primary"
                            sx={{
                              ml: compact ? 1 : 2,
                              borderRadius: 3,
                              minWidth: compact ? 60 : 86,
                              textTransform: 'none',
                              fontWeight: 600,
                              px: compact ? 1.5 : 2.5,
                              '&:hover': { transform: 'scale(1.05)' },
                              transition: 'transform 0.2s ease',
                            }}
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Ver
                          </Button>
                        </Box>
                      </Fade>
                    ))
                  )}
                </Box>
              </CardContent>
            </Card>
          </Zoom>
        </Grid>
      ))}
    </Grid>
  ) : (
    // Vista list en desktop
    <Stack spacing={1.5}>
      {filteredFolders.map((folder) => (
        <Paper
          key={folder.user}
          variant="outlined"
          sx={{
            p: compact ? 1.5 : 2,
            borderRadius: 3,
            borderColor: alpha(theme.palette.divider, 0.2),
          }}
        >
          <Box display="flex" alignItems="center" gap={1.5} mb={compact ? 1 : 1.5}>
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
            <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1 }}>
              {folder.user}
            </Typography>
            <Chip label={`${folder.files.length} archivos`} size="small" />
          </Box>
          <Stack spacing={compact ? 1 : 1.5} sx={{ maxHeight: compact ? 220 : 320, overflowY: 'auto' }}>
            {folder.files.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ pl: 1 }}>
                Sin archivos
              </Typography>
            ) : (
              folder.files.map((file) => (
                <Box
                  key={file.name}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    p: compact ? 0.75 : 1.25,
                    borderRadius: 2,
                    border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                    backgroundColor: alpha(theme.palette.action.hover, 0.35),
                    '&:hover': { backgroundColor: alpha(theme.palette.action.hover, 0.55) },
                  }}
                >
                  <PictureAsPdfIcon sx={{ color: '#d32f2f', fontSize: compact ? 18 : 22 }} />
                  <Typography
                    variant={compact ? 'body2' : 'body1'}
                    sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    fontWeight={600}
                  >
                    {formatFileName(file.name)}
                  </Typography>
                  <Button
                    size={compact ? 'small' : 'medium'}
                    variant="contained"
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ textTransform: 'none', borderRadius: 2 }}
                  >
                    Ver
                  </Button>
                </Box>
              ))
            )}
          </Stack>
        </Paper>
      ))}
    </Stack>
  );

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.08)} 0%, ${alpha(
          theme.palette.secondary.main,
          0.08
        )} 50%, ${alpha(theme.palette.primary.main, 0.05)} 100%)`,
        position: 'relative',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.1) 0%, transparent 50%)',
          pointerEvents: 'none',
        },
      }}
    >
      <Container maxWidth="xl" sx={{ py: isMobile ? 2 : 4, position: 'relative', zIndex: 1 }}>
        {Header}

        {loading ? (
          LoadingState
        ) : error ? (
          ErrorState
        ) : filteredFolders.length === 0 ? (
          <Zoom in timeout={600}>
            <Paper
              elevation={4}
              sx={{
                p: isMobile ? 4 : 8,
                textAlign: 'center',
                borderRadius: 4,
                background: `linear-gradient(135deg, ${alpha(theme.palette.grey[100], 0.8)} 0%, ${alpha(
                  theme.palette.grey[50],
                  0.8
                )} 100%)`,
              }}
            >
              <Box
                sx={{
                  backgroundColor: alpha(theme.palette.primary.main, 0.1),
                  borderRadius: '50%',
                  width: isMobile ? 80 : 120,
                  height: isMobile ? 80 : 120,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                  mb: 3,
                }}
              >
                <FolderIcon sx={{ fontSize: isMobile ? 40 : 64, color: theme.palette.primary.main }} />
              </Box>
              <Typography variant={isMobile ? 'h6' : 'h5'} fontWeight={600} gutterBottom>
                No hay resultados
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 420, mx: 'auto' }}>
                {query ? 'Intenta con otro término de búsqueda' : 'Los archivos y carpetas aparecerán aquí cuando se guarden hojas de trabajo en el sistema'}
              </Typography>
            </Paper>
          </Zoom>
        ) : isMobile ? (
          MobileList
        ) : (
          DesktopContent
        )}
      </Container>
    </Box>
  );
};

export default DriveScreen;
