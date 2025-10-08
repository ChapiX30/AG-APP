// src/components/ui/drive/FileItem.tsx

import React from 'react';
import { Grid, Card, CardContent, Typography, Box, ListItemButton, ListItemIcon, ListItemText, Checkbox, IconButton, Chip } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { DriveFile, extractFileInfo, getFileIcon } from '../../../utils/fileUtils'; // Ajusta la ruta

interface FileItemProps {
    file: DriveFile;
    view: 'grid' | 'list';
    isSelected: boolean;
    onFileClick: () => void;
    onCheckboxChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onMenuOpen: (event: React.MouseEvent<HTMLElement>, file: DriveFile) => void;
}

export const FileItem = ({ file, view, isSelected, onFileClick, onCheckboxChange, onMenuOpen }: FileItemProps) => {
  const { displayName, displayDate } = extractFileInfo(file.name, file.updated, file.originalUpdated);
  
  const handleMenuClick = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    onMenuOpen(event, file);
  };
  
  if (view === 'grid') {
    return (
      <Grid item xs={12} sm={6} md={4} lg={3}>
        <Card 
            onClick={onFileClick} 
            sx={{ cursor: 'pointer', position: 'relative', borderRadius: 3, border: isSelected ? '2px solid #1a73e8' : '1px solid #dadce0', '&:hover': { boxShadow: 3, transform: 'translateY(-2px)' } }}
        >
          <CardContent>
            <Checkbox checked={isSelected} onChange={onCheckboxChange} onClick={(e) => e.stopPropagation()} sx={{ position: 'absolute', top: 4, left: 4 }}/>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, pl: 4 }}>
              {getFileIcon(file.name)}
              {file.reviewed && <CheckCircleIcon sx={{ ml: 1, color: 'success.main', fontSize: 16 }} />}
              {file.completed && <AssignmentTurnedInIcon sx={{ ml: 1, color: 'primary.main', fontSize: 16 }} />}
            </Box>
            <Typography variant="subtitle2" noWrap>{displayName}</Typography>
            <Typography variant="body2" color="text.secondary">{displayDate}</Typography>
            {file.reviewedByName && <Typography variant="caption" color="success.main" sx={{ display: 'block', mt: 1 }}>✓ {file.reviewedByName}</Typography>}
            {file.completedByName && <Typography variant="caption" color="primary" sx={{ display: 'block' }}>✓ Realizado por {file.completedByName}</Typography>}
            <IconButton onClick={handleMenuClick} sx={{ position: 'absolute', top: 8, right: 8 }} size="small"><MoreVertIcon /></IconButton>
          </CardContent>
        </Card>
      </Grid>
    );
  }

  return (
    <ListItemButton onClick={onFileClick} selected={isSelected}>
      <ListItemIcon>
          <Checkbox edge="start" checked={isSelected} onChange={onCheckboxChange} onClick={(e) => e.stopPropagation()}/>
          {getFileIcon(file.name)}
      </ListItemIcon>
      <ListItemText 
          primary={
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  {displayName}
                  {file.reviewed && <CheckCircleIcon sx={{ ml: 1, color: 'success.main', fontSize: 16 }} />}
                  {file.completed && <AssignmentTurnedInIcon sx={{ ml: 1, color: 'primary.main', fontSize: 16 }} />}
              </Box>
          }
          secondary={
              <>
                  {displayDate}
                  {file.reviewedByName && <Typography variant="caption" color="success.main"> | Revisado por {file.reviewedByName}</Typography>}
                  {file.completedByName && <Typography variant="caption" color="primary"> | Realizado por {file.completedByName}</Typography>}
              </>
          }
      />
      <IconButton onClick={handleMenuClick} size="small"><MoreVertIcon /></IconButton>
    </ListItemButton>
  );
};