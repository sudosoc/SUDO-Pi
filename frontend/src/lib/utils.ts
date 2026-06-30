import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(" ");
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function dbmToPercent(dbm: number): number {
  if (dbm <= -100) return 0;
  if (dbm >= -50) return 100;
  return 2 * (dbm + 100);
}

export function dbmToQuality(dbm: number): "excellent" | "good" | "fair" | "poor" {
  const pct = dbmToPercent(dbm);
  if (pct >= 75) return "excellent";
  if (pct >= 50) return "good";
  if (pct >= 25) return "fair";
  return "poor";
}

export function getTemperatureColor(celsius: number): string {
  if (celsius < 50) return "text-success";
  if (celsius < 65) return "text-warning";
  if (celsius < 80) return "text-orange-500";
  return "text-destructive";
}

export function cpuColorClass(percent: number): string {
  if (percent < 50) return "text-success";
  if (percent < 75) return "text-warning";
  return "text-destructive";
}

export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + "…";
}
