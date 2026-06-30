import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Maximize2, Minimize2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import "@xterm/xterm/css/xterm.css";

interface TerminalTab {
  id: string;
  title: string;
  ws: WebSocket | null;
  term: XTerm | null;
  connected: boolean;
}

function createWsUrl(sessionId: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/v1/terminal/ws/${sessionId}`;
}

function TerminalInstance({
  sessionId,
  visible,
  onTitleChange,
}: {
  sessionId: string;
  visible: boolean;
  onTitleChange: (title: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  const send = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      theme: {
        background: "#0f172a",
        foreground: "#e2e8f0",
        cursor: "#06b6d4",
        cursorAccent: "#0f172a",
        black: "#1e293b",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#f59e0b",
        blue: "#3b82f6",
        magenta: "#a855f7",
        cyan: "#06b6d4",
        white: "#cbd5e1",
        brightBlack: "#334155",
        brightRed: "#fca5a5",
        brightGreen: "#86efac",
        brightYellow: "#fcd34d",
        brightBlue: "#93c5fd",
        brightMagenta: "#d8b4fe",
        brightCyan: "#67e8f9",
        brightWhite: "#f1f5f9",
      },
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitRef.current = fitAddon;

    const ws = new WebSocket(createWsUrl(sessionId));
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      const { cols, rows } = term;
      ws.send(JSON.stringify({ type: "resize", cols, rows }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "output") term.write(msg.data);
      else if (msg.type === "exit") {
        term.write("\r\n\x1b[33m[Session ended]\x1b[0m\r\n");
        setConnected(false);
      }
    };

    ws.onerror = () => setConnected(false);
    ws.onclose = () => {
      setConnected(false);
      term.write("\r\n\x1b[31m[Disconnected]\x1b[0m\r\n");
    };

    term.onData((data) => send({ type: "input", data }));

    term.onTitleChange((title) => onTitleChange(title || "Terminal"));

    const observer = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        const { cols, rows } = term;
        send({ type: "resize", cols, rows });
      } catch {
        // ignore
      }
    });
    if (containerRef.current) observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      ws.close();
      term.dispose();
    };
  }, [sessionId]);

  useEffect(() => {
    if (visible && fitRef.current) {
      setTimeout(() => {
        fitRef.current?.fit();
        const term = termRef.current;
        if (term) {
          const { cols, rows } = term;
          send({ type: "resize", cols, rows });
        }
      }, 50);
    }
  }, [visible, send]);

  return (
    <div className={cn("h-full relative", !visible && "hidden")}>
      {!connected && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
          <p className="text-sm text-muted-foreground">Connecting…</p>
        </div>
      )}
      <div ref={containerRef} className="terminal-container h-full bg-[#0f172a] rounded-b-lg" />
    </div>
  );
}

let tabCounter = 1;

export default function TerminalPage() {
  const [tabs, setTabs] = useState<TerminalTab[]>(() => [
    { id: `term-${Date.now()}`, title: "Terminal 1", ws: null, term: null, connected: false },
  ]);
  const [activeTab, setActiveTab] = useState(tabs[0].id);
  const [fullscreen, setFullscreen] = useState(false);

  const addTab = () => {
    tabCounter++;
    const newTab: TerminalTab = {
      id: `term-${Date.now()}`,
      title: `Terminal ${tabCounter}`,
      ws: null,
      term: null,
      connected: false,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTab(newTab.id);
  };

  const closeTab = (id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) {
        tabCounter++;
        return [{ id: `term-${Date.now()}`, title: `Terminal ${tabCounter}`, ws: null, term: null, connected: false }];
      }
      return next;
    });
    if (activeTab === id) {
      setActiveTab((prev) => {
        const remaining = tabs.filter((t) => t.id !== id);
        return remaining[remaining.length - 1]?.id ?? "";
      });
    }
  };

  const updateTabTitle = (id: string, title: string) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
  };

  return (
    <div className={cn("flex flex-col", fullscreen ? "fixed inset-0 z-50 bg-[#0f172a]" : "h-full p-4")}>
      <div className={cn("flex flex-col h-full bg-card rounded-lg border border-border overflow-hidden", fullscreen && "rounded-none border-0")}>
        <div className="flex items-center gap-1 px-2 pt-2 border-b border-border bg-card overflow-x-auto">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-t text-xs cursor-pointer whitespace-nowrap transition-colors",
                tab.id === activeTab
                  ? "bg-[#0f172a] text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.title}</span>
              {tabs.length > 1 && (
                <button
                  className="hover:text-destructive transition-colors"
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          <button
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors ml-1"
            onClick={addTab}
            title="New tab"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <div className="ml-auto pb-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setFullscreen(!fullscreen)}
              title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0">
          {tabs.map((tab) => (
            <TerminalInstance
              key={tab.id}
              sessionId={tab.id}
              visible={tab.id === activeTab}
              onTitleChange={(title) => updateTabTitle(tab.id, title)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
