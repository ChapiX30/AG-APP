// src/components/ui/drive/FolderItem.tsx

import React from 'react';
import { Grid, Card, CardContent, Typography, Box, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import { DriveFolder } from '../../../utils/fileUtils'; // Ajusta la ruta

interface FolderItemProps {
    folder: DriveFolder;
    view: 'grid' | 'list';
    onClick: () => void;
}

export const FolderItem = ({ folder, view, onClick }: FolderItemProps) => {
  if (view === 'grid') {
    return (
      <Grid item xs={12} sm={6} md={4} lg={3}>
        <Card onClick={onClick} sx={{ cursor: "pointer", borderRadius: 3, '&:hover': { boxShadow: 3, transform: 'translateY(-2px)' } }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <FolderIcon sx={{ color: '#1a73e8', mr: 1 }} />
              <Typography variant="subtitle1" noWrap>{folder.name}</Typography>
            </Box>
          </CardContent>
        </Card>
      </Grid>
    );
  }

  return (
    <ListItemButton onClick={onClick}>
      <ListItemIcon><FolderIcon sx={{ color: '#1a73e8' }} /></ListItemIcon>
      <ListItemText primary={folder.name} />
    </ListItemButton>
  );
};