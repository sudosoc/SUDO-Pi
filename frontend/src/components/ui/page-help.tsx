import { useEffect, useRef, useState } from "react";
import { ChevronRight, HelpCircle } from "lucide-react";

export function PageHelp({ title, points }: { title: string; points: string[] }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={`Help: ${title}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
      >
        <HelpCircle className="w-4 h-4" />
      </button>

      {open && (
        <>
          {/* Click-outside overlay */}
          <div
            className="fixed inset-0 z-20"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 top-full mt-2 w-72 bg-popover border border-border rounded-xl shadow-2xl p-4 z-30">
            <h4 className="text-sm font-semibold text-foreground mb-2">
              {title}
            </h4>
            <ul className="space-y-1.5">
              {points.map((point, i) => (
                <li
                  key={i}
                  className="flex items-start gap-1.5 text-xs text-muted-foreground leading-relaxed"
                >
                  <ChevronRight className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
