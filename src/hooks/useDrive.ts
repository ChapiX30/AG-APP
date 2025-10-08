// src/hooks/useDrive.ts

import { useState, useEffect } from 'react';
import { ref, listAll, getDownloadURL, getMetadata } from 'firebase/storage';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { storage, db } from '../utils/firebase'; // Ajusta la ruta a tu config de firebase
import { DriveFile, DriveFolder, UserData, filterFoldersByPermissions, getUserNameByEmail } from '../utils/fileUtils.tsx'; // Ajusta la ruta

const ROOT_PATH = "worksheets";

// Esta función de metadatos es interna al hook
const loadFileMetadata = async (file: DriveFile): Promise<DriveFile> => {
    try {
        const metadataId = file.fullPath.replace(/\//g, '_');
        const metadataRef = doc(db, 'fileMetadata', metadataId);
        const metadataDoc = await getDoc(metadataRef);

        if (metadataDoc.exists()) {
            const metadata = metadataDoc.data();
            let reviewedByName = metadata.reviewedByName;
            let completedByName = metadata.completedByName;

            if (metadata.reviewed && metadata.reviewedBy && !reviewedByName) {
                reviewedByName = await getUserNameByEmail(metadata.reviewedBy);
            }
            if (metadata.completed && metadata.completedBy && !completedByName) {
                completedByName = await getUserNameByEmail(metadata.completedBy);
            }

            const finalMetadata: DriveFile = {
                ...file,
                reviewed: metadata.reviewed || false,
                reviewedBy: metadata.reviewedBy,
                reviewedByName: reviewedByName,
                reviewedAt: metadata.reviewedAt,
                completed: metadata.completed || false,
                completedBy: metadata.completedBy,
                completedByName: completedByName,
                completedAt: metadata.completedAt,
                originalUpdated: metadata.originalUpdated || file.updated,
            };

            if (!metadata.originalUpdated) {
                await updateDoc(metadataRef, { originalUpdated: file.updated }).catch(() => { });
            }
            return finalMetadata;
        } else {
            await setDoc(metadataRef, { filePath: file.fullPath, originalUpdated: file.updated }).catch(() => { });
        }
    } catch (error) {
        console.error("Error loading file metadata:", error);
    }
    return {
        ...file,
        originalUpdated: file.updated
    };
};


export const useDrive = (currentUserData: UserData | null, userIsQuality: boolean) => {
    const [currentView, setCurrentView] = useState<{ folders: DriveFolder[], files: DriveFile[] }>({ folders: [], files: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedPath, setSelectedPath] = useState<string[]>([]);
    const [previousItemCount, setPreviousItemCount] = useState(0);

    const reload = async () => {
        setPreviousItemCount(currentView.files.length + currentView.folders.length);
        setLoading(true);
        setError(null);
        try {
            const fullPath = [ROOT_PATH, ...selectedPath].join("/");
            const dirRef = ref(storage, fullPath);
            const res = await listAll(dirRef);

            let folders: DriveFolder[] = res.prefixes.map(prefix => ({
                name: prefix.name,
                fullPath: prefix.fullPath,
                folders: [],
                files: []
            }));

            if (selectedPath.length === 0 && currentUserData) {
                const userName = currentUserData.name || 'Usuario';
                folders = filterFoldersByPermissions(folders, userIsQuality, userName);
            }

            const files: DriveFile[] = await Promise.all(
                res.items
                    .filter(item => !item.name.endsWith('.keep'))
                    .map(async itemRef => {
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

            setCurrentView({ folders, files });

        } catch (e: any) {
            console.error("Error loading files:", e);
            setError("No se pudieron cargar los archivos.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (currentUserData) {
            reload();
        }
    }, [selectedPath, currentUserData]);

    return {
        loading,
        error,
        currentView,
        selectedPath,
        setSelectedPath,
        previousItemCount,
        reload
    };
};