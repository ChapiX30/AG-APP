// src/components/ui/drive/Skeletons.tsx

import React from 'react';
import { Grid, Card, CardContent, Skeleton, Box, Paper } from '@mui/material';

export const CardSkeleton = () => (
  <Grid item xs={12} sm={6} md={4} lg={3}>
    <Card sx={{ borderRadius: 3, border: '1px solid #dadce0' }}>
      <CardContent>
        <Skeleton variant="rectangular" width="100%" height={40} sx={{ borderRadius: 2 }}/>
        <Skeleton variant="text" sx={{ fontSize: '1.2rem', mt: 2, mb: 1 }} width="80%" />
        <Skeleton variant="text" width="50%" />
      </CardContent>
    </Card>
  </Grid>
);

export const ListSkeleton = () => (
  <Box sx={{ display: 'flex', alignItems: 'center', p: 2, borderBottom: '1px solid #f1f3f4' }}>
    <Skeleton variant="circular" width={24} height={24} sx={{ mr: 2 }} />
    <Box sx={{ flexGrow: 1 }}>
      <Skeleton variant="text" width="40%" sx={{ fontSize: '1rem' }} />
      <Skeleton variant="text" width="20%" />
    </Box>
  </Box>
);

interface LoadingSkeletonsProps {
  view: 'grid' | 'list';
  count: number;
}

export const LoadingSkeletons = ({ view, count }: LoadingSkeletonsProps) => {
  const skeletonCount = count > 0 ? count : 8;

  if (view === 'grid') {
    return (
      <Grid container spacing={2}>
        {Array.from(new Array(skeletonCount)).map((_, index) => <CardSkeleton key={index} />)}
      </Grid>
    );
  }

  return (
    <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
      {Array.from(new Array(skeletonCount)).map((_, index) => <ListSkeleton key={index} />)}
    </Paper>
  );
};