import React, { useState, useEffect, useRef } from "react";
import {
  Eye, EyeOff, Lock, Mail, ArrowRight,
  X, CheckCircle, AlertCircle,
} from "lucide-react";
import {
  motion, AnimatePresence,
  useMotionValue, useMotionTemplate,
} from "framer-motion";
import { sendPasswordResetEmail, AuthError } from "firebase/auth";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { useAuth } from "../hooks/useAuth";
import { useNavigation } from "../hooks/useNavigation";
import { auth, db } from "../utils/firebase";
import labLogo from "../assets/lab_logo.png";

/* ─── helpers ─── */
const isValidEmail = (e: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

const errorMsg = (code: string) =>
  ({
    "auth/user-not-found":    "No existe una cuenta con este correo.",
    "auth/wrong-password":    "Contraseña incorrecta.",
    "auth/invalid-email":     "Formato de correo inválido.",
    "auth/too-many-requests": "Demasiados intentos. Intenta más tarde.",
    "auth/invalid-credential":"Credenciales inválidas.",
  }[code] ?? "Error inesperado. Intenta nuevamente.");

const fetchUser = async (email: string) => {
  try {
    const snap = await getDocs(
      query(collection(db, "usuarios"), where("email", "==", email), limit(1))
    );
    if (snap.empty) return null;
    const d = snap.docs[0].data() as any;
    const name = d.nombre || d.name || "Usuario";
    return {
      name,
      initial: name[0].toUpperCase(),
      photoUrl: d.photoUrl || d.photoURL || null,
    };
  } catch {
    return null;
  }
};

/* ─── component ─── */
export const LoginScreen: React.FC<{
  onNavigateToRegister: () => void;
}> = ({ onNavigateToRegister }) => {
  const { login }      = useAuth();
  const { navigateTo } = useNavigation();

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [attempts, setAttempts] = useState(0);
  const [user, setUser]         = useState<{
    name: string; initial: string; photoUrl?: string | null;
  } | null>(null);
  const [fetching, setFetching]     = useState(false);
  const [showReset, setShowReset]   = useState(false);
  const [resetStatus, setResetStatus] = useState<{
    ok: boolean; msg: string;
  } | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  const cacheRef = useRef<Record<string, any>>({});
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastRef  = useRef<string | null>(null);

  /* spotlight en panel derecho */
  const mouseX   = useMotionValue(0);
  const mouseY   = useMotionValue(0);
  const spotlight = useMotionTemplate`radial-gradient(520px circle at ${mouseX}px ${mouseY}px, rgba(56,189,248,0.12), transparent 70%)`;

  /* debounce user lookup */
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!email.trim()) { setUser(null); lastRef.current = null; return; }
    timerRef.current = setTimeout(async () => {
      const key = email.trim().toLowerCase();
      if (!isValidEmail(key) || lastRef.current === key) return;
      if (cacheRef.current[key] !== undefined) {
        setUser(cacheRef.current[key]); return;
      }
      setFetching(true);
      const found = await fetchUser(key);
      cacheRef.current[key] = found;
      setUser(found);
      if (found) lastRef.current = key;
      setFetching(false);
    }, 600);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [email]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const ok = await login(email.trim().toLowerCase(), password);
      if (ok) navigateTo("menu");
      else { setAttempts(p => p + 1); setError("Credenciales incorrectas."); }
    } catch (err) {
      setAttempts(p => p + 1);
      setError(errorMsg((err as AuthError).code ?? ""));
    } finally { setLoading(false); }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!isValidEmail(clean)) {
      setResetStatus({ ok: false, msg: "Ingresa un correo válido." });
      return;
    }
    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, clean);
      setResetStatus({ ok: true, msg: `Enlace enviado a ${clean}` });
      setTimeout(() => { setShowReset(false); setResetStatus(null); }, 3000);
    } catch (err) {
      setResetStatus({ ok: false, msg: errorMsg((err as AuthError).code) });
    } finally { setResetLoading(false); }
  };

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-[#050810] text-slate-50">

      {/* ════════════════════════════════
          PANEL IZQUIERDO — Branding
      ════════════════════════════════ */}
      <div className="relative hidden lg:flex w-[52%] flex-col items-center justify-center overflow-hidden px-16">

        {/* Orbes de fondo izquierdo */}
        <motion.div
          className="pointer-events-none absolute -top-40 -left-40 h-[640px] w-[640px] rounded-full bg-sky-600/25 blur-[120px]"
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="pointer-events-none absolute -bottom-32 -right-20 h-[500px] w-[500px] rounded-full bg-blue-700/20 blur-[110px]"
          animate={{ scale: [1, 1.1, 1], opacity: [0.4, 0.65, 0.4] }}
          transition={{ duration: 11, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        />

        {/* Cuadrícula tenue */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.06] bg-[linear-gradient(to_right,rgba(148,163,184,1)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,1)_1px,transparent_1px)] bg-[size:52px_52px]" />

        {/* Contenido branding */}
        <motion.div
          className="relative z-10 flex flex-col items-center text-center gap-8 max-w-lg"
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          {/* Logo levitando */}
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            className="relative"
          >
            <div className="absolute inset-0 -m-6 rounded-full bg-sky-500/20 blur-3xl" />
            <img
              src={labLogo}
              alt="ESE AG"
              className="relative h-28 w-auto object-contain drop-shadow-[0_0_32px_rgba(56,189,248,0.55)]"
            />
          </motion.div>

          {/* Texto */}
          <div className="space-y-3">
            <h1 className="text-4xl xl:text-5xl font-bold tracking-tight leading-tight">
              Plataforma de{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-300 to-blue-400">
                Calibración
              </span>
            </h1>
            <p className="text-slate-400 text-base xl:text-lg leading-relaxed max-w-sm mx-auto">
              Sistema integral de gestión metrológica ESE AG. Trazabilidad, certificados y programación de equipos críticos.
            </p>
          </div>

          {/* Pills de estado */}
          <div className="flex flex-wrap justify-center gap-3 mt-2">
            <div className="flex items-center gap-2 rounded-full bg-slate-800/70 border border-slate-700/60 px-4 py-1.5 text-xs text-slate-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Sistema en línea
            </div>
            <div className="flex items-center gap-2 rounded-full bg-slate-800/70 border border-slate-700/60 px-4 py-1.5 text-xs text-slate-300">
              🔒 Conexión cifrada
            </div>
            <div className="flex items-center gap-2 rounded-full bg-slate-800/70 border border-slate-700/60 px-4 py-1.5 text-xs text-slate-300">
              AG-APP v2.0.4
            </div>
          </div>
        </motion.div>
      </div>

      {/* Divisor vertical */}
      <div className="hidden lg:block w-px bg-gradient-to-b from-transparent via-slate-700/60 to-transparent flex-shrink-0" />

      {/* ════════════════════════════════
          PANEL DERECHO — Formulario
      ════════════════════════════════ */}
      <div
        className="relative flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-10 sm:px-12 lg:px-16"
        onMouseMove={(e) => {
          const { left, top } = e.currentTarget.getBoundingClientRect();
          mouseX.set(e.clientX - left);
          mouseY.set(e.clientY - top);
        }}
      >
        {/* Spotlight */}
        <motion.div
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: spotlight }}
        />

        {/* Orbe móvil (solo en mobile donde no hay panel izq) */}
        <motion.div
          className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-sky-600/20 blur-[80px] lg:hidden"
          animate={{ opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 7, repeat: Infinity }}
        />

        <motion.div
          className="relative z-10 w-full max-w-md"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          {/* Logo visible solo en móvil */}
          <div className="flex flex-col items-center gap-3 mb-8 lg:hidden">
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="relative"
            >
              <div className="absolute inset-0 -m-4 rounded-full bg-sky-500/20 blur-2xl" />
              <img
                src={labLogo}
                alt="ESE AG"
                className="relative h-14 w-auto object-contain drop-shadow-[0_0_18px_rgba(56,189,248,0.5)]"
              />
            </motion.div>
            <p className="text-sm font-semibold text-slate-50 tracking-tight">
              ESE AG · Metrología
            </p>
          </div>

          {/* Encabezado formulario */}
          <div className="mb-7">
            <h2 className="text-2xl font-semibold text-slate-50 tracking-tight">
              Bienvenido de nuevo
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Ingresa tus credenciales para continuar.
            </p>
          </div>

          {/* Saludo dinámico */}
          <AnimatePresence>
            {user && (
              <motion.div
                className="flex items-center gap-3 rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 mb-5"
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: "auto", marginBottom: 20 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.25 }}
              >
                {user.photoUrl ? (
                  <img src={user.photoUrl} alt={user.name}
                    className="h-9 w-9 rounded-full object-cover border border-sky-400/50 flex-shrink-0" />
                ) : (
                  <div className="h-9 w-9 rounded-full bg-sky-500/70 flex items-center justify-center text-sm font-semibold flex-shrink-0">
                    {user.initial}
                  </div>
                )}
                <div>
                  <p className="text-[10px] text-sky-300 leading-none mb-0.5">Usuario detectado</p>
                  <p className="text-sm font-medium text-slate-50">{user.name}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Formulario */}
          <form onSubmit={handleLogin} className="space-y-4">

            {/* Correo */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">
                Correo institucional
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  placeholder="usuario@ese-ag.com"
                  autoComplete="email"
                  required
                  className="w-full pl-10 pr-9 py-3.5 rounded-xl bg-slate-800/50 border border-slate-700 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500 focus:bg-slate-800/80 transition-all disabled:opacity-50"
                />
                {fetching && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
                )}
              </div>
            </div>

            {/* Contraseña */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-400">
                  Contraseña
                </label>
                <button type="button" onClick={() => setShowReset(true)}
                  className="text-[11px] text-sky-400 hover:text-sky-300 transition-colors">
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  className="w-full pl-10 pr-10 py-3.5 rounded-xl bg-slate-800/50 border border-slate-700 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500 focus:bg-slate-800/80 transition-all disabled:opacity-50"
                />
                <button type="button" onClick={() => setShowPass(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200 transition-colors">
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  className="flex items-center gap-2 text-[11px] text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2.5"
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                >
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>{error}</span>
                  {attempts >= 3 && (
                    <button type="button" onClick={() => setShowReset(true)}
                      className="ml-auto underline whitespace-nowrap">
                      Recuperar acceso
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Botón */}
            <motion.button
              type="submit"
              disabled={!email || !password || loading}
              whileTap={{ scale: 0.98 }}
              className="group w-full flex items-center justify-center gap-2 rounded-xl bg-sky-500 text-slate-950 text-sm font-semibold py-3.5 mt-1 shadow-lg shadow-sky-500/25 hover:bg-sky-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="h-4 w-4 rounded-full border-2 border-slate-950 border-t-transparent animate-spin" />
              ) : (
                <>
                  Iniciar sesión
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </motion.button>

            <p className="text-center text-[11px] text-slate-500 pt-1">
              ¿Primera vez aquí?{" "}
              <button type="button" onClick={onNavigateToRegister}
                className="text-sky-400 hover:text-sky-300 font-medium transition-colors">
                Crear cuenta
              </button>
            </p>
          </form>
        </motion.div>
      </div>

      {/* ════════════════════════════════
          MODAL — Recuperar contraseña
      ════════════════════════════════ */}
      <AnimatePresence>
        {showReset && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={(e) => { if (e.target === e.currentTarget && !resetLoading) setShowReset(false); }}
          >
            <motion.div
              className="relative w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-700 px-6 py-6 shadow-2xl"
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              transition={{ duration: 0.22 }}
            >
              <button onClick={() => !resetLoading && setShowReset(false)}
                className="absolute right-4 top-4 text-slate-500 hover:text-white transition-colors">
                <X className="h-4 w-4" />
              </button>

              <h3 className="text-sm font-semibold text-slate-50 mb-0.5">Recuperar acceso</h3>
              <p className="text-[11px] text-slate-400 mb-4">
                Te enviamos un enlace a tu correo institucional.
              </p>

              <form onSubmit={handleReset} className="space-y-3">
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="email" value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={resetLoading}
                    placeholder="usuario@ese-ag.com"
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-800/60 border border-slate-700 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500 transition-colors disabled:opacity-50"
                    autoFocus
                  />
                </div>

                <AnimatePresence>
                  {resetStatus && (
                    <motion.p
                      className={`flex items-center gap-1.5 text-[11px] rounded-xl px-3 py-2 ${
                        resetStatus.ok
                          ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-200"
                          : "bg-red-500/10 border border-red-500/30 text-red-200"
                      }`}
                      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    >
                      {resetStatus.ok
                        ? <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" />
                        : <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />}
                      {resetStatus.msg}
                    </motion.p>
                  )}
                </AnimatePresence>

                <button type="submit" disabled={resetLoading}
                  className="w-full rounded-xl bg-sky-500 text-slate-950 text-sm font-semibold py-3 hover:bg-sky-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {resetLoading
                    ? <span className="h-4 w-4 rounded-full border-2 border-slate-950 border-t-transparent animate-spin" />
                    : "Enviar enlace"}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
