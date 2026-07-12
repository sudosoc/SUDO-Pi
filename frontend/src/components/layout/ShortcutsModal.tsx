import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ShortcutItem {
  keys: string[];
  label: string;
}

interface ShortcutGroup {
  category: string;
  items: ShortcutItem[];
}

const SHORTCUTS: ShortcutGroup[] = [
  {
    category: "Navigation",
    items: [
      { keys: ["G", "D"], label: "Dashboard" },
      { keys: ["G", "N"], label: "Network" },
      { keys: ["G", "T"], label: "Terminal" },
      { keys: ["G", "S"], label: "Settings" },
      { keys: ["G", "L"], label: "Logs" },
      { keys: ["G", "M"], label: "Metrics" },
      { keys: ["G", "F"], label: "Files" },
      { keys: ["G", "B"], label: "Backup" },
    ],
  },
  {
    category: "App",
    items: [
      { keys: ["Ctrl", "K"],            label: "Open command palette" },
      { keys: ["Ctrl", "Shift", "L"],   label: "Toggle dark / light theme" },
      { keys: ["Ctrl", "`"],            label: "Toggle floating terminal" },
      { keys: ["?"],                    label: "Show this shortcuts panel" },
      { keys: ["Esc"],                  label: "Close modal / dialog" },
    ],
  },
];

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[26px] h-[22px] px-1.5 rounded bg-muted/80 border border-border/70 text-[11px] font-mono font-medium text-foreground/80 shadow-[inset_0_-1px_0_rgba(0,0,0,0.25)]">
      {children}
    </kbd>
  );
}

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsModal({ open, onClose }: ShortcutsModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={cn(
          "fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
          "w-[480px] max-w-[90vw] rounded-2xl border border-border/60 shadow-2xl",
          "bg-popover/95 backdrop-blur-xl overflow-hidden",
        )}
        style={{ boxShadow: "0 25px 80px hsl(260 50% 3% / 0.7), 0 0 0 1px hsl(var(--primary) / 0.08)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/50">
          <div>
            <h2 className="text-sm font-semibold">Keyboard Shortcuts</h2>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">Press any key sequence to navigate</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Shortcut groups */}
        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {SHORTCUTS.map((group) => (
            <div key={group.category}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-primary/70 mb-2.5">
                {group.category}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-secondary/30 transition-colors"
                  >
                    <span className="text-[12.5px] text-foreground/80">{item.label}</span>
                    <div className="flex items-center gap-1">
                      {item.keys.map((k, i) => (
                        <span key={k} className="flex items-center gap-1">
                          {i > 0 && item.keys.length > 1 && item.keys[0].length === 1 && i === 1
                            ? <span className="text-[10px] text-muted-foreground/40 mx-0.5">then</span>
                            : i > 0
                            ? <span className="text-[10px] text-muted-foreground/40 mx-0.5">+</span>
                            : null
                          }
                          <Kbd>{k}</Kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-border/40 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground/40">Press</span>
          <div className="flex items-center gap-1.5">
            <Kbd>?</Kbd>
            <span className="text-[10px] text-muted-foreground/40">to toggle this panel</span>
          </div>
        </div>
      </div>
    </>
  );
}
