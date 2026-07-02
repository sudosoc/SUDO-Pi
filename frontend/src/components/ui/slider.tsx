import * as React from "react";
import { cn } from "@/lib/utils";

interface SliderProps {
  value?: number[];
  defaultValue?: number[];
  onValueChange?: (value: number[]) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
}

const Slider = React.forwardRef<HTMLDivElement, SliderProps>(
  (
    {
      value,
      defaultValue,
      onValueChange,
      min = 0,
      max = 100,
      step = 1,
      disabled = false,
      className,
    },
    ref,
  ) => {
    const [internalValue, setInternalValue] = React.useState<number[]>(
      defaultValue ?? [min],
    );
    const controlled = value !== undefined;
    const currentValues = controlled ? value! : internalValue;
    const trackRef = React.useRef<HTMLDivElement>(null);

    const clamp = (v: number) =>
      Math.min(max, Math.max(min, Math.round(v / step) * step));

    const getValueFromPosition = (clientX: number): number => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return currentValues[0];
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return clamp(min + ratio * (max - min));
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, index: number) => {
      if (disabled) return;
      e.currentTarget.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        const next = getValueFromPosition(ev.clientX);
        const updated = [...currentValues];
        updated[index] = next;
        if (!controlled) setInternalValue(updated);
        onValueChange?.(updated);
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };

    const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (disabled) return;
      const next = getValueFromPosition(e.clientX);
      // Move whichever thumb is closest
      const closest = currentValues.reduce(
        (acc, v, i) => (Math.abs(v - next) < Math.abs(currentValues[acc] - next) ? i : acc),
        0,
      );
      const updated = [...currentValues];
      updated[closest] = next;
      if (!controlled) setInternalValue(updated);
      onValueChange?.(updated);
    };

    const percent = (v: number) => ((v - min) / (max - min)) * 100;

    const sorted = [...currentValues].sort((a, b) => a - b);
    const rangeLeft = percent(sorted[0]);
    const rangeRight = sorted.length > 1 ? 100 - percent(sorted[sorted.length - 1]) : 100 - percent(sorted[0]);

    return (
      <div
        ref={ref}
        className={cn("relative flex w-full touch-none select-none items-center py-2", className)}
      >
        <div
          ref={trackRef}
          className="relative h-1.5 w-full grow cursor-pointer overflow-hidden rounded-full bg-secondary"
          onClick={handleTrackClick}
        >
          <div
            className="absolute h-full bg-primary"
            style={{
              left: `${rangeLeft}%`,
              right: `${rangeRight}%`,
            }}
          />
        </div>
        {currentValues.map((v, i) => (
          <div
            key={i}
            className={cn(
              "absolute block h-4 w-4 rounded-full border border-primary/50 bg-background shadow ring-0",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "transition-colors hover:border-primary",
              disabled ? "cursor-not-allowed opacity-50" : "cursor-grab active:cursor-grabbing",
            )}
            style={{ left: `calc(${percent(v)}% - 8px)` }}
            onPointerDown={(e) => handlePointerDown(e, i)}
            tabIndex={disabled ? -1 : 0}
            role="slider"
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={v}
            onKeyDown={(e) => {
              if (disabled) return;
              let next = v;
              if (e.key === "ArrowRight" || e.key === "ArrowUp") next = clamp(v + step);
              else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = clamp(v - step);
              else if (e.key === "Home") next = min;
              else if (e.key === "End") next = max;
              else return;
              e.preventDefault();
              const updated = [...currentValues];
              updated[i] = next;
              if (!controlled) setInternalValue(updated);
              onValueChange?.(updated);
            }}
          />
        ))}
      </div>
    );
  },
);
Slider.displayName = "Slider";

export { Slider };
