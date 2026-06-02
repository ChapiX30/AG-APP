import React, { useState, useEffect, useRef } from "react";
import {
  Eye, EyeOff, Lock, Mail, ArrowRight,
  X, CheckCircle, AlertCircle,
  Shield, Gauge, Radio, Zap,
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

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/* ─── overlay energía (login) ─── */
const EnergyLoginOverlay: React.FC<{
  active: boolean;
  reducedMotion: boolean;
}> = ({ active, reducedMotion }) => (
  <AnimatePresence>
    {active && (
      <motion.div
        className="fixed inset-0 z-40 flex items-center justify-center bg-[#050810]/88 backdrop-blur-md px-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label="Verificando acceso"
      >
        <motion.div
          className="relative flex flex-col items-center gap-4 rounded-3xl border border-[#2464A3]/45 bg-slate-900/90 px-8 py-8 w-full max-w-xs shadow-[0_0_72px_rgba(36,100,163,0.28)]"
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.98, opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {reducedMotion ? (
            <span className="h-9 w-9 rounded-full border-2 border-[#5a93c9] border-t-transparent animate-spin" />
          ) : (
            <div className="relative flex h-28 w-28 items-center justify-center">
              {[0, 0.55, 1.1].map((delay) => (
                <motion.span
                  key={delay}
                  className="pointer-events-none absolute inset-0 rounded-full border border-[#5a93c9]/50"
                  animate={{ scale: [0.65, 1.35], opacity: [0.55, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut", delay }}
                />
              ))}
              <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full bg-[#2464A3]/25 border border-[#2464A3]/50">
                <Zap className="h-7 w-7 text-[#8bb5d9]" fill="currentColor" fillOpacity={0.25} />
              </div>
              <div className="absolute bottom-0 left-1/2 flex -translate-x-1/2 items-end justify-center gap-1 h-8 w-28">
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                  <motion.span
                    key={i}
                    className="w-1 rounded-full bg-gradient-to-t from-[#2464A3] to-[#5a93c9]"
                    animate={{ height: [6, 22, 8, 18, 10] }}
                    transition={{
                      duration: 0.85,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: i * 0.07,
                    }}
                  />
                ))}
              </div>
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full opacity-70"
                viewBox="0 0 120 120"
                aria-hidden
              >
                <motion.path
                  d="M8,60 C20,38 32,82 44,60 S68,38 80,60 92,82 104,60"
                  fill="none"
                  stroke="#5a93c9"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0.4 }}
                  animate={{ pathLength: 1, opacity: 0.9 }}
                  transition={{ duration: 1.2, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
                />
              </svg>
            </div>
          )}

          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-slate-100">
              Verificando acceso
            </p>
            <p className="text-[11px] text-slate-500">
              {reducedMotion
                ? "Un momento…"
                : "Energizando sesión · equipos de medición"}
            </p>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

/* ─── logo animado (marca) ─── */
const AnimatedBrandLogo: React.FC<{ size?: "lg" | "sm" }> = ({ size = "lg" }) => {
  const large = size === "lg";
  const imgH = large ? "h-28" : "h-14";
  const box = large ? "h-36 w-36" : "h-20 w-20";
  const glow = large ? "-m-8 blur-3xl" : "-m-5 blur-2xl";
  const ring = large ? "inset-[-14px]" : "inset-[-8px]";
  const pulse = large ? "inset-[-22px]" : "inset-[-12px]";

  return (
    <div className={`relative flex items-center justify-center ${box}`}>
      {/* halo central */}
      <motion.div
        className={`pointer-events-none absolute inset-0 rounded-full bg-[#2464A3]/25 ${glow}`}
        animate={{ opacity: [0.35, 0.75, 0.35], scale: [0.92, 1.08, 0.92] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* ondas que se expanden */}
      {[0, 1.1].map((delay) => (
        <motion.span
          key={delay}
          className={`pointer-events-none absolute rounded-full border border-[#5a93c9]/50 ${pulse}`}
          initial={{ opacity: 0.55, scale: 0.75 }}
          animate={{ opacity: [0.5, 0], scale: [0.75, 1.45] }}
          transition={{
            duration: 2.8,
            repeat: Infinity,
            ease: "easeOut",
            delay,
          }}
        />
      ))}

      {/* anillo giratorio */}
      <motion.div
        className={`pointer-events-none absolute rounded-full ${ring}`}
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0%, #5a93c9 18%, #2464A3 42%, transparent 58%, #5a93c9 78%, transparent 100%)",
          mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))",
          WebkitMask:
            "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))",
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: large ? 10 : 8, repeat: Infinity, ease: "linear" }}
      />

      {/* logo + destello (máscara elíptica, sin caja cuadrada) */}
      <motion.div
        className="relative z-10 flex items-center justify-center"
        animate={{
          y: [0, large ? -10 : -5, 0],
          scale: [1, 1.04, 1],
          filter: [
            "drop-shadow(0 0 18px rgba(36,100,163,0.45))",
            "drop-shadow(0 0 32px rgba(90,147,201,0.85))",
            "drop-shadow(0 0 18px rgba(36,100,163,0.45))",
          ],
        }}
        transition={{
          duration: large ? 4.5 : 3.8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        whileHover={{ scale: 1.06 }}
      >
        <img
          src={labLogo}
          alt="Equipos y Servicios AG"
          className={`${imgH} w-auto object-contain drop-shadow-[0_0_28px_rgba(36,100,163,0.65)]`}
        />
        <div
          className={`pointer-events-none absolute ${large ? "h-[88%] w-[95%]" : "h-[88%] w-[95%]"}`}
          style={{
            maskImage:
              "radial-gradient(ellipse 72% 68% at 50% 50%, #000 35%, transparent 70%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 72% 68% at 50% 50%, #000 35%, transparent 70%)",
          }}
          aria-hidden
        >
          <motion.div
            className="absolute inset-y-0 w-full"
            animate={{ x: ["-100%", "100%"] }}
            transition={{
              duration: large ? 3.6 : 3,
              repeat: Infinity,
              ease: "easeInOut",
              repeatDelay: large ? 2.4 : 2,
            }}
          >
            <div
              className={`absolute top-1/2 -translate-y-1/2 ${large ? "h-[70%] w-10" : "h-[65%] w-6"} blur-[6px]`}
              style={{
                left: "50%",
                transform: "translate(-50%, -50%) rotate(-14deg)",
                background:
                  "linear-gradient(90deg, transparent, rgba(147,197,253,0.35) 42%, rgba(255,255,255,0.5) 50%, rgba(147,197,253,0.35) 58%, transparent)",
                maskImage:
                  "linear-gradient(180deg, transparent 0%, #000 22%, #000 78%, transparent 100%)",
                WebkitMaskImage:
                  "linear-gradient(180deg, transparent 0%, #000 22%, #000 78%, transparent 100%)",
                mixBlendMode: "overlay",
              }}
            />
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

/* ─── fondo blueprint metrológico ─── */
const BlueprintBg: React.FC<{ subtle?: boolean }> = ({ subtle }) => (
  <>
    <div
      className={`pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(90,147,201,0.35)_1px,transparent_1px),linear-gradient(to_bottom,rgba(90,147,201,0.35)_1px,transparent_1px)] bg-[size:44px_44px] ${subtle ? "opacity-[0.05]" : "opacity-[0.09]"}`}
    />
    <div
      className={`pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent,transparent_11px,rgba(36,100,163,0.12)_11px,rgba(36,100,163,0.12)_12px)] ${subtle ? "opacity-30" : "opacity-50"}`}
    />
    <motion.div
      className="pointer-events-none absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#5a93c9]/60 to-transparent shadow-[0_0_20px_rgba(90,147,201,0.5)]"
      animate={{ top: ["-2%", "102%"] }}
      transition={{ duration: subtle ? 10 : 7, repeat: Infinity, ease: "linear" }}
    />
  </>
);

/* ─── bento features ─── */
const BENTO = [
  { icon: Radio,  title: "Sistema en línea",  sub: "Operativo",     pulse: true },
  { icon: Shield, title: "Conexión segura",   sub: "Cifrado SSL" },
  { icon: Gauge,  title: "Gestión metrológica", sub: "Equipos AG" },
] as const;

const BentoFeatures: React.FC = () => (
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-xl">
    {BENTO.map(({ icon: Icon, title, sub, pulse }, i) => (
      <motion.div
        key={title}
        className="flex flex-col gap-2 rounded-2xl border border-[#2464A3]/25 bg-slate-900/50 backdrop-blur-md px-4 py-3.5 text-left"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 + i * 0.1, duration: 0.45 }}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2464A3]/20 border border-[#2464A3]/30">
            <Icon className="h-4 w-4 text-[#5a93c9]" />
          </div>
          {pulse && (
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          )}
        </div>
        <p className="text-xs font-semibold text-slate-200">{title}</p>
        <p className="text-[10px] text-slate-500">{sub}</p>
      </motion.div>
    ))}
  </div>
);

/* ─── input floating label ─── */
const inputCls =
  "peer w-full pl-10 pr-10 pt-5 pb-2.5 rounded-xl bg-slate-800/35 border border-slate-700/70 text-sm text-white placeholder-transparent focus:outline-none focus:border-[#2464A3] focus:ring-[3px] focus:ring-[#2464A3]/18 focus:bg-slate-800/60 transition-all disabled:opacity-50";
const labelCls =
  "absolute left-10 top-3.5 text-sm text-slate-500 pointer-events-none transition-all duration-200 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:text-[#5a93c9] peer-[:not(:placeholder-shown)]:top-1.5 peer-[:not(:placeholder-shown)]:text-[10px] peer-[:not(:placeholder-shown)]:text-slate-400";

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
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  /* spotlight en panel derecho */
  const mouseX   = useMotionValue(0);
  const mouseY   = useMotionValue(0);
  const spotlight = useMotionTemplate`radial-gradient(520px circle at ${mouseX}px ${mouseY}px, rgba(90,147,201,0.14), transparent 70%)`;

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
    <div className="relative flex h-full w-full overflow-hidden bg-[#050810] text-slate-50">

      {/* ════════════════════════════════
          PANEL IZQUIERDO — Branding
      ════════════════════════════════ */}
      <div className="relative hidden lg:flex w-[52%] flex-col items-center justify-center overflow-hidden px-12 xl:px-16">

        <BlueprintBg />

        <motion.div
          className="pointer-events-none absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-[#2464A3]/20 blur-[110px]"
          animate={{ scale: [1, 1.12, 1], opacity: [0.35, 0.6, 0.35] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="pointer-events-none absolute -bottom-32 -right-16 h-[420px] w-[420px] rounded-full bg-[#5a93c9]/15 blur-[100px]"
          animate={{ scale: [1, 1.08, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 11, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        />

        {/* Contenido branding */}
        <motion.div
          className="relative z-10 flex flex-col items-center text-center gap-7 max-w-xl w-full"
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          <AnimatedBrandLogo size="lg" />

          {/* Texto */}
          <div className="space-y-3">
            <h1 className="text-4xl xl:text-5xl font-bold tracking-tight leading-tight">
              Plataforma de{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#5a93c9] to-[#2464A3]">
                Calibración
              </span>
            </h1>
            <p className="text-slate-400 text-base xl:text-lg leading-relaxed max-w-sm mx-auto">
              Equipos y Servicios AG — sistema de gestión metrológica. Trazabilidad, certificados y programación de equipos críticos.
            </p>
          </div>

          <BentoFeatures />
        </motion.div>
      </div>

      <div className="hidden lg:block w-px bg-gradient-to-b from-transparent via-[#2464A3]/40 to-transparent flex-shrink-0" />

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

        <BlueprintBg subtle />
        <motion.div
          className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-[#2464A3]/18 blur-[80px] lg:hidden"
          animate={{ opacity: [0.35, 0.65, 0.35] }}
          transition={{ duration: 7, repeat: Infinity }}
        />

        <motion.div
          className="relative z-10 w-full max-w-md"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          <div className="flex flex-col items-center gap-3 mb-6 lg:hidden">
            <AnimatedBrandLogo size="sm" />
            <p className="text-sm font-semibold text-slate-50 tracking-tight">
              Equipos y Servicios AG
            </p>
            <p className="text-xs text-slate-400">Sistema de gestión metrológica</p>
          </div>

          <div className="relative rounded-3xl border border-[#2464A3]/30 bg-slate-900/45 backdrop-blur-xl shadow-[0_8px_64px_rgba(36,100,163,0.18)] px-6 py-7 sm:px-8 sm:py-8">
            <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[#5a93c9]/50 to-transparent" />

            <div className="mb-6 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <AnimatePresence mode="wait">
                  <motion.h2
                    key={user ? user.name : "guest"}
                    className="text-2xl font-semibold text-slate-50 tracking-tight"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.22 }}
                  >
                    Bienvenido de nuevo
                    {user && (
                      <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#8bb5d9] to-[#5a93c9]">
                        {", "}{firstName(user.name)}
                      </span>
                    )}
                  </motion.h2>
                </AnimatePresence>
                <p className="text-sm text-slate-400 mt-1">
                  {user
                    ? "Ingresa tu contraseña para continuar."
                    : "Ingresa tus credenciales para continuar."}
                </p>
              </div>
              <AnimatePresence>
                {user && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{ duration: 0.2 }}
                    className="flex-shrink-0"
                    title={user.name}
                  >
                    {user.photoUrl ? (
                      <img
                        src={user.photoUrl}
                        alt=""
                        className="h-11 w-11 rounded-full object-cover border-2 border-[#2464A3]/60 shadow-[0_0_16px_rgba(36,100,163,0.35)]"
                      />
                    ) : (
                      <div className="h-11 w-11 rounded-full bg-[#2464A3]/80 border-2 border-[#5a93c9]/40 flex items-center justify-center text-sm font-semibold shadow-[0_0_16px_rgba(36,100,163,0.35)]">
                        {user.initial}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          {/* Formulario */}
          <form onSubmit={handleLogin} className="space-y-4">

            <div className="relative group">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-[#5a93c9] transition-colors z-10" />
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                placeholder=" "
                autoComplete="email"
                required
                className={`${inputCls} pr-9`}
              />
              <label htmlFor="login-email" className={labelCls}>
                Correo institucional
              </label>
              {fetching && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full border-2 border-[#5a93c9] border-t-transparent animate-spin" />
              )}
            </div>

            <div>
              <div className="flex justify-end mb-1.5">
                <button
                  type="button"
                  onClick={() => setShowReset(true)}
                  className="text-[11px] text-[#5a93c9] hover:text-[#8bb5d9] transition-colors"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              <div className="relative group">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-[#5a93c9] transition-colors z-10" />
                <input
                  id="login-password"
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  placeholder=" "
                  autoComplete="current-password"
                  required
                  className={inputCls}
                />
                <label htmlFor="login-password" className={labelCls}>
                  Contraseña
                </label>
                <button
                  type="button"
                  onClick={() => setShowPass((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200 transition-colors z-10"
                >
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
              whileHover={{ scale: 1.01 }}
              className="group relative w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#2464A3] to-[#5a93c9] text-white text-sm font-semibold py-3.5 mt-1 shadow-lg shadow-[#2464A3]/30 overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed disabled:from-[#2464A3] disabled:to-[#2464A3]"
            >
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
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
                className="text-[#5a93c9] hover:text-[#8bb5d9] font-medium transition-colors">
                Crear cuenta
              </button>
            </p>
          </form>
          </div>
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
              className="relative w-full max-w-sm rounded-3xl bg-slate-900/90 backdrop-blur-xl border border-[#2464A3]/35 px-6 py-6 shadow-[0_24px_80px_rgba(36,100,163,0.25)]"
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
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-800/60 border border-slate-700 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#2464A3] transition-colors disabled:opacity-50"
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
                  className="w-full rounded-xl bg-gradient-to-r from-[#2464A3] to-[#5a93c9] text-white text-sm font-semibold py-3 hover:opacity-95 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">
                  {resetLoading
                    ? <span className="h-4 w-4 rounded-full border-2 border-slate-950 border-t-transparent animate-spin" />
                    : "Enviar enlace"}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <EnergyLoginOverlay active={loading} reducedMotion={reducedMotion} />
    </div>
  );
};