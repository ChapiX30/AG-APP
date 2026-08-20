import React, { useState, useEffect, useRef } from "react";
import {
  Eye, EyeOff, Lock, Mail, ArrowRight,
  X, CheckCircle, AlertCircle,
  ShieldCheck, Gauge,
} from "lucide-react";
import {
  isQualityRole,
  type UsuarioRow,
} from "../utils/calibrationShared";
import { isQualityEmailAllowlisted } from "../utils/certificateAccess";
import {
  motion, AnimatePresence, MotionConfig,
  useMotionValue, useSpring, useTransform,
} from "framer-motion";
import { sendPasswordResetEmail, signOut, AuthError } from "firebase/auth";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { AccessDeniedError, useAuth } from "../hooks/useAuth";
import { useNavigation } from "../hooks/useNavigation";
import { auth, db } from "../utils/firebase";
import labLogo from "../assets/lab_logo.png";
import loginBgCmm from "../assets/login/lab-cmm-probe.webp";
import loginBgTransmille from "../assets/login/lab-transmille.webp";
import loginBgAgilent from "../assets/login/lab-agilent.webp";
import loginBgFluke from "../assets/login/lab-fluke-cal.webp";
import loginBgBench from "../assets/login/lab-bench-kit.webp";
import loginBgPh from "../assets/login/lab-ph-meter.webp";
import { MetrologyLoginVisual } from "./ui/MetrologyLoginVisual";
import {
  METROLOGY_SCENE_MSG,
  resolveMetrologyScene,
  type MetrologyScene,
} from "../utils/loginScenes";
import {
  loadSavedLoginCredentials,
  saveLoginCredentials,
} from "../utils/loginCredentials";

const LOGIN_BACKGROUNDS = [
  loginBgCmm,
  loginBgTransmille,
  loginBgAgilent,
  loginBgFluke,
  loginBgBench,
  loginBgPh,
] as const;

const BG_ROTATE_MS = 6200;

/* ─── helpers ─── */
const isValidEmail = (e: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

const errorMsg = (err: unknown) => {
  if (err instanceof AccessDeniedError) {
    return err.message;
  }

  const code = (err as AuthError)?.code ?? "";
  const message = (err as Error)?.message ?? "";

  const known: Record<string, string> = {
    "auth/user-not-found": "No existe una cuenta con este correo.",
    "auth/wrong-password": "Contraseña incorrecta.",
    "auth/invalid-email": "Formato de correo inválido.",
    "auth/too-many-requests": "Demasiados intentos. Intenta más tarde.",
    "auth/invalid-credential": "Correo o contraseña incorrectos.",
    "auth/network-request-failed": "Sin conexión a internet. Revisa tu red e intenta de nuevo.",
    "auth/user-disabled": "Esta cuenta está deshabilitada. Contacta al administrador.",
    "auth/internal-error": "Error del servidor de autenticación. Intenta en unos minutos.",
    "auth/operation-not-allowed": "El inicio de sesión no está habilitado para esta app.",
    "permission-denied": "No tienes permiso para acceder. Contacta al administrador.",
    unavailable: "El servicio no está disponible. Revisa tu conexión.",
  };

  if (code && known[code]) return known[code];
  if (message.toLowerCase().includes("network")) {
    return "Sin conexión a internet. Revisa tu red e intenta de nuevo.";
  }
  if (message) return message;
  return "Error inesperado. Intenta nuevamente.";
};

const profileFromUsuario = (d: Record<string, unknown>, fallbackName = "Usuario") => {
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
        return profileFromUsuario(snap.docs[0].data() as Record<string, unknown>);
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

/* ─── tokens de escena ─── */
const ACC = "#2464A3";
const ACC_SOFT = "#5a93c9";

/* ─── animaciones por rol (overlay) ─── */
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
          className="fixed inset-0 z-40 flex items-center justify-center bg-[#050810]/90 backdrop-blur-md px-4 font-login"
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
              <p className="text-sm font-medium text-slate-100">{copy.title}</p>
              <p className="text-[11px] text-slate-500 leading-relaxed font-instrument">
                {reducedMotion ? "Un momento…" : copy.sub}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/* ─── marca AG — 3D en el logo (showcase elegante) ─── */
const BrandMark: React.FC<{ size?: "lg" | "sm" }> = ({ size = "lg" }) => {
  const large = size === "lg";
  const wrapRef = useRef<HTMLDivElement>(null);
  const hoverMx = useMotionValue(0);
  const hoverMy = useMotionValue(0);
  const spring = { stiffness: 120, damping: 22, mass: 0.4 };
  const hoverRx = useSpring(useTransform(hoverMy, [-0.5, 0.5], [6, -6]), spring);
  const hoverRy = useSpring(useTransform(hoverMx, [-0.5, 0.5], [-8, 8]), spring);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    hoverMx.set((e.clientX - r.left) / r.width - 0.5);
    hoverMy.set((e.clientY - r.top) / r.height - 0.5);
  };

  const onLeave = () => {
    hoverMx.set(0);
    hoverMy.set(0);
  };

  return (
    <div className={`relative flex flex-col items-center ${large ? "gap-8" : "gap-4"}`}>
      <div
        ref={wrapRef}
        className={`relative flex items-center justify-center ${
          large ? "h-[19rem] w-[19rem]" : "h-32 w-32"
        }`}
        style={{ perspective: large ? 1100 : 720 }}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        {/* capa hover: suma un toque extra al pasar el mouse */}
        <motion.div
          className="relative z-10"
          style={{
            rotateX: hoverRx,
            rotateY: hoverRy,
            transformStyle: "preserve-3d",
          }}
        >
          {/* el LOGO mismo: giro 3D suave tipo vitrina */}
          <motion.img
            src={labLogo}
            alt="Equipos y Servicios AG"
            className={`${large ? "h-[15rem]" : "h-28"} w-auto object-contain select-none will-change-transform`}
            draggable={false}
            style={{
              transformStyle: "preserve-3d",
              transformOrigin: "50% 50%",
              backfaceVisibility: "hidden",
            }}
            animate={{
              rotateY: [-18, 18, -18],
              rotateX: [4, -3, 4],
              y: [0, large ? -6 : -3, 0],
              filter: [
                "drop-shadow(-14px 18px 26px rgba(0,0,0,0.42)) drop-shadow(0 0 18px rgba(36,100,163,0.2))",
                "drop-shadow(14px 18px 26px rgba(0,0,0,0.42)) drop-shadow(0 0 22px rgba(36,100,163,0.28))",
                "drop-shadow(-14px 18px 26px rgba(0,0,0,0.42)) drop-shadow(0 0 18px rgba(36,100,163,0.2))",
              ],
            }}
            transition={{
              duration: 8.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        </motion.div>
      </div>

      <div className="text-center space-y-2">
        <h1
          className={`font-display font-bold tracking-tight text-[#f2f6fb] ${
            large ? "text-3xl xl:text-4xl" : "text-lg"
          }`}
          style={{ textShadow: "0 2px 28px rgba(0,0,0,0.55)" }}
        >
          Equipos y Servicios AG
        </h1>
        <p
          className="font-instrument text-[11px] tracking-[0.22em] uppercase text-[#8bb5d9]"
          style={{ textShadow: "0 1px 12px rgba(0,0,0,0.45)" }}
        >
          Gestión metrológica
        </p>
      </div>
    </div>
  );
};

/* ─── fondo fotográfico rotativo ─── */
const LabPhotoBackdrop: React.FC<{
  index: number;
  reducedMotion: boolean;
}> = ({ index, reducedMotion }) => (
  <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
    {LOGIN_BACKGROUNDS.map((src, i) => {
      const active = i === index;
      return (
        <div
          key={src}
          className="absolute inset-0"
          style={{
            opacity: active ? 1 : 0,
            transition: reducedMotion
              ? "opacity 0.35s ease"
              : "opacity 1.1s cubic-bezier(0.22, 1, 0.36, 1)",
            zIndex: active ? 2 : 1,
          }}
        >
          <img
            src={src}
            alt=""
            className="h-full w-full object-cover"
            style={{
              transform: reducedMotion
                ? "scale(1.04)"
                : active
                  ? "scale(1.12) translateX(0)"
                  : "scale(1.06)",
              transition: reducedMotion
                ? "none"
                : `transform ${BG_ROTATE_MS + 400}ms linear`,
              willChange: "transform, opacity",
            }}
            draggable={false}
          />
        </div>
      );
    })}

    {/* veladura: izquierda más abierta para que se vea el lab */}
    <div
      className="absolute inset-0 z-[3]"
      style={{
        background: `
          linear-gradient(105deg,
            rgba(5,8,14,0.58) 0%,
            rgba(5,8,14,0.32) 38%,
            rgba(5,8,14,0.68) 66%,
            rgba(5,8,14,0.88) 100%
          )
        `,
      }}
    />
    <div
      className="absolute inset-0 z-[3]"
      style={{
        background: `
          radial-gradient(ellipse 70% 55% at 28% 42%, rgba(36,100,163,0.18), transparent 60%),
          radial-gradient(ellipse 45% 40% at 78% 70%, rgba(36,100,163,0.1), transparent 55%),
          linear-gradient(180deg, rgba(5,8,14,0.28) 0%, transparent 30%, transparent 70%, rgba(5,8,14,0.5) 100%)
        `,
      }}
    />
    <div
      className="absolute inset-0 z-[3] opacity-[0.04]"
      style={{
        backgroundImage: `
          linear-gradient(rgba(90,147,201,0.9) 1px, transparent 1px),
          linear-gradient(90deg, rgba(90,147,201,0.9) 1px, transparent 1px)
        `,
        backgroundSize: "72px 72px",
        maskImage: "radial-gradient(ellipse 65% 55% at 35% 40%, #000 15%, transparent 72%)",
        WebkitMaskImage: "radial-gradient(ellipse 65% 55% at 35% 40%, #000 15%, transparent 72%)",
      }}
    />
  </div>
);

/* ─── estilos de input tipo consola ─── */
const fieldWrap =
  "group relative rounded-2xl border border-white/[0.12] bg-[#0a1220]/82 backdrop-blur-md transition-all duration-300 focus-within:border-[#2464A3]/60 focus-within:bg-[#0d1830]/90 focus-within:shadow-[0_0_0_3px_rgba(36,100,163,0.14)]";
const fieldInput =
  "peer w-full bg-transparent pl-11 pr-11 pt-6 pb-2.5 text-[15px] text-[#e8eef4] placeholder-transparent outline-none disabled:opacity-50 font-login";
const fieldLabel =
  "absolute left-11 top-3.5 text-sm text-[#6b7c90] pointer-events-none transition-all duration-200 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:tracking-[0.14em] peer-focus:uppercase peer-focus:text-[#5a93c9] peer-focus:font-instrument peer-[:not(:placeholder-shown)]:top-1.5 peer-[:not(:placeholder-shown)]:text-[10px] peer-[:not(:placeholder-shown)]:tracking-[0.14em] peer-[:not(:placeholder-shown)]:uppercase peer-[:not(:placeholder-shown)]:font-instrument peer-[:not(:placeholder-shown)]:text-[#8fa3b8]";

/* ─── component ─── */
export const LoginScreen: React.FC = () => {
  const { login, completeLogin, authReady } = useAuth();
  const { resetTo } = useNavigation();

  const savedLogin = loadSavedLoginCredentials();

  const [email, setEmail] = useState(savedLogin.email);
  const [password, setPassword] = useState(savedLogin.password);
  const [rememberMe, setRememberMe] = useState(savedLogin.rememberMe);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [user, setUser] = useState<DetectedUser | null>(null);
  const [loginTransition, setLoginTransition] = useState(false);
  const [loginVariant, setLoginVariant] = useState<LoginVariant>("metrology");
  const [metrologyScene, setMetrologyScene] = useState<MetrologyScene>("electrical");
  const [fetching, setFetching] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetStatus, setResetStatus] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  const cacheRef = useRef<Record<string, DetectedUser | null>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRef = useRef<string | null>(null);
  const submittingRef = useRef(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [bgIndex, setBgIndex] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    // El fondo SIEMPRE rota; reducedMotion solo suaviza el zoom, no detiene el cambio
    const id = window.setInterval(() => {
      setBgIndex((i) => (i + 1) % LOGIN_BACKGROUNDS.length);
    }, BG_ROTATE_MS);
    return () => window.clearInterval(id);
  }, []);

  /* precarga para crossfades limpios */
  useEffect(() => {
    LOGIN_BACKGROUNDS.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, []);

  /* debounce user lookup */
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!email.trim()) {
      setUser(null);
      lastRef.current = null;
      return;
    }
    timerRef.current = setTimeout(async () => {
      const key = email.trim().toLowerCase();
      if (!isValidEmail(key) || lastRef.current === key) return;
      if (cacheRef.current[key] !== undefined) {
        const cached = cacheRef.current[key];
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
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
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
      saveLoginCredentials(emailKey, password, rememberMe);
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
      console.error("Login falló:", err);
      setError(errorMsg(err));
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
      setTimeout(() => {
        setShowReset(false);
        setResetStatus(null);
      }, 3000);
    } catch (err) {
      setResetStatus({ ok: false, msg: errorMsg(err) });
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <MotionConfig reducedMotion="never">
    <div
      className="relative flex h-full w-full overflow-hidden font-login text-[#e8eef4]"
      style={{ background: "#05080e" }}
    >
      <LabPhotoBackdrop index={bgIndex} reducedMotion={reducedMotion} />

      {/* ════════════════════════════════
          PANEL IZQUIERDO — Marca
      ════════════════════════════════ */}
      <div className="relative hidden lg:flex w-[56%] flex-col items-center justify-center overflow-hidden px-12 xl:px-16 py-10">
        <motion.div
          className="relative z-10 flex flex-col items-center justify-center"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <BrandMark size="lg" />
        </motion.div>
      </div>

      {/* divisor */}
      <div className="relative hidden lg:flex w-px flex-shrink-0 items-stretch">
        <div className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-[#5a93c9]/45 to-transparent" />
      </div>

      {/* ════════════════════════════════
          PANEL DERECHO — Consola de acceso
      ════════════════════════════════ */}
      <div className="relative flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-10 sm:px-10 lg:px-14 xl:px-16">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(5,8,14,0.42) 0%, rgba(8,14,24,0.62) 45%, rgba(5,8,14,0.78) 100%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(ellipse 80% 55% at 70% 40%, rgba(36,100,163,0.16), transparent 62%)",
          }}
        />

        <motion.div
          className="relative z-10 w-full max-w-[400px] rounded-[1.75rem] border border-white/[0.08] bg-[#071018]/55 px-5 py-7 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:px-7"
          initial={{ opacity: 0, x: 28 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="mb-8 lg:hidden">
            <BrandMark size="sm" />
          </div>

          <div className="mb-8">
            <div className="mb-5 flex items-center gap-3">
              <span className="font-instrument text-[10px] tracking-[0.28em] uppercase text-[#5a93c9]">
                Acceso
              </span>
              <span className="h-px flex-1 bg-gradient-to-r from-[#2464A3]/50 to-transparent" />
            </div>

            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <AnimatePresence mode="wait">
                  <motion.h2
                    key={user ? user.name : "guest"}
                    className="font-display text-[1.85rem] sm:text-[2.1rem] font-bold tracking-tight text-[#f2f6fb] leading-tight"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22 }}
                  >
                    {user ? (
                      <>
                        Hola,{" "}
                        <span className="text-[#5a93c9]">
                          {firstName(user.name)}
                        </span>
                      </>
                    ) : (
                      "Bienvenido"
                    )}
                  </motion.h2>
                </AnimatePresence>
                <p className="mt-2 text-sm text-[#b0c0d0] font-light">
                  {user
                    ? "Confirma tu contraseña para entrar al sistema."
                    : "Ingresa con tu correo institucional."}
                </p>
                {user?.puesto || user?.role ? (
                  <p className="mt-2 font-instrument text-[10px] tracking-[0.14em] uppercase text-[#5a93c9]/90">
                    {[user.puesto, user.role].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
              </div>

              <AnimatePresence>
                {user && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    className="relative flex-shrink-0"
                    title={user.name}
                  >
                    <span
                      className="absolute -inset-1 rounded-full opacity-70"
                      style={{
                        background: `conic-gradient(from 200deg, ${ACC}, ${ACC_SOFT}, ${ACC})`,
                      }}
                    />
                    {user.photoUrl ? (
                      <img
                        src={user.photoUrl}
                        alt=""
                        className="relative h-12 w-12 rounded-full object-cover border-2 border-[#070b12]"
                      />
                    ) : (
                      <div className="relative flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#070b12] bg-[#2464A3] text-sm font-semibold">
                        {user.initial}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* formulario — sin card glass */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className={fieldWrap}>
              <Mail className="absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[#5a6678] transition-colors group-focus-within:text-[#5a93c9]" />
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                placeholder=" "
                autoComplete="email"
                required
                className={fieldInput}
              />
              <label htmlFor="login-email" className={fieldLabel}>
                Correo institucional
              </label>
              {fetching && (
                <span className="absolute right-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-[#5a93c9] border-t-transparent animate-spin" />
              )}
            </div>

            <div>
              <div className="mb-1.5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowReset(true)}
                  className="font-instrument text-[10px] tracking-[0.08em] text-[#5a93c9] transition-colors hover:text-[#8bb5d9]"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              <div className={fieldWrap}>
                <Lock className="absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[#5a6678] transition-colors group-focus-within:text-[#5a93c9]" />
                <input
                  id="login-password"
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  placeholder=" "
                  autoComplete="current-password"
                  required
                  className={fieldInput}
                />
                <label htmlFor="login-password" className={fieldLabel}>
                  Contraseña
                </label>
                <button
                  type="button"
                  onClick={() => setShowPass((p) => !p)}
                  className="absolute right-3.5 top-1/2 z-10 -translate-y-1/2 text-[#5a6678] transition-colors hover:text-[#e8eef4]"
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <label className="flex cursor-pointer select-none items-center gap-2.5 px-1">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={loading}
                className="h-4 w-4 rounded border-[#3a4a5c] bg-[#0a1220] text-[#2464A3] focus:ring-[#2464A3]/30"
              />
              <span className="text-xs text-[#8fa3b8]">
                Recordarme en este dispositivo
              </span>
            </label>

            <AnimatePresence>
              {error && (
                <motion.div
                  className="flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[11px] text-red-200"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>{error}</span>
                  {attempts >= 3 && (
                    <button
                      type="button"
                      onClick={() => setShowReset(true)}
                      className="ml-auto whitespace-nowrap underline"
                    >
                      Recuperar acceso
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              type="submit"
              disabled={!email || !password || loading || !authReady}
              whileTap={{ scale: 0.985 }}
              whileHover={{ scale: 1.01 }}
              className="group relative mt-2 flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl py-[15px] text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: `linear-gradient(105deg, ${ACC} 0%, #1a4f85 55%, #2a6aab 100%)`,
                boxShadow: `0 12px 40px rgba(36,100,163,0.35), inset 0 1px 0 rgba(255,255,255,0.12)`,
              }}
            >
              {/* borde brass sutil */}
              <span
                className="pointer-events-none absolute inset-0 rounded-2xl"
                style={{
                  boxShadow: `inset 0 0 0 1px rgba(196,163,90,0.25)`,
                }}
              />
              <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              {loading ? (
                <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              ) : !authReady ? (
                "Preparando..."
              ) : (
                <>
                  Entrar al sistema
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </motion.button>

            <p className="pt-3 text-center text-[11px] leading-relaxed text-[#5a6678]">
              Acceso solo para personal autorizado.
              <br />
              Solicita el alta a tu administrador si aún no tienes cuenta.
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm font-login"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => {
              if (e.target === e.currentTarget && !resetLoading) setShowReset(false);
            }}
          >
            <motion.div
              className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-[#2464A3]/30 bg-[#0c1420]/95 px-6 py-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              transition={{ duration: 0.22 }}
            >
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-px"
                style={{
                  background: `linear-gradient(90deg, transparent, ${ACC_SOFT}, transparent)`,
                }}
              />
              <button
                onClick={() => !resetLoading && setShowReset(false)}
                className="absolute right-4 top-4 text-[#5a6678] transition-colors hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>

              <p className="mb-1 font-instrument text-[10px] tracking-[0.22em] uppercase text-[#5a93c9]">
                Recuperación
              </p>
              <h3 className="mb-1 font-display text-lg font-bold text-[#f2f6fb]">
                Recuperar acceso
              </h3>
              <p className="mb-4 text-[12px] text-[#8fa3b8]">
                Te enviamos un enlace a tu correo institucional.
              </p>

              <form onSubmit={handleReset} className="space-y-3">
                <div className={fieldWrap}>
                  <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5a6678]" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={resetLoading}
                    placeholder="usuario@ese-ag.com"
                    className="w-full bg-transparent py-3.5 pl-11 pr-4 text-sm text-white outline-none placeholder:text-[#5a6678] disabled:opacity-50"
                    autoFocus
                  />
                </div>

                <AnimatePresence>
                  {resetStatus && (
                    <motion.p
                      className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] ${
                        resetStatus.ok
                          ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                          : "border border-red-500/30 bg-red-500/10 text-red-200"
                      }`}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                    >
                      {resetStatus.ok ? (
                        <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                      )}
                      {resetStatus.msg}
                    </motion.p>
                  )}
                </AnimatePresence>

                <button
                  type="submit"
                  disabled={resetLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-50"
                  style={{
                    background: `linear-gradient(105deg, ${ACC}, #2a6aab)`,
                  }}
                >
                  {resetLoading ? (
                    <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  ) : (
                    "Enviar enlace"
                  )}
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
    </MotionConfig>
  );
};
