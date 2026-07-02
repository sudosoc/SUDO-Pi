import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const ToastProvider = ToastPrimitive.Provider;

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Viewport
    ref={ref}
    className={cn(
      "fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]",
      className
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitive.Viewport.displayName;

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-xl border border-border bg-popover p-4 pr-8 text-popover-foreground shadow-2xl transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-2 data-[state=open]:sm:slide-in-from-bottom-2",
  {
    variants: {
      variant: {
        default: "border-border",
        destructive: "border-destructive/40",
        success: "border-success/40",
        warning: "border-warning/40",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Root> & VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => (
  <ToastPrimitive.Root
    ref={ref}
    className={cn(toastVariants({ variant }), className)}
    {...props}
  />
));
Toast.displayName = ToastPrimitive.Root.displayName;

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Action
    ref={ref}
    className={cn(
      "inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-border bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
      className
    )}
    {...props}
  />
));
ToastAction.displayName = ToastPrimitive.Action.displayName;

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Close
    ref={ref}
    className={cn(
      "absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring group-hover:opacity-100",
      className
    )}
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" />
  </ToastPrimitive.Close>
));
ToastClose.displayName = ToastPrimitive.Close.displayName;

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Title ref={ref} className={cn("text-sm font-semibold", className)} {...props} />
));
ToastTitle.displayName = ToastPrimitive.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Description ref={ref} className={cn("text-sm opacity-90", className)} {...props} />
));
ToastDescription.displayName = ToastPrimitive.Description.displayName;

// ─── Auto-dismiss progress bar ────────────────────────────────────────────────
// A 2px bar pinned to the bottom of the toast that shrinks 100% → 0 over the
// toast's lifetime via a linear CSS width transition. When `paused` becomes
// true (hover) the current width is frozen; on resume the remaining width
// animates over the proportional remaining time — mirroring Radix's own
// pause/resume of the close timer.

const PROGRESS_COLOR: Record<string, string> = {
  default: "bg-info",
  destructive: "bg-destructive",
  success: "bg-success",
  warning: "bg-warning",
};

interface ToastProgressProps {
  /** Total lifetime of the toast in ms. */
  duration?: number;
  /** Freeze the bar (e.g. while the toast is hovered). */
  paused?: boolean;
  variant?: "default" | "destructive" | "success" | "warning" | null;
}

function ToastProgress({ duration = 5000, paused = false, variant }: ToastProgressProps) {
  const barRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = barRef.current;
    const track = el?.parentElement;
    if (!el || !track) return;

    const trackWidth = track.getBoundingClientRect().width;
    const pct = trackWidth > 0 ? (el.getBoundingClientRect().width / trackWidth) * 100 : 100;

    if (paused) {
      // Freeze at the current width.
      el.style.transition = "none";
      el.style.width = `${pct}%`;
    } else {
      // Pin the starting width, force a reflow so the browser registers it,
      // then animate the remaining distance over the remaining time.
      el.style.transition = "none";
      el.style.width = `${pct}%`;
      void el.getBoundingClientRect();
      const remaining = Math.max(0, duration * (pct / 100));
      el.style.transition = `width ${remaining}ms linear`;
      el.style.width = "0%";
    }
  }, [paused, duration]);

  return (
    <div aria-hidden="true" className="absolute bottom-0 left-0 right-0 h-0.5">
      <div
        ref={barRef}
        className={cn("h-full opacity-70", PROGRESS_COLOR[variant ?? "default"])}
        style={{ width: "100%" }}
      />
    </div>
  );
}

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>;
type ToastActionElement = React.ReactElement<typeof ToastAction>;

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
  ToastProgress,
};
