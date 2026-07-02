import { useState } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";
import { useToast, type ToasterToast } from "./use-toast";
import {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastProgress,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "./toast";

const TOAST_DURATION = 5000;

const VARIANT_ICONS: Record<string, { Icon: LucideIcon; className: string }> = {
  default: { Icon: Info, className: "text-info" },
  success: { Icon: CheckCircle2, className: "text-success" },
  destructive: { Icon: XCircle, className: "text-destructive" },
  warning: { Icon: AlertTriangle, className: "text-warning" },
};

function ToastItem({ toast: t }: { toast: ToasterToast }) {
  const { id: _id, title, description, action, variant, duration, ...props } = t;
  const [paused, setPaused] = useState(false);
  const lifetime = duration ?? TOAST_DURATION;
  const { Icon, className: iconClass } = VARIANT_ICONS[variant ?? "default"] ?? VARIANT_ICONS.default;

  return (
    <Toast
      variant={variant}
      duration={lifetime}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      {...props}
    >
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconClass}`} aria-hidden="true" />
        <div className="grid gap-1">
          {title && <ToastTitle>{title}</ToastTitle>}
          {description && <ToastDescription>{description}</ToastDescription>}
        </div>
      </div>
      {action && (
        <ToastAction altText={action.label} onClick={action.onClick}>
          {action.label}
        </ToastAction>
      )}
      <ToastClose />
      <ToastProgress duration={lifetime} paused={paused} variant={variant} />
    </Toast>
  );
}

export function Toaster() {
  const { toasts } = useToast();
  return (
    <ToastProvider duration={TOAST_DURATION}>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
