import ReactECharts from "echarts-for-react";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/hooks/useCountUp";

interface MetricGaugeProps {
  value: number;
  label: string;
  unit?: string;
  subtitle?: string;
  colorThresholds?: { value: number; color: string }[];
  className?: string;
}

function getColor(
  value: number,
  thresholds: { value: number; color: string }[]
): string {
  const sorted = [...thresholds].sort((a, b) => b.value - a.value);
  for (const t of sorted) {
    if (value >= t.value) return t.color;
  }
  return thresholds[0]?.color ?? "#06b6d4";
}

const DEFAULT_THRESHOLDS = [
  { value: 0, color: "#22c55e" },
  { value: 50, color: "#f59e0b" },
  { value: 80, color: "#ef4444" },
];

export function MetricGauge({
  value,
  label,
  unit = "%",
  subtitle,
  colorThresholds = DEFAULT_THRESHOLDS,
  className,
}: MetricGaugeProps) {
  const animatedValue = useCountUp(value);
  const color = getColor(value, colorThresholds);

  const option = {
    animation: false,
    series: [
      {
        type: "gauge",
        startAngle: 220,
        endAngle: -40,
        min: 0,
        max: 100,
        splitNumber: 0,
        radius: "90%",
        axisLine: {
          lineStyle: {
            width: 8,
            color: [
              [animatedValue / 100, color],
              [1, "rgba(255,255,255,0.08)"],
            ],
          },
        },
        pointer: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        detail: {
          valueAnimation: false,
          formatter: `{value}${unit}`,
          color: "#f1f5f9",
          fontSize: 18,
          fontWeight: "bold",
          fontFamily: "Inter",
          offsetCenter: [0, "5%"],
        },
        title: {
          show: true,
          color: "#94a3b8",
          fontSize: 11,
          fontFamily: "Inter",
          offsetCenter: [0, "35%"],
        },
        data: [{ value: Math.round(animatedValue), name: label }],
      },
    ],
    backgroundColor: "transparent",
  };

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <ReactECharts
        option={option}
        style={{ height: 120, width: 120 }}
        opts={{ renderer: "svg" }}
      />
      {subtitle && (
        <p className="text-xs text-muted-foreground text-center mt-1">{subtitle}</p>
      )}
    </div>
  );
}
