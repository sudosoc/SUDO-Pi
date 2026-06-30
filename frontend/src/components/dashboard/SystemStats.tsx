import { Cpu, HardDrive, MemoryStick, Thermometer } from "lucide-react";
import { useSystemStore } from "@/stores/systemStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { MetricGauge } from "./MetricGauge";
import { SparklineChart } from "./SparklineChart";
import { formatBytes, formatUptime, getTemperatureColor, cpuColorClass } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

function MetricSkeleton() {
  return (
    <Card>
      <CardHeader><Skeleton className="h-4 w-24" /></CardHeader>
      <CardContent><Skeleton className="h-24 w-full" /></CardContent>
    </Card>
  );
}

export function SystemStats() {
  const { stats, cpuHistory, ramHistory } = useSystemStore();

  if (!stats) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <MetricSkeleton key={i} />)}
      </div>
    );
  }

  const { cpu, memory, temperature, disks, uptime_seconds } = stats;
  const primaryDisk = disks.find((d) => d.mountpoint === "/") ?? disks[0];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5" /> CPU
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-end justify-between">
            <span className={cn("text-2xl font-bold tabular-nums", cpuColorClass(cpu.percent))}>
              {cpu.percent.toFixed(0)}%
            </span>
            <span className="text-xs text-muted-foreground">{cpu.frequency_mhz.toFixed(0)} MHz</span>
          </div>
          <Progress
            value={cpu.percent}
            className="h-1.5"
            indicatorClassName={cpu.percent > 80 ? "bg-destructive" : cpu.percent > 50 ? "bg-warning" : "bg-success"}
          />
          <SparklineChart data={cpuHistory} color="#06b6d4" height={36} />
          <div className="grid grid-cols-3 gap-1 text-xs text-muted-foreground">
            <div>
              <span className="block text-foreground font-medium">{cpu.load_avg_1.toFixed(1)}</span>
              <span>1m</span>
            </div>
            <div>
              <span className="block text-foreground font-medium">{cpu.load_avg_5.toFixed(1)}</span>
              <span>5m</span>
            </div>
            <div>
              <span className="block text-foreground font-medium">{cpu.core_count}</span>
              <span>cores</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <MemoryStick className="w-3.5 h-3.5" /> RAM
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-end justify-between">
            <span className={cn("text-2xl font-bold tabular-nums", cpuColorClass(memory.percent))}>
              {memory.percent.toFixed(0)}%
            </span>
            <span className="text-xs text-muted-foreground">
              {formatBytes(memory.used_bytes)} / {formatBytes(memory.total_bytes)}
            </span>
          </div>
          <Progress
            value={memory.percent}
            className="h-1.5"
            indicatorClassName={memory.percent > 85 ? "bg-destructive" : memory.percent > 65 ? "bg-warning" : "bg-primary"}
          />
          <SparklineChart data={ramHistory} color="#a855f7" height={36} />
          <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
            <div>
              <span className="block text-foreground font-medium">{formatBytes(memory.available_bytes)}</span>
              <span>available</span>
            </div>
            <div>
              <span className="block text-foreground font-medium">{formatBytes(memory.swap_used_bytes)}</span>
              <span>swap</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <Thermometer className="w-3.5 h-3.5" /> Temperature
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center pt-2">
          <MetricGauge
            value={temperature.cpu ?? 0}
            label="CPU"
            unit="°C"
            colorThresholds={[
              { value: 0, color: "#22c55e" },
              { value: 55, color: "#f59e0b" },
              { value: 70, color: "#ef4444" },
            ]}
            subtitle={
              temperature.cpu
                ? `${temperature.cpu.toFixed(1)}°C`
                : "No sensor"
            }
          />
          {temperature.gpu !== null && (
            <div className="text-xs text-muted-foreground mt-2">
              GPU: <span className={cn("font-medium", getTemperatureColor(temperature.gpu))}>
                {temperature.gpu.toFixed(1)}°C
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5" /> Disk
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(primaryDisk ? [primaryDisk, ...disks.filter((d) => d !== primaryDisk)] : disks)
            .slice(0, 3)
            .map((disk) => (
              <div key={disk.mountpoint} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground font-medium truncate max-w-[60%]">{disk.mountpoint}</span>
                  <span className="text-muted-foreground">{disk.percent.toFixed(0)}%</span>
                </div>
                <Progress
                  value={disk.percent}
                  className="h-1"
                  indicatorClassName={disk.percent > 90 ? "bg-destructive" : disk.percent > 75 ? "bg-warning" : "bg-primary"}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{formatBytes(disk.used_bytes)}</span>
                  <span>{formatBytes(disk.total_bytes)}</span>
                </div>
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}
