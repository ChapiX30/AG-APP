import React, { useState, useEffect, useRef, useMemo } from "react";
import { ref, listAll, getDownloadURL, uploadBytes, deleteObject, getMetadata } from "firebase/storage";
import { doc, getDoc, deleteDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { storage, db, auth } from "../utils/firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { useNavigation } from "../hooks/useNavigation";
import { 
  Folder, Cloud, Search, LayoutGrid, List, Trash2, 
  CheckCircle2, FileText, Download, Star, Info, X, 
  FolderPlus, UploadCloud, ChevronRight, File, Image as ImageIcon, 
  Loader2, FileCheck, Home, Filter, Clock, Eye, Settings, User,
  CalendarClock, ArrowLeft, FolderCheck, MoveRight, ArrowUp, FolderOpen
} from "lucide-react";
import clsx from "clsx";

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

type ViewMode = 'grid' | 'list';
type FilterType = 'all' | 'starred' | 'recent' | 'pending_review' | 'completed';

// --- UTILS ---

const cleanFileName = (rawName: string) => {
    if (!rawName) return "Sin Nombre";
    let name = rawName.replace(/^worksheets_/, '');
    const firstUnderscore = name.indexOf('_');
    if (firstUnderscore !== -1) {
        const firstPart = name.substring(0, firstUnderscore);
        if (firstPart.includes(' ')) {
            return name.substring(firstUnderscore + 1);
        }
    }
    return name;
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
    const createdDate = new Date(createdDateStr);
    const deadlineDate = addBusinessDays(createdDate, 5);
    const daysLeft = countBusinessDaysLeft(deadlineDate);
    const now = new Date();
    const totalTime = deadlineDate.getTime() - createdDate.getTime();
    const elapsedTime = now.getTime() - createdDate.getTime();
    let progress = (elapsedTime / totalTime) * 100;
    if (progress < 0) progress = 0;
    if (progress > 100) progress = 100;

    let status: 'normal' | 'warning' | 'urgent' | 'overdue' = 'normal';
    if (daysLeft <= 2) status = 'warning';
    if (daysLeft <= 1) status = 'urgent';
    if (daysLeft < 0) status = 'overdue';

    return { progress, daysLeft, status };
};

const isQualityUser = (user: UserData | null) => {
  const p = (user?.puesto || user?.role || "").toLowerCase();
  return p.includes('calidad') || p.includes('quality') || p.includes('admin') || p.includes('gerente');
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
  if (['pdf'].includes(ext || '')) return <FileText size={size} className="text-red-500" strokeWidth={1.5} />;
  if (['jpg', 'jpeg', 'png', 'svg'].includes(ext || '')) return <ImageIcon size={size} className="text-purple-600" strokeWidth={1.5} />;
  if (['xls', 'xlsx', 'csv'].includes(ext || '')) return <FileText size={size} className="text-green-600" strokeWidth={1.5} />;
  if (['doc', 'docx'].includes(ext || '')) return <FileText size={size} className="text-blue-600" strokeWidth={1.5} />;
  return <File size={size} className="text-gray-400" strokeWidth={1.5} />;
};

const getFolderNameFromPath = (fullPath: string) => {
    const parts = fullPath.split('/');
    if (parts.length >= 2) {
        return parts[parts.length - 2];
    }
    return "Raíz";
};

const ROOT_PATH = "worksheets";

export default function DriveScreen({ onBack }: { onBack?: () => void }) {
  const [user] = useAuthState(auth);
  const { goBack } = useNavigation();

  // Estados Principales
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserData, setCurrentUserData] = useState<UserData | null>(null);
  
  // Navegación
  const [path, setPath] = useState<string[]>([]);
  const [view, setView] = useState<ViewMode>('grid'); 
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [completedGroupView, setCompletedGroupView] = useState<string | null>(null);

  // Selección
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, file: DriveFile | null } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Modals
  const [isUploading, setIsUploading] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados MOVER
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveTargetFile, setMoveTargetFile] = useState<DriveFile | null>(null);
  const [moveToPath, setMoveToPath] = useState<string[]>([]);
  const [moveFolderContent, setMoveFolderContent] = useState<DriveFolder[]>([]);
  const [isMoving, setIsMoving] = useState(false);

  // 1. Cargar Usuario
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
        setCurrentUserData(foundUser);
      } catch (e) { console.error("Error usuario", e); }
    };
    loadUser();
  }, [user]);

  // 2. Cargar Contenido
  const loadContent = async () => {
    setLoading(true);
    setContextMenu(null);
    try {
      if (activeFilter !== 'all' || searchQuery) {
        const querySnapshot = await getDocs(collection(db, 'fileMetadata'));
        const results: DriveFile[] = [];
        const term = searchQuery.toLowerCase();
        const isQuality = isQualityUser(currentUserData);
        const myName = (currentUserData?.name || "").toLowerCase();

        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const rawName = data.name || docSnap.id; 
          const cleanNameStr = cleanFileName(rawName);

          if (!isQuality && activeFilter !== 'all') { 
              const pathIncludesName = (data.filePath || "").toLowerCase().includes(myName);
              if (!pathIncludesName) return; 
          }

          if (term && !cleanNameStr.toLowerCase().includes(term)) return;

          let matchesTab = true;
          if (activeFilter === 'starred') matchesTab = data.starred === true;
          if (activeFilter === 'pending_review') matchesTab = (data.completed === true) && (data.reviewed !== true);
          if (activeFilter === 'completed') matchesTab = data.reviewed === true;

          if (matchesTab) {
              results.push({
                  name: cleanNameStr,
                  rawName: rawName,
                  url: "",
                  fullPath: data.filePath || docSnap.id.replace(/_/g, '/'),
                  updated: data.updated || new Date().toISOString(),
                  created: data.created || data.updated || new Date().toISOString(),
                  size: data.size || 0,
                  contentType: data.contentType,
                  reviewed: data.reviewed,
                  reviewedByName: data.reviewedByName,
                  completed: data.completed,
                  completedByName: data.completedByName,
                  starred: data.starred,
                  uploadedBy: data.uploadedBy
              });
          }
        });
        
        if (activeFilter === 'recent') {
            results.sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());
        }
        setFiles(results);
        setFolders([]);

      } else {
        const pathStr = [ROOT_PATH, ...path].join('/');
        const res = await listAll(ref(storage, pathStr));
        
        let loadedFolders = res.prefixes.map(p => ({ name: p.name, fullPath: p.fullPath }));
        if (currentUserData && !isQualityUser(currentUserData)) {
            if (path.length === 0) {
                const myName = (currentUserData.name || "").toLowerCase();
                loadedFolders = loadedFolders.filter(f => f.name.toLowerCase().includes(myName));
            }
        }
        setFolders(loadedFolders);
        
        const filePromises = res.items.map(async (item) => {
            if (item.name === '.keep') return null;
            const metaId = item.fullPath.replace(/\//g, '_');
            let meta: any = {};
            try {
                const metaSnap = await getDoc(doc(db, 'fileMetadata', metaId));
                if (metaSnap.exists()) meta = metaSnap.data();
            } catch (e) { }

            let storageMeta = { size: 0, updated: new Date().toISOString(), timeCreated: new Date().toISOString(), contentType: 'unknown' };
            try { storageMeta = await getMetadata(item) as any; } catch (e) { }
            
            const rawName = meta.name || item.name;
            const finalName = cleanFileName(rawName);

            return {
                name: finalName,
                rawName: rawName, 
                fullPath: item.fullPath,
                url: '', 
                size: storageMeta.size,
                updated: storageMeta.updated,
                created: meta.created || storageMeta.timeCreated,
                contentType: storageMeta.contentType,
                ...meta
            } as DriveFile;
        });
        const loadedFiles = (await Promise.all(filePromises)).filter(f => f !== null) as DriveFile[];
        setFiles(loadedFiles);
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { if (currentUserData) loadContent(); }, [path, activeFilter, searchQuery, currentUserData]);

  // 3. EFECTO PARA CARGAR CARPETAS DE "MOVER"
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

  // LOGICA COMPLETED GROUPS
  const completedGroups = useMemo(() => {
    if (activeFilter !== 'completed') return {};
    const groups: Record<string, DriveFile[]> = {};
    files.forEach(file => {
        const folderName = getFolderNameFromPath(file.fullPath);
        if (!groups[folderName]) groups[folderName] = [];
        groups[folderName].push(file);
    });
    return groups;
  }, [files, activeFilter]);

  // Acciones
  const handleBack = () => { if (onBack) onBack(); else goBack(); };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const isQuality = isQualityUser(currentUserData);
    const isInMyFolder = path.length > 0;
    if (!e.target.files?.length) return;
    if (!isQuality && !isInMyFolder) { alert("Entra a tu carpeta primero."); return; }
    setIsUploading(true);
    try {
        for (const file of Array.from(e.target.files)) {
            const fullPath = `${[ROOT_PATH, ...path].join('/')}/${file.name}`;
            const snap = await uploadBytes(ref(storage, fullPath), file);
            const meta = await getMetadata(snap.ref);
            await setDoc(doc(db, 'fileMetadata', fullPath.replace(/\//g, '_')), {
                name: file.name,
                filePath: fullPath,
                size: meta.size,
                contentType: meta.contentType,
                updated: meta.updated,
                created: new Date().toISOString(),
                uploadedBy: currentUserData?.name,
                reviewed: false,
                completed: false
            }, { merge: true });
        }
        loadContent();
    } catch(err) { alert("Error"); }
    setIsUploading(false);
  };

  const handleMoveFile = async () => {
    if (!moveTargetFile) return;
    const destinationPathString = [ROOT_PATH, ...moveToPath].join('/');
    // Usamos el nombre limpio para el destino para sanear el archivo si es necesario
    const newFullPath = `${destinationPathString}/${moveTargetFile.name}`;
    
    if (newFullPath === moveTargetFile.fullPath) {
      setMoveDialogOpen(false); return;
    }
    
    setIsMoving(true);
    try {
        // 1. Obtener URL descarga
        let fileUrl = moveTargetFile.url;
        if (!fileUrl) fileUrl = await getDownloadURL(ref(storage, moveTargetFile.fullPath));
        
        // 2. Descargar y subir al nuevo lugar (Copia)
        const response = await fetch(fileUrl);
        const blob = await response.blob();
        await uploadBytes(ref(storage, newFullPath), blob);

        // 3. Mover Metadata
        const oldMetaId = moveTargetFile.fullPath.replace(/\//g, '_');
        const newMetaId = newFullPath.replace(/\//g, '_');
        const oldMetaDoc = await getDoc(doc(db, 'fileMetadata', oldMetaId));
        let metaData = oldMetaDoc.exists() ? oldMetaDoc.data() : {};
        
        if (oldMetaDoc.exists()) await deleteDoc(doc(db, 'fileMetadata', oldMetaId));
        
        await setDoc(doc(db, 'fileMetadata', newMetaId), { 
            ...metaData, 
            filePath: newFullPath,
            name: moveTargetFile.name, // Aseguramos nombre limpio
            updated: new Date().toISOString() 
        }, { merge: true });

        // 4. Borrar viejo
        await deleteObject(ref(storage, moveTargetFile.fullPath));
        
        setMoveDialogOpen(false);
        setMoveTargetFile(null);
        setMoveToPath([]); // Reset path
        loadContent();
    } catch (e: any) {
        console.error("Error moving:", e);
        alert("No se pudo mover el archivo.");
    } finally {
        setIsMoving(false);
    }
  };

  const updateFileStatus = async (file: DriveFile, field: string, value: any) => {
    const userName = currentUserData?.name || "Usuario";
    const newReviewedBy = field === 'reviewed' && value ? userName : (field === 'reviewed' && !value ? null : file.reviewedByName);
    const newCompletedBy = field === 'completed' && value ? userName : (field === 'completed' && !value ? null : file.completedByName);

    const updatedFile = { ...file, [field]: value, reviewedByName: newReviewedBy, completedByName: newCompletedBy };
    setFiles(prev => prev.map(f => f.fullPath === file.fullPath ? updatedFile : f));
    if (selectedFile?.fullPath === file.fullPath) setSelectedFile(updatedFile as DriveFile);

    try {
        const id = file.fullPath.replace(/\//g, '_');
        const dataToUpdate: any = { [field]: value };
        if (field === 'reviewed') dataToUpdate['reviewedByName'] = newReviewedBy;
        if (field === 'completed') dataToUpdate['completedByName'] = newCompletedBy;
        await setDoc(doc(db, 'fileMetadata', id), dataToUpdate, { merge: true });
        if (activeFilter === 'pending_review' && field === 'reviewed' && value === true) {
            setTimeout(() => { setFiles(prev => prev.filter(f => f.fullPath !== file.fullPath)); setSelectedFile(null); }, 500); 
        }
    } catch (e) { loadContent(); } 
  };

  const handleDelete = async (file: DriveFile) => {
    if (!confirm(`¿Eliminar ${file.name}?`)) return;
    try {
        await deleteObject(ref(storage, file.fullPath));
        await deleteDoc(doc(db, 'fileMetadata', file.fullPath.replace(/\//g, '_')));
        setFiles(prev => prev.filter(f => f.fullPath !== file.fullPath));
        setSelectedFile(null);
    } catch(e) { alert("Error al eliminar"); }
  };

  const handleDownload = async (file: DriveFile) => {
     try {
       const url = await getDownloadURL(ref(storage, file.fullPath));
       window.open(url, '_blank');
     } catch (e) { alert("No se pudo descargar"); }
  };

  const handleContextMenu = (e: React.MouseEvent, file: DriveFile) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, file });
      setSelectedFile(file);
  };

  // --- RENDER ---
  const renderContent = () => {
    if (activeFilter === 'completed' && !completedGroupView) {
        const groupNames = Object.keys(completedGroups);
        if (groupNames.length === 0) return <div className="text-center py-20 text-gray-400 flex flex-col items-center"><FolderCheck className="w-16 h-16 mb-4 text-gray-200" /><p className="text-lg font-medium text-gray-500">No hay servicios completados</p></div>;
        return (
            <div className="mb-8">
                <h2 className="text-xs font-bold text-gray-400 mb-4 uppercase tracking-wider flex items-center gap-2"><FolderCheck size={14}/> Servicios Finalizados</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {groupNames.map(folderName => (
                        <div key={folderName} onClick={() => setCompletedGroupView(folderName)} className="group p-4 border border-green-100 bg-green-50/50 rounded-2xl hover:border-green-400 cursor-pointer transition-all flex flex-col items-center gap-3 shadow-sm hover:shadow-lg hover:-translate-y-1 relative">
                            <FolderCheck size={32} className="text-green-500 fill-green-100 group-hover:text-green-600 transition-colors" />
                            <span className="text-sm font-bold text-green-800 truncate w-full text-center">{folderName}</span>
                            <span className="text-[10px] text-green-600 bg-green-100 px-2 py-0.5 rounded-full">{completedGroups[folderName].length} archivos</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    let displayFiles = files;
    if (activeFilter === 'completed' && completedGroupView) displayFiles = completedGroups[completedGroupView] || [];

    if (displayFiles.length === 0 && folders.length === 0) return <div className="text-center py-20 text-gray-400 flex flex-col items-center"><Folder className="w-16 h-16 mb-4 text-gray-200" /><p className="text-lg font-medium text-gray-500">Carpeta vacía</p></div>;

    return (
        <>
            {activeFilter === 'all' && folders.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-xs font-bold text-gray-400 mb-4 uppercase tracking-wider flex items-center gap-2"><Folder size={14}/> Carpetas</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {folders.map((f) => (
                            <div key={f.fullPath} onDoubleClick={() => setPath([...path, f.name])} className="group p-4 border border-gray-200 bg-white rounded-2xl hover:border-blue-400 cursor-pointer transition-all flex flex-col items-center gap-3 shadow-sm hover:shadow-lg hover:-translate-y-1 select-none relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-cyan-300 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <Folder size={32} className="text-blue-200 fill-blue-50 group-hover:text-blue-500 group-hover:fill-blue-100 transition-colors" />
                                <span className="text-sm font-semibold text-gray-700 truncate w-full text-center">{f.name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <div>
                {view === 'grid' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 pb-20">
                        {displayFiles.map((file) => (
                            <FileCard key={file.fullPath} file={file} selected={selectedFile?.fullPath === file.fullPath} onSelect={() => setSelectedFile(file)} onContextMenu={handleContextMenu} onDoubleClick={() => handleDownload(file)} />
                        ))}
                    </div>
                ) : (
                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                        <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-gray-50 border-b border-gray-200 text-[11px] font-bold text-gray-400 uppercase tracking-wider"><div className="col-span-4">Nombre</div><div className="col-span-3">Progreso</div><div className="col-span-2">Estado</div><div className="col-span-2 text-right">Tamaño</div><div className="col-span-1"></div></div>
                        {displayFiles.map((file) => (
                            <FileListRow key={file.fullPath} file={file} selected={selectedFile?.fullPath === file.fullPath} onSelect={() => setSelectedFile(file)} onContextMenu={handleContextMenu} onDoubleClick={() => handleDownload(file)} />
                        ))}
                    </div>
                )}
            </div>
        </>
    );
  };

  return (
    <div className="flex h-full w-full bg-[#f8f9fa] text-gray-800 font-sans overflow-hidden" onClick={() => setContextMenu(null)}>
      
      {/* SIDEBAR */}
      <div className="w-64 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col pt-5 pb-4 z-20">
        <div className="px-6 mb-8 flex items-center justify-between">
             <button onClick={handleBack} className="p-2 -ml-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors" title="Regresar"><ArrowLeft size={20} /></button>
             <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2"><div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-200"><Cloud size={18} fill="currentColor" /></div>AG Drive</h1>
        </div>

        {isQualityUser(currentUserData) && (
            <div className="px-4 mb-6"><button onClick={() => setCreateFolderOpen(true)} className="w-full py-3 px-4 bg-white border border-gray-200 shadow-sm rounded-xl flex items-center gap-3 hover:shadow-md transition-all text-gray-700 font-medium group"><FolderPlus size={20} className="text-blue-500"/>Nueva Carpeta</button></div>
        )}

        <nav className="flex-1 px-3 space-y-1">
            <SidebarItem icon={<Home size={18}/>} label="Mi Unidad" active={activeFilter === 'all'} onClick={() => { setActiveFilter('all'); setPath([]); setCompletedGroupView(null); }} />
            <SidebarItem icon={<Star size={18}/>} label="Destacados" active={activeFilter === 'starred'} onClick={() => { setActiveFilter('starred'); setCompletedGroupView(null); }} />
            <SidebarItem icon={<Clock size={18}/>} label="Recientes" active={activeFilter === 'recent'} onClick={() => { setActiveFilter('recent'); setCompletedGroupView(null); }} />
            {isQualityUser(currentUserData) && (<><div className="pt-6 pb-3 px-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Calidad</div><SidebarItem icon={<Settings size={18}/>} label="Por Revisar" active={activeFilter === 'pending_review'} onClick={() => { setActiveFilter('pending_review'); setCompletedGroupView(null); }} badge /><SidebarItem icon={<FileCheck size={18}/>} label="Completados" active={activeFilter === 'completed'} onClick={() => { setActiveFilter('completed'); setCompletedGroupView(null); }} /></>)}
        </nav>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-gray-200 flex items-center justify-between px-6 bg-white sticky top-0 z-10">
            <div className="flex-1 max-w-2xl relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} /><input type="text" placeholder="Buscar..." className="w-full bg-gray-100 hover:bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-100 border-transparent focus:border-blue-500 rounded-xl py-2.5 pl-10 pr-4 transition-all outline-none text-sm" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div>
            <div className="flex items-center gap-3 ml-4"><button onClick={() => fileInputRef.current?.click()} className="hidden md:flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95">{isUploading ? <Loader2 size={18} className="animate-spin" /> : <UploadCloud size={18} />}<span>Subir</span></button><input ref={fileInputRef} type="file" multiple hidden onChange={handleUpload} /><div className="h-8 w-px bg-gray-200 mx-1"></div><div className="bg-gray-100 p-1 rounded-lg flex border border-gray-200"><button onClick={() => setView('list')} className={clsx("p-2 rounded-md transition-all", view === 'list' ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700")}><List size={18} /></button><button onClick={() => setView('grid')} className={clsx("p-2 rounded-md transition-all", view === 'grid' ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700")}><LayoutGrid size={18} /></button></div><button onClick={() => setDetailsOpen(!detailsOpen)} className={clsx("p-2.5 rounded-xl transition-colors border", detailsOpen ? "bg-blue-50 text-blue-600 border-blue-200" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50")}><Info size={18} /></button></div>
        </header>

        <div className="px-6 py-4 flex items-center text-sm text-gray-600 bg-white/50 backdrop-blur-sm sticky top-16 z-10 border-b border-gray-200 min-h-[60px]">
            {activeFilter !== 'all' ? (
                <div className="flex items-center gap-3">
                    <span className="font-bold text-gray-800 capitalize flex items-center gap-2 bg-white px-3 py-1 rounded-md border border-gray-200 shadow-sm"><Filter size={14} className="text-blue-500"/> {activeFilter === 'pending_review' ? 'Pendientes de Revisión' : (activeFilter === 'completed' ? 'Historial Completado' : activeFilter.replace('_', ' '))}</span>
                    {activeFilter === 'completed' && completedGroupView && (<><ChevronRight size={14} className="text-gray-400" /><button onClick={() => setCompletedGroupView(null)} className="hover:bg-gray-200 px-2 py-1 rounded-md text-gray-500 hover:text-gray-900 font-medium">Todos</button><ChevronRight size={14} className="text-gray-400" /><span className="font-bold text-green-700 flex items-center gap-2 bg-green-50 px-2 py-1 rounded-md border border-green-100"><FolderCheck size={14}/> {completedGroupView}</span></>)}
                </div>
            ) : (
                <div className="flex items-center gap-1"><button onClick={() => setPath([])} className="hover:bg-gray-200 px-2 py-1 rounded-md text-gray-500 hover:text-gray-900 font-medium transition-colors">Unidad</button>{path.map((folder, i) => (<React.Fragment key={folder}><ChevronRight size={14} className="text-gray-400" /><button onClick={() => setPath(path.slice(0, i + 1))} className="hover:bg-gray-200 px-2 py-1 rounded-md font-semibold text-gray-800 transition-colors">{folder}</button></React.Fragment>))}</div>
            )}
        </div>

        <div className="flex-1 overflow-y-auto p-6" onContextMenu={(e) => e.preventDefault()}>
            {loading ? <div className="h-full flex flex-col items-center justify-center text-gray-400"><Loader2 size={40} className="animate-spin text-blue-500 mb-3" /><p className="font-medium animate-pulse">Cargando...</p></div> : renderContent()}
        </div>
      </div>

      {detailsOpen && selectedFile && ( <DetailsPanel file={selectedFile} onClose={() => setDetailsOpen(false)} isQualityUser={isQualityUser(currentUserData)} onToggleStatus={updateFileStatus} onDownload={handleDownload} onDelete={handleDelete} /> )}
      
      {/* CONTEXT MENU */}
      {contextMenu && (
        <div className="fixed bg-white/90 backdrop-blur-xl border border-gray-200 shadow-2xl rounded-xl py-1 w-60 z-50 text-sm animate-in fade-in zoom-in-95 duration-100" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 rounded-t-xl"><p className="font-bold text-gray-800 truncate text-xs">{contextMenu.file?.name}</p></div>
            <MenuOption icon={<Eye size={16}/>} label="Vista previa" onClick={() => { if(contextMenu.file) handleDownload(contextMenu.file); setContextMenu(null); }} />
            <MenuOption icon={<Download size={16}/>} label="Descargar" onClick={() => { if(contextMenu.file) handleDownload(contextMenu.file); setContextMenu(null); }} />
            <div className="my-1 border-t border-gray-100"></div>
            {isQualityUser(currentUserData) && (
                <>
                    <MenuOption icon={<CheckCircle2 size={16} className={contextMenu.file?.reviewed ? "text-green-600" : ""}/>} label={contextMenu.file?.reviewed ? "Invalidar Calidad" : "Validar Calidad"} onClick={() => { if(contextMenu.file) updateFileStatus(contextMenu.file, 'reviewed', !contextMenu.file.reviewed); setContextMenu(null); }} />
                    <MenuOption icon={<MoveRight size={16} className="text-blue-500"/>} label="Mover a carpeta" onClick={() => { if(contextMenu.file) { setMoveTargetFile(contextMenu.file); setMoveDialogOpen(true); setContextMenu(null); } }} />
                    <MenuOption icon={<Trash2 size={16} className="text-red-500"/>} label="Eliminar archivo" className="text-red-600 hover:bg-red-50" onClick={() => { if(contextMenu.file) handleDelete(contextMenu.file); setContextMenu(null); }} />
                </>
            )}
        </div>
      )}

      {/* MOVE DIALOG */}
      {moveDialogOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => e.stopPropagation()}>
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[80vh] overflow-hidden animate-in zoom-in-95">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2"><MoveRight className="text-blue-600" size={20} /> Mover "{moveTargetFile?.name}"</h3>
                    <button onClick={() => setMoveDialogOpen(false)} className="p-1 hover:bg-gray-200 rounded-full"><X size={20} /></button>
                </div>
                <div className="p-3 bg-gray-100 border-b border-gray-200 flex items-center gap-2 text-sm">
                     <button disabled={moveToPath.length === 0} onClick={() => setMoveToPath(prev => prev.slice(0, -1))} className="p-1.5 bg-white border rounded hover:bg-gray-50 disabled:opacity-50"><ArrowUp size={16} /></button>
                     <div className="flex items-center gap-1 overflow-hidden text-gray-600"><Home size={14} /><span>/</span>{moveToPath.map((p, i) => <span key={i} className="font-medium text-gray-800">{p} /</span>)}</div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 min-h-[200px]">
                    {moveFolderContent.length === 0 ? <div className="text-center py-10 text-gray-400 flex flex-col items-center"><FolderOpen size={32} className="mb-2 opacity-50" /><p>Carpeta vacía</p></div> : 
                    <div className="space-y-1">{moveFolderContent.map((folder, idx) => (
                        <button key={idx} onClick={() => setMoveToPath([...moveToPath, folder.name])} className="w-full flex items-center gap-3 p-3 hover:bg-blue-50 rounded-lg text-left transition-colors group"><Folder size={20} className="text-blue-400 group-hover:text-blue-600 fill-blue-50" /><span className="text-sm font-medium text-gray-700">{folder.name}</span><ChevronRight size={16} className="ml-auto text-gray-400" /></button>
                    ))}</div>}
                </div>
                <div className="p-4 border-t border-gray-100 flex justify-end gap-3 bg-white">
                    <button onClick={() => setMoveDialogOpen(false)} disabled={isMoving} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">Cancelar</button>
                    <button onClick={handleMoveFile} disabled={!moveTargetFile || isMoving} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-lg flex items-center gap-2 disabled:opacity-50">{isMoving ? <Loader2 size={16} className="animate-spin" /> : "Mover Aquí"}</button>
                </div>
            </div>
        </div>
      )}

      {createFolderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl ring-1 ring-gray-900/5">
                <h3 className="text-lg font-bold mb-4 text-gray-800">Nueva Carpeta</h3>
                <input autoFocus value={newFolderName} onChange={e=>setNewFolderName(e.target.value)} className="w-full border border-gray-300 p-3 rounded-xl mb-6 outline-none focus:ring-2 focus:ring-blue-500" placeholder="Nombre..." />
                <div className="flex justify-end gap-3">
                    <button onClick={() => setCreateFolderOpen(false)} className="px-4 py-2.5 text-gray-600 font-medium hover:bg-gray-100 rounded-lg">Cancelar</button>
                    <button onClick={() => { if (!newFolderName.trim()) return; const folderRef = ref(storage, `${[ROOT_PATH, ...path, newFolderName.trim()].join('/')}/.keep`); uploadBytes(folderRef, new Uint8Array([0])).then(() => { setCreateFolderOpen(false); setNewFolderName(""); loadContent(); }); }} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200">Crear</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}

// --- SUBCOMPONENTES ---
const DeadlineBar = ({ createdDate }: { createdDate: string }) => {
    const { progress, daysLeft, status } = getDeadlineInfo(createdDate);
    let colorClass = "bg-green-500"; let textClass = "text-green-700 bg-green-50 border-green-200"; let label = `${daysLeft} días restantes`;
    if (status === 'warning') { colorClass = "bg-yellow-500"; textClass = "text-yellow-700 bg-yellow-50 border-yellow-200"; }
    if (status === 'urgent') { colorClass = "bg-orange-500"; textClass = "text-orange-700 bg-orange-50 border-orange-200"; label = "Vence pronto"; }
    if (status === 'overdue') { colorClass = "bg-red-500"; textClass = "text-red-700 bg-red-50 border-red-200"; label = `Vencido (${Math.abs(daysLeft)} días)`; }
    return (<div className="w-full mt-auto pt-2"><div className="flex justify-between items-center mb-1.5"><span className={clsx("text-[10px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-wide", textClass)}>{label}</span><span className="text-[10px] text-gray-400 font-mono">{Math.round(progress)}%</span></div><div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden"><div className={clsx("h-full rounded-full transition-all duration-700 ease-out", colorClass)} style={{ width: `${progress}%` }}></div></div></div>);
};
const FileCard = ({ file, selected, onSelect, onContextMenu, onDoubleClick }: any) => (<div onClick={onSelect} onContextMenu={(e) => onContextMenu(e, file)} onDoubleClick={onDoubleClick} className={clsx("group relative bg-white border rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 flex flex-col h-[260px]", selected ? "ring-2 ring-blue-500 border-transparent shadow-xl translate-y-[-4px]" : "border-gray-200 hover:border-blue-300 hover:shadow-lg hover:translate-y-[-2px]")}><div className="h-32 bg-gray-50/50 flex items-center justify-center border-b border-gray-100 group-hover:bg-white transition-colors relative"><div className="transform transition-transform group-hover:scale-110 duration-300">{getFileIcon(file.name, 56)}</div>{file.reviewed && <div className="absolute top-3 right-3 bg-green-500 text-white p-1 rounded-full shadow-md"><CheckCircle2 size={14}/></div>}</div><div className="p-4 flex flex-col flex-1 justify-between"><div><p className="text-sm font-bold text-gray-800 truncate mb-1" title={file.name}>{file.name}</p><div className="flex items-center gap-1 text-[10px] text-gray-400"><span className="bg-gray-100 px-1.5 py-0.5 rounded">{formatFileSize(file.size)}</span></div></div><DeadlineBar createdDate={file.created} /></div></div>);
const FileListRow = ({ file, selected, onSelect, onContextMenu, onDoubleClick }: any) => (<div onClick={onSelect} onContextMenu={(e) => onContextMenu(e, file)} onDoubleClick={onDoubleClick} className={clsx("grid grid-cols-12 gap-4 px-6 py-4 border-b border-gray-100 hover:bg-blue-50/50 cursor-pointer items-center transition-all group", selected ? "bg-blue-50 border-l-4 border-l-blue-500 pl-[20px]" : "")}><div className="col-span-4 flex items-center gap-4 overflow-hidden">{getFileIcon(file.name, 28)}<span className={clsx("truncate font-semibold text-sm", selected ? "text-blue-700" : "text-gray-700")}>{file.name}</span></div><div className="col-span-3 pr-8"><DeadlineBar createdDate={file.created} /></div><div className="col-span-2">{file.reviewed ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200"><CheckCircle2 size={12}/> Validado</span> : (file.completed ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200"><FileCheck size={12}/> Terminado</span> : <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-500 border border-gray-200"><Clock size={12}/> En Proceso</span>)}</div><div className="col-span-2 text-right text-gray-500 text-xs font-mono">{formatFileSize(file.size)}</div><div className="col-span-1 flex justify-end"><button className="p-1 text-gray-400 hover:text-blue-600 rounded-full hover:bg-blue-100 transition-colors opacity-0 group-hover:opacity-100"><Download size={16}/></button></div></div>);
const SidebarItem = ({ icon, label, active, onClick, badge }: any) => (<button onClick={onClick} className={clsx("w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-all mb-1 group relative overflow-hidden", active ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900")}><div className="flex items-center justify-between relative z-10"><div className="flex items-center gap-3">{icon} {label}</div>{badge && <div className="w-2 h-2 bg-red-500 rounded-full shadow-sm animate-pulse"></div>}</div></button>);
const MenuOption = ({ icon, label, onClick, className }: any) => (<button onClick={onClick} className={clsx("w-full text-left px-4 py-2.5 text-gray-700 hover:bg-blue-50 flex items-center gap-3 transition-colors text-sm font-medium", className)}>{icon} {label}</button>);
const DetailsPanel = ({ file, onClose, isQualityUser, onToggleStatus, onDownload, onDelete }: any) => (<div className="w-96 bg-white border-l border-gray-200 shadow-2xl z-30 overflow-y-auto animate-in slide-in-from-right duration-300 flex flex-col h-full"><div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50"><span className="font-bold text-gray-800 text-lg flex items-center gap-2"><Info size={20} className="text-blue-600"/> Detalles</span><button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition-colors"><X size={20} className="text-gray-500"/></button></div><div className="p-8 flex flex-col items-center border-b border-gray-100"><div className="w-28 h-28 bg-white rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-blue-50 border border-blue-50 relative"><div className="absolute inset-0 bg-blue-500/5 rounded-3xl blur-xl"></div>{getFileIcon(file.name, 64)}</div><h3 className="font-bold text-center text-gray-800 break-all text-lg mb-1">{file.name}</h3><p className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-1 rounded-md">{formatFileSize(file.size)}</p></div><div className="p-6 space-y-8 flex-1"><div><h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2"><CalendarClock size={14}/> Tiempos</h4><div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm"><DeadlineBar createdDate={file.created} /><p className="text-[10px] text-gray-400 mt-3 text-center">Calculado en base a 5 días hábiles</p></div></div><div><h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Settings size={14}/> Flujo de Trabajo</h4><div className="space-y-4"><div className={clsx("p-4 rounded-xl border transition-all", file.completed ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-100")}><div className="flex items-center justify-between mb-2"><span className="text-sm font-bold text-gray-700">Metrólogo</span><button onClick={() => onToggleStatus(file, 'completed', !file.completed)} className={clsx("w-11 h-6 rounded-full relative transition-all shadow-inner", file.completed ? "bg-blue-600" : "bg-gray-300")}><div className={clsx("absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm", file.completed ? "left-6" : "left-1")}></div></button></div><p className="text-xs flex items-center gap-1.5">{file.completedByName ? <><User size={12} className="text-blue-600"/> <span className="text-blue-700 font-medium">{file.completedByName}</span></> : <span className="text-gray-400 italic">Pendiente de finalizar</span>}</p></div><div className={clsx("p-4 rounded-xl border transition-all relative overflow-hidden", file.reviewed ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-100")}>{!isQualityUser && <div className="absolute inset-0 bg-gray-50/50 z-10 cursor-not-allowed" title="Solo Calidad puede firmar"></div>}<div className="flex items-center justify-between mb-2"><span className="text-sm font-bold text-gray-700">Calidad</span><button disabled={!isQualityUser} onClick={() => onToggleStatus(file, 'reviewed', !file.reviewed)} className={clsx("w-11 h-6 rounded-full relative transition-all shadow-inner", file.reviewed ? "bg-green-600" : "bg-gray-300")}><div className={clsx("absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm", file.reviewed ? "left-6" : "left-1")}></div></button></div><p className="text-xs flex items-center gap-1.5">{file.reviewedByName ? <><CheckCircle2 size={12} className="text-green-600"/> <span className="text-green-700 font-medium">{file.reviewedByName}</span></> : <span className="text-gray-400 italic">Pendiente de validación</span>}</p></div></div></div><div><h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Metadatos</h4><div className="space-y-2 text-xs bg-gray-50 p-3 rounded-lg border border-gray-100"><div className="flex justify-between"><span className="text-gray-500">ID Original</span> <span className="text-gray-900 font-mono truncate max-w-[140px]" title={file.rawName}>{file.rawName}</span></div><div className="flex justify-between"><span className="text-gray-500">Creado</span> <span className="text-gray-900 font-medium">{new Date(file.created).toLocaleDateString()}</span></div></div></div></div><div className="p-4 bg-gray-50 border-t border-gray-200 grid grid-cols-2 gap-3"><button onClick={() => onDownload(file)} className="flex items-center justify-center gap-2 py-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 text-sm font-bold text-gray-700 shadow-sm transition-all"><Download size={16}/> Abrir</button>{isQualityUser && <button onClick={() => onDelete(file)} className="flex items-center justify-center gap-2 py-2.5 bg-red-50 border border-red-100 rounded-xl hover:bg-red-100 text-sm font-bold text-red-600 shadow-sm transition-all"><Trash2 size={16}/> Borrar</button>}</div></div>);