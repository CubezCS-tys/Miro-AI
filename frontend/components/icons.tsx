import type { CSSProperties } from "react";

/* Hand-drawn doodle icons (Khushmeen Doodle Icons, vendored to /public/doodle).
   Each SVG is recoloured to the current text colour with a CSS mask, so one file
   themes for light and dark. Mask loads over http(s) only, which is how Next
   serves /public. */

type IconProps = { size?: number; className?: string; title?: string };

function DoodleIcon({
  name,
  size = 18,
  className,
  title,
}: IconProps & { name: string }) {
  const url = `url(/doodle/${name}.svg)`;
  const style: CSSProperties = {
    display: "inline-block",
    width: size,
    height: size,
    flex: "none",
    backgroundColor: "currentColor",
    WebkitMaskImage: url,
    maskImage: url,
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
    WebkitMaskSize: "contain",
    maskSize: "contain",
  };
  return (
    <span aria-hidden="true" role={title ? "img" : undefined} aria-label={title} className={className} style={style} />
  );
}

const make = (name: string) => {
  const Component = (p: IconProps) => <DoodleIcon name={name} {...p} />;
  Component.displayName = `Icon(${name})`;
  return Component;
};

export const FileUpIcon = make("upload");
export const FileIcon = make("upload");
export const TextIcon = make("text");
export const ConceptIcon = make("concept");
export const StickyIcon = make("sticky");
export const RectIcon = make("rect");
export const EllipseIcon = make("ellipse");
export const DiamondIcon = make("diamond");
export const CodeIcon = make("code");
export const CommandIcon = make("command");
export const DocsIcon = make("docs");
export const PlusIcon = make("new");
export const LensIcon = make("lens");
export const SunIcon = make("sun");
export const MoonIcon = make("moon");
export const CloseIcon = make("close");
export const CopyIcon = make("copy");
export const TrashIcon = make("trash");
export const SparkleIcon = make("generate");
export const CheckIcon = make("check");
export const ChevronLeftIcon = make("prev");
export const ChevronRightIcon = make("next");
