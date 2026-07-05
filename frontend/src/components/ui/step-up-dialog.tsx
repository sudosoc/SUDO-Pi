import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ShieldCheck, KeyRound, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ---------------------------------------------------------------------------
// StepUpDialog — dual-factor confirmation for OS-level actions.
// Collects the caller's dashboard password AND the Pi's root password before
// a sensitive operation (managing Linux users, changing your own password).
// ---------------------------------------------------------------------------

export interface StepUpResult {
  dashboard_password: string;
  system_password: string;
}

export interface StepUpOptions {
  title?: string;
  description?: string;
  confirmLabel?: string;
}

interface StepUpDialogProps extends StepUpOptions {
  open: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (result: StepUpResult) => void;
}

function StepUpDialog({
  open,
  loading,
  title = "Confirm your identity",
  description = "This action affects the Pi's operating system. Enter your dashboard password and the Pi's root password to continue.",
  confirmLabel = "Verify and continue",
  onCancel,
  onConfirm,
}: StepUpDialogProps) {
  const [dashboardPw, setDashboardPw] = useState("");
  const [systemPw, setSystemPw] = useState("");

  useEffect(() => {
    if (open) {
      setDashboardPw("");
      setSystemPw("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;

  const disabled = !dashboardPw || !systemPw;
  const submit = () => {
    if (!disabled && !loading) {
      onConfirm({ dashboard_password: dashboardPw, system_password: systemPw });
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-background/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="page-transition max-w-sm w-full rounded-2xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center bg-primary/15 text-primary">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        <div className="mt-5 space-y-3">
          <div>
            <label className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
              <KeyRound className="w-3.5 h-3.5" /> Dashboard password
            </label>
            <Input
              type="password"
              autoFocus
              value={dashboardPw}
              onChange={(e) => setDashboardPw(e.target.value)}
              placeholder="Your dashboard login password"
              autoComplete="current-password"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
              <Terminal className="w-3.5 h-3.5" /> Pi root password
            </label>
            <Input
              type="password"
              value={systemPw}
              onChange={(e) => setSystemPw(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="The root account password on the Pi"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={submit} disabled={disabled} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// useStepUp — promise-based hook. Resolves the two passwords, or null on cancel.
// The caller runs the request, and can call setError-free retry by re-invoking.
// ---------------------------------------------------------------------------

export function useStepUp(): {
  stepUp: (opts?: StepUpOptions) => Promise<StepUpResult | null>;
  dialog: ReactNode;
  close: () => void;
  setLoading: (v: boolean) => void;
} {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [opts, setOpts] = useState<StepUpOptions>({});
  const resolverRef = useRef<((value: StepUpResult | null) => void) | null>(null);

  const stepUp = useCallback((options: StepUpOptions = {}): Promise<StepUpResult | null> => {
    if (resolverRef.current) {
      resolverRef.current(null);
      resolverRef.current = null;
    }
    setOpts(options);
    setOpen(true);
    setLoading(false);
    return new Promise<StepUpResult | null>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((value: StepUpResult | null) => {
    if (value === null) {
      setOpen(false);
      setLoading(false);
    }
    if (resolverRef.current) {
      resolverRef.current(value);
      resolverRef.current = null;
    }
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setLoading(false);
  }, []);

  const dialog: ReactNode = (
    <StepUpDialog
      open={open}
      loading={loading}
      title={opts.title}
      description={opts.description}
      confirmLabel={opts.confirmLabel}
      onCancel={() => settle(null)}
      onConfirm={(result) => {
        setLoading(true);
        settle(result);
      }}
    />
  );

  return { stepUp, dialog, close, setLoading };
}
