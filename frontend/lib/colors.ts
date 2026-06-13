/* Shared palette for stickies and shapes. Keyed by name so node data stays
   a plain serializable string. */

export const COLOR_NAMES = [
  "amber",
  "cyan",
  "violet",
  "emerald",
  "rose",
  "slate",
] as const;

export type ColorName = (typeof COLOR_NAMES)[number];

export const SWATCH_BG: Record<ColorName, string> = {
  amber: "bg-amber-400",
  cyan: "bg-cyan-400",
  violet: "bg-violet-400",
  emerald: "bg-emerald-400",
  rose: "bg-rose-400",
  slate: "bg-slate-400",
};

export const STICKY_STYLES: Record<ColorName, string> = {
  amber: "border-amber-300/30 from-amber-400/15 to-amber-600/10 text-amber-100 placeholder:text-amber-200/30",
  cyan: "border-cyan-300/30 from-cyan-400/15 to-cyan-600/10 text-cyan-100 placeholder:text-cyan-200/30",
  violet: "border-violet-300/30 from-violet-400/15 to-violet-600/10 text-violet-100 placeholder:text-violet-200/30",
  emerald: "border-emerald-300/30 from-emerald-400/15 to-emerald-600/10 text-emerald-100 placeholder:text-emerald-200/30",
  rose: "border-rose-300/30 from-rose-400/15 to-rose-600/10 text-rose-100 placeholder:text-rose-200/30",
  slate: "border-slate-300/30 from-slate-400/15 to-slate-600/10 text-slate-100 placeholder:text-slate-300/30",
};

export const SHAPE_STYLES: Record<ColorName, string> = {
  amber: "border-amber-300/45 bg-amber-400/10",
  cyan: "border-cyan-300/45 bg-cyan-400/10",
  violet: "border-violet-300/45 bg-violet-400/10",
  emerald: "border-emerald-300/45 bg-emerald-400/10",
  rose: "border-rose-300/45 bg-rose-400/10",
  slate: "border-slate-300/45 bg-slate-400/10",
};
