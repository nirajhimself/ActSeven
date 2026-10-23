"use client";

import { useState } from "react";
import { CloseIcon } from "@/components/ui/Icons";
import { Sheet } from "@/components/ui/Sheet";

// Indicative body measurements in centimetres — placeholder values to be
// replaced with ACT VII's graded size specification.
const tables: Record<"tops" | "trousers" | "tailoring", { caption: string; head: string[]; rows: string[][] }> = {
  tops: {
    caption: "Shirts, knitwear & outerwear — body measurements (cm)",
    head: ["Size", "Chest", "Waist", "Sleeve"],
    rows: [
      ["XS", "86–91", "71–76", "81"],
      ["S", "91–96", "76–81", "83"],
      ["M", "96–101", "81–86", "85"],
      ["L", "101–106", "86–91", "87"],
      ["XL", "106–112", "91–97", "89"],
      ["XXL", "112–118", "97–103", "91"],
    ],
  },
  trousers: {
    caption: "Trousers — body measurements (cm)",
    head: ["Size", "Waist", "Hip", "Inseam"],
    rows: [
      ["28", "71", "89", "81"],
      ["30", "76", "94", "81"],
      ["32", "81", "99", "82"],
      ["34", "86", "104", "82"],
      ["36", "91", "109", "83"],
      ["38", "97", "114", "83"],
    ],
  },
  tailoring: {
    caption: "Suits & blazers — chest size (inches) to body measurements (cm)",
    head: ["Size", "Chest", "Waist", "Shoulder"],
    rows: [
      ["36", "91", "76", "43"],
      ["38", "96", "81", "44"],
      ["40", "101", "86", "45.5"],
      ["42", "106", "91", "47"],
      ["44", "112", "97", "48.5"],
      ["46", "117", "102", "50"],
    ],
  },
};

/** `category` is a category slug; categories without a chart show the general guidance. */
export function SizeGuide({ category }: { category: string }) {
  const [open, setOpen] = useState(false);
  const table = tables[category === "trousers" ? "trousers" : category === "suits-blazers" ? "tailoring" : "tops"];

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="text-xs underline underline-offset-4 hover:text-gold-deep">
        Size guide
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} side="right" labelledBy="size-guide-title">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-obsidian/10 px-6 py-3">
            <h2 id="size-guide-title" className="display text-2xl">
              Size guide
            </h2>
            <button type="button" onClick={() => setOpen(false)} className="-mr-2.5 grid size-11 place-items-center" aria-label="Close size guide">
              <CloseIcon className="size-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <table className="w-full text-left text-sm">
              <caption className="mb-4 text-left text-xs text-taupe">{table.caption}</caption>
              <thead>
                <tr className="border-b border-obsidian/20">
                  {table.head.map((h) => (
                    <th key={h} scope="col" className="label py-3 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map(([size, ...cells]) => (
                  <tr key={size} className="border-b border-obsidian/10">
                    <th scope="row" className="py-3 font-medium">
                      {size}
                    </th>
                    {cells.map((c, i) => (
                      <td key={i} className="py-3 tabular-nums">
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-6 text-xs leading-relaxed text-taupe">
              Measure over a light shirt, keeping the tape snug but not tight. If you are between sizes, see the fit note on the
              product page. Indicative measurements for this demo store.
            </p>
          </div>
        </div>
      </Sheet>
    </>
  );
}
