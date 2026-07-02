import { useEffect, useRef, useState } from "react";
import { useSystemStore } from "@/stores/systemStore";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/hooks/useCountUp";

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
  return `${bytes.toFixed(0)} B/s`;
}

function StatPill({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <span className="flex items-center gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold tabular-nums", color)}>{value}</span>
    </span>
  );
}

export function StatusBar() {
  const { stats } = useSystemStore();

  // Network speed calculation via delta
  const prevRxRef = useRef<number | null>(null);
  const prevTxRef = useRef<number | null>(null);
  const [rxSpeed, setRxSpeed] = useState<number | null>(null);
  const [txSpeed, setTxSpeed] = useState<number | null>(null);

  // Clock
  const [time, setTime] = useState(() => {
    const now = new Date();
    return now.toLocaleTimeString("en-GB", { hour12: false });
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date().toLocaleTimeString("en-GB", { hour12: false }));

      // Recompute network speed every second using latest store stats
      const currentStats = useSystemStore.getState().stats;
      if (currentStats) {
        const iface = currentStats.network_interfaces.find((i) => i.name !== "lo");
        if (iface) {
          const rx = iface.bytes_recv;
          const tx = iface.bytes_sent;
          if (prevRxRef.current !== null && prevTxRef.current !== null) {
            setRxSpeed(Math.max(0, rx - prevRxRef.current));
            setTxSpeed(Math.max(0, tx - prevTxRef.current));
          }
          prevRxRef.current = rx;
          prevTxRef.current = tx;
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Initialise refs when stats first arrive
  useEffect(() => {
    if (stats && prevRxRef.current === null) {
      const iface = stats.network_interfaces.find((i) => i.name !== "lo");
      if (iface) {
        prevRxRef.current = iface.bytes_recv;
        prevTxRef.current = iface.bytes_sent;
      }
    }
  }, [stats]);

  const cpu = stats?.cpu.percent ?? null;
  const ram = stats?.memory.percent ?? null;
  const temp = stats?.temperature.cpu ?? null;

  // Animated display values (hooks must run unconditionally; nulls fall back to 0)
  const animatedCpu = useCountUp(cpu ?? 0);
  const animatedRam = useCountUp(ram ?? 0);
  const animatedTemp = useCountUp(temp ?? 0);

  const cpuColor =
    cpu === null ? "text-muted-foreground"
    : cpu > 80 ? "text-red-400"
    : cpu > 50 ? "text-yellow-400"
    : "text-green-400";

  const ramColor =
    ram === null ? "text-muted-foreground"
    : ram > 85 ? "text-red-400"
    : ram > 65 ? "text-yellow-400"
    : "text-blue-400";

  const tempColor =
    temp === null ? "text-muted-foreground"
    : temp > 70 ? "text-red-400"
    : temp > 55 ? "text-yellow-400"
    : "text-cyan-400";

  return (
    <div className="h-7 flex items-center px-4 gap-4 bg-card/60 border-t border-border/70 text-[11px] font-mono shrink-0">
      {/* Left: stat pills */}
      <div className="flex items-center gap-3">
        <StatPill
          label="CPU"
          value={cpu !== null ? `${Math.round(animatedCpu)}%` : "—"}
          color={cpuColor}
        />
        <StatPill
          label="RAM"
          value={ram !== null ? `${Math.round(animatedRam)}%` : "—"}
          color={ramColor}
        />
        <StatPill
          label="Temp"
          value={temp !== null ? `${Math.round(animatedTemp)}°C` : "—"}
          color={tempColor}
        />
      </div>

      {/* Center: network speed — hidden on small screens */}
      <div className="hidden md:flex flex-1 items-center justify-center gap-3 text-muted-foreground">
        <span>
          <span className="text-green-400">↓</span>{" "}
          {rxSpeed !== null ? formatBytes(rxSpeed) : "—"}
        </span>
        <span>
          <span className="text-blue-400">↑</span>{" "}
          {txSpeed !== null ? formatBytes(txSpeed) : "—"}
        </span>
      </div>

      {/* Right: clock */}
      <div className="ml-auto text-muted-foreground tabular-nums">{time}</div>
    </div>
  );
}
