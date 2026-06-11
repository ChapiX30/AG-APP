export type FlowAccent = "acreditado" | "trazable" | "worksheet";

export const flowAccents: Record<
  FlowAccent,
  {
    header: string;
    headerGlow: string;
    chip: string;
    chipSolid: string;
    iconBox: string;
    cardRing: string;
    cardAccent: string;
    button: string;
    buttonShadow: string;
    highlight: string;
    soft: string;
    softBorder: string;
    consecutivo: string;
  }
> = {
  acreditado: {
    header: "from-indigo-700 via-blue-600 to-blue-700",
    headerGlow: "from-blue-400/20 to-indigo-500/10",
    chip: "bg-white/15 text-white border-white/25",
    chipSolid: "bg-blue-500/25 text-blue-50 border-blue-300/30",
    iconBox: "bg-white/15 ring-1 ring-white/20",
    cardRing: "ring-blue-100",
    cardAccent: "border-l-blue-500",
    button: "from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800",
    buttonShadow: "shadow-blue-500/25",
    highlight: "text-blue-600",
    soft: "bg-blue-50/80",
    softBorder: "border-blue-100",
    consecutivo: "text-blue-600",
  },
  trazable: {
    header: "from-amber-600 via-orange-500 to-orange-600",
    headerGlow: "from-amber-400/25 to-orange-500/10",
    chip: "bg-white/15 text-white border-white/25",
    chipSolid: "bg-amber-500/25 text-amber-50 border-amber-300/30",
    iconBox: "bg-white/15 ring-1 ring-white/20",
    cardRing: "ring-amber-100",
    cardAccent: "border-l-amber-500",
    button: "from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700",
    buttonShadow: "shadow-orange-500/25",
    highlight: "text-amber-600",
    soft: "bg-amber-50/80",
    softBorder: "border-amber-100",
    consecutivo: "text-orange-600",
  },
  worksheet: {
    header: "from-indigo-700 via-blue-600 to-blue-700",
    headerGlow: "from-blue-400/20 to-indigo-500/10",
    chip: "bg-white/15 text-white border-white/25",
    chipSolid: "bg-white/20 text-white border-white/30",
    iconBox: "bg-white/15 ring-1 ring-white/20",
    cardRing: "ring-blue-100",
    cardAccent: "border-l-indigo-500",
    button: "from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800",
    buttonShadow: "shadow-blue-500/25",
    highlight: "text-indigo-600",
    soft: "bg-slate-50",
    softBorder: "border-slate-200",
    consecutivo: "text-indigo-600",
  },
};

export function accentFromMagnitude(name?: string | null): FlowAccent {
  return name?.toLowerCase().includes("trazable") ? "trazable" : "acreditado";
}
