import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  File, Folder, FolderOpen, Upload, Download, Trash2,
  Edit3, Plus, ChevronRight, Home,
  Archive, RefreshCw, Search, Code, X, Save,
} from "lucide-react";
import ReactCodeMirror from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { markdown } from "@codemirror/lang-markdown";
import type { Extension } from "@codemirror/state";
import { filesApi } from "@/api/files";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, formatBytes } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import type { FileEntry } from "@/types";

// ─── Language detection ───────────────────────────────────────────────────────

const TEXT_EXTENSIONS = new Set([
  "txt", "log", "sh", "bash", "zsh", "fish", "env", "conf", "cfg", "ini",
  "toml", "yaml", "yml", "xml", "csv", "sql", "dockerfile", "gitignore",
  "gitattributes", "editorconfig", "htaccess", "service", "timer",
]);

function getLanguageExtension(filename: string): Extension | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (["py", "pyw"].includes(ext)) return python();
  if (["js", "jsx", "ts", "tsx", "mjs", "cjs"].includes(ext)) return javascript({ typescript: ext === "ts" || ext === "tsx", jsx: ext === "jsx" || ext === "tsx" });
  if (ext === "json") return json();
  if (["html", "htm", "jinja", "jinja2", "j2"].includes(ext)) return html();
  if (["css", "scss", "sass", "less"].includes(ext)) return css();
  if (["md", "markdown", "mdx"].includes(ext)) return markdown();
  return null;
}

function isTextFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return (
    TEXT_EXTENSIONS.has(ext) ||
    getLanguageExtension(filename) !== null ||
    !filename.includes(".")
  );
}

// ─── File Editor Modal ────────────────────────────────────────────────────────

interface FileEditorProps {
  path: string;
  onClose: () => void;
}

function FileEditorModal({ path, onClose }: FileEditorProps) {
  const filename = path.split("/").pop() ?? path;
  const langExt = getLanguageExtension(filename);
  const extensions: Extension[] = langExt ? [langExt] : [];

  const [content, setContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const queryClient = useQueryClient();

  const { isLoading } = useQuery({
    queryKey: ["file-content", path],
    queryFn: async () => {
      const data = await filesApi.readFile(path);
      const text = typeof data === "string" ? data : (data?.content ?? "");
      setContent(text);
      setIsDirty(false);
      return text;
    },
    staleTime: Infinity,
  });

  const saveMut = useMutation({
    mutationFn: () => filesApi.writeFile(path, content),
    onSuccess: () => {
      setIsDirty(false);
      toast({ title: "File saved", variant: "success" } as { title: string; variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["files"] });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" } as { title: string; variant: "destructive" }),
  });

  const handleChange = useCallback((val: string) => {
    setContent(val);
    setIsDirty(true);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      if (isDirty) saveMut.mutate();
    }
    if (e.key === "Escape" && !isDirty) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !isDirty) onClose(); }}
    >
      <div
        className="w-full max-w-5xl h-[80vh] bg-card border border-border rounded-xl shadow-2xl flex flex-col"
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Code className="w-4 h-4 text-primary" />
            <span className="text-sm font-mono font-medium truncate max-w-sm">{filename}</span>
            {isDirty && <Badge variant="warning" className="text-[10px] py-0 px-1.5">Unsaved</Badge>}
            {langExt && (
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-muted-foreground">
                {filename.split(".").pop()?.toUpperCase()}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="gap-1.5 h-7 text-xs"
              disabled={!isDirty}
              loading={saveMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              <Save className="w-3.5 h-3.5" />
              Save
              <span className="text-[10px] opacity-60 hidden sm:inline">(Ctrl+S)</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={onClose}
              title="Close editor"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <ReactCodeMirror
              value={content}
              onChange={handleChange}
              theme={oneDark}
              extensions={extensions}
              height="100%"
              style={{ height: "100%", fontSize: "13px" }}
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
                highlightActiveLine: true,
                highlightSelectionMatches: true,
                autocompletion: true,
                searchKeymap: true,
                history: true,
              }}
            />
          )}
        </div>

        {/* Status bar */}
        <div className="px-4 py-1.5 border-t border-border text-[10px] text-muted-foreground flex items-center gap-4 shrink-0">
          <span>{content.split("\n").length} lines</span>
          <span>{content.length} chars</span>
          <span className="ml-auto truncate max-w-xs font-mono opacity-60">{path}</span>
        </div>
      </div>
    </div>
  );
}

// ─── File browser components ──────────────────────────────────────────────────

function FileBreadcrumb({ path, onNavigate }: { path: string; onNavigate: (p: string) => void }) {
  const parts = path.split("/").filter(Boolean);
  return (
    <div className="flex items-center gap-1 text-sm overflow-x-auto">
      <button
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors shrink-0"
        onClick={() => onNavigate("/")}
      >
        <Home className="w-3.5 h-3.5" />
      </button>
      {parts.map((part, i) => {
        const partPath = "/" + parts.slice(0, i + 1).join("/");
        return (
          <div key={i} className="flex items-center gap-1 shrink-0">
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
            <button
              className={cn(
                "transition-colors",
                i === parts.length - 1
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => onNavigate(partPath)}
            >
              {part}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function FileIcon({ entry }: { entry: FileEntry }) {
  if (entry.is_dir) return <Folder className="w-4 h-4 text-warning shrink-0" />;
  const ext = entry.name.split(".").pop()?.toLowerCase();
  if (["tar", "gz", "zip", "bz2", "xz"].includes(ext ?? "")) return <Archive className="w-4 h-4 text-primary shrink-0" />;
  return <File className="w-4 h-4 text-muted-foreground shrink-0" />;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FilesPage() {
  const [currentPath, setCurrentPath] = useState("/home");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: listing, isLoading, refetch } = useQuery({
    queryKey: ["files", currentPath],
    queryFn: () => filesApi.listDirectory(currentPath),
  });

  const deleteMutation = useMutation({
    mutationFn: filesApi.deletePath,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files", currentPath] });
      setSelected(new Set());
      toast({ title: "Deleted", variant: "success" } as { title: string; variant: "success" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" } as { title: string; variant: "destructive" }),
  });

  const renameMutation = useMutation({
    mutationFn: ({ path, name }: { path: string; name: string }) => filesApi.rename(path, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files", currentPath] });
      setRenameTarget(null);
    },
    onError: () => toast({ title: "Rename failed", variant: "destructive" } as { title: string; variant: "destructive" }),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => filesApi.uploadFile(currentPath, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files", currentPath] });
      toast({ title: "Uploaded successfully", variant: "success" } as { title: string; variant: "success" });
    },
    onError: () => toast({ title: "Upload failed", variant: "destructive" } as { title: string; variant: "destructive" }),
  });

  const mkdirMutation = useMutation({
    mutationFn: (name: string) => filesApi.mkdir(currentPath, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["files", currentPath] }),
    onError: () => toast({ title: "Failed to create folder", variant: "destructive" } as { title: string; variant: "destructive" }),
  });

  const navigate = (path: string) => {
    setCurrentPath(path);
    setSelected(new Set());
    setFilter("");
  };

  const handleEntryClick = (entry: FileEntry) => {
    if (entry.is_dir) {
      navigate(entry.path);
    }
  };

  const handleEntrySelect = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach((f) => uploadMutation.mutate(f));
    e.target.value = "";
  };

  const handleDelete = () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} item(s)?`)) return;
    selected.forEach((path) => deleteMutation.mutate(path));
  };

  const handleMkdir = () => {
    const name = prompt("New folder name:");
    if (name?.trim()) mkdirMutation.mutate(name.trim());
  };

  const filteredEntries = (listing?.entries ?? []).filter(
    (e) => !filter || e.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="p-6 h-full flex flex-col gap-4">
      {/* File editor modal */}
      {editingFile && (
        <FileEditorModal path={editingFile} onClose={() => setEditingFile(null)} />
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <FileBreadcrumb path={currentPath} onNavigate={navigate} />
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} loading={uploadMutation.isPending}>
          <Upload className="w-3.5 h-3.5 mr-1" /> Upload
        </Button>
        <Button variant="outline" size="sm" onClick={handleMkdir}>
          <Plus className="w-3.5 h-3.5 mr-1" /> New Folder
        </Button>
        {selected.size > 0 && (
          <Button variant="destructive" size="sm" onClick={handleDelete} loading={deleteMutation.isPending}>
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete ({selected.size})
          </Button>
        )}
        <input ref={fileInputRef} type="file" multiple hidden onChange={handleUpload} />
      </div>

      <Card className="flex-1 overflow-hidden">
        <CardContent className="p-0 h-full">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ScrollArea className="h-full">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card border-b border-border z-10">
                  <tr>
                    <th className="w-8 px-4 py-2" />
                    <th className="text-left px-4 py-2 text-muted-foreground font-medium text-xs">Name</th>
                    <th className="text-right px-4 py-2 text-muted-foreground font-medium text-xs hidden md:table-cell">Size</th>
                    <th className="text-left px-4 py-2 text-muted-foreground font-medium text-xs hidden lg:table-cell">Permissions</th>
                    <th className="text-left px-4 py-2 text-muted-foreground font-medium text-xs hidden lg:table-cell">Owner</th>
                    <th className="w-24 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {listing?.parent && (
                    <tr
                      className="border-b border-border/50 hover:bg-secondary/30 cursor-pointer"
                      onClick={() => listing.parent && navigate(listing.parent)}
                    >
                      <td className="px-4 py-2" />
                      <td className="px-4 py-2 flex items-center gap-2">
                        <FolderOpen className="w-4 h-4 text-warning" />
                        <span className="text-muted-foreground">..</span>
                      </td>
                      <td colSpan={4} />
                    </tr>
                  )}
                  {filteredEntries.map((entry) => (
                    <tr
                      key={entry.path}
                      className={cn(
                        "border-b border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer",
                        selected.has(entry.path) && "bg-primary/10"
                      )}
                      onClick={() => handleEntryClick(entry)}
                    >
                      <td className="px-4 py-2" onClick={(e) => handleEntrySelect(e, entry.path)}>
                        <input
                          type="checkbox"
                          checked={selected.has(entry.path)}
                          onChange={() => {}}
                          className="rounded border-border"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <FileIcon entry={entry} />
                          {renameTarget === entry.path ? (
                            <Input
                              value={newName}
                              onChange={(e) => setNewName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") renameMutation.mutate({ path: entry.path, name: newName });
                                if (e.key === "Escape") setRenameTarget(null);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              autoFocus
                              className="h-6 text-xs"
                            />
                          ) : (
                            <span className="truncate max-w-[200px] md:max-w-xs">{entry.name}</span>
                          )}
                          {entry.is_symlink && (
                            <Badge variant="info" className="text-[10px] py-0">link</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground text-xs hidden md:table-cell tabular-nums">
                        {entry.is_dir ? "—" : formatBytes(entry.size_bytes)}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground hidden lg:table-cell">
                        {entry.permissions}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground hidden lg:table-cell">
                        {entry.owner}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                          {!entry.is_dir && isTextFile(entry.name) && (
                            <button
                              className="p-1 text-muted-foreground hover:text-primary transition-colors"
                              title="Edit file content"
                              onClick={() => setEditingFile(entry.path)}
                            >
                              <Code className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {!entry.is_dir && (
                            <a href={filesApi.getDownloadUrl(entry.path)} download className="p-1 text-muted-foreground hover:text-foreground">
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button
                            className="p-1 text-muted-foreground hover:text-foreground"
                            title="Rename"
                            onClick={() => { setRenameTarget(entry.path); setNewName(entry.name); }}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="p-1 text-muted-foreground hover:text-destructive"
                            title="Delete"
                            onClick={() => { if (confirm(`Delete ${entry.name}?`)) deleteMutation.mutate(entry.path); }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredEntries.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                        {filter ? "No files match your filter" : "Empty directory"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
