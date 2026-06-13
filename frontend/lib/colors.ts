/* Sticky and shape colours. These are the user's own content colours, the only
   place colour appears in an otherwise monochrome UI. Stickies are solid paper
   with dark ink text; shapes are an ink border over a light colour wash. The
   border and hard shadow are applied by the node components. `slate` is the
   neutral, token-driven option. */

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
  amber: "bg-amber-300",
  cyan: "bg-cyan-300",
  violet: "bg-violet-300",
  emerald: "bg-emerald-300",
  rose: "bg-rose-300",
  slate: "bg-zinc-400",
};

export const STICKY_STYLES: Record<ColorName, string> = {
  amber: "bg-amber-300 text-amber-950 placeholder:text-amber-900/45",
  cyan: "bg-cyan-200 text-cyan-950 placeholder:text-cyan-900/45",
  violet: "bg-violet-200 text-violet-950 placeholder:text-violet-900/45",
  emerald: "bg-emerald-200 text-emerald-950 placeholder:text-emerald-900/45",
  rose: "bg-rose-200 text-rose-950 placeholder:text-rose-900/45",
  slate: "bg-surface-2 text-fg placeholder:text-faint",
};

export const SHAPE_STYLES: Record<ColorName, string> = {
  amber: "bg-amber-300/20",
  cyan: "bg-cyan-300/20",
  violet: "bg-violet-300/20",
  emerald: "bg-emerald-300/20",
  rose: "bg-rose-300/20",
  slate: "bg-surface-2",
};
