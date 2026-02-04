import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { ref, listAll, getDownloadURL, uploadBytes, deleteObject, getMetadata } from "firebase/storage";
import { doc, getDoc, deleteDoc, setDoc, collection, getDocs, updateDoc, query, where, limit, orderBy } from "firebase/firestore"; 
import { storage, db, auth } from "../utils/firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { useNavigation } from "../hooks/useNavigation";
import { 
  Folder, Search, LayoutGrid, List, Trash2, 
  CheckCircle2, FileText, Download, Star, Info, X, 
  FolderPlus, UploadCloud, ChevronRight, File, Image as ImageIcon, 
  FileCheck, Home, Filter, Clock, Eye, Settings, 
  ArrowLeft, MoveRight, ArrowUp, FolderOpen,
  ArrowUpWideNarrow, Menu,
  AlertCircle, LogOut, Edit, CornerDownRight, Maximize2,
  RefreshCw, Zap
} from "lucide-react";
import clsx from "clsx";
import labLogo from '../assets/lab_logo.png'; 

// --- INTERFACES ---
interface DriveFile {
  name: string;
  rawName: string;
  url: string;
  fullPath: string;
  updated: string;
  created: string;
  size?: number;
  contentType?: string;
  reviewed?: boolean;
  reviewedByName?: string;
  completed?: boolean;
  completedByName?: string;
  starred?: boolean;
  uploadedBy?: string;
  parentFolder?: string;
  keywords?: string[];
}

interface DriveFolder {
  name: string;
  fullPath: string;
}

interface UserData {
  name?: string;
  email?: string;
  puesto?: string;
  role?: string;
}

interface ToastMessage {
    id: number;
    type: 'success' | 'error' | 'info';
    text: string;
}

type ViewMode = 'grid' | 'list';
type FilterType = 'all' | 'starred' | 'recent' | 'pending_review' | 'completed';
type SortType = 'dateDesc' | 'dateAsc' | 'nameAsc' | 'nameDesc';
type DragItemType = 'file' | 'folder' | null;

// --- CUSTOM HOOKS ---
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// --- UTILS ---
const normalizeText = (text: string) => {
    return text ? text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() : "";
};

const generateSearchTokens = (text: string): string[] => {
    if (!text) return [];
    const normalized = normalizeText(text);
    const parts = normalized.split(/[_ \-\.]+/).filter(p => p.length > 2);
    return [...new Set([normalized, ...parts])];
};

const fuzzyMatch = (file: DriveFile, searchTerms: string[]) => {
    const textToSearch = [
        file.name, 
        file.rawName, 
        file.uploadedBy, 
        file.parentFolder,
        ...(file.keywords || [])
    ].join(' ').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    return searchTerms.every(term => textToSearch.includes(term));
};

const cleanFileName = (rawName: string) => {
    if (!rawName) return "Sin Nombre";
    let name = rawName.replace(/^worksheets_/, '');
    const indexAG = name.indexOf('_AG');
    if (indexAG !== -1) return name.substring(indexAG + 1);
    const firstUnderscore = name.indexOf('_');
    if (firstUnderscore !== -1) {
        const firstPart = name.substring(0, firstUnderscore);
        if (firstPart.includes(' ')) return name.substring(firstUnderscore + 1);
    }
    return name;
};

const getParentFolderName = (fullPath: string) => {
    const parts = fullPath.split('/');
    if (parts.length >= 2) {
        const parent = parts[parts.length - 2];
        if (parent === 'worksheets') return "Raíz";
        return parent;
    }
    return "Raíz";
};

const addBusinessDays = (startDate: Date, daysToAdd: number) => {
    let currentDate = new Date(startDate);
    let added = 0;
    while (added < daysToAdd) {
        currentDate.setDate(currentDate.getDate() + 1);
        const day = currentDate.getDay();
        if (day !== 0 && day !== 6) added++;
    }
    return currentDate;
};

const countBusinessDaysLeft = (deadlineDate: Date) => {
    const now = new Date();
    const current = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(deadlineDate.getFullYear(), deadlineDate.getMonth(), deadlineDate.getDate());

    if (current > target) {
        let overdue = 0;
        let temp = new Date(target);
        while (temp < current) {
            temp.setDate(temp.getDate() + 1);
            const d = temp.getDay();
            if (d !== 0 && d !== 6) overdue++;
        }
        return -overdue;
    }

    let days = 0;
    let temp = new Date(current);
    while (temp < target) {
        temp.setDate(temp.getDate() + 1);
        const d = temp.getDay();
        if (d !== 0 && d !== 6) days++;
    }
    return days;
};

const getDeadlineInfo = (createdDateStr: string) => {
    if (!createdDateStr) return { progress: 0, daysLeft: 5, status: 'normal' };
    const createdDate = new Date(createdDateStr);
    const deadlineDate = addBusinessDays(createdDate, 5);
    const daysLeft = countBusinessDaysLeft(deadlineDate);
    const now = new Date();
    const totalTime = deadlineDate.getTime() - createdDate.getTime();
    const elapsedTime = now.getTime() - createdDate.getTime();
    let progress = (elapsedTime / totalTime) * 100;
    progress = Math.min(Math.max(progress, 0), 100);

    let status: 'normal' | 'warning' | 'urgent' | 'overdue' = 'normal';
    if (daysLeft <= 2) status = 'warning';
    if (daysLeft <= 1) status = 'urgent';
    if (daysLeft < 0) status = 'overdue';

    return { progress, daysLeft, status };
};

const isQualityUser = (user: UserData | null) => {
  const p = (user?.puesto || user?.role || "").toLowerCase();
  const email = (user?.email || "").toLowerCase();
  const hasAdminRole = ['calidad', 'quality', 'admin', 'gerente', 'manager'].some(role => p.includes(role));
  const allowedEmails = ['eaaese07@gmail.com', 'edgar.metrologo@ejemplo.com'];
  return hasAdminRole || allowedEmails.includes(email);
};

const formatFileSize = (bytes?: number) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const getFileIcon = (fileName?: string, size: number = 24) => {
  if (!fileName || typeof fileName !== 'string') return <File size={size} className="text-gray-400" />;
  const ext = fileName.split('.').pop()?.toLowerCase();
  const iconProps = { size, strokeWidth: 1.5 };
  if (['pdf'].includes(ext || '')) return <FileText {...iconProps} className="text-red-500" />;
  if (['jpg', 'jpeg', 'png', 'svg', 'webp'].includes(ext || '')) return <ImageIcon {...iconProps} className="text-purple-600" />;
  if (['xls', 'xlsx', 'csv'].includes(ext || '')) return <FileText {...iconProps} className="text-green-600" />;
  if (['doc', 'docx'].includes(ext || '')) return <FileText {...iconProps} className="text-blue-600" />;
  return <File {...iconProps} className="text-gray-400" />;
};

const ROOT_PATH = "worksheets";

export default function DriveScreen({ onBack }: { onBack?: () => void }) {
  const [user] = useAuthState(auth);
  const { goBack } = useNavigation();

  // Estados Datos
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]); 
  const [suggestedFiles, setSuggestedFiles] = useState<DriveFile[]>([]); 
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false); 
  const [currentUserData, setCurrentUserData] = useState<UserData | null>(null);
  
  // UI & Nav
  const [path, setPath] = useState<string[]>([]);
  const [view, setView] = useState<ViewMode>('grid'); 
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [sortBy, setSortBy] = useState<SortType>('dateDesc'); 
  const [filterMenuOpen, setFilterMenuOpen] = useState(false); 
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [completedGroupView, setCompletedGroupView] = useState<string | null>(null);

  // Selección
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, file: DriveFile | null, folder: DriveFolder | null } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300); 

  const [dragActive, setDragActive] = useState(false); 
  const [toasts, setToasts] = useState<ToastMessage[]>([]); 
  const [draggingItem, setDraggingItem] = useState<{ type: DragItemType, data: DriveFile | DriveFolder } | null>(null);
  const [dropTargetFolder, setDropTargetFolder] = useState<string | null>(null);

  // Modals
  const [isUploading, setIsUploading] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveTargetFile, setMoveTargetFile] = useState<DriveFile | null>(null);
  const [moveTargetFolder, setMoveTargetFolder] = useState<DriveFolder | null>(null);
  const [moveToPath, setMoveToPath] = useState<string[]>([]);
  const [moveFolderContent, setMoveFolderContent] = useState<DriveFolder[]>([]);
  const [isMoving, setIsMoving] = useState(false);

  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTargetFile, setRenameTargetFile] = useState<DriveFile | null>(null);
  const [renameTargetFolder, setRenameTargetFolder] = useState<DriveFolder | null>(null);
  const [newName, setNewName] = useState("");

  const handleBack = () => { onBack ? onBack() : goBack(); };

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
      const id = Date.now();
      setToasts(prev => [...prev, { id, text, type }]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  useEffect(() => {
    const loadUser = async () => {
      if (!user?.email) return;
      try {
        const usersRef = collection(db, 'usuarios');
        const snap = await getDocs(usersRef);
        let foundUser: UserData | null = null;
        snap.forEach(d => {
            const data = d.data();
            if (data.correo === user.email || data.email === user.email) {
                foundUser = { name: data.nombre || data.name, email: data.correo || data.email, puesto: data.puesto || data.role };
            }
        });
        setCurrentUserData(foundUser || { name: user.displayName || "Usuario", email: user.email || "", role: "User" });
      } catch (e) { console.error(e); }
    };
    loadUser();
  }, [user]);

  // Acceso Rápido (Filtro de Seguridad)
  useEffect(() => {
    const loadSuggestions = async () => {
        if (!currentUserData || path.length > 0 || debouncedSearch) {
            setSuggestedFiles([]);
            return;
        }
        try {
            const q = query(collection(db, 'fileMetadata'), orderBy('updated', 'desc'), limit(50));
            const snap = await getDocs(q);
            const recents: DriveFile[] = [];
            
            const isQuality = isQualityUser(currentUserData);
            const myName = normalizeText(currentUserData?.name || "");

            for (const doc of snap.docs) {
                if (recents.length >= 4) break; 

                const data = doc.data();
                const rawName = data.name || doc.id;
                const fullPath = data.filePath || `worksheets/${data.name || doc.id}`;
                
                if (!isQuality) {
                     const isUploader = normalizeText(data.uploadedBy || "") === myName;
                     const isInMyFolder = fullPath.toLowerCase().includes(myName);
                     if (!isInMyFolder && !isUploader) continue;
                }

                recents.push({
                    name: cleanFileName(data.name),
                    rawName: data.name,
                    fullPath: data.filePath,
                    updated: data.updated,
                    created: data.created,
                    size: data.size,
                    url: "", 
                    contentType: data.contentType,
                    ...data
                } as DriveFile);
            }
            setSuggestedFiles(recents);
        } catch (e) { console.error("Error loading suggestions", e); }
    };
    loadSuggestions();
  }, [currentUserData, path, debouncedSearch]);

  const loadContent = useCallback(async () => {
    setLoading(true);
    setContextMenu(null);
    setSelectedIds(new Set());
    setLastSelectedId(null);
    
    try {
      const isGlobalSearch = path.length === 0 && debouncedSearch !== "";
      
      if (isGlobalSearch) {
        // MODO BÚSQUEDA GLOBAL
        const q = query(collection(db, 'fileMetadata'), limit(200));
        const querySnapshot = await getDocs(q);
        const results: DriveFile[] = [];
        const isQuality = isQualityUser(currentUserData);
        const myName = normalizeText(currentUserData?.name || "");
        const searchTerms = normalizeText(debouncedSearch).split(" ").filter(t => t.length > 0);

        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const rawName = data.name || docSnap.id; 
          const cleanNameStr = cleanFileName(rawName);
          let fullPath = data.filePath || `worksheets/${data.name || docSnap.id}`;

          if (!isQuality) { 
              const isUploader = normalizeText(data.uploadedBy || "") === myName;
              if (!fullPath.toLowerCase().includes(myName) && !isUploader) return; 
          }

          const fileObj: DriveFile = {
            name: cleanNameStr,
            rawName: rawName,
            url: "",
            fullPath: fullPath,
            updated: data.updated || new Date().toISOString(),
            created: data.created || data.updated || new Date().toISOString(),
            size: data.size || 0,
            contentType: data.contentType,
            reviewed: data.reviewed,
            reviewedByName: data.reviewedByName,
            completed: data.completed,
            completedByName: data.completedByName,
            starred: data.starred,
            uploadedBy: data.uploadedBy,
            parentFolder: getParentFolderName(fullPath),
            keywords: data.keywords
          };

          if (fuzzyMatch(fileObj, searchTerms)) {
              results.push(fileObj);
          }
        });
        setFiles(results);
        setFolders([]); 
      } else {
        // MODO NAVEGACIÓN
        const pathStr = [ROOT_PATH, ...path].join('/');
        const res = await listAll(ref(storage, pathStr));
        
        let loadedFolders = res.prefixes.map(p => ({ name: p.name, fullPath: p.fullPath }));
        if (currentUserData) {
            const myName = normalizeText(currentUserData.name || "");
            if (!isQualityUser(currentUserData) && path.length === 0) {
                loadedFolders = loadedFolders.filter(f => normalizeText(f.name).includes(myName));
            }
            if (debouncedSearch) {
                const term = normalizeText(debouncedSearch);
                loadedFolders = loadedFolders.filter(f => normalizeText(f.name).includes(term));
            }
        }
        setFolders(loadedFolders);
        
        const filePromises = res.items.map(async (item) => {
            if (item.name === '.keep') return null;
            
            const rawName = item.name;
            const cleanName = cleanFileName(rawName);
            
            if (debouncedSearch) {
                const term = normalizeText(debouncedSearch);
                const matchName = normalizeText(cleanName).includes(term);
                const matchRaw = normalizeText(rawName).includes(term);
                if (!matchName && !matchRaw) return null;
            }

            const metaId = item.fullPath.replace(/\//g, '_');
            let meta: any = {};
            let needsRepair = false;

            try {
                const metaSnap = await getDoc(doc(db, 'fileMetadata', metaId));
                if (metaSnap.exists()) {
                    meta = metaSnap.data();
                    if (meta.name !== item.name) needsRepair = true;
                } else {
                    needsRepair = true;
                }
            } catch (e) { }

            let storageMeta = { size: 0, updated: new Date().toISOString(), timeCreated: new Date().toISOString(), contentType: 'unknown' };
            try { storageMeta = await getMetadata(item) as any; } catch (e) { }

            if (needsRepair && !isSyncing) {
                setIsSyncing(true);
                const newMeta = {
                    name: item.name,
                    filePath: item.fullPath,
                    size: storageMeta.size,
                    contentType: storageMeta.contentType,
                    updated: storageMeta.updated,
                    created: meta.created || storageMeta.timeCreated,
                    uploadedBy: meta.uploadedBy || "Sistema",
                    keywords: generateSearchTokens(cleanFileName(item.name)),
                    completed: meta.completed || false,
                    reviewed: meta.reviewed || false,
                    starred: meta.starred || false
                };
                setDoc(doc(db, 'fileMetadata', metaId), newMeta, { merge: true })
                    .then(() => setIsSyncing(false))
                    .catch(() => setIsSyncing(false));
                meta = newMeta;
            }

            if (!debouncedSearch) {
                if (activeFilter === 'starred' && meta.starred !== true) return null;
                if (activeFilter === 'pending_review' && !((meta.completed === true) && (meta.reviewed !== true))) return null;
                if (activeFilter === 'completed' && meta.reviewed !== true) return null;
                if (activeFilter === 'recent') {
                     const date = new Date(meta.updated || meta.created);
                     const diff = Math.abs(new Date().getTime() - date.getTime());
                     if (Math.ceil(diff / (1000 * 60 * 60 * 24)) > 7) return null;
                }
            }

            return {
                name: cleanName,
                rawName: rawName,
                fullPath: item.fullPath,
                url: '', 
                size: storageMeta.size,
                updated: storageMeta.updated,
                created: meta.created || storageMeta.timeCreated,
                contentType: storageMeta.contentType,
                parentFolder: path.length > 0 ? path[path.length - 1] : "Raíz",
                ...meta
            } as DriveFile;
        });
        
        const loadedFiles = (await Promise.all(filePromises)).filter(Boolean) as DriveFile[];
        setFiles(loadedFiles);
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [path, activeFilter, currentUserData, debouncedSearch]);

  useEffect(() => { if (currentUserData) loadContent(); }, [loadContent]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

        if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
            e.preventDefault();
            setSelectedIds(new Set(processedFiles.map(f => f.fullPath)));
        }
        if (e.key === 'Escape') {
            if (previewFile) setPreviewFile(null);
            else if (selectedIds.size > 0) setSelectedIds(new Set());
            else if (debouncedSearch) setSearchQuery("");
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (selectedIds.size > 0 && isQualityUser(currentUserData)) handleBatchDelete();
        }
        if (e.key === ' ' && selectedIds.size === 1) {
            e.preventDefault();
            const file = files.find(f => f.fullPath === Array.from(selectedIds)[0]);
            if (file) handlePreview(file);
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, files, previewFile, currentUserData]);

  const processedFiles = useMemo(() => {
    let result = [...files];
    result.sort((a, b) => {
        const dateA = new Date(a.created).getTime();
        const dateB = new Date(b.created).getTime();
        switch (sortBy) {
            case 'nameAsc': return a.name.localeCompare(b.name);
            case 'nameDesc': return b.name.localeCompare(a.name);
            case 'dateAsc': return dateA - dateB;
            case 'dateDesc': return dateB - dateA;
            default: return 0;
        }
    });
    return result;
  }, [files, sortBy]); 

  const completedGroups = useMemo(() => {
    if (activeFilter !== 'completed') return {};
    const groups: Record<string, DriveFile[]> = {};
    processedFiles.forEach(file => {
        const folderName = file.parentFolder || getParentFolderName(file.fullPath);
        if (!groups[folderName]) groups[folderName] = [];
        groups[folderName].push(file);
    });
    return groups;
  }, [processedFiles, activeFilter]);

  const handleSelect = (file: DriveFile, isMulti: boolean, isRange: boolean) => {
    const newSelected = new Set(isMulti ? selectedIds : []);
    
    if (isRange && lastSelectedId) {
        const allPaths = processedFiles.map(f => f.fullPath);
        const startIdx = allPaths.indexOf(lastSelectedId);
        const endIdx = allPaths.indexOf(file.fullPath);
        if (startIdx !== -1 && endIdx !== -1) {
            const [min, max] = [Math.min(startIdx, endIdx), Math.max(startIdx, endIdx)];
            for (let i = min; i <= max; i++) newSelected.add(allPaths[i]);
        }
    } else {
        if (newSelected.has(file.fullPath)) newSelected.delete(file.fullPath);
        else newSelected.add(file.fullPath);
        setLastSelectedId(file.fullPath);
    }
    
    setSelectedIds(newSelected);
    setDetailsOpen(newSelected.size === 1 && (!isMulti && !isRange));
  };

  const handlePreview = async (file: DriveFile) => {
      try {
        let url = file.url;
        if (!url) url = await getDownloadURL(ref(storage, file.fullPath));
        setPreviewFile({ ...file, url });
      } catch (e) { showToast("No se pudo cargar la vista previa", 'error'); }
  };

  const handleBatchDelete = async () => {
      if (selectedIds.size === 0) return;
      if (!confirm(`¿Estás seguro de eliminar ${selectedIds.size} archivos?`)) return;

      let deletedCount = 0;
      for (const id of Array.from(selectedIds)) {
          const file = files.find(f => f.fullPath === id);
          if (file) {
              try {
                  await deleteObject(ref(storage, file.fullPath));
                  await deleteDoc(doc(db, 'fileMetadata', file.fullPath.replace(/\//g, '_')));
                  deletedCount++;
              } catch (e) { console.error(e); }
          }
      }
      showToast(`Se eliminaron ${deletedCount} archivos`, 'success');
      setSelectedIds(new Set());
      loadContent();
  };

  const moveFolderRecursive = async (sourcePrefix: string, destPrefix: string) => {
      const sourceRef = ref(storage, sourcePrefix);
      const res = await listAll(sourceRef);

      for (const itemRef of res.items) {
          const fileUrl = await getDownloadURL(itemRef);
          const response = await fetch(fileUrl);
          const blob = await response.blob();
          
          const newFilePath = `${destPrefix}/${itemRef.name}`;
          await uploadBytes(ref(storage, newFilePath), blob);

          if (itemRef.name !== '.keep') {
              const oldMetaId = itemRef.fullPath.replace(/\//g, '_');
              const newMetaId = newFilePath.replace(/\//g, '_');
              const oldMetaDoc = await getDoc(doc(db, 'fileMetadata', oldMetaId));
              let metaData = oldMetaDoc.exists() ? oldMetaDoc.data() : {};
              
              if (oldMetaDoc.exists()) await deleteDoc(doc(db, 'fileMetadata', oldMetaId));
              
              await setDoc(doc(db, 'fileMetadata', newMetaId), { 
                  ...metaData, 
                  filePath: newFilePath, 
                  updated: new Date().toISOString() 
              }, { merge: true });
          }
          await deleteObject(itemRef);
      }

      for (const folderRef of res.prefixes) {
          const newSubDest = `${destPrefix}/${folderRef.name}`;
          await moveFolderRecursive(folderRef.fullPath, newSubDest);
      }
  };

  const executeMoveFolder = async (folderToMove: DriveFolder, destPath: string) => {
      const newFullPath = `${destPath}/${folderToMove.name}`;
      if (newFullPath.startsWith(folderToMove.fullPath)) {
          showToast("No puedes mover una carpeta dentro de sí misma", 'error');
          return false;
      }
      if (newFullPath === folderToMove.fullPath) return false;

      setIsMoving(true);
      try {
          await moveFolderRecursive(folderToMove.fullPath, newFullPath);
          return true;
      } catch (e) {
          console.error("Error moving folder:", e);
          showToast("Error al mover la carpeta", 'error');
          return false;
      } finally {
          setIsMoving(false);
      }
  };

  const executeMoveFile = async (fileToMove: DriveFile, destPath: string) => {
      const newFullPath = `${destPath}/${fileToMove.name}`;
      if (newFullPath === fileToMove.fullPath) return false;

      setIsMoving(true);
      try {
        let fileUrl = fileToMove.url;
        if (!fileUrl) fileUrl = await getDownloadURL(ref(storage, fileToMove.fullPath));
        const response = await fetch(fileUrl);
        const blob = await response.blob();
        await uploadBytes(ref(storage, newFullPath), blob);

        const oldMetaId = fileToMove.fullPath.replace(/\//g, '_');
        const newMetaId = newFullPath.replace(/\//g, '_');
        const oldMetaDoc = await getDoc(doc(db, 'fileMetadata', oldMetaId));
        let metaData = oldMetaDoc.exists() ? oldMetaDoc.data() : {};
        
        if (oldMetaDoc.exists()) await deleteDoc(doc(db, 'fileMetadata', oldMetaId));
        await setDoc(doc(db, 'fileMetadata', newMetaId), { ...metaData, filePath: newFullPath, name: fileToMove.name, updated: new Date().toISOString() }, { merge: true });
        await deleteObject(ref(storage, fileToMove.fullPath));
        return true;
      } catch(e) {
          console.error("Error moving file", e);
          showToast("Error al mover el archivo", 'error');
          return false;
      } finally {
          setIsMoving(false);
      }
  };

  const handleModalMove = async () => {
    const destinationPathString = [ROOT_PATH, ...moveToPath].join('/');

    if (moveTargetFolder) {
        const success = await executeMoveFolder(moveTargetFolder, destinationPathString);
        if (success) {
            showToast("Carpeta movida correctamente", 'success');
            setMoveDialogOpen(false);
            setMoveTargetFolder(null);
            setMoveToPath([]);
            loadContent();
        }
        return;
    }

    if (moveTargetFile) {
        const success = await executeMoveFile(moveTargetFile, destinationPathString);
        if (success) {
            showToast("Archivo movido correctamente", 'success');
            setMoveDialogOpen(false);
            setMoveTargetFile(null);
            setMoveToPath([]);
            loadContent();
        }
    }
  };

  useEffect(() => {
    const loadMoveFolders = async () => {
        if (!moveDialogOpen) return;
        const pathString = [ROOT_PATH, ...moveToPath].join('/');
        try {
            const res = await listAll(ref(storage, pathString));
            const folders = res.prefixes.map(p => ({ name: p.name, fullPath: p.fullPath }));
            setMoveFolderContent(folders);
        } catch(e) { console.error(e); }
    };
    loadMoveFolders();
  }, [moveDialogOpen, moveToPath]);

  const handleDrag = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); if (draggingItem) return; if (e.type === "dragenter" || e.type === "dragover") setDragActive(true); else if (e.type === "dragleave") setDragActive(false); };
  
  const handleDrop = async (e: React.DragEvent) => { 
      e.preventDefault(); e.stopPropagation(); setDragActive(false); 
      if (draggingItem) return; 
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) { await processFiles(e.dataTransfer.files); } 
  };

  const processFiles = async (fileList: FileList) => {
      const isQuality = isQualityUser(currentUserData);
      const isInMyFolder = path.length > 0;
      if (!isQuality && !isInMyFolder) { showToast("Entra a tu carpeta personal primero", 'error'); return; }
      setIsUploading(true);
      let count = 0;
      try {
          for (const file of Array.from(fileList)) {
              const fullPath = `${[ROOT_PATH, ...path].join('/')}/${file.name}`;
              const docId = fullPath.replace(/\//g, '_');
              const existingDoc = await getDoc(doc(db, 'fileMetadata', docId));
              const existingData = existingDoc.exists() ? existingDoc.data() : {};
              const snap = await uploadBytes(ref(storage, fullPath), file);
              const meta = await getMetadata(snap.ref);
              const cleanName = cleanFileName(file.name);
              const keywords = generateSearchTokens(cleanName);

              await setDoc(doc(db, 'fileMetadata', docId), {
                  name: file.name,
                  filePath: fullPath,
                  size: meta.size,
                  contentType: meta.contentType,
                  updated: meta.updated,
                  created: existingData.created || new Date().toISOString(),
                  uploadedBy: currentUserData?.name || "Desconocido",
                  keywords: keywords,
                  completed: existingData.completed || false,
                  completedByName: existingData.completedByName || null,
                  reviewed: false, 
                  reviewedByName: null
              }, { merge: true });
              count++;
          }
          showToast(`Se subieron ${count} archivos correctamente`, 'success');
          loadContent();
      } catch(err) { console.error(err); showToast("Error al subir archivos", 'error'); } finally { setIsUploading(false); }
  };

  const handleUploadInput = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files && e.target.files.length > 0) processFiles(e.target.files); };

  const updateFileStatus = async (file: DriveFile, field: string, value: any) => {
    const userName = currentUserData?.name || user?.displayName || "Usuario Desconocido";
    const newReviewedBy = field === 'reviewed' && value ? userName : (field === 'reviewed' && !value ? null : file.reviewedByName);
    const newCompletedBy = field === 'completed' && value ? userName : (field === 'completed' && !value ? null : file.completedByName);

    const updatedFile = { ...file, [field]: value, reviewedByName: newReviewedBy, completedByName: newCompletedBy };
    
    setFiles(prev => prev.map(f => f.fullPath === file.fullPath ? updatedFile : f));
    if (previewFile?.fullPath === file.fullPath) setPreviewFile(updatedFile as DriveFile);

    try {
        const id = file.fullPath.replace(/\//g, '_');
        const dataToUpdate: any = { [field]: value };
        if (field === 'reviewed') dataToUpdate['reviewedByName'] = value ? userName : null;
        if (field === 'completed') dataToUpdate['completedByName'] = value ? userName : null;
        
        await setDoc(doc(db, 'fileMetadata', id), dataToUpdate, { merge: true });
        
        if (field === 'reviewed' && value === true) showToast("Validación guardada", 'success');
        if (field === 'completed' && value === true) showToast("Marcado como terminado", 'success');

        if (value === true && (field === 'completed' || field === 'reviewed')) {
             let cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/\s*\(\d+\)/, "");
             const possibleId = cleanName.split(/[_ ]/)[0].trim();
             
             const qId = query(collection(db, "hojasDeTrabajo"), where("id", "==", possibleId));
             let snap = await getDocs(qId);
             if (snap.empty) {
                 const qFolio = query(collection(db, "hojasDeTrabajo"), where("folio", "==", possibleId));
                 snap = await getDocs(qFolio);
             }
             if (!snap.empty) {
                 const docRef = snap.docs[0].ref;
                 const updateData: any = { lastUpdated: new Date().toISOString() };
                 if (field === 'completed') {
                     updateData['status_certificado'] = "Generado";
                     updateData['cargado_drive'] = "Si";
                 } 
                 if (field === 'reviewed') updateData['status_certificado'] = "Firmado";
                 await updateDoc(docRef, updateData);
                 showToast(`Sincronizado con equipo ${possibleId}`, 'success');
             }
        }
    } catch (e) { console.error(e); showToast("Error de conexión", 'error'); loadContent(); } 
  };

  const handleDelete = async (file: DriveFile) => { if (!confirm(`¿Eliminar ${file.name}?`)) return; try { await deleteObject(ref(storage, file.fullPath)); await deleteDoc(doc(db, 'fileMetadata', file.fullPath.replace(/\//g, '_'))); setFiles(prev => prev.filter(f => f.fullPath !== file.fullPath)); setSelectedIds(new Set()); showToast("Archivo eliminado", 'success'); } catch(e) { showToast("Error al eliminar", 'error'); } };
  const handleDownload = async (file: DriveFile) => { try { const url = await getDownloadURL(ref(storage, file.fullPath)); window.open(url, '_blank'); } catch (e) { showToast("No se pudo descargar", 'error'); } };
  
  const handleFolderContextMenu = (e: React.MouseEvent, folder: DriveFolder) => {
    e.preventDefault(); e.stopPropagation(); 
    setContextMenu({ x: e.clientX, y: e.clientY, file: null, folder });
  };
  const handleItemDragStart = (e: React.DragEvent, item: DriveFile | DriveFolder, type: DragItemType) => {
    if (!isQualityUser(currentUserData)) { e.preventDefault(); return; }
    setDraggingItem({ type, data: item });
    e.dataTransfer.effectAllowed = "move";
  };
  const handleFolderDragOver = (e: React.DragEvent, folderFullPath: string) => { e.preventDefault(); e.stopPropagation(); if (!draggingItem) return; if (draggingItem.type === 'folder' && (draggingItem.data as DriveFolder).fullPath === folderFullPath) return; setDropTargetFolder(folderFullPath); };
  
  const handleFolderDrop = async (e: React.DragEvent, targetFolder: DriveFolder) => {
      e.preventDefault(); e.stopPropagation();
      setDropTargetFolder(null);
      
      if (!draggingItem) return;

      let success = false;
      const destPath = targetFolder.fullPath;

      if (draggingItem.type === 'folder') {
          const folderToMove = draggingItem.data as DriveFolder;
          if (folderToMove.fullPath === destPath) return; 
          success = await executeMoveFolder(folderToMove, destPath);
      } else if (draggingItem.type === 'file') {
          const fileToMove = draggingItem.data as DriveFile;
          if (fileToMove.fullPath.startsWith(destPath)) return;
          success = await executeMoveFile(fileToMove, destPath);
      }

      setDraggingItem(null);
      if (success) {
          showToast("Elemento movido correctamente", 'success');
          loadContent();
      }
  };

  const renderContent = () => {
    if (activeFilter === 'completed' && !completedGroupView) {
        const groupNames = Object.keys(completedGroups);
        if (groupNames.length === 0) return <EmptyState icon={FileCheck} text="No hay servicios completados" />;
        return (
            <div className="mb-8 animate-in fade-in duration-500">
                <h2 className="text-xs font-bold text-gray-400 mb-4 uppercase tracking-wider flex items-center gap-2"><FileCheck size={14}/> Servicios Finalizados</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {groupNames.map(folderName => (
                        <div key={folderName} onClick={() => setCompletedGroupView(folderName)} className="group p-5 border border-green-100 bg-white hover:bg-green-50/50 rounded-2xl hover:border-green-300 cursor-pointer transition-all flex flex-col items-center gap-3 shadow-sm hover:shadow-lg hover:-translate-y-1 relative">
                            <div className="p-3 bg-green-100/50 rounded-full group-hover:bg-green-200/50 transition-colors">
                                <FileCheck size={28} className="text-green-600" />
                            </div>
                            <span className="text-sm font-bold text-gray-800 truncate w-full text-center">{folderName}</span>
                            <span className="text-[10px] text-green-700 bg-green-100 px-2 py-0.5 rounded-full font-medium">{completedGroups[folderName].length} archivos</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    let displayFiles = processedFiles;
    if (activeFilter === 'completed' && completedGroupView) displayFiles = completedGroups[completedGroupView] || [];
    
    const showFolders = activeFilter === 'all' && !debouncedSearch && folders.length > 0;

    if (displayFiles.length === 0 && !showFolders) {
        if(debouncedSearch) return <EmptyState icon={Search} text={`No se encontraron resultados para "${debouncedSearch}"`} />;
        return <EmptyState icon={Folder} text="Esta carpeta está vacía" />;
    }

    return (
        <div className="animate-in slide-in-from-bottom-2 duration-300 pb-20">
            {path.length === 0 && !debouncedSearch && suggestedFiles.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-[11px] font-bold text-gray-500 mb-3 uppercase tracking-wider flex items-center gap-2"><Zap size={12} className="text-amber-500 fill-amber-100"/> Acceso Rápido</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {suggestedFiles.map(f => (
                            <div key={`sugg-${f.fullPath}`} onClick={() => handlePreview(f)} className="bg-white p-3 rounded-xl border border-gray-200 hover:border-blue-400 hover:shadow-md cursor-pointer transition-all flex items-center gap-3 group">
                                {getFileIcon(f.name, 32)}
                                <div className="min-w-0">
                                    <p className="text-xs font-bold text-gray-700 truncate group-hover:text-blue-600">{f.name}</p>
                                    <p className="text-[10px] text-gray-400">Editado {new Date(f.updated).toLocaleDateString()}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {showFolders && (
                <div className="mb-8">
                    <h2 className="text-xs font-bold text-gray-400 mb-4 uppercase tracking-wider flex items-center gap-2"><Folder size={14}/> Carpetas</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {folders.map((f) => (
                            <div 
                                key={f.fullPath} 
                                draggable={isQualityUser(currentUserData)}
                                onDragStart={(e) => handleItemDragStart(e, f, 'folder')}
                                onDragOver={(e) => handleFolderDragOver(e, f.fullPath)}
                                onDrop={(e) => handleFolderDrop(e, f)}
                                onDoubleClick={() => { setPath([...path, f.name]); setSearchQuery(""); }} 
                                onContextMenu={(e) => handleFolderContextMenu(e, f)}
                                className={clsx(
                                    "group p-4 border rounded-2xl cursor-pointer transition-all flex flex-col items-center gap-3 shadow-sm hover:shadow-lg hover:-translate-y-1 select-none relative overflow-hidden bg-white",
                                    dropTargetFolder === f.fullPath ? "border-blue-500 bg-blue-50 scale-105 ring-2 ring-blue-300" : "border-gray-200 hover:border-blue-400"
                                )}
                            >
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-cyan-300 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <Folder size={40} className="text-blue-100 fill-blue-50 group-hover:text-blue-500 group-hover:fill-blue-100 transition-all duration-300" />
                                <span className="text-sm font-semibold text-gray-700 truncate w-full text-center group-hover:text-blue-700">{f.name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            
            {displayFiles.length > 0 && (
                <div className="mb-4 flex items-center justify-between sticky top-0 bg-[#f8f9fa] z-10 py-2">
                    <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                        <File size={14}/> {debouncedSearch ? 'Resultados de Búsqueda' : 'Archivos'} <span className="bg-gray-100 text-gray-600 px-1.5 rounded-md">{displayFiles.length}</span>
                    </h2>
                    {selectedIds.size > 0 && (
                        <div className="flex items-center gap-2 animate-in slide-in-from-right fade-in">
                            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md">{selectedIds.size} seleccionados</span>
                            {isQualityUser(currentUserData) && (
                                <button onClick={handleBatchDelete} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-red-100 shadow-sm" title="Eliminar seleccionados">
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
            
            {view === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                    {displayFiles.map((file) => (
                        <FileCard 
                            key={file.fullPath} 
                            file={file} 
                            selected={selectedIds.has(file.fullPath)} 
                            searchActive={!!debouncedSearch} 
                            onSelect={(multi: boolean, range: boolean) => handleSelect(file, multi, range)} 
                            onContextMenu={(e: any) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, file, folder: null }); if(!selectedIds.has(file.fullPath)) handleSelect(file, false, false); }}
                            onDoubleClick={() => handlePreview(file)} 
                        />
                    ))}
                </div>
            ) : (
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm mb-20">
                    <div className="grid grid-cols-12 gap-4 px-4 md:px-6 py-3 bg-gray-50/80 border-b border-gray-200 text-[11px] font-bold text-gray-400 uppercase tracking-wider backdrop-blur-sm sticky top-0">
                        <div className="col-span-10 md:col-span-4">Nombre</div>
                        <div className="hidden md:block col-span-3">Progreso</div>
                        <div className="hidden md:block col-span-2">Estado</div>
                        <div className="hidden md:block col-span-2 text-right">Tamaño</div>
                        <div className="col-span-2 md:col-span-1"></div>
                    </div>
                    {displayFiles.map((file) => (
                        <FileListRow 
                            key={file.fullPath} 
                            file={file} 
                            selected={selectedIds.has(file.fullPath)} 
                            searchActive={!!debouncedSearch}
                            onSelect={(multi: boolean, range: boolean) => handleSelect(file, multi, range)} 
                            onContextMenu={(e: any) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, file, folder: null }); if(!selectedIds.has(file.fullPath)) handleSelect(file, false, false); }}
                            onDoubleClick={() => handlePreview(file)} 
                        />
                    ))}
                </div>
            )}
        </div>
    );
  };

  return (
    <div className="flex h-full w-full bg-[#f8f9fa] text-gray-800 font-sans overflow-hidden relative" onClick={() => { setContextMenu(null); setFilterMenuOpen(false); }}>
      {dragActive && !draggingItem && <div className="absolute inset-0 z-[100] bg-blue-500/10 backdrop-blur-sm border-4 border-blue-500 border-dashed m-4 rounded-3xl flex items-center justify-center pointer-events-none"><div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center animate-bounce"><UploadCloud size={64} className="text-blue-500 mb-4" /><h2 className="text-2xl font-bold text-blue-600">Suelta los archivos aquí</h2></div></div>}
      <div className="absolute inset-0 z-0" onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}></div>
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)}></div>}

      <div className={clsx("fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 flex flex-col pt-5 pb-4 transition-transform duration-300 md:relative md:translate-x-0 shadow-2xl md:shadow-none", sidebarOpen ? "translate-x-0" : "-translate-x-full")}>
        <div className="px-6 mb-8 flex items-center justify-between">
             <button onClick={handleBack} className="p-2 -ml-2 text-gray-500 hover:text-gray-800 md:hidden"><ArrowLeft size={20} /></button>
             <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2 tracking-tight">
                <img src={labLogo} alt="Lab Logo" className="w-10 h-10 rounded-lg shadow-md bg-white object-contain p-1 border border-gray-100" />
                AG Drive
             </h1>
        </div>
        <div className="px-4 mb-6">
            {isQualityUser(currentUserData) && (<button onClick={() => setCreateFolderOpen(true)} className="w-full py-3 px-4 bg-blue-600 text-white shadow-lg shadow-blue-200 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-700 transition-all font-medium active:scale-95"><FolderPlus size={20}/> <span>Nueva Carpeta</span></button>)}
        </div>
        <nav className="flex-1 px-3 space-y-1">
            <SidebarItem icon={<Home size={18}/>} label="Mi Unidad" active={activeFilter === 'all'} onClick={() => { setActiveFilter('all'); setPath([]); setCompletedGroupView(null); setSearchQuery(""); setSidebarOpen(false); }} />
            <SidebarItem icon={<Star size={18}/>} label="Destacados" active={activeFilter === 'starred'} onClick={() => { setActiveFilter('starred'); setSidebarOpen(false); }} />
            <SidebarItem icon={<Clock size={18}/>} label="Recientes" active={activeFilter === 'recent'} onClick={() => { setActiveFilter('recent'); setSidebarOpen(false); }} />
            {isQualityUser(currentUserData) && (<div className="mt-8"><div className="px-4 mb-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Gestión</div><SidebarItem icon={<Settings size={18}/>} label="Por Revisar" active={activeFilter === 'pending_review'} onClick={() => { setActiveFilter('pending_review'); setSidebarOpen(false); }} badge /><SidebarItem icon={<FileCheck size={18}/>} label="Completados" active={activeFilter === 'completed'} onClick={() => { setActiveFilter('completed'); setSidebarOpen(false); }} /></div>)}
        </nav>
        <div className="p-4 border-t border-gray-100"><button onClick={handleBack} className="flex items-center gap-3 w-full px-3 py-2 text-gray-500 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all font-medium text-sm"><LogOut size={18}/> <span>Salir al Menú</span></button></div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 relative z-10 bg-[#f8f9fa]">
        <header className="h-16 border-b border-gray-200/80 flex items-center justify-between px-4 md:px-8 bg-white/80 backdrop-blur-md sticky top-0 z-30 transition-all">
            <div className="flex items-center gap-4 flex-1 max-w-3xl">
                <button onClick={() => setSidebarOpen(true)} className="md:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg"><Menu size={20} /></button>
                <div className="relative flex-1 group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                    <input type="text" placeholder="Buscar archivos, carpetas, folios..." className="w-full bg-gray-100/50 hover:bg-gray-100 focus:bg-white focus:ring-2 focus:ring-blue-500/20 border border-transparent focus:border-blue-500 rounded-xl py-2.5 pl-10 pr-4 transition-all outline-none text-sm font-medium" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14}/></button>}
                </div>
            </div>
            <div className="flex items-center gap-2 md:gap-3 ml-4">
                {isSyncing && <div className="text-xs text-blue-500 flex items-center gap-1 animate-pulse"><RefreshCw size={12} className="animate-spin"/> Sync...</div>}
                <button onClick={() => fileInputRef.current?.click()} className="hidden md:flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 hover:border-gray-300 transition-all active:scale-95 shadow-sm">
                    {isUploading ? <img src={labLogo} className="w-4 h-4 animate-spin" alt="uploading" /> : <UploadCloud size={16} />} <span>Subir</span>
                </button>
                <input ref={fileInputRef} type="file" multiple hidden onChange={handleUploadInput} />
                <div className="bg-gray-100 p-1 rounded-xl flex items-center"><button onClick={() => setView('list')} className={clsx("p-2 rounded-lg transition-all", view === 'list' ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:text-gray-600")}><List size={18} /></button><button onClick={() => setView('grid')} className={clsx("p-2 rounded-lg transition-all", view === 'grid' ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:text-gray-600")}><LayoutGrid size={18} /></button></div>
                <button onClick={() => setDetailsOpen(!detailsOpen)} className={clsx("p-2.5 rounded-xl transition-all border", detailsOpen ? "bg-blue-50 text-blue-600 border-blue-200" : "bg-white border-gray-200 text-gray-400 hover:text-gray-700")}><Info size={18} /></button>
            </div>
        </header>

        <div className="px-4 md:px-8 py-3 flex items-center justify-between text-sm bg-white border-b border-gray-200/50 sticky top-16 z-20">
            <div className="flex items-center overflow-hidden">
                {activeFilter !== 'all' ? (
                     <span className="font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-lg border border-blue-100 text-xs uppercase tracking-wide flex items-center gap-2"><Filter size={12}/> {activeFilter === 'pending_review' ? 'Pendientes' : (activeFilter === 'completed' ? 'Historial' : activeFilter)}{completedGroupView && <><ChevronRight size={12} className="text-gray-400"/> {completedGroupView}</>}</span>
                ) : (
                    debouncedSearch ? <span className="font-bold text-gray-800 flex items-center gap-2"><Search size={14} className="text-blue-500"/> Resultados para "{debouncedSearch}"</span> :
                    <nav className="flex items-center text-gray-500"><button onClick={() => setPath([])} className={clsx("hover:bg-gray-100 px-2 py-1 rounded-md transition-colors flex items-center gap-1", path.length === 0 ? "text-gray-800 font-bold bg-gray-100" : "")}><Home size={14} className="mb-0.5"/> Unidad</button>{path.map((folder, i) => (<React.Fragment key={folder}><ChevronRight size={14} className="text-gray-300 mx-1" /><button onClick={() => setPath(path.slice(0, i + 1))} className={clsx("hover:bg-gray-100 px-2 py-1 rounded-md transition-colors truncate max-w-[150px]", i === path.length - 1 ? "text-gray-800 font-bold bg-gray-50" : "")}>{folder}</button></React.Fragment>))}</nav>
                )}
            </div>
            <div className="relative"><button onClick={() => setFilterMenuOpen(!filterMenuOpen)} className="flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-gray-800 transition-colors px-2 py-1 rounded-lg hover:bg-gray-100"><ArrowUpWideNarrow size={14} /> <span>ORDENAR</span></button>{filterMenuOpen && <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95"><div className="p-1 space-y-0.5"><button onClick={() => setSortBy('dateDesc')} className={clsx("w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg", sortBy === 'dateDesc' ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50")}>Más recientes</button><button onClick={() => setSortBy('dateAsc')} className={clsx("w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg", sortBy === 'dateAsc' ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50")}>Más antiguos</button></div></div>}</div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">{loading ? <LoadingSkeleton /> : renderContent()}</div>
      </div>
        
      {detailsOpen && selectedIds.size === 1 && (() => {
          const fileId = Array.from(selectedIds)[0];
          const file = files.find(f => f.fullPath === fileId);
          return file ? <DetailsPanel file={file} onClose={() => setDetailsOpen(false)} isQualityUser={isQualityUser(currentUserData)} onToggleStatus={updateFileStatus} onDownload={() => handlePreview(file)} onDelete={handleDelete} /> : null;
      })()}
      
      {/* --- PREVIEW MODAL --- */}
      {previewFile && (
          <FilePreviewModal 
            file={previewFile} 
            onClose={() => setPreviewFile(null)} 
            onDownload={() => handleDownload(previewFile)}
          />
      )}

      {/* --- CONTEXT MENU --- */}
      {contextMenu && (
        <div className="fixed bg-white/95 backdrop-blur-xl border border-gray-200 shadow-2xl rounded-xl py-1 w-64 z-50 text-sm animate-in fade-in zoom-in-95 duration-100" style={{ top: Math.min(contextMenu.y, window.innerHeight - 300), left: Math.min(contextMenu.x, window.innerWidth - 250) }} onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 rounded-t-xl"><p className="font-bold text-gray-800 truncate text-xs">{contextMenu.file ? contextMenu.file.name : contextMenu.folder?.name}</p></div>
            {contextMenu.file && (
                <>
                    <MenuOption icon={<Eye size={16}/>} label="Vista previa" onClick={() => { if(contextMenu.file) handlePreview(contextMenu.file); setContextMenu(null); }} shortcut="Espacio"/>
                    <MenuOption icon={<Download size={16}/>} label="Descargar" onClick={() => { if(contextMenu.file) handleDownload(contextMenu.file); setContextMenu(null); }} />
                    <div className="my-1 border-t border-gray-100"></div>
                    <MenuOption icon={<FileCheck size={16} className={contextMenu.file.completed ? "text-blue-600" : "text-gray-400"} />} label={contextMenu.file.completed ? "Marcar como Pendiente" : "Marcar como Realizado"} onClick={() => { updateFileStatus(contextMenu.file!, 'completed', !contextMenu.file!.completed); setContextMenu(null); }} />
                    {isQualityUser(currentUserData) && (<MenuOption icon={<CheckCircle2 size={16} className={contextMenu.file.reviewed ? "text-green-600" : "text-gray-400"} />} label={contextMenu.file.reviewed ? "Invalidar Calidad" : "Validar Calidad"} onClick={() => { updateFileStatus(contextMenu.file!, 'reviewed', !contextMenu.file!.reviewed); setContextMenu(null); }} />)}
                    <div className="my-1 border-t border-gray-100"></div>
                    {isQualityUser(currentUserData) && (<><MenuOption icon={<Edit size={16} className="text-purple-500"/>} label="Renombrar" onClick={() => { if(contextMenu.file) { setRenameTargetFile(contextMenu.file); setRenameTargetFolder(null); setNewName(contextMenu.file.name); setRenameDialogOpen(true); setContextMenu(null); } }} /><MenuOption icon={<MoveRight size={16} className="text-blue-500"/>} label="Mover a carpeta" onClick={() => { if(contextMenu.file) { setMoveTargetFile(contextMenu.file); setMoveTargetFolder(null); setMoveDialogOpen(true); setContextMenu(null); } }} /><MenuOption icon={<Trash2 size={16} className="text-red-500"/>} label="Eliminar archivo" className="text-red-600 hover:bg-red-50" onClick={() => { if(contextMenu.file) handleDelete(contextMenu.file); setContextMenu(null); }} shortcut="Del" /></>)}
                </>
            )}
             {contextMenu.folder && isQualityUser(currentUserData) && (
                 <>
                    <MenuOption icon={<FolderOpen size={16} className="text-blue-500"/>} label="Abrir" onClick={() => { if(contextMenu.folder) { setPath([...path, contextMenu.folder.name]); setContextMenu(null); } }} />
                    <MenuOption icon={<Edit size={16} className="text-purple-500"/>} label="Renombrar" onClick={() => { if(contextMenu.folder) { setRenameTargetFolder(contextMenu.folder); setRenameTargetFile(null); setNewName(contextMenu.folder.name); setRenameDialogOpen(true); setContextMenu(null); } }} />
                    <MenuOption icon={<MoveRight size={16} className="text-blue-500"/>} label="Mover a carpeta" onClick={() => { if(contextMenu.folder) { setMoveTargetFolder(contextMenu.folder); setMoveTargetFile(null); setMoveDialogOpen(true); setContextMenu(null); } }} />
                 </>
            )}
        </div>
      )}

      {/* --- MOVE MODAL --- */}
      {moveDialogOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => e.stopPropagation()}>
              <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[80vh] overflow-hidden animate-in zoom-in-95">
                  <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                      <h3 className="font-bold text-gray-800 flex items-center gap-2">
                          <MoveRight className="text-blue-600" size={20} /> Mover "{moveTargetFile?.name || moveTargetFolder?.name}"
                      </h3>
                      <button onClick={() => setMoveDialogOpen(false)} className="p-1 hover:bg-gray-200 rounded-full"><X size={20} /></button>
                  </div>
                  <div className="p-3 bg-gray-100 border-b border-gray-200 flex items-center gap-2 text-sm">
                      <button disabled={moveToPath.length === 0} onClick={() => setMoveToPath(prev => prev.slice(0, -1))} className="p-1.5 bg-white border rounded hover:bg-gray-50 disabled:opacity-50"><ArrowUp size={16} /></button>
                      <div className="flex items-center gap-1 overflow-hidden text-gray-600"><Home size={14} /><span>/</span>{moveToPath.map((p, i) => <span key={i} className="font-medium text-gray-800">{p} /</span>)}</div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 min-h-[200px]">
                      {moveFolderContent.length === 0 ? 
                          <div className="text-center py-10 text-gray-400 flex flex-col items-center"><FolderOpen size={32} className="mb-2 opacity-50" /><p>Carpeta vacía</p></div> : 
                          <div className="space-y-1">{moveFolderContent.map((folder, idx) => (
                              <button 
                                  key={idx} 
                                  onClick={() => setMoveToPath([...moveToPath, folder.name])} 
                                  disabled={moveTargetFolder?.name === folder.name} 
                                  className={clsx("w-full flex items-center gap-3 p-3 hover:bg-blue-50 rounded-lg text-left transition-colors group", moveTargetFolder?.name === folder.name && "opacity-50 cursor-not-allowed")}
                              >
                                  <Folder size={20} className="text-blue-400 group-hover:text-blue-600 fill-blue-50" />
                                  <span className="text-sm font-medium text-gray-700">{folder.name}</span>
                                  <ChevronRight size={16} className="ml-auto text-gray-400" />
                              </button>
                          ))}</div>
                      }
                  </div>
                  <div className="p-4 border-t border-gray-100 flex justify-end gap-3 bg-white">
                      <button onClick={() => setMoveDialogOpen(false)} disabled={isMoving} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">Cancelar</button>
                      <button onClick={handleModalMove} disabled={(!moveTargetFile && !moveTargetFolder) || isMoving} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-lg flex items-center gap-2 disabled:opacity-50">
                          {isMoving ? <img src={labLogo} className="w-4 h-4 animate-spin" alt="moving" /> : "Mover Aquí"}
                      </button>
                  </div>
              </div>
          </div>
      )}

      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
          {toasts.map(toast => (<div key={toast.id} className={clsx("pointer-events-auto px-4 py-3 rounded-xl shadow-xl shadow-gray-200/50 flex items-center gap-3 animate-in slide-in-from-right-10 fade-in duration-300 border text-sm font-medium", toast.type === 'success' ? 'bg-white border-green-200 text-green-700' : toast.type === 'error' ? 'bg-white border-red-200 text-red-700' : 'bg-gray-800 text-white')}>{toast.type === 'success' ? <CheckCircle2 size={18} className="text-green-500"/> : toast.type === 'error' ? <AlertCircle size={18} className="text-red-500"/> : <Info size={18}/>}{toast.text}</div>))}
      </div>
      
      {createFolderOpen && <Dialog title="Nueva Carpeta" onClose={() => setCreateFolderOpen(false)} onConfirm={() => { if (!newFolderName.trim()) return; const folderRef = ref(storage, `${[ROOT_PATH, ...path, newFolderName.trim()].join('/')}/.keep`); uploadBytes(folderRef, new Uint8Array([0])).then(() => { setCreateFolderOpen(false); setNewFolderName(""); loadContent(); }); }}><input autoFocus value={newFolderName} onChange={e=>setNewFolderName(e.target.value)} className="w-full border border-gray-300 p-3 rounded-xl mb-6 outline-none focus:ring-2 focus:ring-blue-500" placeholder="Nombre..." /></Dialog>}
      
      {renameDialogOpen && <Dialog title="Renombrar" onClose={() => setRenameDialogOpen(false)} onConfirm={async () => { /* Logica placeholder */ setRenameDialogOpen(false); }}><input autoFocus value={newName} onChange={e => setNewName(e.target.value)} className="w-full border border-gray-300 p-3 rounded-xl outline-none focus:ring-2 focus:ring-purple-500" placeholder="Nuevo nombre..." /></Dialog>}
    </div>
  );
}

// --- SUBCOMPONENTES PRO ---

// Nuevo Componente Switch Animado PRO
const ProSwitch = ({ checked, onChange, disabled, activeColor = "bg-blue-600" }: any) => {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={onChange}
            className={clsx(
                "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                checked ? activeColor : "bg-gray-200",
                disabled && "opacity-50 cursor-not-allowed"
            )}
        >
            <span
                className={clsx(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-300 ease-in-out relative top-[0.5px]",
                    checked ? "translate-x-5" : "translate-x-0"
                )}
            />
        </button>
    );
};

const FileCard = React.memo(({ file, selected, onSelect, onContextMenu, onDoubleClick, searchActive }: any) => {
    const isReadyForReview = file.completed && !file.reviewed;
    const showFolder = searchActive && file.parentFolder && file.parentFolder !== "Raíz";

    return (
        <div 
            onClick={(e) => onSelect(e.ctrlKey || e.metaKey, e.shiftKey)} 
            onContextMenu={onContextMenu} 
            onDoubleClick={onDoubleClick} 
            className={clsx(
                "group relative bg-white border rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 flex flex-col h-[270px] select-none", 
                selected ? "ring-2 ring-blue-500 border-transparent shadow-xl translate-y-[-4px]" : "border-gray-200/80 hover:border-blue-300 hover:shadow-lg hover:translate-y-[-2px]", 
                isReadyForReview ? "ring-1 ring-blue-400 border-blue-200 shadow-blue-100" : ""
            )}
        >
            <div className="h-32 bg-gray-50 flex items-center justify-center border-b border-gray-100 group-hover:bg-white transition-colors relative">
                {selected && <div className="absolute top-2 left-2 z-20"><div className="bg-blue-500 text-white rounded-full p-1"><CheckCircle2 size={16} /></div></div>}
                <div className="transform transition-transform group-hover:scale-110 duration-500 drop-shadow-sm">{getFileIcon(file.name, 60)}</div>
                <div className="absolute top-3 right-3 flex flex-col gap-1">
                    {file.reviewed && <div className="bg-green-500 text-white p-1 rounded-full shadow-md z-10" title="Validado"><CheckCircle2 size={12}/></div>}
                    {isReadyForReview && <div className="bg-blue-500 text-white p-1 rounded-full shadow-md z-10 animate-pulse" title="Listo para Revisión"><Eye size={12}/></div>}
                </div>
            </div>
            <div className="p-4 flex flex-col flex-1 justify-between">
                <div>
                    <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-sm font-bold text-gray-800 line-clamp-2 leading-tight" title={file.name}>{file.name}</p>
                    </div>
                    {showFolder && (
                        <div className="flex items-center gap-1 text-[10px] text-blue-600 bg-blue-50 px-2 py-1 rounded-md mb-2 w-fit max-w-full">
                            <CornerDownRight size={10} className="flex-shrink-0" />
                            <span className="truncate font-medium">{file.parentFolder}</span>
                        </div>
                    )}
                    <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-1">
                         <span className="bg-gray-100 px-1.5 py-0.5 rounded font-mono">{formatFileSize(file.size)}</span>
                    </div>
                </div>
                <DeadlineBar createdDate={file.created} />
            </div>
        </div>
    );
});

const FileListRow = React.memo(({ file, selected, onSelect, onContextMenu, onDoubleClick, searchActive }: any) => {
    const showFolder = searchActive && file.parentFolder && file.parentFolder !== "Raíz";
    return (
        <div 
            onClick={(e) => onSelect(e.ctrlKey || e.metaKey, e.shiftKey)} 
            onContextMenu={onContextMenu} 
            onDoubleClick={onDoubleClick} 
            className={clsx("grid grid-cols-12 gap-4 px-4 md:px-6 py-4 border-b border-gray-100 hover:bg-blue-50/40 cursor-pointer items-center transition-all group select-none", selected ? "bg-blue-50 border-l-4 border-l-blue-500 pl-3 md:pl-[20px]" : "")}
        >
            <div className="col-span-10 md:col-span-4 flex items-center gap-3 overflow-hidden">
                {selected ? <CheckCircle2 size={24} className="text-blue-500"/> : getFileIcon(file.name, 24)}
                <div className="flex flex-col min-w-0">
                    <span className={clsx("truncate font-semibold text-sm", selected ? "text-blue-700" : "text-gray-700")}>{file.name}</span>
                    {showFolder && <span className="text-[10px] text-gray-400 flex items-center gap-1"><FolderOpen size={10}/> {file.parentFolder}</span>}
                </div>
            </div>
            <div className="hidden md:block col-span-3 pr-8"><DeadlineBar createdDate={file.created} /></div>
            <div className="hidden md:block col-span-2">
                 {file.reviewed ? <StatusBadge type="success" text="Validado" icon={CheckCircle2}/> : file.completed ? <StatusBadge type="warning" text="Por Revisar" icon={Eye}/> : <StatusBadge type="neutral" text="En Proceso" icon={Clock}/>}
            </div>
            <div className="hidden md:block col-span-2 text-right text-gray-400 text-xs font-mono">{formatFileSize(file.size)}</div>
            <div className="col-span-2 md:col-span-1 flex justify-end"><button className="p-2 text-gray-300 hover:text-blue-600 rounded-full hover:bg-blue-100 transition-all opacity-0 group-hover:opacity-100"><Download size={16}/></button></div>
        </div>
    );
});

const FilePreviewModal = ({ file, onClose, onDownload }: { file: DriveFile, onClose: () => void, onDownload: () => void }) => {
    const isImage = ['jpg', 'jpeg', 'png', 'svg', 'webp', 'gif'].includes(file.name.split('.').pop()?.toLowerCase() || '');
    const isPdf = file.name.endsWith('.pdf');

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-white rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="h-14 border-b border-gray-200 flex items-center justify-between px-6 bg-gray-50">
                    <div className="flex items-center gap-3 overflow-hidden">
                        {getFileIcon(file.name, 20)}
                        <h3 className="font-bold text-gray-800 truncate">{file.name}</h3>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={onDownload} className="p-2 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors" title="Descargar"><Download size={20}/></button>
                        <button onClick={onClose} className="p-2 hover:bg-red-50 text-gray-500 hover:text-red-500 rounded-lg transition-colors"><X size={20}/></button>
                    </div>
                </div>
                <div className="flex-1 bg-gray-100 flex items-center justify-center overflow-hidden relative">
                    {!file.url ? (
                        <div className="flex flex-col items-center gap-3"><Loader2 size={40} className="animate-spin text-blue-500" /><p className="text-gray-500 font-medium">Cargando vista previa...</p></div>
                    ) : isImage ? (
                        <img src={file.url} alt="Preview" className="max-w-full max-h-full object-contain shadow-lg" />
                    ) : isPdf ? (
                        <iframe src={file.url} className="w-full h-full" title="PDF Preview"></iframe>
                    ) : (
                        <div className="text-center">
                            <FileText size={64} className="mx-auto text-gray-300 mb-4" />
                            <p className="text-gray-500 mb-4">Este archivo no se puede previsualizar aquí.</p>
                            <button onClick={onDownload} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">Descargar para ver</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const StatusBadge = ({ type, text, icon: Icon }: any) => {
    const styles = { success: "bg-green-100 text-green-700 border-green-200", warning: "bg-blue-100 text-blue-700 border-blue-200 animate-pulse", neutral: "bg-gray-100 text-gray-500 border-gray-200" };
    return <span className={clsx("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border", styles[type as keyof typeof styles])}><Icon size={12}/> {text}</span>
};

const DeadlineBar = ({ createdDate }: { createdDate: string }) => {
    const { progress, daysLeft, status } = getDeadlineInfo(createdDate);
    const colors = { normal: "bg-emerald-500", warning: "bg-amber-500", urgent: "bg-orange-500", overdue: "bg-rose-500" };
    return (
        <div className="w-full mt-auto">
            <div className="flex justify-between items-center mb-1"><span className={clsx("text-[9px] font-bold uppercase tracking-wider", status === 'overdue' ? "text-rose-600" : "text-gray-400")}>{status === 'overdue' ? `Vencido ${Math.abs(daysLeft)}d` : `${daysLeft} días rest.`}</span><span className="text-[9px] text-gray-300 font-mono">{Math.round(progress)}%</span></div>
            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden"><div className={clsx("h-full rounded-full transition-all duration-1000 ease-out", colors[status])} style={{ width: `${progress}%` }}></div></div>
        </div>
    );
};

const EmptyState = ({ icon: Icon, text }: any) => <div className="h-full flex flex-col items-center justify-center text-gray-300 py-20 animate-in fade-in zoom-in-95"><div className="bg-gray-50 p-6 rounded-full mb-4"><Icon className="w-12 h-12 text-gray-200" strokeWidth={1.5} /></div><p className="text-base font-medium text-gray-400">{text}</p></div>;

// Nuevo LoadingSkeleton PRO con Logo Giratorio
const LoadingSkeleton = () => (
    <div className="h-full w-full flex flex-col items-center justify-center min-h-[400px] animate-in fade-in duration-500">
        <div className="relative">
            <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full animate-pulse"></div>
            <img src={labLogo} alt="Cargando..." className="w-24 h-24 animate-spin relative z-10 drop-shadow-lg" style={{ animationDuration: '3s' }} />
        </div>
        <p className="text-gray-400 font-medium mt-6 animate-pulse tracking-wider text-sm">Cargando tu espacio...</p>
    </div>
);

const SidebarItem = ({ icon, label, active, onClick, badge }: any) => (<button onClick={onClick} className={clsx("w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all mb-1 group relative overflow-hidden", active ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900")}><div className="flex items-center justify-between relative z-10"><div className="flex items-center gap-3">{icon} {label}</div>{badge && <div className="w-2 h-2 bg-blue-500 rounded-full shadow-sm"></div>}</div></button>);
const MenuOption = ({ icon, label, onClick, shortcut, className }: any) => (<button onClick={onClick} className={clsx("w-full text-left px-4 py-2.5 text-gray-700 hover:bg-blue-50 flex items-center gap-3 transition-colors text-sm font-medium", className)}>{icon} {label} {shortcut && <span className="text-xs text-gray-400 ml-auto">{shortcut}</span>}</button>);

const DetailsPanel = ({ file, onClose, isQualityUser, onToggleStatus, onDownload, onDelete }: any) => (
    <div className="fixed md:relative inset-0 md:inset-auto w-full md:w-96 bg-white border-l border-gray-200 shadow-2xl z-[60] overflow-y-auto animate-in slide-in-from-right duration-300 flex flex-col h-full">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
            <span className="font-bold text-gray-800 text-lg flex items-center gap-2">Detalles</span>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors"><X size={20} className="text-gray-400"/></button>
        </div>
        <div className="p-8 flex flex-col items-center border-b border-gray-100/50">
            <div className="w-24 h-24 bg-gray-50 rounded-[2rem] flex items-center justify-center mb-6 shadow-sm border border-gray-100">{getFileIcon(file.name, 56)}</div>
            <h3 className="font-bold text-center text-gray-800 break-words w-full text-lg mb-2 leading-tight">{file.name}</h3>
            <div className="flex flex-wrap gap-2 justify-center"><span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-2 py-1 rounded-md">{formatFileSize(file.size)}</span></div>
        </div>
        <div className="p-6 space-y-8 flex-1">
            <div>
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Settings size={12}/> Estado del Proceso</h4>
                <div className="space-y-4">
                    <div className={clsx("p-4 rounded-2xl border transition-all flex items-center justify-between gap-4 shadow-sm", file.completed ? "bg-blue-50 border-blue-200/60" : "bg-white border-gray-200/60")}>
                        <div className="flex-1"><span className="text-sm font-bold text-gray-700 block mb-1">Metrólogo</span><p className="text-xs text-gray-500">{file.completedByName || "Pendiente"}</p></div>
                        <ProSwitch checked={file.completed} onChange={() => onToggleStatus(file, 'completed', !file.completed)} />
                    </div>
                    <div className={clsx("p-4 rounded-2xl border transition-all flex items-center justify-between gap-4 shadow-sm", file.reviewed ? "bg-green-50 border-green-200/60" : "bg-white border-gray-200/60")}>
                        <div className="flex-1"><span className="text-sm font-bold text-gray-700 block mb-1">Calidad</span><p className="text-xs text-gray-500">{file.reviewedByName || "Pendiente"}</p></div>
                        <ProSwitch checked={file.reviewed} disabled={!isQualityUser} activeColor="bg-green-600" onChange={() => onToggleStatus(file, 'reviewed', !file.reviewed)} />
                    </div>
                </div>
            </div>
        </div>
        <div className="p-4 bg-white border-t border-gray-100 grid grid-cols-2 gap-3 pb-8 md:pb-4"><button onClick={() => onDownload(file)} className="flex items-center justify-center gap-2 py-3 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 text-sm font-bold text-gray-700 transition-all"><Maximize2 size={16}/> Vista Previa</button>{isQualityUser && <button onClick={() => onDelete(file)} className="flex items-center justify-center gap-2 py-3 bg-red-50 border border-red-100 rounded-xl hover:bg-red-100 text-sm font-bold text-red-600 transition-all"><Trash2 size={16}/> Borrar</button>}</div>
    </div>
);

const Dialog = ({ title, children, onClose, onConfirm }: any) => (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
            <div className="px-4 py-3 border-b border-gray-100 font-bold text-gray-800">{title}</div>
            <div className="p-4">{children}</div>
            <div className="bg-gray-50 px-4 py-3 flex justify-end gap-2">
                <button onClick={onClose} className="px-3 py-1.5 text-gray-600 hover:bg-gray-200 rounded-lg text-sm font-medium">Cancelar</button>
                <button onClick={onConfirm} className="px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-medium">Confirmar</button>
            </div>
        </div>
    </div>
);