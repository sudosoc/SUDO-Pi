import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Code2, Plus, Trash2, Play, RefreshCw, Clock, CheckCircle2, XCircle,
  X, ChevronDown, ChevronUp, Terminal, BookOpen, History,
} from "lucide-react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { apiClient, getApiError } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Script {
  id: number;
  name: string;
  description: string;
  language: "bash" | "python";
  code: string;
  created_at: string;
  updated_at: string;
  last_run?: string | null;
  last_exit_code?: number | null;
}

interface RunResult {
  script_id: number;
  name: string;
  exit_code: number;
  output: string;
  duration: number;
  ran_at: string;
}

interface HistoryEntry {
  id: number;
  script_id: number;
  name: string;
  exit_code: number;
  output: string;
  duration: number;
  ran_at: string;
}

function useToast() {
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  function toast(text: string, ok = true) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 5000);
  }
  return { msg, toast };
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const BASH_PLACEHOLDER = `#!/bin/bash
# System info snapshot
echo "=== Hostname ===" && hostname
echo "=== Uptime ===" && uptime
echo "=== Disk Usage ===" && df -h /
echo "=== Memory ===" && free -h
`;

const PYTHON_PLACEHOLDER = `#!/usr/bin/env python3
# Example: list top 5 processes by CPU
import subprocess, json

result = subprocess.run(
    ["ps", "-eo", "pid,comm,%cpu,%mem", "--sort=-%cpu"],
    capture_output=True, text=True
)
lines = result.stdout.strip().split("\\n")
for line in lines[:6]:
    print(line)
`;

function LanguageBadge({ lang }: { lang: "bash" | "python" }) {
  return (
    <span className={cn(
      "text-[9px] font-bold px-1.5 py-0.5 rounded-full tracking-wide",
      lang === "python"
        ? "bg-blue-500/15 text-blue-400"
        : "bg-amber-500/15 text-amber-400",
    )}>
      {lang === "python" ? "PY" : "SH"}
    </span>
  );
}

function ExitBadge({ code }: { code: number | null | undefined }) {
  if (code === null || code === undefined) return null;
  return (
    <span className={cn(
      "text-[9px] font-bold px-1.5 py-0.5 rounded-full",
      code === 0 ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400",
    )}>
      exit {code}
    </span>
  );
}

interface ScriptFormProps {
  initial?: Partial<Script>;
  onSave: (d: { name: string; description: string; language: "bash" | "python"; code: string }) => void;
  onCancel: () => void;
  saving: boolean;
  error: string;
}

function ScriptForm({ initial, onSave, onCancel, saving, error }: ScriptFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [language, setLanguage] = useState<"bash" | "python">(initial?.language ?? "bash");
  const [code, setCode] = useState(
    initial?.code ?? (language === "python" ? PYTHON_PLACEHOLDER : BASH_PLACEHOLDER),
  );

  const handleLangChange = (lang: "bash" | "python") => {
    setLanguage(lang);
    if (!initial?.code) {
      setCode(lang === "python" ? PYTHON_PLACEHOLDER : BASH_PLACEHOLDER);
    }
  };

  const handleCodeChange = useCallback((val: string) => setCode(val), []);

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Code2 className="w-4 h-4 text-primary" />
          {initial?.id ? "Edit Script" : "New Script"}
          <Button variant="ghost" size="icon-sm" onClick={onCancel} className="ml-auto">
            <X className="w-3.5 h-3.5" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="text-sm px-3 py-2 rounded-lg border border-red-500/30 text-red-400 bg-red-500/5">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Script name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Check disk space" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Reports available disk on all mounts"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Language</Label>
          <div className="flex gap-2">
            {(["bash", "python"] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => handleLangChange(lang)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                  language === lang
                    ? lang === "python"
                      ? "border-blue-500/40 bg-blue-500/10 text-blue-400"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-400"
                    : "border-border/50 text-muted-foreground hover:text-foreground",
                )}
              >
                {lang === "bash" ? "Bash / Shell" : "Python 3"}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Code</Label>
          <div className="rounded-lg overflow-hidden border border-border/60">
            <CodeMirror
              value={code}
              onChange={handleCodeChange}
              extensions={language === "python" ? [python()] : []}
              theme={oneDark}
              basicSetup={{
                lineNumbers: true,
                foldGutter: false,
                highlightActiveLineGutter: true,
                bracketMatching: true,
                autocompletion: true,
              }}
              style={{ fontSize: "13px", maxHeight: "420px" }}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => onSave({ name, description, language, code })}
            disabled={saving || !name.trim() || !code.trim()}
            className="gap-1.5"
          >
            {saving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            Save Script
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function OutputPanel({ result }: { result: RunResult }) {
  return (
    <Card className={cn(
      "border transition-colors",
      result.exit_code === 0 ? "border-green-500/25" : "border-red-500/25",
    )}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Terminal className="w-4 h-4 text-muted-foreground" />
          <span>Output — {result.name}</span>
          <ExitBadge code={result.exit_code} />
          <span className="ml-auto text-[10px] text-muted-foreground/60 font-normal">
            {result.duration.toFixed(2)}s · {relTime(result.ran_at)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <pre className={cn(
          "text-xs font-mono bg-black/40 rounded-lg p-4 max-h-72 overflow-y-auto whitespace-pre-wrap leading-relaxed",
          result.exit_code === 0 ? "text-green-300/90" : "text-red-300/90",
        )}>
          {result.output || <span className="text-muted-foreground/50">(no output)</span>}
        </pre>
      </CardContent>
    </Card>
  );
}

function HistoryPanel({ history }: { history: HistoryEntry[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (history.length === 0) {
    return (
      <div className="text-center py-8">
        <History className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground/50">No runs yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {history.map((h) => (
        <div key={h.id} className="rounded-xl border border-border/50 overflow-hidden">
          <button
            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/20 transition-colors"
            onClick={() => setExpanded(expanded === h.id ? null : h.id)}
          >
            {h.exit_code === 0
              ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
              : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            }
            <span className="text-xs font-medium truncate flex-1">{h.name}</span>
            <ExitBadge code={h.exit_code} />
            <span className="text-[10px] text-muted-foreground/60 shrink-0">{relTime(h.ran_at)}</span>
            <span className="text-[10px] text-muted-foreground/40 shrink-0">{h.duration.toFixed(1)}s</span>
            {expanded === h.id ? <ChevronUp className="w-3 h-3 text-muted-foreground/40 shrink-0" /> : <ChevronDown className="w-3 h-3 text-muted-foreground/40 shrink-0" />}
          </button>
          {expanded === h.id && (
            <pre className={cn(
              "text-[11px] font-mono px-4 py-3 whitespace-pre-wrap max-h-48 overflow-y-auto border-t border-border/30",
              h.exit_code === 0 ? "text-green-300/80 bg-black/30" : "text-red-300/80 bg-black/30",
            )}>
              {h.output || "(no output)"}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

type Tab = "library" | "history";

export default function ScriptRunnerPage() {
  const qc = useQueryClient();
  const { msg, toast } = useToast();
  const [tab, setTab] = useState<Tab>("library");
  const [showForm, setShowForm] = useState(false);
  const [editScript, setEditScript] = useState<Script | null>(null);
  const [formError, setFormError] = useState("");
  const [runningId, setRunningId] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<RunResult | null>(null);

  const { data: scripts = [], isLoading: loadingScripts, isFetching: fetchingScripts, refetch: refetchScripts } = useQuery<Script[]>({
    queryKey: ["scripts"],
    queryFn: async () => {
      const { data } = await apiClient.get<Script[]>("/scripts");
      return data;
    },
    staleTime: 30_000,
  });

  const { data: history = [], isLoading: loadingHistory } = useQuery<HistoryEntry[]>({
    queryKey: ["scripts-history"],
    queryFn: async () => {
      const { data } = await apiClient.get<HistoryEntry[]>("/scripts/history");
      return data;
    },
    enabled: tab === "history",
    staleTime: 10_000,
  });

  const addMut = useMutation({
    mutationFn: async (d: { name: string; description: string; language: string; code: string }) => {
      const { data } = await apiClient.post<Script>("/scripts", d, {});
      return data;
    },
    onSuccess: () => {
      toast("Script saved.");
      setShowForm(false);
      setFormError("");
      qc.invalidateQueries({ queryKey: ["scripts"] });
    },
    onError: (e) => setFormError(getApiError(e)),
  });

  const updateMut = useMutation({
    mutationFn: async (d: { id: number; name: string; description: string; language: string; code: string }) => {
      const { id, ...body } = d;
      const { data } = await apiClient.put<Script>(`/scripts/${id}`, body, {});
      return data;
    },
    onSuccess: () => {
      toast("Script updated.");
      setEditScript(null);
      setFormError("");
      qc.invalidateQueries({ queryKey: ["scripts"] });
    },
    onError: (e) => setFormError(getApiError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/scripts/${id}`);
    },
    onSuccess: () => {
      toast("Script deleted.");
      qc.invalidateQueries({ queryKey: ["scripts"] });
    },
    onError: (e) => toast(getApiError(e), false),
  });

  const runMut = useMutation({
    mutationFn: async (id: number) => {
      setRunningId(id);
      const { data } = await apiClient.post<RunResult>(`/scripts/${id}/run`, {}, {});
      return data;
    },
    onSuccess: (result) => {
      setLastResult(result);
      setRunningId(null);
      toast(
        result.exit_code === 0
          ? `Script ran successfully (${result.duration.toFixed(1)}s).`
          : `Script exited with code ${result.exit_code}.`,
        result.exit_code === 0,
      );
      qc.invalidateQueries({ queryKey: ["scripts"] });
      qc.invalidateQueries({ queryKey: ["scripts-history"] });
    },
    onError: (e) => {
      toast(getApiError(e), false);
      setRunningId(null);
    },
  });

  return (
    <div className="p-6 space-y-6 page-transition">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Code2 className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">Script Runner</h2>
            <p className="text-sm text-muted-foreground">
              Save and run Bash or Python scripts on the Pi with live output.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon-sm" onClick={() => refetchScripts()} disabled={fetchingScripts}>
            <RefreshCw className={cn("w-4 h-4", fetchingScripts && "animate-spin")} />
          </Button>
          <Button size="sm" onClick={() => { setShowForm(true); setEditScript(null); setFormError(""); }} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            New Script
          </Button>
        </div>
      </div>

      {msg && (
        <div className={cn(
          "text-sm px-3 py-2 rounded-lg border",
          msg.ok ? "border-green-500/30 text-green-400 bg-green-500/5" : "border-red-500/30 text-red-400 bg-red-500/5",
        )}>
          {msg.text}
        </div>
      )}

      {/* Form */}
      {showForm && !editScript && (
        <ScriptForm
          onSave={(d) => addMut.mutate(d)}
          onCancel={() => { setShowForm(false); setFormError(""); }}
          saving={addMut.isPending}
          error={formError}
        />
      )}

      {editScript && (
        <ScriptForm
          initial={editScript}
          onSave={(d) => updateMut.mutate({ id: editScript.id, ...d })}
          onCancel={() => { setEditScript(null); setFormError(""); }}
          saving={updateMut.isPending}
          error={formError}
        />
      )}

      {/* Last run output */}
      {lastResult && !editScript && !showForm && (
        <OutputPanel result={lastResult} />
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border/50">
        {([
          { id: "library", label: "Script Library", icon: <BookOpen className="w-3.5 h-3.5" />, count: scripts.length },
          { id: "history", label: "Run History", icon: <History className="w-3.5 h-3.5" />, count: history.length },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors",
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.icon}
            {t.label}
            {t.count > 0 && (
              <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded-full font-semibold">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Library tab */}
      {tab === "library" && (
        loadingScripts ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />)}
          </div>
        ) : scripts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Code2 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No scripts yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Create a Bash or Python script to run it on the Pi.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {scripts.map((script) => (
              editScript?.id !== script.id && (
                <Card key={script.id} className="border-border/60 card-interactive">
                  <CardContent className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <LanguageBadge lang={script.language} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold truncate">{script.name}</span>
                          {script.last_exit_code !== null && script.last_exit_code !== undefined && (
                            <ExitBadge code={script.last_exit_code} />
                          )}
                        </div>
                        {script.description && (
                          <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5">{script.description}</p>
                        )}
                        {script.last_run && (
                          <p className="text-[10px] text-muted-foreground/40 mt-0.5 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            Last run {relTime(script.last_run)}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          className={cn(
                            "h-7 gap-1.5 px-2.5 text-xs",
                            runningId === script.id && "opacity-80",
                          )}
                          onClick={() => runMut.mutate(script.id)}
                          disabled={runMut.isPending && runningId === script.id}
                        >
                          {runMut.isPending && runningId === script.id
                            ? <RefreshCw className="w-3 h-3 animate-spin" />
                            : <Play className="w-3 h-3" />
                          }
                          Run
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-7 w-7"
                          onClick={() => { setEditScript(script); setShowForm(false); setFormError(""); setLastResult(null); }}
                          title="Edit"
                        >
                          <Code2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-7 w-7 text-destructive/60 hover:text-destructive hover:bg-destructive/8"
                          onClick={() => {
                            if (confirm(`Delete script "${script.name}"?`)) deleteMut.mutate(script.id);
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            ))}
          </div>
        )
      )}

      {/* History tab */}
      {tab === "history" && (
        loadingHistory ? (
          <div className="h-32 bg-muted animate-pulse rounded-xl" />
        ) : (
          <HistoryPanel history={history} />
        )
      )}

      <div className="flex items-start gap-2 text-xs text-muted-foreground/50">
        <Terminal className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <p>
          Scripts run as the <code className="font-mono">sudo-pi</code> service user with a 60-second
          timeout. Output (stdout + stderr merged) is captured and shown here.
          Scripts are stored at <code className="font-mono">/opt/sudo-pi/scripts/</code>.
        </p>
      </div>
    </div>
  );
}
