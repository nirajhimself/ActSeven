import type { Colour } from "@/lib/catalog";

/** Read-only colour dots for product cards. */
export function Swatches({ colours, max = 4 }: { colours: Colour[]; max?: number }) {
  const shown = colours.slice(0, max);
  const extra = colours.length - shown.length;
  return (
    <div className="flex items-center gap-1.5">
      <span className="sr-only">
        Available in {colours.length === 1 ? "1 colour" : `${colours.length} colours`}: {colours.map((c) => c.name).join(", ")}
      </span>
      {shown.map((c) => (
        <span
          key={c.name}
          aria-hidden="true"
          title={c.name}
          className="size-2.5 rounded-full ring-1 ring-obsidian/20 ring-offset-1 ring-offset-ivory"
          style={{ backgroundColor: c.hex }}
        />
      ))}
      {extra > 0 ? (
        <span aria-hidden="true" className="text-[0.625rem] text-taupe">
          +{extra}
        </span>
      ) : null}
    </div>
  );
}
