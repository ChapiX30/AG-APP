// src/components/DriveScreen.tsx

import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { ref, listAll, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../utils/firebase';
import FolderIcon from '@mui/icons-material/Folder';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloudIcon from '@mui/icons-material/Cloud';
import DescriptionIcon from '@mui/icons-material/Description';
import MenuIcon from '@mui/icons-material/Menu';
import { 
  Card, 
  CardContent, 
  Typography, 
  Box, 
  Grid, 
  Button, 
  CircularProgress,
  Divider,
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
  Stack
} from '@mui/material';

interface UserFolder {
  user: string;
  files: { name: string; url: string; size?: number }[];
}

interface DriveScreenProps {
  onBack?: () => void;
}

export const DriveScreen: React.FC<DriveScreenProps> = ({ onBack }) => {
  const [folders, setFolders] = useState<UserFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isSmall = useMediaQuery(theme.breakpoints.down('sm'));

  const fetchFolders = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Primero obtenemos todos los archivos del storage directamente
      const worksheetsRef = ref(storage, 'worksheets');
      const worksheetsList = await listAll(worksheetsRef);
      
      const foldersData: UserFolder[] = [];
      
      // Iteramos sobre cada "carpeta" de usuario
      for (const folderRef of worksheetsList.prefixes) {
        const userName = folderRef.name;
        
        try {
          const filesList = await listAll(folderRef);
          const files = await Promise.all(
            filesList.items.map(async (itemRef) => {
              try {
                const url = await getDownloadURL(itemRef);
                return {
                  name: itemRef.name,
                  url: url,
                };
              } catch (error) {
                console.error(`Error getting download URL for ${itemRef.name}:`, error);
                return null;
              }
            })
          );
          
          // Filtramos archivos nulos y agregamos la carpeta
          const validFiles = files.filter(file => file !== null) as { name: string; url: string }[];
          foldersData.push({ user: userName, files: validFiles });
          
        } catch (error) {
          console.error(`Error accessing folder ${userName}:`, error);
          // Agregamos carpeta vacía si hay error
          foldersData.push({ user: userName, files: [] });
        }
      }
      
      // Ordenamos por nombre de usuario
      foldersData.sort((a, b) => a.user.localeCompare(b.user));
      setFolders(foldersData);
      
    } catch (error) {
      console.error('Error fetching folders:', error);
      setError('Error al cargar las carpetas. Intenta nuevamente.');
      setFolders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFolders();
  }, []);

  const formatFileName = (fileName: string) => {
    // Remover la extensión para mostrar
    return fileName.replace(/\.[^/.]+$/, '');
  };

  const getTotalFiles = () => {
    return folders.reduce((total, folder) => total + folder.files.length, 0);
  };

  const handleBackClick = () => {
    if (onBack) {
      onBack();
    } else {
      // Fallback: usar window.history para regresar
      window.history.back();
    }
  };

  return (
    <Box 
      sx={{ 
        minHeight: '100vh',
        background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.08)} 0%, ${alpha(theme.palette.secondary.main, 0.08)} 50%, ${alpha(theme.palette.primary.main, 0.05)} 100%)`,
        position: 'relative',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.1) 0%, transparent 50%)',
          pointerEvents: 'none'
        }
      }}
    >
      <Container maxWidth="xl" sx={{ py: isMobile ? 2 : 4, position: 'relative', zIndex: 1 }}>
        {/* Header mejorado - Responsivo */}
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
                pointerEvents: 'none'
              }
            }}
          >
            {/* Versión móvil del header */}
            {isMobile ? (
              <Box>
                {/* Fila superior con botón de regresar y título */}
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
                          '&:hover': {
                            backgroundColor: alpha('#ffffff', 0.25),
                            transform: 'translateX(-2px)'
                          },
                          transition: 'all 0.3s ease'
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
                        justifyContent: 'center'
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
                        '&:hover': {
                          backgroundColor: alpha('#ffffff', 0.25),
                          transform: 'rotate(180deg)'
                        },
                        '&:disabled': {
                          backgroundColor: alpha('#ffffff', 0.1),
                          color: alpha('#ffffff', 0.5)
                        },
                        transition: 'all 0.3s ease'
                      }}
                    >
                      <RefreshIcon />
                    </IconButton>
                  </Tooltip>
                </Box>
                
                {/* Fila inferior con estadísticas */}
                <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                  <Chip 
                    icon={<FolderIcon />}
                    label={`${folders.length} carpetas`}
                    size="small"
                    sx={{ 
                      backgroundColor: alpha('#ffffff', 0.2),
                      color: '#ffffff',
                      fontWeight: 600
                    }}
                  />
                  <Chip 
                    icon={<DescriptionIcon />}
                    label={`${getTotalFiles()} archivos`}
                    size="small"
                    sx={{ 
                      backgroundColor: alpha('#ffffff', 0.2),
                      color: '#ffffff',
                      fontWeight: 600
                    }}
                  />
                </Box>
              </Box>
            ) : (
              /* Versión escritorio del header */
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box display="flex" alignItems="center">
                  <Tooltip title="Regresar a la vista anterior">
                    <IconButton 
                      onClick={handleBackClick}
                      sx={{ 
                        color: '#ffffff', 
                        mr: 3,
                        backgroundColor: alpha('#ffffff', 0.15),
                        border: `1px solid ${alpha('#ffffff', 0.2)}`,
                        '&:hover': {
                          backgroundColor: alpha('#ffffff', 0.25),
                          transform: 'translateX(-2px)'
                        },
                        transition: 'all 0.3s ease'
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
                      justifyContent: 'center'
                    }}
                  >
                    <CloudIcon sx={{ fontSize: 48 }} />
                  </Box>
                  
                  <Box>
                    <Typography variant="h3" fontWeight={700} sx={{ mb: 1 }}>
                      Drive Interno
                    </Typography>
                    <Box display="flex" alignItems="center" gap={2}>
                      <Chip 
                        icon={<FolderIcon />}
                        label={`${folders.length} carpetas`}
                        sx={{ 
                          backgroundColor: alpha('#ffffff', 0.2),
                          color: '#ffffff',
                          fontWeight: 600
                        }}
                      />
                      <Chip 
                        icon={<DescriptionIcon />}
                        label={`${getTotalFiles()} archivos`}
                        sx={{ 
                          backgroundColor: alpha('#ffffff', 0.2),
                          color: '#ffffff',
                          fontWeight: 600
                        }}
                      />
                    </Box>
                  </Box>
                </Box>
                
                <Tooltip title="Actualizar contenido">
                  <IconButton 
                    onClick={fetchFolders}
                    disabled={loading}
                    sx={{ 
                      color: '#ffffff',
                      backgroundColor: alpha('#ffffff', 0.15),
                      border: `1px solid ${alpha('#ffffff', 0.2)}`,
                      '&:hover': {
                        backgroundColor: alpha('#ffffff', 0.25),
                        transform: 'rotate(180deg)'
                      },
                      '&:disabled': {
                        backgroundColor: alpha('#ffffff', 0.1),
                        color: alpha('#ffffff', 0.5)
                      },
                      transition: 'all 0.3s ease'
                    }}
                  >
                    <RefreshIcon />
                  </IconButton>
                </Tooltip>
              </Box>
            )}
          </Paper>
        </Fade>

        {/* Content */}
        {loading ? (
          <Fade in timeout={600}>
            <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" py={isMobile ? 8 : 12}>
              <Box sx={{ position: 'relative', mb: 4 }}>
                <CircularProgress 
                  size={isMobile ? 60 : 80} 
                  thickness={4} 
                  sx={{ 
                    color: theme.palette.primary.main,
                    animationDuration: '2s'
                  }}
                />
                <CloudIcon 
                  sx={{ 
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    fontSize: isMobile ? 24 : 32,
                    color: theme.palette.primary.main
                  }}
                />
              </Box>
              <Typography variant={isMobile ? "h6" : "h5"} sx={{ color: 'text.primary', fontWeight: 600 }}>
                Cargando archivos...
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
                Explorando el drive interno
              </Typography>
            </Box>
          </Fade>
        ) : error ? (
          <Zoom in timeout={600}>
            <Paper 
              elevation={4} 
              sx={{ 
                p: isMobile ? 4 : 6, 
                textAlign: 'center', 
                borderRadius: 4,
                background: `linear-gradient(135deg, ${alpha(theme.palette.error.main, 0.1)} 0%, ${alpha(theme.palette.error.main, 0.05)} 100%)`
              }}
            >
              <CloudIcon sx={{ fontSize: isMobile ? 48 : 72, color: theme.palette.error.main, mb: 2 }} />
              <Typography color="error" variant={isMobile ? "h6" : "h5"} fontWeight={600} gutterBottom>
                {error}
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                No se pudieron cargar los archivos del drive
              </Typography>
              <Button 
                variant="contained" 
                size={isMobile ? "medium" : "large"}
                onClick={fetchFolders}
                startIcon={<RefreshIcon />}
                sx={{ 
                  mt: 2,
                  borderRadius: 3,
                  px: 4,
                  py: 1.5,
                  textTransform: 'none',
                  fontWeight: 600
                }}
              >
                Reintentar
              </Button>
            </Paper>
          </Zoom>
        ) : folders.length === 0 ? (
          <Zoom in timeout={600}>
            <Paper 
              elevation={4} 
              sx={{ 
                p: isMobile ? 4 : 8, 
                textAlign: 'center', 
                borderRadius: 4,
                background: `linear-gradient(135deg, ${alpha(theme.palette.grey[100], 0.8)} 0%, ${alpha(theme.palette.grey[50], 0.8)} 100%)`
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
                  mb: 3
                }}
              >
                <FolderIcon sx={{ fontSize: isMobile ? 40 : 64, color: theme.palette.primary.main }} />
              </Box>
              <Typography variant={isMobile ? "h6" : "h5"} fontWeight={600} gutterBottom>
                No hay carpetas disponibles
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 400, mx: 'auto' }}>
                Los archivos y carpetas aparecerán aquí cuando se guarden hojas de trabajo en el sistema
              </Typography>
            </Paper>
          </Zoom>
        ) : (
          <Grid container spacing={isMobile ? 2 : 4}>
            {folders.map((folder, index) => (
              <Grid item xs={12} sm={6} md={6} lg={4} key={folder.user}>
                <Zoom in timeout={400 + index * 100}>
                  <Card 
                    sx={{ 
                      borderRadius: 4, 
                      boxShadow: theme.shadows[6],
                      height: '100%',
                      transition: 'all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                      border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                      '&:hover': {
                        transform: isMobile ? 'translateY(-4px)' : 'translateY(-8px)',
                        boxShadow: theme.shadows[12],
                        '& .folder-icon': {
                          transform: 'scale(1.1)'
                        }
                      }
                    }}
                  >
                    <CardContent sx={{ p: isMobile ? 2 : 4 }}>
                      {/* Folder Header */}
                      <Box display="flex" alignItems="center" mb={isMobile ? 2 : 3}>
                        <Box
                          className="folder-icon"
                          sx={{
                            backgroundColor: alpha(theme.palette.primary.main, 0.12),
                            borderRadius: 3,
                            p: isMobile ? 1.5 : 2,
                            mr: isMobile ? 1.5 : 2.5,
                            transition: 'transform 0.3s ease'
                          }}
                        >
                          <FolderIcon sx={{ fontSize: isMobile ? 28 : 36, color: theme.palette.primary.main }} />
                        </Box>
                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                          <Typography variant={isMobile ? "subtitle1" : "h6"} fontWeight={700} noWrap sx={{ mb: 1 }}>
                            {folder.user}
                          </Typography>
                          <Badge 
                            badgeContent={folder.files.length}
                            color={folder.files.length > 0 ? "primary" : "default"}
                            sx={{
                              '& .MuiBadge-badge': {
                                fontWeight: 600
                              }
                            }}
                          >
                            <Chip 
                              label="archivos"
                              size="small"
                              variant="outlined"
                              sx={{ 
                                borderRadius: 2,
                                fontWeight: 500
                              }}
                            />
                          </Badge>
                        </Box>
                      </Box>

                      <Divider sx={{ mb: isMobile ? 2 : 3 }} />

                      {/* Files List */}
                      <Box sx={{ maxHeight: isMobile ? 200 : 320, overflowY: 'auto' }}>
                        {folder.files.length === 0 ? (
                          <Box 
                            sx={{ 
                              textAlign: 'center', 
                              py: isMobile ? 2 : 4,
                              color: 'text.secondary'
                            }}
                          >
                            <Box
                              sx={{
                                backgroundColor: alpha(theme.palette.grey[500], 0.1),
                                borderRadius: '50%',
                                width: isMobile ? 60 : 80,
                                height: isMobile ? 60 : 80,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                mx: 'auto',
                                mb: 2
                              }}
                            >
                              <PictureAsPdfIcon sx={{ fontSize: isMobile ? 30 : 40, opacity: 0.5 }} />
                            </Box>
                            <Typography variant="body1" fontWeight={500}>
                              Sin archivos PDF
                            </Typography>
                            <Typography variant="body2" sx={{ opacity: 0.7 }}>
                              Esta carpeta está vacía
                            </Typography>
                          </Box>
                        ) : (
                          folder.files.map((file, fileIndex) => (
                            <Fade in timeout={300 + fileIndex * 50} key={file.name}>
                              <Box 
                                sx={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  mb: isMobile ? 1.5 : 2,
                                  p: isMobile ? 1.5 : 2,
                                  borderRadius: 3,
                                  backgroundColor: alpha(theme.palette.action.hover, 0.4),
                                  border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                                  transition: 'all 0.3s ease',
                                  '&:hover': {
                                    backgroundColor: alpha(theme.palette.action.hover, 0.6),
                                    transform: isMobile ? 'translateX(2px)' : 'translateX(4px)',
                                    boxShadow: theme.shadows[2]
                                  }
                                }}
                              >
                                <Box
                                  sx={{
                                    backgroundColor: alpha('#d32f2f', 0.1),
                                    borderRadius: 2,
                                    p: isMobile ? 0.5 : 1,
                                    mr: isMobile ? 1 : 2,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}
                                >
                                  <PictureAsPdfIcon sx={{ color: "#d32f2f", fontSize: isMobile ? 20 : 28 }} />
                                </Box>
                                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                  <Typography 
                                    variant={isMobile ? "body2" : "body1"} 
                                    fontWeight={600}
                                    sx={{ 
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      mb: 0.5
                                    }}
                                  >
                                    {formatFileName(file.name)}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary" fontWeight={500}>
                                    Documento PDF
                                  </Typography>
                                </Box>
                                <Button
                                  size={isMobile ? "small" : "medium"}
                                  variant="contained"
                                  color="primary"
                                  sx={{ 
                                    ml: isMobile ? 1 : 2, 
                                    borderRadius: 3, 
                                    minWidth: isMobile ? 60 : 80,
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    px: isMobile ? 2 : 3,
                                    '&:hover': {
                                      transform: 'scale(1.05)'
                                    },
                                    transition: 'transform 0.2s ease'
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
        )}
      </Container>
    </Box>
  );
};