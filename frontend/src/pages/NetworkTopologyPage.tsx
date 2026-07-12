import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Share2, RefreshCw } from "lucide-react";
import ReactECharts from "echarts-for-react";
import { apiClient } from "@/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TopologyData {
  nodes: {
    id: string;
    name: string;
    ip: string;
    mac?: string;
    vendor?: string;
    category: number;
    symbolSize: number;
    type: string;
  }[];
  links: { source: string; target: string }[];
  categories: { name: string }[];
}

const CATEGORY_COLORS = [
  "#9461f6", // 0 gateway - violet
  "#38bdf8", // 1 device  - sky
  "#94a3b8", // 2 apple   - slate
  "#34d399", // 3 mobile  - emerald
  "#fb923c", // 4 computer- orange
];

export default function NetworkTopologyPage() {
  const chartRef = useRef<ReactECharts>(null);

  const { data, isLoading, isError, isFetching, refetch } = useQuery<TopologyData>({
    queryKey: ["network-topology"],
    queryFn: async () => {
      const { data } = await apiClient.get<TopologyData>("/network-scanner/topology");
      return data;
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const nodes = data?.nodes ?? [];
  const links = data?.links ?? [];
  const categories = data?.categories ?? [];

  const option = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      backgroundColor: "hsl(262 50% 4.5%)",
      borderColor: "hsl(262 26% 11%)",
      textStyle: { color: "#e2e0f7", fontSize: 12 },
      formatter: (params: { dataType: string; data: TopologyData["nodes"][number] & TopologyData["links"][number] }) => {
        if (params.dataType !== "node") return "";
        const d = params.data as TopologyData["nodes"][number];
        const lines = [
          `<b style="color:#9461f6">${d.name}</b>`,
          d.ip ? `<span style="color:#94a3b8">IP: ${d.ip}</span>` : "",
          d.mac ? `<span style="color:#64748b">MAC: ${d.mac}</span>` : "",
          d.vendor ? `<span style="color:#64748b">${d.vendor}</span>` : "",
        ].filter(Boolean);
        return lines.join("<br/>");
      },
    },
    legend: {
      show: true,
      data: categories.map((c) => c.name),
      bottom: 8,
      textStyle: { color: "#94a3b8", fontSize: 11 },
      itemWidth: 10,
      itemHeight: 10,
    },
    series: [
      {
        type: "graph",
        layout: "force",
        roam: true,
        animation: true,
        animationDuration: 600,
        force: {
          repulsion: 220,
          edgeLength: [80, 180],
          gravity: 0.15,
          layoutAnimation: true,
        },
        categories: categories.map((c, i) => ({
          name: c.name,
          itemStyle: { color: CATEGORY_COLORS[i] ?? "#94a3b8" },
        })),
        data: nodes.map((n) => ({
          ...n,
          label: {
            show: true,
            position: "bottom",
            fontSize: 10,
            color: "#c4c0e0",
            formatter: n.name.length > 16 ? n.name.slice(0, 14) + "…" : n.name,
          },
          itemStyle: {
            color: CATEGORY_COLORS[n.category] ?? "#94a3b8",
            borderColor: "hsl(262 26% 11%)",
            borderWidth: n.type === "gateway" ? 3 : 1.5,
            shadowBlur: n.type === "gateway" ? 16 : 6,
            shadowColor: CATEGORY_COLORS[n.category] ?? "#94a3b8",
          },
        })),
        links: links.map((l) => ({
          ...l,
          lineStyle: {
            color: "hsl(262 26% 18%)",
            width: 1.5,
            curveness: 0,
          },
        })),
        lineStyle: { color: "source", curveness: 0.1 },
        emphasis: {
          focus: "adjacency",
          lineStyle: { width: 2.5, color: "#9461f6" },
        },
      },
    ],
  };

  return (
    <div className="p-6 space-y-6 page-transition">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Share2 className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">Network Topology</h2>
            <p className="text-sm text-muted-foreground">
              Live force-directed graph of devices connected to the Pi.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground/60">
            {nodes.length - 1} device{nodes.length !== 2 ? "s" : ""}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Graph */}
      <Card className="border-border/50">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="h-[520px] flex items-center justify-center">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground/40" />
            </div>
          ) : isError ? (
            <div className="h-[520px] flex flex-col items-center justify-center gap-3">
              <Share2 className="w-8 h-8 text-destructive/40" />
              <p className="text-sm text-muted-foreground/60">Failed to load topology data.</p>
              <p className="text-xs text-muted-foreground/40">Network scanner may not be running. Try refreshing.</p>
              <button onClick={() => refetch()} className="text-xs text-primary hover:underline mt-1">Retry</button>
            </div>
          ) : nodes.length <= 1 ? (
            <div className="h-[520px] flex flex-col items-center justify-center gap-3">
              <Share2 className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground/60">No devices detected on the AP network.</p>
              <p className="text-xs text-muted-foreground/40">
                Connect a device via Wi-Fi to see it appear here.
              </p>
            </div>
          ) : (
            <ReactECharts
              ref={chartRef}
              option={option}
              style={{ height: "520px", width: "100%" }}
              notMerge
              lazyUpdate
            />
          )}
        </CardContent>
      </Card>

      {/* Legend / device list */}
      {nodes.length > 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {nodes.filter((n) => n.type !== "gateway").map((n) => (
            <div
              key={n.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border/50 bg-card/60"
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{
                  background: CATEGORY_COLORS[n.category] ?? "#94a3b8",
                  boxShadow: `0 0 6px ${CATEGORY_COLORS[n.category] ?? "#94a3b8"}88`,
                }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{n.name}</p>
                <p className="text-[10px] font-mono text-muted-foreground/60 truncate">{n.ip}</p>
              </div>
              {n.vendor && (
                <span className="text-[10px] text-muted-foreground/50 shrink-0 max-w-[80px] truncate">
                  {n.vendor}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground/40">
        Drag nodes to rearrange. Scroll to zoom. Click a node to highlight its connections.
        Updates every 30 seconds.
      </p>
    </div>
  );
}
