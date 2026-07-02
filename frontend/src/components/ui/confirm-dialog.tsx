import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ---------------------------------------------------------------------------
// ConfirmDialog — unified confirmation dialog for destructive actions
// ---------------------------------------------------------------------------

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** e.g. "Reboot the Pi?" */
  title: string;
  /** Consequences explanation */
  description?: string;
  /** Default "Confirm" */
  confirmLabel?: string;
  /** Default "danger" */
  severity?: "danger" | "critical";
  /** If set (e.g. "CONFIRM"), user must type it exactly — forces critical behavior */
  typeToConfirm?: string;
  /** Shows spinner on confirm button */
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  severity = "danger",
  typeToConfirm,
  loading,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");

  // Reset the typed input whenever `open` changes
  useEffect(() => {
    setTyped("");
  }, [open]);

  // Escape closes
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const isCritical = severity === "critical" || !!typeToConfirm;
  const confirmDisabled = !!typeToConfirm && typed !== typeToConfirm;

  return (
    <div
      className="fixed inset-0 z-[70] bg-background/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="page-transition max-w-sm w-full rounded-2xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center gap-3">
          <div
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center",
              isCritical
                ? "bg-destructive/15 text-destructive"
                : "bg-warning/15 text-warning"
            )}
          >
            {isCritical ? (
              <ShieldAlert className="w-6 h-6" />
            ) : (
              <AlertTriangle className="w-6 h-6" />
            )}
          </div>
          <h3 className="text-base font-semibold">{title}</h3>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>

        {typeToConfirm && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-mono text-muted-foreground text-center">
              Type <b className="text-foreground">{typeToConfirm}</b> to proceed
            </p>
            <Input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !confirmDisabled && !loading) {
                  e.preventDefault();
                  onConfirm();
                }
              }}
              placeholder={typeToConfirm}
              className="font-mono text-center border-destructive/50 focus-visible:ring-destructive"
            />
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            onClick={onConfirm}
            disabled={confirmDisabled}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// useConfirm — promise-based convenience hook
// ---------------------------------------------------------------------------

export type ConfirmOptions = Omit<
  ConfirmDialogProps,
  "open" | "onClose" | "onConfirm"
>;

export function useConfirm(): {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  dialog: ReactNode;
} {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    // If a dialog is somehow already pending, resolve it as cancelled first
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
    setOpts(options);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    setOpen(false);
    if (resolverRef.current) {
      resolverRef.current(value);
      resolverRef.current = null;
    }
  }, []);

  const dialog: ReactNode = opts ? (
    <ConfirmDialog
      open={open}
      onClose={() => settle(false)}
      onConfirm={() => settle(true)}
      title={opts.title}
      description={opts.description}
      confirmLabel={opts.confirmLabel}
      severity={opts.severity}
      typeToConfirm={opts.typeToConfirm}
      loading={opts.loading}
    />
  ) : null;

  return { confirm, dialog };
}
