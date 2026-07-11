import { useEffect, useRef, useState } from "react";
import { useSystemStore } from "@/stores/systemStore";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/hooks/useCountUp";

function fmtSpeed(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB/s`;
  return `${bytes.toFixed(0)} B/s`;
}

function Metric({ label, value, color, glow }: { label: string; value: string; color: string; glow?: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-muted-foreground/50 text-[10px] uppercase tracking-wide font-medium">{label}</span>
      <span
        className={cn("font-mono font-semibold tabular-nums text-[11px]", color)}
        style={glow ? { textShadow: `0 0 10px ${glow}` } : undefined}
      >
        {value}
      </span>
    </span>
  );
}

function Dot() {
  return <span className="w-0.5 h-0.5 rounded-full bg-border/80" />;
}

export function StatusBar() {
  const { stats } = useSystemStore();

  const prevRxRef = useRef<number | null>(null);
  const prevTxRef = useRef<number | null>(null);
  const [rxSpeed, setRxSpeed] = useState<number | null>(null);
  const [txSpeed, setTxSpeed] = useState<number | null>(null);

  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString("en-GB", { hour12: false })
  );

  useEffect(() => {
    const id = setInterval(() => {
      setTime(new Date().toLocaleTimeString("en-GB", { hour12: false }));
      const s = useSystemStore.getState().stats;
      if (s) {
        const iface = s.network_interfaces.find((i) => i.name !== "lo");
        if (iface) {
          if (prevRxRef.current !== null && prevTxRef.current !== null) {
            setRxSpeed(Math.max(0, iface.bytes_recv - prevRxRef.current));
            setTxSpeed(Math.max(0, iface.bytes_sent - prevTxRef.current));
          }
          prevRxRef.current = iface.bytes_recv;
          prevTxRef.current = iface.bytes_sent;
        }
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (stats && prevRxRef.current === null) {
      const iface = stats.network_interfaces.find((i) => i.name !== "lo");
      if (iface) {
        prevRxRef.current = iface.bytes_recv;
        prevTxRef.current = iface.bytes_sent;
      }
    }
  }, [stats]);

  const cpu  = stats?.cpu.percent ?? null;
  const ram  = stats?.memory.percent ?? null;
  const temp = stats?.temperature.cpu ?? null;

  const animCpu  = useCountUp(cpu  ?? 0);
  const animRam  = useCountUp(ram  ?? 0);
  const animTemp = useCountUp(temp ?? 0);

  const cpuColor  = cpu  === null ? "text-muted-foreground/40" : cpu  > 80 ? "text-red-400"    : cpu  > 50 ? "text-amber-400" : "text-emerald-400";
  const ramColor  = ram  === null ? "text-muted-foreground/40" : ram  > 85 ? "text-red-400"    : ram  > 65 ? "text-amber-400" : "text-violet-400";
  const tempColor = temp === null ? "text-muted-foreground/40" : temp > 70 ? "text-red-400"    : temp > 55 ? "text-amber-400" : "text-cyan-400";

  const cpuGlow  = cpu  !== null && cpu  > 80 ? "rgba(239,68,68,0.5)"  : undefined;
  const tempGlow = temp !== null && temp > 70 ? "rgba(239,68,68,0.5)"  : undefined;

  return (
    <div className="h-6 flex items-center px-4 gap-3 border-t border-border/40 bg-popover/60 backdrop-blur text-[10.5px] font-mono shrink-0">
      {/* Left: metrics */}
      <div className="flex items-center gap-3">
        <Metric label="CPU"  value={cpu  !== null ? `${Math.round(animCpu)}%`  : "—"} color={cpuColor}  glow={cpuGlow} />
        <Dot />
        <Metric label="RAM"  value={ram  !== null ? `${Math.round(animRam)}%`  : "—"} color={ramColor} />
        <Dot />
        <Metric label="Temp" value={temp !== null ? `${Math.round(animTemp)}°C` : "—"} color={tempColor} glow={tempGlow} />
      </div>

      {/* Center: network */}
      <div className="hidden md:flex flex-1 items-center justify-center gap-3 text-muted-foreground/50">
        <span className="flex items-center gap-1">
          <span className="text-emerald-500/70">↓</span>
          <span className="text-muted-foreground/60">{rxSpeed !== null ? fmtSpeed(rxSpeed) : "—"}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="text-violet-400/70">↑</span>
          <span className="text-muted-foreground/60">{txSpeed !== null ? fmtSpeed(txSpeed) : "—"}</span>
        </span>
      </div>

      {/* Right: clock */}
      <div className="ml-auto text-muted-foreground/50 tabular-nums tracking-wide">{time}</div>
    </div>
  );
}
