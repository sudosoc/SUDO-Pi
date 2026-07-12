import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";

const noteKey = (path: string) => `sudo-pi-note:${path}`;

export function hasRouteNote(path: string): boolean {
  try { return !!localStorage.getItem(noteKey(path))?.trim(); } catch { return false; }
}

interface RouteNotesProps {
  open:    boolean;
  onClose: () => void;
}

export function RouteNotes({ open, onClose }: RouteNotesProps) {
  const location   = useLocation();
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setText(localStorage.getItem(noteKey(location.pathname)) ?? "");
    setSaved(false);
  }, [location.pathname]);

  const save = useCallback(() => {
    if (text.trim()) {
      localStorage.setItem(noteKey(location.pathname), text);
    } else {
      localStorage.removeItem(noteKey(location.pathname));
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  }, [text, location.pathname]);

  // Auto-save 800ms after last keystroke
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(save, 800);
    return () => clearTimeout(t);
  }, [text, open, save]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed bottom-14 right-4 z-[300] w-72 flex flex-col rounded-2xl overflow-hidden",
        "border border-yellow-700/25 shadow-2xl",
        "animate-in slide-in-from-bottom-3 duration-200",
      )}
      style={{
        background: "hsl(40 30% 7% / 0.96)",
        backdropFilter: "blur(24px)",
        boxShadow: "0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(202,138,4,0.12)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-yellow-700/15">
        <div className="flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-yellow-500/50" />
          <span className="text-[11px] font-medium text-yellow-400/50 font-mono truncate max-w-[160px]">
            {location.pathname}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="text-[10px] text-yellow-600/50 animate-in fade-in duration-200">saved</span>
          )}
          <button
            onClick={onClose}
            className="text-yellow-700/50 hover:text-yellow-400/70 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Textarea */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Notes for this page…"
        className="flex-1 p-3 bg-transparent text-[12.5px] text-yellow-100/70 placeholder:text-yellow-800/40 font-mono resize-none outline-none min-h-[130px] leading-relaxed"
        autoFocus
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      />

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-yellow-700/15">
        <span className="text-[10px] text-yellow-800/40 tabular-nums">{text.length} chars</span>
        <span className="text-[10px] text-yellow-800/40">
          <kbd className="font-mono">Esc</kbd> or <kbd className="font-mono">N</kbd> to close
        </span>
      </div>
    </div>
  );
}
