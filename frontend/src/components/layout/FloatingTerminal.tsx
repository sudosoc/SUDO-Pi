import { useState, useRef, useCallback, useEffect } from "react";
import { Terminal, X, Play } from "lucide-react";
import { apiClient } from "@/api/client";

interface OutputEntry {
  id: number;
  timestamp: string;
  command: string;
  output: string;
  exitCode: number;
}

let nextId = 0;

export function FloatingTerminal() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [entries, setEntries] = useState<OutputEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const history = useRef<string[]>([]);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom when new entries arrive
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [entries]);

  // Focus input when drawer opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const runCommand = useCallback(async (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    // Add to history (deduplicate at head)
    if (history.current[0] !== trimmed) {
      history.current.unshift(trimmed);
      if (history.current.length > 20) history.current.pop();
    }
    setHistoryIndex(-1);
    setInput("");
    setRunning(true);

    const timestamp = new Date().toLocaleTimeString("en-GB", { hour12: false });

    try {
      const res = await apiClient.post<{ output: string; exit_code: number }>(
        "/terminal/execute",
        { command: trimmed }
      );
      const entry: OutputEntry = {
        id: nextId++,
        timestamp,
        command: trimmed,
        output: res.data.output,
        exitCode: res.data.exit_code,
      };
      setEntries((prev) => {
        const next = [...prev, entry];
        return next.length > 200 ? next.slice(next.length - 200) : next;
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Request failed";
      const entry: OutputEntry = {
        id: nextId++,
        timestamp,
        command: trimmed,
        output: message,
        exitCode: 1,
      };
      setEntries((prev) => [...prev, entry]);
    } finally {
      setRunning(false);
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      runCommand(input);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(historyIndex + 1, history.current.length - 1);
      setHistoryIndex(next);
      setInput(history.current[next] ?? "");
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.max(historyIndex - 1, -1);
      setHistoryIndex(next);
      setInput(next === -1 ? "" : (history.current[next] ?? ""));
      return;
    }
  };

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ position: "fixed", bottom: "36px", right: "16px", zIndex: 40 }}
        className="w-11 h-11 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors"
        aria-label={open ? "Close terminal" : "Open quick terminal"}
      >
        {open ? <X className="w-5 h-5" /> : <Terminal className="w-5 h-5" />}
      </button>

      {/* Drawer */}
      {open && (
        <div
          style={{
            position: "fixed",
            bottom: "64px",
            right: "16px",
            width: "380px",
            height: "300px",
            zIndex: 40,
          }}
          className="bg-card border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Terminal className="w-3.5 h-3.5 text-primary" />
              Quick Terminal
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close terminal"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Output area */}
          <div
            ref={outputRef}
            className="flex-1 overflow-y-auto bg-background p-2 font-mono text-xs space-y-2"
          >
            {entries.length === 0 && (
              <p className="text-muted-foreground text-center mt-4 text-[11px]">
                Run a command below. Use ↑↓ for history.
              </p>
            )}
            {entries.map((entry) => (
              <div key={entry.id} className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-[10px] tabular-nums shrink-0">
                    {entry.timestamp}
                  </span>
                  <span className="text-yellow-400">$ {entry.command}</span>
                </div>
                {entry.output && (
                  <pre
                    className={
                      entry.exitCode !== 0
                        ? "text-red-400 whitespace-pre-wrap break-all pl-2"
                        : "text-foreground/80 whitespace-pre-wrap break-all pl-2"
                    }
                  >
                    {entry.output}
                  </pre>
                )}
                {entry.exitCode !== 0 && (
                  <span className="text-red-500 text-[10px] pl-2">
                    exit {entry.exitCode}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Input row */}
          <div className="flex items-center gap-1.5 px-2 py-2 border-t border-border shrink-0">
            <span className="text-primary font-mono text-xs shrink-0">$</span>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={running}
              placeholder={running ? "Running…" : "Enter command…"}
              className="flex-1 bg-transparent text-xs font-mono text-foreground placeholder:text-muted-foreground outline-none disabled:opacity-50"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <button
              onClick={() => runCommand(input)}
              disabled={running || !input.trim()}
              className="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
              aria-label="Run command"
            >
              <Play className="w-3 h-3" />
              Run
            </button>
          </div>
        </div>
      )}
    </>
  );
}
