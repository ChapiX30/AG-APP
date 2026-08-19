import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '../utils/firebase';
import {
  computeCargaTecnicos,
  type CargaServicio,
  type CargaUsuario,
  type DriveCargaFile,
  type TecnicoCarga,
} from '../utils/tecnicoCarga';

let driveCache: DriveCargaFile[] | null = null;
let driveInflight: Promise<DriveCargaFile[]> | null = null;

async function fetchDriveFiles(): Promise<DriveCargaFile[]> {
  if (driveCache) return driveCache;
  if (driveInflight) return driveInflight;

  const toRow = (d: { id: string; data: () => Record<string, unknown> }): DriveCargaFile => {
    const data = d.data();
    return {
      filePath: String(data.filePath || d.id.replace(/_/g, '/') || ''),
      name: String(data.name || ''),
      completed: data.completed === true,
      worksheetTechnician: data.worksheetTechnician ? String(data.worksheetTechnician) : undefined,
      uploadedBy: data.uploadedBy ? String(data.uploadedBy) : undefined,
      parentFolder: data.parentFolder ? String(data.parentFolder) : undefined,
    };
  };

  driveInflight = (async () => {
    const [byUpdated, byCreated] = await Promise.all([
      getDocs(query(collection(db, 'fileMetadata'), orderBy('updated', 'desc'), limit(1500))).catch(() => null),
      getDocs(query(collection(db, 'fileMetadata'), orderBy('created', 'desc'), limit(1500))).catch(() => null),
    ]);

    const byPath = new Map<string, DriveCargaFile>();
    [...(byUpdated?.docs || []), ...(byCreated?.docs || [])].forEach((d) => {
      const row = toRow(d);
      const key = row.filePath || d.id;
      if (!byPath.has(key)) byPath.set(key, row);
    });

    const rows = [...byPath.values()];
    driveCache = rows;
    return rows;
  })().finally(() => {
    driveInflight = null;
  });

  return driveInflight;
}

/**
 * Carga del equipo: archivos de Drive aún no marcados como realizados.
 * Cachea el catálogo para que el segundo abrir sea inmediato.
 */
export function useCargaTecnicos(
  enabled: boolean,
  usuarios: CargaUsuario[],
  servicios: CargaServicio[]
): { cargaByUserId: Map<string, TecnicoCarga>; loading: boolean } {
  const [driveFiles, setDriveFiles] = useState<DriveCargaFile[] | null>(driveCache);
  const [loading, setLoading] = useState(enabled && !driveCache);

  useEffect(() => {
    if (!enabled) return;
    if (driveCache) {
      setDriveFiles(driveCache);
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);

    fetchDriveFiles()
      .then((rows) => {
        if (alive) setDriveFiles(rows);
      })
      .catch((error) => {
        console.error('[useCargaTecnicos] no se pudo leer Drive', error);
        if (alive) setDriveFiles([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [enabled]);

  const cargaByUserId = useMemo(
    () =>
      computeCargaTecnicos({
        usuarios,
        driveFiles: driveFiles || [],
        servicios,
      }),
    [usuarios, driveFiles, servicios]
  );

  return { cargaByUserId, loading };
}
