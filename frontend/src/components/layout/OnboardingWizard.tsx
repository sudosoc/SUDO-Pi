import { useState, useEffect } from "react";
import { Zap, Wifi, CheckCircle2 } from "lucide-react";
import { apiClient } from "@/api/client";
import { useQuery } from "@tanstack/react-query";
import type { SystemStats } from "@/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isDone(): boolean {
  try {
    return localStorage.getItem("onboarding-done") === "true";
  } catch {
    return false;
  }
}

function markDone() {
  try {
    localStorage.setItem("onboarding-done", "true");
  } catch {
    // ignore
  }
}

// ─── Progress dots ─────────────────────────────────────────────────────────

function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={
            i <= current
              ? "w-2 h-2 rounded-full bg-primary transition-colors"
              : "w-2 h-2 rounded-full bg-border transition-colors"
          }
        />
      ))}
    </div>
  );
}

// ─── Step 1 — Welcome ─────────────────────────────────────────────────────

function StepWelcome({
  hostname,
  onNext,
}: {
  hostname: string | undefined;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-4">
      <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
        <Zap className="w-8 h-8 text-primary" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-foreground">Welcome to SUDO-Pi</h2>
        {hostname && (
          <p className="text-xs text-muted-foreground mt-1 font-mono">{hostname}</p>
        )}
      </div>
      <p className="text-sm text-muted-foreground max-w-xs">
        Your Raspberry Pi management dashboard is ready. Let's take a moment to
        set things up.
      </p>
      <button
        onClick={onNext}
        className="mt-2 px-6 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        Get Started →
      </button>
    </div>
  );
}

// ─── Step 2 — Change Password ────────────────────────────────────────────

function StepPassword({ onNext }: { onNext: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 4) {
      setError("Password must be at least 4 characters.");
      return;
    }

    setLoading(true);
    try {
      await apiClient.put("/users/me/password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setSuccess(true);
      setTimeout(() => onNext(), 1500);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to update password.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <h2 className="text-xl font-bold text-foreground">Secure your dashboard</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Set a new admin password to protect access.
        </p>
      </div>

      {success ? (
        <div className="flex flex-col items-center gap-2 py-4">
          <CheckCircle2 className="w-10 h-10 text-green-400" />
          <p className="text-sm text-green-400 font-medium">Password updated!</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
          />
          <input
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
          />

          {error && (
            <p className="text-xs text-red-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Updating…" : "Update Password"}
          </button>
        </form>
      )}

      <button
        onClick={onNext}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors text-center mt-1"
      >
        Skip for now
      </button>
    </div>
  );
}

// ─── Step 3 — Network Info ────────────────────────────────────────────────

function StepNetwork({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center text-center gap-4">
      <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
        <Wifi className="w-8 h-8 text-primary" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-foreground">Network is configured</h2>
      </div>
      <p className="text-sm text-muted-foreground max-w-xs">
        Your Pi is broadcasting a WiFi access point. Connect devices to the
        SUDO-Pi network and they'll reach this dashboard at{" "}
        <span className="font-mono text-foreground">sudo.local</span> or{" "}
        <span className="font-mono text-foreground">192.168.4.1</span>.
      </p>
      <div className="px-4 py-2 rounded-lg bg-background border border-border font-mono text-sm text-primary">
        192.168.4.1
      </div>
      <button
        onClick={onNext}
        className="mt-2 px-6 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        Continue →
      </button>
    </div>
  );
}

// ─── Step 4 — Ready ───────────────────────────────────────────────────────

function StepReady({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="flex flex-col items-center text-center gap-4">
      <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center">
        <CheckCircle2 className="w-8 h-8 text-green-400" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-foreground">Setup complete!</h2>
      </div>
      <p className="text-sm text-muted-foreground max-w-xs">
        Your SUDO-Pi dashboard is fully operational. Explore the menu to manage
        your system.
      </p>
      <button
        onClick={onFinish}
        className="mt-2 px-6 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        Start exploring →
      </button>
    </div>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────

export function OnboardingWizard() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!isDone()) setVisible(true);
  }, []);

  const { data: systemStats } = useQuery<SystemStats>({
    queryKey: ["system-stats-onboarding"],
    queryFn: async () => {
      const res = await apiClient.get<SystemStats>("/system/stats");
      return res.data;
    },
    enabled: visible,
    staleTime: 60_000,
  });

  const close = () => {
    markDone();
    setVisible(false);
  };

  if (!visible) return null;

  const TOTAL_STEPS = 4;

  return (
    <div className="fixed inset-0 bg-background/70 backdrop-blur-md z-[60] flex items-center justify-center p-4">
      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl p-8 shadow-2xl">
        {/* Skip button */}
        <button
          onClick={close}
          className="absolute top-4 right-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip setup
        </button>

        {/* Step counter */}
        <p className="text-xs text-muted-foreground text-center mb-2">
          Step {step + 1} of {TOTAL_STEPS}
        </p>

        {/* Progress dots */}
        <ProgressDots total={TOTAL_STEPS} current={step} />

        {/* Step content */}
        {step === 0 && (
          <StepWelcome
            hostname={systemStats?.hostname}
            onNext={() => setStep(1)}
          />
        )}
        {step === 1 && <StepPassword onNext={() => setStep(2)} />}
        {step === 2 && <StepNetwork onNext={() => setStep(3)} />}
        {step === 3 && <StepReady onFinish={close} />}
      </div>
    </div>
  );
}
