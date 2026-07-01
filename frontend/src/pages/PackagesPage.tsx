import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Download, RefreshCw, Search, Trash2, Upload } from "lucide-react";
import { apiClient } from "@/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/use-toast";

export default function PackagesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<{ name: string; description: string; installed: boolean; version: string }[]>([]);
  const [searching, setSearching] = useState(false);

  const { data: installed, isLoading, refetch } = useQuery({
    queryKey: ["packages"],
    queryFn: async () => {
      const { data } = await apiClient.get("/packages");
      return data;
    },
  });

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    setSearching(true);
    try {
      const { data } = await apiClient.get(`/packages/search?q=${encodeURIComponent(searchTerm)}`);
      setSearchResults(data);
    } catch {
      toast({ title: "Search failed", variant: "destructive" } as { title: string; variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const installMutation = useMutation({
    mutationFn: (pkg: string) => apiClient.post("/packages/install", { name: pkg }),
    onSuccess: (_, pkg) => {
      refetch();
      toast({ title: `${pkg} installed`, variant: "success" } as { title: string; variant: "success" });
    },
    onError: (_, pkg) => toast({ title: `Failed to install ${pkg}`, variant: "destructive" } as { title: string; variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: (pkg: string) => apiClient.delete(`/packages/${pkg}`),
    onSuccess: (_, pkg) => {
      refetch();
      toast({ title: `${pkg} removed`, variant: "success" } as { title: string; variant: "success" });
    },
    onError: (_, pkg) => toast({ title: `Failed to remove ${pkg}`, variant: "destructive" } as { title: string; variant: "destructive" }),
  });

  const updateAllMutation = useMutation({
    mutationFn: () => apiClient.post("/packages/upgrade"),
    onSuccess: () => {
      refetch();
      toast({ title: "System updated", variant: "success" } as { title: string; variant: "success" });
    },
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => refetch()} loading={isLoading}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
        </Button>
        <Button variant="outline" size="sm" onClick={() => updateAllMutation.mutate()} loading={updateAllMutation.isPending}>
          <Upload className="w-3.5 h-3.5 mr-1" /> Update All
        </Button>
      </div>

      <Tabs defaultValue="installed">
        <TabsList>
          <TabsTrigger value="installed">Installed</TabsTrigger>
          <TabsTrigger value="search">Search & Install</TabsTrigger>
        </TabsList>

        <TabsContent value="installed" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-280px)]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card border-b border-border">
                    <tr>
                      <th className="text-left px-4 py-2 text-muted-foreground font-medium text-xs">Package</th>
                      <th className="text-left px-4 py-2 text-muted-foreground font-medium text-xs">Version</th>
                      <th className="text-left px-4 py-2 text-muted-foreground font-medium text-xs hidden md:table-cell">Description</th>
                      <th className="w-16 px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading
                      ? Array.from({ length: 10 }).map((_, i) => (
                          <tr key={i} className="border-b border-border/50">
                            {Array.from({ length: 4 }).map((_, j) => (
                              <td key={j} className="px-4 py-2"><div className="h-4 bg-muted rounded animate-pulse" /></td>
                            ))}
                          </tr>
                        ))
                      : (installed?.items ?? []).map((pkg: { name: string; version: string; description: string }) => (
                          <tr key={pkg.name} className="border-b border-border/50 hover:bg-secondary/20">
                            <td className="px-4 py-2 font-medium font-mono">{pkg.name}</td>
                            <td className="px-4 py-2 text-muted-foreground text-xs">{pkg.version}</td>
                            <td className="px-4 py-2 text-muted-foreground hidden md:table-cell truncate max-w-xs">{pkg.description}</td>
                            <td className="px-4 py-2">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => confirm(`Remove ${pkg.name}?`) && removeMutation.mutate(pkg.name)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                    {(!isLoading && !installed?.items?.length) && (
                      <tr>
                        <td colSpan={4} className="text-center py-12 text-muted-foreground">
                          No packages found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="search" className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search apt packages…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-8"
              />
            </div>
            <Button onClick={handleSearch} loading={searching}>
              <Search className="w-3.5 h-3.5 mr-1" /> Search
            </Button>
          </div>

          {searchResults.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <ScrollArea className="h-96">
                  <div className="divide-y divide-border">
                    {searchResults.map((pkg) => (
                      <div key={pkg.name} className="flex items-center justify-between px-4 py-3 hover:bg-secondary/20">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-mono font-medium text-sm">{pkg.name}</p>
                            {pkg.installed && <Badge variant="success" className="text-[10px]">Installed</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{pkg.description}</p>
                        </div>
                        <div className="flex items-center gap-2 ml-2 shrink-0">
                          <span className="text-xs text-muted-foreground">{pkg.version}</span>
                          {!pkg.installed && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => installMutation.mutate(pkg.name)}
                              loading={installMutation.isPending && installMutation.variables === pkg.name}
                            >
                              <Download className="w-3.5 h-3.5 mr-1" /> Install
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
