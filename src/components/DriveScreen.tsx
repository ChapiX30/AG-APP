import React, { useState, useEffect, useMemo, useRef } from "react";
import { ref, listAll, getDownloadURL, uploadBytes, deleteObject, getMetadata } from "firebase/storage";
import { doc, getDoc, updateDoc, deleteDoc, setDoc, collection, addDoc, query, where, limit, getDocs } from "firebase/firestore";
import { storage, db, auth } from "../utils/firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { useNavigation } from "../hooks/useNavigation";
import { 
  Folder, Plus, ArrowLeft, Cloud, Search, List, LayoutGrid, Trash2, 
  CheckCircle2, FileText, Download, MoreVertical, Star, Info, X, 
  FolderPlus, UploadCloud, ChevronRight, File, Image as ImageIcon, 
  Music, Video, Loader2, FileCheck, FolderOpen, MoveRight, ArrowUp,
  Home, ShieldAlert, ArrowDownUp 
} from "lucide-react";
import clsx from "clsx";

// --- INTERFACES ---
interface DriveFile {
  name: string;
  url: string;
  fullPath: string;
  updated: string;
  size?: number;
  contentType?: string;
  reviewed?: boolean;
  reviewedByName?: string;
  completed?: boolean;
  completedByName?: string;
  starred?: boolean;
  originalUpdated?: string;
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

// --- TIPO DE ORDENAMIENTO ---
type SortOption = 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc' | 'size-desc' | 'size-asc';

// --- UTILS DE SEGURIDAD ---
const isQualityUser = (user: UserData | null) => {
  const p = (user?.puesto || user?.role || "").toLowerCase();
  return p.includes('calidad') || p.includes('quality') || p.includes('admin') || p.includes('supervisor') || p.includes('gerente');
};

// --- UTILS VISUALES ---
const formatFileSize = (bytes?: number): string => {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
};

const getFileIcon = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(ext || '')) return <ImageIcon className="text-purple-500" />;
  if (['mp3', 'wav'].includes(ext || '')) return <Music className="text-pink-500" />;
  if (['mp4', 'mov'].includes(ext || '')) return <Video className="text-red-500" />;
  if (['pdf'].includes(ext || '')) return <FileText className="text-red-500" />;
  if (['xls', 'xlsx', 'csv'].includes(ext || '')) return <FileText className="text-green-500" />;
  if (['doc', 'docx'].includes(ext || '')) return <FileText className="text-blue-500" />;
  return <File className="text-gray-400" />;
};

const ROOT_PATH = "worksheets";

export default function DriveScreen({ onBack }: { onBack?: () => void }) {
  const [user] = useAuthState(auth);
  const { goBack } = useNavigation();

  // --- ESTADOS ---
  const [currentFolders, setCurrentFolders] = useState<DriveFolder[]>([]);
  const [currentFiles, setCurrentFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string[]>([]);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  
  // ESTADO DE FILTRO Y ORDENAMIENTO
  const [sortOption, setSortOption] = useState<SortOption>('date-desc');
  const [showSortMenu, setShowSortMenu] = useState(false);

  // ESTADO DE BÚSQUEDA
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DriveFile[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [activeMenuFile, setActiveMenuFile] = useState<DriveFile | null>(null);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [deleteFile, setDeleteFile] = useState<DriveFile | null>(null);
  const [fileInfoTarget, setFileInfoTarget] = useState<DriveFile | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveTargetFile, setMoveTargetFile] = useState<DriveFile | null>(null);
  const [moveToPath, setMoveToPath] = useState<string[]>([]);
  const [moveFolderContent, setMoveFolderContent] = useState<DriveFolder[]>([]);
  const [isMoving, setIsMoving] = useState(false);
  const [currentUserData, setCurrentUserData] = useState<UserData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Cargar Perfil
  useEffect(() => {
    const loadUserPermissions = async () => {
      if (!user?.email) return;
      try {
        const q = query(collection(db, 'usuarios'), where('correo', '==', user.email), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
            const data = snap.docs[0].data();
            setCurrentUserData({
                name: data.nombre || data.name,
                email: data.correo || data.email,
                puesto: data.puesto || data.position || data.role
            });
        }
      } catch (e) { console.error("Error cargando permisos:", e); }
    };
    loadUserPermissions();
  }, [user]);

  // 2. Cargar Archivos (Solo si NO estamos buscando)
  useEffect(() => {
    if (currentUserData && !searchQuery) loadCurrentDirectory();
  }, [currentUserData, selectedPath, searchQuery]);

  // 3. EFECTO DE BÚSQUEDA OPTIMIZADO
  useEffect(() => {
      let isActive = true;

      const performSearch = async () => {
          if (!searchQuery.trim()) {
              setIsSearching(false);
              setSearchResults([]);
              setLoading(false);
              return;
          }

          setIsSearching(true);
          setLoading(true);

          try {
              const q = query(collection(db, 'fileMetadata')); 
              const snapshot = await getDocs(q);
              
              if (!isActive) return;

              const results: DriveFile[] = [];
              const searchTerm = searchQuery.toLowerCase();
              const isQuality = isQualityUser(currentUserData);
              const userNameLower = (currentUserData?.name || "").toLowerCase();

              for (const d of snapshot.docs) {
                  const data = d.data();
                  
                  let realName = data.name;
                  if (!realName && data.filePath) {
                      const parts = data.filePath.split('/');
                      realName = parts[parts.length - 1];
                  }
                  if (!realName) realName = d.id;

                  const matchName = realName.toLowerCase().includes(searchTerm);
                  const matchId = d.id.toLowerCase().includes(searchTerm);

                  if (matchName || matchId) {
                      if (!isQuality && !d.id.toLowerCase().includes(userNameLower)) {
                          continue; 
                      }
                      
                      const fullPath = data.filePath || d.id.replace(/_/g, '/');
                      
                      results.push({
                          name: realName, 
                          url: "", 
                          fullPath: fullPath,
                          updated: data.updated || new Date().toISOString(),
                          size: data.size || 0,
                          contentType: data.contentType,
                          reviewed: data.reviewed,
                          completed: data.completed,
                          starred: data.starred,
                          reviewedByName: data.reviewedByName,
                          completedByName: data.completedByName
                      });
                  }
              }
              setSearchResults(results);
          } catch (e) {
              console.error("Error en búsqueda:", e);
          } finally {
              if (isActive) setLoading(false);
          }
      };

      const delayDebounceFn = setTimeout(() => {
          performSearch();
      }, 300);

      return () => {
          isActive = false;
          clearTimeout(delayDebounceFn);
      };
  }, [searchQuery, currentUserData]);

  // 4. Cargar carpetas para mover
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

  // --- LÓGICA DE CARGA ---
  async function loadCurrentDirectory() {
    setLoading(true);
    setCurrentFolders([]);
    setCurrentFiles([]);
    setError(null);
    try {
        const pathString = [ROOT_PATH, ...selectedPath].join('/');
        const listRef = ref(storage, pathString);
        const res = await listAll(listRef);

        const folders: DriveFolder[] = res.prefixes.map(p => ({ name: p.name, fullPath: p.fullPath }));
        
        const filesPromises = res.items.map(async (itemRef) => {
            if (itemRef.name === '.keep') return null;
            const url = await getDownloadURL(itemRef).catch(() => "");
            const metadata = await getMetadata(itemRef).catch(() => ({ updated: new Date().toISOString(), size: 0, contentType: '' }));
            const metaId = itemRef.fullPath.replace(/\//g, '_');
            const metaDoc = await getDoc(doc(db, 'fileMetadata', metaId));
            const extraMeta = metaDoc.exists() ? metaDoc.data() : {};

            return { 
                name: itemRef.name, 
                url, 
                fullPath: itemRef.fullPath, 
                updated: metadata.updated, 
                size: metadata.size, 
                contentType: metadata.contentType,
                ...extraMeta
            } as DriveFile;
        });

        const files = (await Promise.all(filesPromises)).filter(f => f !== null) as DriveFile[];
        setCurrentFolders(folders);
        setCurrentFiles(files);
    } catch (e: any) {
        console.error(e);
        setError("Carpeta vacía o sin acceso.");
    } finally {
        setLoading(false);
    }
  }

  // --- FUNCIONES ACCIONES ---
  const handleOpenFile = async (file: DriveFile) => {
    try {
        let url = file.url;
        if (!url) {
            url = await getDownloadURL(ref(storage, file.fullPath));
        }
        window.open(url, '_blank');
    } catch (error) {
        console.error("Error abriendo archivo:", error);
        alert("No se pudo abrir el archivo.");
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isQualityUser(currentUserData)) return alert("⛔️ Solo Calidad puede subir archivos.");
    if (!e.target.files || e.target.files.length === 0) return;
    setIsUploading(true);
    try {
        for (const file of Array.from(e.target.files)) {
            const fullPath = `${[ROOT_PATH, ...selectedPath].join('/')}/${file.name}`;
            const fileRef = ref(storage, fullPath);
            const snap = await uploadBytes(fileRef, file);
            const meta = await getMetadata(snap.ref);
            const metaId = fullPath.replace(/\//g, '_');
            await setDoc(doc(db, 'fileMetadata', metaId), {
                name: file.name,
                name_lower: file.name.toLowerCase(),
                filePath: fullPath,
                size: meta.size,
                contentType: meta.contentType,
                updated: meta.updated,
                uploadedBy: currentUserData?.email
            }, { merge: true });
        }
        await loadCurrentDirectory();
    } catch (e) { console.error(e); alert("Error al subir archivo"); }
    finally { setIsUploading(false); }
  };

  const handleCreateFolder = async () => {
    if (!isQualityUser(currentUserData)) return;
    if (!newFolderName.trim()) return;
    try {
        const folderRef = ref(storage, `${[ROOT_PATH, ...selectedPath, newFolderName.trim()].join('/')}/.keep`);
        await uploadBytes(folderRef, new Uint8Array([0]));
        setCreateFolderOpen(false);
        setNewFolderName("");
        await loadCurrentDirectory();
    } catch (e) { console.error(e); }
  };

  const handleDelete = async () => {
    if (!isQualityUser(currentUserData)) return;
    if (!deleteFile) return;
    try {
        await deleteObject(ref(storage, deleteFile.fullPath));
        await deleteDoc(doc(db, 'fileMetadata', deleteFile.fullPath.replace(/\//g, '_'))).catch(() => {});
        setDeleteFile(null);
        if (isSearching) {
            setSearchResults(prev => prev.filter(f => f.fullPath !== deleteFile.fullPath));
        } else {
            await loadCurrentDirectory();
        }
    } catch (e) { console.error(e); alert("Error al eliminar."); }
  };

  const handleMoveFile = async () => {
    if (!moveTargetFile || !isQualityUser(currentUserData)) return;
    const destinationPathString = [ROOT_PATH, ...moveToPath].join('/');
    const newFullPath = `${destinationPathString}/${moveTargetFile.name}`;
    if (newFullPath === moveTargetFile.fullPath) {
      setMoveDialogOpen(false);
      return;
    }
    setIsMoving(true);
    try {
        let fileUrl = moveTargetFile.url;
        if (!fileUrl) fileUrl = await getDownloadURL(ref(storage, moveTargetFile.fullPath));
        const response = await fetch(fileUrl);
        const blob = await response.blob();
        await uploadBytes(ref(storage, newFullPath), blob);

        const oldMetaId = moveTargetFile.fullPath.replace(/\//g, '_');
        const newMetaId = newFullPath.replace(/\//g, '_');
        const oldMetaDoc = await getDoc(doc(db, 'fileMetadata', oldMetaId));
        let metaData = oldMetaDoc.exists() ? oldMetaDoc.data() : {};
        
        if (oldMetaDoc.exists()) await deleteDoc(doc(db, 'fileMetadata', oldMetaId));
        await setDoc(doc(db, 'fileMetadata', newMetaId), { 
            ...metaData, 
            filePath: newFullPath,
            name: moveTargetFile.name,
            updated: new Date().toISOString() 
        }, { merge: true });

        await deleteObject(ref(storage, moveTargetFile.fullPath));
        if (!isSearching) await loadCurrentDirectory();
        setMoveDialogOpen(false);
        setMoveTargetFile(null);
        setMoveToPath([]);
    } catch (e: any) {
        console.error("Error moving file:", e);
        alert(`No se pudo mover: ${e.message}`);
    } finally {
        setIsMoving(false);
    }
  };

  // Toggle helpers
  const handleToggleReviewed = async (file: DriveFile) => {
      if (!isQualityUser(currentUserData)) return;
      const newVal = !file.reviewed;
      const userName = currentUserData?.name || "Calidad";
      try {
          const id = file.fullPath.replace(/\//g, '_');
          await setDoc(doc(db, 'fileMetadata', id), { reviewed: newVal, reviewedByName: newVal ? userName : null }, { merge: true });
          const updateState = (prev: DriveFile[]) => prev.map(f => f.fullPath === file.fullPath ? { ...f, reviewed: newVal, reviewedByName: newVal ? userName : undefined } : f);
          if (isSearching) setSearchResults(updateState); else setCurrentFiles(updateState);
      } catch (e) { console.error(e); }
  };
  const handleToggleCompleted = async (file: DriveFile) => {
      const newVal = !file.completed;
      const userName = currentUserData?.name || "Usuario";
      try {
          const id = file.fullPath.replace(/\//g, '_');
          await setDoc(doc(db, 'fileMetadata', id), { completed: newVal, completedByName: newVal ? userName : null }, { merge: true });
          const updateState = (prev: DriveFile[]) => prev.map(f => f.fullPath === file.fullPath ? { ...f, completed: newVal, completedByName: newVal ? userName : undefined } : f);
          if (isSearching) setSearchResults(updateState); else setCurrentFiles(updateState);
      } catch (e) { console.error(e); }
  };
  const handleToggleStar = async (file: DriveFile) => {
      const newVal = !file.starred;
      try {
          const id = file.fullPath.replace(/\//g, '_');
          await setDoc(doc(db, 'fileMetadata', id), { starred: newVal }, { merge: true });
          const updateState = (prev: DriveFile[]) => prev.map(f => f.fullPath === file.fullPath ? { ...f, starred: newVal } : f);
          if (isSearching) setSearchResults(updateState); else setCurrentFiles(updateState);
      } catch (e) { console.error(e); }
  };

  // --- LÓGICA DE ORDENAMIENTO ---
  const displayFiles = useMemo(() => {
    let files = isSearching ? searchResults : currentFiles;
    return [...files].sort((a, b) => {
      switch (sortOption) {
        case 'date-desc': // Más reciente primero
          return new Date(b.updated).getTime() - new Date(a.updated).getTime();
        case 'date-asc': // Más antiguo primero
          return new Date(a.updated).getTime() - new Date(b.updated).getTime();
        case 'name-asc': // A-Z
          return a.name.localeCompare(b.name);
        case 'name-desc': // Z-A
          return b.name.localeCompare(a.name);
        case 'size-desc': // Más pesado primero
          return (b.size || 0) - (a.size || 0);
        case 'size-asc': // Más ligero primero
          return (a.size || 0) - (b.size || 0);
        default:
          return 0;
      }
    });
  }, [isSearching, searchResults, currentFiles, sortOption]);

  const displayFolders = isSearching ? [] : (selectedPath.length === 0 && currentUserData && !isQualityUser(currentUserData) ? 
     currentFolders.filter(f => f.name.toLowerCase().includes((currentUserData.name||"").toLowerCase())) 
     : currentFolders);

  // Labels para el botón de ordenamiento
  const sortLabels: Record<SortOption, string> = {
    'date-desc': 'Más Recientes',
    'date-asc': 'Más Antiguos',
    'name-asc': 'Nombre (A-Z)',
    'name-desc': 'Nombre (Z-A)',
    'size-desc': 'Tamaño (Mayor)',
    'size-asc': 'Tamaño (Menor)',
  };

  return (
    <div className="h-full flex flex-col bg-[#eceff8]" onClick={() => { setActiveMenuFile(null); setShowSortMenu(false); }}>
      
      {/* HEADER */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex flex-col gap-4 shadow-sm z-20 sticky top-0">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
                <button onClick={() => {
                    if (isSearching) { setSearchQuery(""); setIsSearching(false); }
                    else if (selectedPath.length) setSelectedPath(prev => prev.slice(0, -1));
                    else if (onBack) onBack();
                    else goBack();
                }} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
                    <ArrowLeft size={20} />
                </button>
                <div className="flex items-center gap-2">
                    <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
                        <Cloud size={20} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-800">AG Drive</h1>
                        <div className="flex items-center gap-1 text-xs text-gray-500 overflow-hidden max-w-[200px] md:max-w-md">
                            <span className="cursor-pointer hover:text-blue-600 hover:underline" onClick={() => {setSelectedPath([]); setSearchQuery("");}}>Raíz</span>
                            {selectedPath.map((p, i) => (
                                <React.Fragment key={i}>
                                    <ChevronRight size={12} />
                                    <span className="cursor-pointer hover:text-blue-600 hover:underline truncate" onClick={() => setSelectedPath(selectedPath.slice(0, i + 1))}>{p}</span>
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <div className="hidden md:flex relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input 
                        type="text" 
                        placeholder="Buscar..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 pr-4 py-2 bg-gray-100 border-transparent focus:bg-white focus:border-blue-500 border rounded-lg text-sm transition-all w-48 outline-none focus:w-64"
                    />
                    {searchQuery && (
                        <button onClick={() => {setSearchQuery(""); setIsSearching(false);}} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 rounded-full"><X size={12}/></button>
                    )}
                </div>

                {/* BOTÓN DE ORDENAMIENTO (CORREGIDO) */}
                <div className="relative">
                    <button 
                        onClick={(e) => { e.stopPropagation(); setShowSortMenu(!showSortMenu); }}
                        className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-blue-600 transition-colors text-sm font-medium shadow-sm"
                    >
                        <ArrowDownUp size={16} />
                        <span className="hidden sm:inline">{sortLabels[sortOption]}</span>
                    </button>
                    
                    {showSortMenu && (
                        <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-30 animate-in fade-in zoom-in-95 duration-100">
                            <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Fecha</div>
                            <button onClick={() => setSortOption('date-desc')} className={clsx("w-full text-left px-4 py-2 text-sm hover:bg-blue-50 transition-colors flex justify-between", sortOption === 'date-desc' ? "text-blue-600 font-medium" : "text-gray-700")}>Más Recientes {sortOption === 'date-desc' && <CheckCircle2 size={14}/>}</button>
                            <button onClick={() => setSortOption('date-asc')} className={clsx("w-full text-left px-4 py-2 text-sm hover:bg-blue-50 transition-colors flex justify-between", sortOption === 'date-asc' ? "text-blue-600 font-medium" : "text-gray-700")}>Más Antiguos {sortOption === 'date-asc' && <CheckCircle2 size={14}/>}</button>
                            
                            <div className="border-t border-gray-100 my-1"></div>
                            <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Nombre</div>
                            <button onClick={() => setSortOption('name-asc')} className={clsx("w-full text-left px-4 py-2 text-sm hover:bg-blue-50 transition-colors flex justify-between", sortOption === 'name-asc' ? "text-blue-600 font-medium" : "text-gray-700")}>A - Z {sortOption === 'name-asc' && <CheckCircle2 size={14}/>}</button>
                            <button onClick={() => setSortOption('name-desc')} className={clsx("w-full text-left px-4 py-2 text-sm hover:bg-blue-50 transition-colors flex justify-between", sortOption === 'name-desc' ? "text-blue-600 font-medium" : "text-gray-700")}>Z - A {sortOption === 'name-desc' && <CheckCircle2 size={14}/>}</button>

                            <div className="border-t border-gray-100 my-1"></div>
                            <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Tamaño</div>
                            <button onClick={() => setSortOption('size-desc')} className={clsx("w-full text-left px-4 py-2 text-sm hover:bg-blue-50 transition-colors flex justify-between", sortOption === 'size-desc' ? "text-blue-600 font-medium" : "text-gray-700")}>Mayor peso {sortOption === 'size-desc' && <CheckCircle2 size={14}/>}</button>
                            <button onClick={() => setSortOption('size-asc')} className={clsx("w-full text-left px-4 py-2 text-sm hover:bg-blue-50 transition-colors flex justify-between", sortOption === 'size-asc' ? "text-blue-600 font-medium" : "text-gray-700")}>Menor peso {sortOption === 'size-asc' && <CheckCircle2 size={14}/>}</button>
                        </div>
                    )}
                </div>

                <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200">
                    <button onClick={() => setView('grid')} className={clsx("p-2 rounded-md transition-all", view === 'grid' ? "bg-white shadow text-blue-600" : "text-gray-500 hover:text-gray-700")}><LayoutGrid size={18}/></button>
                    <button onClick={() => setView('list')} className={clsx("p-2 rounded-md transition-all", view === 'list' ? "bg-white shadow text-blue-600" : "text-gray-500 hover:text-gray-700")}><List size={18}/></button>
                </div>
            </div>
        </div>

        {isQualityUser(currentUserData) && !isSearching && (
            <div className="flex gap-3 pt-2">
                <button onClick={() => setCreateFolderOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all text-sm font-medium shadow-sm">
                    <FolderPlus size={16} /> Nueva Carpeta
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all text-sm font-medium shadow-md shadow-blue-200">
                    {isUploading ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />} Subir Archivo
                </button>
                <input ref={fileInputRef} type="file" multiple hidden onChange={handleUpload} />
            </div>
        )}
      </div>

      {/* --- CONTENT --- */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <Loader2 size={40} className="animate-spin mb-4 text-blue-500" />
                <p>{isSearching ? "Buscando en todo el sistema..." : "Sincronizando archivos..."}</p>
            </div>
        ) : (
            <>
                {isSearching && (
                    <div className="mb-6">
                         <h3 className="text-lg font-bold text-gray-800 mb-1">Resultados de búsqueda</h3>
                         <p className="text-sm text-gray-500">Se encontraron {displayFiles.length} archivos para "{searchQuery}"</p>
                    </div>
                )}

                {/* Folders */}
                {!isSearching && displayFolders.length > 0 && (
                    <div className="mb-8">
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Carpetas</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                            {displayFolders.map((folder, idx) => (
                                <div 
                                    key={idx}
                                    onClick={() => setSelectedPath([...selectedPath, folder.name])}
                                    className="group flex flex-col items-center p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-400 hover:shadow-md cursor-pointer transition-all text-center relative"
                                >
                                    <Folder size={48} className="text-blue-200 fill-blue-50 group-hover:text-blue-400 transition-colors mb-2" />
                                    <span className="text-sm font-medium text-gray-700 truncate w-full">{folder.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Files */}
                {displayFiles.length > 0 ? (
                    <div>
                        <div className="flex justify-between items-end mb-4">
                            {!isSearching && <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Archivos ({displayFiles.length})</h3>}
                        </div>
                        
                        {view === 'grid' ? (
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                                {displayFiles.map((file, idx) => (
                                    <div key={file.fullPath} className="group relative bg-white border border-gray-200 rounded-t-xl rounded-b-xl hover:shadow-lg hover:border-blue-300 transition-all flex flex-col h-[220px]">
                                        <div className="h-32 bg-gray-50 flex items-center justify-center relative cursor-pointer border-b border-gray-100 rounded-t-xl overflow-hidden" onClick={() => handleOpenFile(file)}>
                                            <div className="transform transition-transform group-hover:scale-110">{getFileIcon(file.name)}</div>
                                            <div className="absolute bottom-2 right-2 flex gap-1">
                                                {file.reviewed && <div className="p-1 bg-green-100 rounded-full shadow-sm"><CheckCircle2 size={14} className="text-green-600"/></div>}
                                                {file.completed && <div className="p-1 bg-blue-100 rounded-full shadow-sm"><FileCheck size={14} className="text-blue-600"/></div>}
                                            </div>
                                        </div>

                                        <div className="p-3 flex justify-between items-start gap-2 bg-white flex-1 rounded-b-xl">
                                            <div className="min-w-0 flex-1" onClick={() => setFileInfoTarget(file)}>
                                                <p className="text-sm font-medium text-gray-800 truncate cursor-pointer hover:text-blue-600" title={file.name}>{file.name}</p>
                                                <div className="flex items-center gap-1 mt-1">
                                                    <p className="text-xs text-gray-400">{formatFileSize(file.size)}</p>
                                                    {file.starred && <Star size={10} className="fill-yellow-400 text-yellow-400" />}
                                                </div>
                                            </div>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); setActiveMenuFile(activeMenuFile === file ? null : file); }}
                                                className="p-1 hover:bg-gray-100 rounded-md text-gray-400 hover:text-gray-600"
                                            >
                                                <MoreVertical size={16} />
                                            </button>
                                        </div>

                                        {/* Menu Contextual */}
                                        {activeMenuFile === file && (
                                            <div className="absolute top-8 right-2 w-52 bg-white rounded-lg shadow-2xl border border-gray-100 z-30 py-1 animate-in fade-in zoom-in-95 duration-100">
                                                <button onClick={() => handleOpenFile(file)} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2"><Download size={16}/> Descargar</button>
                                                <button onClick={() => handleToggleStar(file)} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2"><Star size={16} className={file.starred ? "fill-yellow-400 text-yellow-400" : ""}/> {file.starred ? 'Quitar Destacado' : 'Destacar'}</button>
                                                <div className="border-t border-gray-100 my-1"></div>
                                                <button onClick={() => handleToggleCompleted(file)} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2"><FileCheck size={16} className={file.completed ? "text-blue-600" : "text-gray-400"} /> {file.completed ? 'Desmarcar Realizado' : 'Marcar Realizado'}</button>
                                                
                                                {isQualityUser(currentUserData) && (
                                                    <>
                                                        <button onClick={() => handleToggleReviewed(file)} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2"><CheckCircle2 size={16} className={file.reviewed ? "text-green-600" : "text-gray-400"} /> {file.reviewed ? 'Quitar Revisión' : 'Marcar Revisado'}</button>
                                                        <div className="border-t border-gray-100 my-1"></div>
                                                        <button onClick={() => { setMoveTargetFile(file); setMoveToPath([]); setMoveDialogOpen(true); setActiveMenuFile(null); }} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2"><MoveRight size={16}/> Mover</button>
                                                        <button onClick={() => setDeleteFile(file)} className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"><Trash2 size={16}/> Eliminar</button>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                                {displayFiles.map((file, idx) => (
                                    <div key={idx} className="flex items-center p-3 border-b border-gray-100 last:border-0 hover:bg-blue-50/50 transition-colors group relative">
                                        <div className="w-10 flex justify-center">{getFileIcon(file.name)}</div>
                                        <div className="flex-1 min-w-0 px-4">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                                                {file.reviewed && <CheckCircle2 size={14} className="text-green-500" title="Revisado" />}
                                                {file.completed && <FileCheck size={14} className="text-blue-500" title="Realizado" />}
                                                {isSearching && <span className="text-xs text-gray-400 ml-2 bg-gray-100 px-2 rounded">{file.fullPath.split('/').slice(1, -1).join(' / ')}</span>}
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                                <span>{formatFileSize(file.size)}</span>
                                                <span>•</span>
                                                <span>{new Date(file.updated).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity px-2">
                                            <button onClick={() => handleOpenFile(file)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Download size={16}/></button>
                                            {isQualityUser(currentUserData) && (
                                                <>
                                                    <button onClick={() => { setMoveTargetFile(file); setMoveToPath([]); setMoveDialogOpen(true); }} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><MoveRight size={16}/></button>
                                                    <button onClick={() => setDeleteFile(file)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16}/></button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    (displayFolders.length === 0) && (
                        <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                            <Folder size={64} className="mb-4 text-gray-300" />
                            <p className="text-lg font-medium text-gray-500">{isSearching ? "No se encontraron resultados" : "Carpeta vacía"}</p>
                            {isSearching && <p className="text-sm text-gray-400 mt-2">Intenta con otro nombre de archivo</p>}
                        </div>
                    )
                )}
            </>
        )}
      </div>

      {/* --- MODALS --- */}

      {/* 1. Move File Modal */}
      {moveDialogOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={(e) => e.stopPropagation()}>
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <MoveRight className="text-blue-600" size={20} /> Mover "{moveTargetFile?.name}"
                    </h3>
                    <button onClick={() => setMoveDialogOpen(false)} className="p-1 hover:bg-gray-200 rounded-full"><X size={20} /></button>
                </div>
                
                <div className="p-3 bg-gray-100 border-b border-gray-200 flex items-center gap-2 text-sm">
                     <button 
                        disabled={moveToPath.length === 0}
                        onClick={() => setMoveToPath(prev => prev.slice(0, -1))}
                        className="p-1 bg-white border rounded hover:bg-gray-50 disabled:opacity-50"
                     >
                        <ArrowUp size={16} />
                     </button>
                     <div className="flex items-center gap-1 overflow-hidden text-gray-600">
                        <Home size={14} />
                        <span>/</span>
                        {moveToPath.map((p, i) => <span key={i} className="font-medium text-gray-800">{p} /</span>)}
                     </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                    {moveFolderContent.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 flex flex-col items-center">
                            <FolderOpen size={32} className="mb-2 opacity-50" />
                            <p>No hay subcarpetas aquí</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {moveFolderContent.map((folder, idx) => (
                                <button 
                                    key={idx}
                                    onClick={() => setMoveToPath([...moveToPath, folder.name])}
                                    className="w-full flex items-center gap-3 p-3 hover:bg-blue-50 rounded-lg text-left transition-colors group"
                                >
                                    <Folder size={20} className="text-blue-400 group-hover:text-blue-600 fill-blue-50" />
                                    <span className="text-sm font-medium text-gray-700">{folder.name}</span>
                                    <ChevronRight size={16} className="ml-auto text-gray-400" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-gray-100 flex justify-end gap-3 bg-white">
                    <button onClick={() => setMoveDialogOpen(false)} disabled={isMoving} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">Cancelar</button>
                    <button 
                        onClick={handleMoveFile} 
                        disabled={!moveTargetFile || isMoving}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isMoving ? <Loader2 size={16} className="animate-spin" /> : "Mover Aquí"}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* 2. Create Folder Modal */}
      {createFolderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Nueva Carpeta</h3>
                <input 
                    autoFocus
                    type="text" 
                    placeholder="Nombre de la carpeta"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none mb-6"
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                />
                <div className="flex justify-end gap-3">
                    <button onClick={() => setCreateFolderOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">Cancelar</button>
                    <button onClick={handleCreateFolder} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">Crear</button>
                </div>
            </div>
        </div>
      )}

      {/* 3. Delete Confirmation */}
      {deleteFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Trash2 className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">¿Eliminar archivo?</h3>
                <p className="text-gray-500 text-sm mb-6">Esta acción eliminará permanentemente <strong>"{deleteFile.name}"</strong>.</p>
                <div className="flex gap-3">
                    <button onClick={() => setDeleteFile(null)} className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50">Cancelar</button>
                    <button onClick={handleDelete} className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 shadow-lg shadow-red-200">Eliminar</button>
                </div>
            </div>
        </div>
      )}

      {/* 4. File Info Slide-over */}
      {fileInfoTarget && (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setFileInfoTarget(null)} />
            <div className="relative w-full max-w-sm bg-white h-full shadow-2xl p-6 overflow-y-auto animate-in slide-in-from-right duration-300">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold text-gray-900 text-lg">Detalles</h3>
                    <button onClick={() => setFileInfoTarget(null)} className="p-2 hover:bg-gray-100 rounded-full"><X size={20} className="text-gray-500"/></button>
                </div>
                
                <div className="flex flex-col items-center mb-8">
                    <div className="w-24 h-24 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-center mb-4 shadow-inner">
                        {React.cloneElement(getFileIcon(fileInfoTarget.name), { className: "w-12 h-12" })}
                    </div>
                    <p className="text-center font-semibold text-gray-800 break-all">{fileInfoTarget.name}</p>
                </div>

                <div className="space-y-4">
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-3">
                        <InfoItem label="Tipo" value={fileInfoTarget.contentType || 'Desconocido'} />
                        <InfoItem label="Tamaño" value={formatFileSize(fileInfoTarget.size)} />
                        <InfoItem label="Modificado" value={new Date(fileInfoTarget.updated).toLocaleDateString()} />
                        <InfoItem label="Ruta" value={fileInfoTarget.fullPath || '/'} />
                    </div>
                    
                    <div className="pt-4 border-t border-gray-100">
                        <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><ShieldAlert size={16}/> Estado</h4>
                        <div className="space-y-2">
                            {/* Estado Revisión */}
                            <div className={`p-3 rounded-lg border flex flex-col gap-1 ${fileInfoTarget.reviewed ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 size={18} className={fileInfoTarget.reviewed ? "text-green-600" : "text-gray-300"} />
                                    <span className={`text-sm font-semibold ${fileInfoTarget.reviewed ? 'text-green-800' : 'text-gray-500'}`}>
                                        {fileInfoTarget.reviewed ? 'Revisado' : 'Pendiente'}
                                    </span>
                                </div>
                                {fileInfoTarget.reviewedByName && (
                                    <p className="text-xs text-green-700 pl-6">Por: {fileInfoTarget.reviewedByName}</p>
                                )}
                            </div>

                            {/* Estado Completado */}
                            <div className={`p-3 rounded-lg border flex flex-col gap-1 ${fileInfoTarget.completed ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                                <div className="flex items-center gap-2">
                                    <FileCheck size={18} className={fileInfoTarget.completed ? "text-blue-600" : "text-gray-300"} />
                                    <span className={`text-sm font-semibold ${fileInfoTarget.completed ? 'text-blue-800' : 'text-gray-500'}`}>
                                        {fileInfoTarget.completed ? 'Realizado' : 'En Proceso'}
                                    </span>
                                </div>
                                {fileInfoTarget.completedByName && (
                                    <p className="text-xs text-blue-700 pl-6">Por: {fileInfoTarget.completedByName}</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}

    </div>
  );
}

const InfoItem = ({ label, value }: { label: string, value: string }) => (
    <div className="flex justify-between items-center text-sm">
        <span className="text-gray-500">{label}</span>
        <span className="font-medium text-gray-900 truncate max-w-[180px]">{value}</span>
    </div>
);