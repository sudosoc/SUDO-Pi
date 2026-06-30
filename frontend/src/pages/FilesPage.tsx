import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  File, Folder, FolderOpen, Upload, Download, Trash2,
  Edit3, Copy, Scissors, Plus, ChevronRight, Home,
  Archive, MoreVertical, RefreshCw, Search,
} from "lucide-react";
import { filesApi } from "@/api/files";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, formatBytes } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import type { FileEntry } from "@/types";

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

export default function FilesPage() {
  const [currentPath, setCurrentPath] = useState("/home");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
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
                    <th className="w-8 px-2 py-2" />
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
                          {!entry.is_dir && (
                            <a href={filesApi.getDownloadUrl(entry.path)} download className="p-1 text-muted-foreground hover:text-foreground">
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button
                            className="p-1 text-muted-foreground hover:text-foreground"
                            onClick={() => { setRenameTarget(entry.path); setNewName(entry.name); }}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="p-1 text-muted-foreground hover:text-destructive"
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
