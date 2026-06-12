import React, { useState, useEffect, useRef } from "react";
import {
  Eye, EyeOff, Lock, Mail, ArrowRight,
  X, CheckCircle, AlertCircle,
  Shield, Gauge, Radio, ShieldCheck,
} from "lucide-react";
import {
  isQualityRole,
  type UsuarioRow,
} from "../utils/calibrationShared";
import { isQualityEmailAllowlisted } from "../utils/certificateAccess";
import {
  motion, AnimatePresence,
  useMotionValue, useMotionTemplate,
} from "framer-motion";
import { sendPasswordResetEmail, signOut, AuthError } from "firebase/auth";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { useAuth } from "../hooks/useAuth";
import { useNavigation } from "../hooks/useNavigation";
import { auth, db } from "../utils/firebase";
import labLogo from "../assets/lab_logo.png";
import { MetrologyLoginVisual } from "./ui/MetrologyLoginVisual";
import {
  METROLOGY_SCENE_MSG,
  resolveMetrologyScene,
  type MetrologyScene,
} from "../utils/loginScenes";

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

const profileFromFirestore = (d: Record<string, unknown>, fallbackName = "Usuario") => {
  const name = String(d.nombre || d.name || fallbackName);
  return {
    name,
    initial: name[0]?.toUpperCase() || "U",
    photoUrl: (d.photoUrl || d.photoURL || null) as string | null,
    role: String(d.role || d.rol || "").trim(),
    puesto: String(d.puesto || d.cargo || "").trim(),
  };
};

const fetchUser = async (email: string) => {
  try {
    for (const field of ["email", "correo"] as const) {
      const snap = await getDocs(
        query(collection(db, "usuarios"), where(field, "==", email), limit(1))
      );
      if (!snap.empty) {
        return profileFromFirestore(snap.docs[0].data() as Record<string, unknown>);
      }
    }
  } catch {
    return null;
  }
  return null;
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** Tiempo mínimo para que la aguja del voltímetro recorra 0→100%. */
const MIN_LOGIN_OVERLAY_MS = 2600;

type DetectedUser = {
  name: string;
  initial: string;
  photoUrl?: string | null;
  role: string;
  puesto: string;
};

type LoginVariant = "metrology" | "quality" | "general";

const leadershipText = (u: DetectedUser) =>
  `${u.puesto || ""} ${u.role || ""}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const isLeadershipRole = (u: DetectedUser) => {
  const t = leadershipText(u);
  return (
    t.includes("admin") ||
    t.includes("jefe") ||
    t.includes("director") ||
    t.includes("gerente") ||
    t.includes("coordinador")
  );
};

/** Calidad → escudo; jefatura → gauge; resto (metrólogos/técnicos) → voltímetro animado */
const resolveLoginVariant = (u: DetectedUser | null, email: string): LoginVariant => {
  if (isQualityEmailAllowlisted(email)) return "quality";
  if (!u) return "metrology";

  const roleL = (u.role || "").toLowerCase();
  const puestoL = (u.puesto || "").toLowerCase();
  if (
    roleL.includes("calidad") ||
    puestoL.includes("calidad") ||
    roleL.includes("quality") ||
    puestoL.includes("quality")
  ) {
    return "quality";
  }

  const row: UsuarioRow = {
    id: "",
    name: u.name,
    nombre: u.name,
    role: u.role,
    puesto: u.puesto,
  };
  if (isQualityRole(row)) return "quality";
  if (isLeadershipRole(u)) return "general";
  return "metrology";
};

const VARIANT_MSG: Record<Exclude<LoginVariant, "metrology">, { title: string; sub: string }> = {
  quality: { title: "Verificando acceso", sub: "Trazabilidad y aseguramiento de calidad" },
  general: { title: "Verificando acceso", sub: "Plataforma de calibración · Equipos AG" },
};

const waitMs = (ms: number) => new Promise((r) => setTimeout(r, ms));

const waitForPaint = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });

/** Espera a que el overlay monte y complete la animación de carga. */
const waitForLoginOverlay = async (durationMs: number) => {
  await waitForPaint();
  await waitMs(durationMs);
  await waitForPaint();
};

/* ─── animaciones por rol ─── */
const GeneralLoginVisual: React.FC = () => (
  <div className="relative flex h-28 w-28 items-center justify-center">
    {[0, 0.5].map((delay) => (
      <motion.span
        key={delay}
        className="absolute inset-0 rounded-full border border-[#2464A3]/40"
        animate={{ scale: [0.7, 1.25], opacity: [0.5, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay }}
      />
    ))}
    <motion.div
      animate={{ rotate: [0, 8, -8, 0] }}
      transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
    >
      <Gauge className="h-16 w-16 text-[#5a93c9]" strokeWidth={1.5} />
    </motion.div>
  </div>
);

const QualityLoginVisual: React.FC = () => (
  <div className="relative flex h-28 w-28 items-center justify-center">
    <motion.div
      className="absolute inset-0 rounded-full border-2 border-dashed border-[#5a93c9]/45"
      animate={{ rotate: 360 }}
      transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
    />
    <motion.div
      className="absolute inset-2 rounded-full border border-emerald-500/25"
      animate={{ scale: [1, 1.08, 1], opacity: [0.4, 0.7, 0.4] }}
      transition={{ duration: 2, repeat: Infinity }}
    />
    <motion.div
      className="relative z-10 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#2464A3]/20 border border-[#2464A3]/45"
      initial={{ scale: 0.9 }}
      animate={{ scale: [0.95, 1, 0.95] }}
      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
    >
      <ShieldCheck className="h-9 w-9 text-emerald-400" strokeWidth={1.75} />
    </motion.div>
    <motion.svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      aria-hidden
    >
      <motion.path
        d="M28,52 L42,66 L72,36"
        fill="none"
        stroke="#34d399"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 0.6 }}
      />
    </motion.svg>
  </div>
);

const LoginTransitionOverlay: React.FC<{
  active: boolean;
  reducedMotion: boolean;
  variant: LoginVariant;
  metrologyScene: MetrologyScene;
}> = ({ active, reducedMotion, variant, metrologyScene }) => {
  const copy =
    variant === "metrology"
      ? METROLOGY_SCENE_MSG[metrologyScene]
      : VARIANT_MSG[variant];

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="fixed inset-0 z-40 flex items-center justify-center bg-[#050810]/90 backdrop-blur-md px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label="Verificando acceso"
        >
          <motion.div
            className="relative flex flex-col items-center gap-5 rounded-3xl border border-[#2464A3]/45 bg-slate-900/92 px-6 py-8 w-full max-w-sm shadow-[0_0_72px_rgba(36,100,163,0.28)]"
            initial={{ scale: 0.96, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.98, opacity: 0, y: 4 }}
            transition={{ duration: 0.28 }}
          >
            {variant === "quality" ? (
              <QualityLoginVisual key="login-quality" />
            ) : variant === "metrology" ? (
              <MetrologyLoginVisual
                key={`metrology-${metrologyScene}`}
                scene={metrologyScene}
                active={active}
                durationMs={MIN_LOGIN_OVERLAY_MS}
                reducedMotion={false}
              />
            ) : (
              <GeneralLoginVisual key="login-general" />
            )}

            <div className="text-center space-y-1.5">
              <p className="text-sm font-medium text-slate-100">
                {copy.title}
              </p>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {reducedMotion ? "Un momento…" : copy.sub}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

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
  const { login, completeLogin } = useAuth();
  const { resetTo } = useNavigation();

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [attempts, setAttempts] = useState(0);
  const [user, setUser]         = useState<DetectedUser | null>(null);
  const [loginTransition, setLoginTransition] = useState(false);
  const [loginVariant, setLoginVariant]     = useState<LoginVariant>("metrology");
  const [metrologyScene, setMetrologyScene] = useState<MetrologyScene>("electrical");
  const [fetching, setFetching]     = useState(false);
  const [showReset, setShowReset]   = useState(false);
  const [resetStatus, setResetStatus] = useState<{
    ok: boolean; msg: string;
  } | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  const cacheRef = useRef<Record<string, any>>({});
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastRef  = useRef<string | null>(null);
  const submittingRef = useRef(false);
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
        const cached = cacheRef.current[key] as DetectedUser | null;
        setUser(
          cached
            ? {
                ...cached,
                role: cached.role ?? "",
                puesto: cached.puesto ?? "",
              }
            : null
        );
        return;
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
    if (submittingRef.current || loading) return;

    const emailKey = email.trim().toLowerCase();
    submittingRef.current = true;
    setLoading(true);
    setError("");
    setLoginTransition(false);

    let overlayShown = false;

    try {
      const authProfile = await login(emailKey, password);

      let detected: DetectedUser = {
        name: authProfile.name,
        initial: authProfile.name[0]?.toUpperCase() || "U",
        role: authProfile.role,
        puesto: authProfile.puesto,
      };

      if (!detected.role && !detected.puesto) {
        const byEmail = await fetchUser(emailKey);
        if (byEmail) {
          detected = {
            ...byEmail,
            role: byEmail.role || detected.role,
            puesto: byEmail.puesto || detected.puesto,
          };
        }
      }

      cacheRef.current[emailKey] = detected;

      const variant = resolveLoginVariant(detected, emailKey);
      const scene = resolveMetrologyScene(detected.name);

      setLoginVariant(variant);
      setMetrologyScene(scene);
      setLoginTransition(true);
      overlayShown = true;

      await waitForLoginOverlay(MIN_LOGIN_OVERLAY_MS);

      completeLogin({
        id: authProfile.id,
        name: detected.name,
        email: emailKey,
        role: detected.role,
        puesto: detected.puesto,
      });
      resetTo("menu");
    } catch (err) {
      if (auth.currentUser) {
        try {
          await signOut(auth);
        } catch {
          /* limpiar sesión parcial */
        }
      }
      setAttempts((p) => p + 1);
      setError(errorMsg((err as AuthError).code ?? ""));
      if (overlayShown) setLoginTransition(false);
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
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

      <LoginTransitionOverlay
        active={loginTransition}
        reducedMotion={reducedMotion}
        variant={loginVariant}
        metrologyScene={metrologyScene}
      />
    </div>
  );
};