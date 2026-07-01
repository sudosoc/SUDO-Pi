import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Play, Square, RefreshCw, Trash2 } from "lucide-react";
import { apiClient } from "@/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/components/ui/use-toast";
import { formatBytes } from "@/lib/utils";

export default function DockerPage() {
  const queryClient = useQueryClient();

  const { data: containers, isLoading: loadingContainers, refetch: refetchContainers } = useQuery({
    queryKey: ["docker-containers"],
    queryFn: async () => {
      const { data } = await apiClient.get("/docker/containers");
      return data;
    },
    refetchInterval: 10000,
  });

  const { data: images, isLoading: loadingImages, refetch: refetchImages } = useQuery({
    queryKey: ["docker-images"],
    queryFn: async () => {
      const { data } = await apiClient.get("/docker/images");
      return data;
    },
  });

  const containerAction = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      apiClient.post(`/docker/containers/${id}/${action}`),
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ["docker-containers"] });
      toast({ title: `Container ${action}ed`, variant: "success" } as { title: string; variant: "success" });
    },
    onError: () => toast({ title: "Action failed", variant: "destructive" } as { title: string; variant: "destructive" }),
  });

  return (
    <div className="p-6 space-y-4">
      <Tabs defaultValue="containers">
        <TabsList>
          <TabsTrigger value="containers">Containers</TabsTrigger>
          <TabsTrigger value="images">Images</TabsTrigger>
        </TabsList>

        <TabsContent value="containers" className="mt-4">
          <div className="flex items-center gap-2 mb-4">
            <Button variant="outline" size="sm" onClick={() => refetchContainers()}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-280px)]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card border-b border-border">
                    <tr>
                      <th className="text-left px-4 py-2 text-muted-foreground font-medium text-xs">Name</th>
                      <th className="text-left px-4 py-2 text-muted-foreground font-medium text-xs">Image</th>
                      <th className="text-center px-4 py-2 text-muted-foreground font-medium text-xs">Status</th>
                      <th className="text-left px-4 py-2 text-muted-foreground font-medium text-xs hidden md:table-cell">Ports</th>
                      <th className="w-24 px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {loadingContainers
                      ? Array.from({ length: 5 }).map((_, i) => (
                          <tr key={i} className="border-b border-border/50">
                            {Array.from({ length: 5 }).map((_, j) => (
                              <td key={j} className="px-4 py-2"><div className="h-4 bg-muted rounded animate-pulse" /></td>
                            ))}
                          </tr>
                        ))
                      : (containers ?? []).map((c: { id: string; name: string; image: string; status: string; state: string; ports: string }) => (
                          <tr key={c.id} className="border-b border-border/50 hover:bg-secondary/20">
                            <td className="px-4 py-2 font-mono font-medium">{c.name.replace("/", "")}</td>
                            <td className="px-4 py-2 text-muted-foreground text-xs truncate max-w-[120px]">{c.image}</td>
                            <td className="px-4 py-2 text-center">
                              <Badge
                                variant={c.state === "running" ? "success" : c.state === "exited" ? "muted" : "warning"}
                                className="text-[10px]"
                              >
                                {c.state}
                              </Badge>
                            </td>
                            <td className="px-4 py-2 text-xs text-muted-foreground hidden md:table-cell font-mono">{c.ports}</td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-1">
                                {c.state !== "running" ? (
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    className="text-success hover:text-success hover:bg-success/10 h-7 w-7"
                                    onClick={() => containerAction.mutate({ id: c.id, action: "start" })}
                                  >
                                    <Play className="w-3 h-3" />
                                  </Button>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    className="text-warning hover:text-warning hover:bg-warning/10 h-7 w-7"
                                    onClick={() => containerAction.mutate({ id: c.id, action: "stop" })}
                                  >
                                    <Square className="w-3 h-3" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="h-7 w-7"
                                  onClick={() => containerAction.mutate({ id: c.id, action: "restart" })}
                                >
                                  <RefreshCw className="w-3 h-3" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    {(!loadingContainers && !containers?.length) && (
                      <tr>
                        <td colSpan={5} className="text-center py-12 text-muted-foreground">No containers</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="images" className="mt-4">
          <div className="flex items-center gap-2 mb-4">
            <Button variant="outline" size="sm" onClick={() => refetchImages()}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-280px)]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card border-b border-border">
                    <tr>
                      <th className="text-left px-4 py-2 text-muted-foreground font-medium text-xs">Repository</th>
                      <th className="text-left px-4 py-2 text-muted-foreground font-medium text-xs">Tag</th>
                      <th className="text-right px-4 py-2 text-muted-foreground font-medium text-xs">Size</th>
                      <th className="w-12 px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {loadingImages
                      ? Array.from({ length: 5 }).map((_, i) => (
                          <tr key={i} className="border-b border-border/50">
                            {Array.from({ length: 4 }).map((_, j) => (
                              <td key={j} className="px-4 py-2"><div className="h-4 bg-muted rounded animate-pulse" /></td>
                            ))}
                          </tr>
                        ))
                      : (images ?? []).map((img: { id: string; repo_tags: string[]; size: number }) => {
                          const tag = img.repo_tags?.[0] ?? "<none>";
                          const [repo, tagPart] = tag.split(":");
                          return (
                            <tr key={img.id} className="border-b border-border/50 hover:bg-secondary/20">
                              <td className="px-4 py-2 font-mono">{repo}</td>
                              <td className="px-4 py-2 text-muted-foreground text-xs">{tagPart ?? "latest"}</td>
                              <td className="px-4 py-2 text-right text-muted-foreground text-xs tabular-nums">{formatBytes(img.size)}</td>
                              <td className="px-4 py-2">
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 w-7"
                                  onClick={() => confirm("Remove this image?") && apiClient.delete(`/docker/images/${img.id}`).then(() => refetchImages())}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                    {(!loadingImages && !images?.length) && (
                      <tr>
                        <td colSpan={4} className="text-center py-12 text-muted-foreground">No images</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
