import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck, RefreshCw, AlertTriangle, CheckCircle2, Upload,
  KeyRound, Globe, RotateCcw, Copy, ChevronDown, ChevronUp,
} from "lucide-react";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CertInfo {
  subject: string;
  issuer: string;
  not_before: string;
  not_after: string;
  days_remaining: number;
  sans: string[];
  serial: string;
  fingerprint_sha256: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function expiryColor(days: number): string {
  if (days <= 7)  return "text-red-400";
  if (days <= 30) return "text-yellow-400";
  return "text-green-400";
}

function expiryBorder(days: number): string {
  if (days <= 7)  return "border-red-500/40";
  if (days <= 30) return "border-yellow-500/30";
  return "border-green-500/30";
}

function useToast() {
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  function toast(text: string, ok = true) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  }
  return { msg, toast };
}

// ─── Section: Cert Info ───────────────────────────────────────────────────────

function CertInfoCard({ cert, refetch, isFetching }: { cert: CertInfo; refetch: () => void; isFetching: boolean }) {
  const [showFingerprint, setShowFingerprint] = useState(false);
  const days = cert.days_remaining;

  function copyFp() {
    navigator.clipboard.writeText(cert.fingerprint_sha256);
  }

  return (
    <Card className={cn("border", expiryBorder(days))}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldCheck className="w-4 h-4 text-muted-foreground" />
          Active TLS Certificate
          <Button variant="ghost" size="icon-sm" onClick={refetch} disabled={isFetching} className="ml-auto">
            <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Expiry badge */}
        <div className={cn("flex items-center gap-2 p-3 rounded-lg border", expiryBorder(days))}>
          {days > 7
            ? <CheckCircle2 className={cn("w-5 h-5 shrink-0", expiryColor(days))} />
            : <AlertTriangle className={cn("w-5 h-5 shrink-0", expiryColor(days))} />
          }
          <div>
            <p className={cn("text-sm font-semibold", expiryColor(days))}>
              {days > 0 ? `Expires in ${days} days` : "Certificate has expired"}
            </p>
            <p className="text-xs text-muted-foreground">{cert.not_after}</p>
          </div>
        </div>

        {/* Fields grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Subject</p>
            <p className="font-mono text-xs break-all">{cert.subject}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Issuer</p>
            <p className="font-mono text-xs break-all">{cert.issuer}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Valid From</p>
            <p className="font-mono text-xs">{cert.not_before}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Valid Until</p>
            <p className={cn("font-mono text-xs", expiryColor(days))}>{cert.not_after}</p>
          </div>
          {cert.sans.length > 0 && (
            <div className="sm:col-span-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Subject Alternative Names</p>
              <div className="flex flex-wrap gap-1">
                {cert.sans.map((san) => (
                  <span key={san} className="text-[11px] font-mono bg-secondary/50 px-1.5 py-0.5 rounded">{san}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Fingerprint (collapsed) */}
        <button
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setShowFingerprint((v) => !v)}
        >
          SHA-256 Fingerprint
          {showFingerprint ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {showFingerprint && (
          <div className="flex items-center gap-2">
            <code className="text-[11px] font-mono text-muted-foreground break-all flex-1">{cert.fingerprint_sha256}</code>
            <Button variant="ghost" size="icon-sm" onClick={copyFp} title="Copy fingerprint">
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Section: Generate Self-Signed ───────────────────────────────────────────

function GenerateSelfSignedCard({ onSuccess }: { onSuccess: () => void }) {
  const [cn_, setCn] = useState("sudo-pi.local");
  const [days, setDays] = useState(365);
  const [sans, setSans] = useState("sudo-pi.local,localhost");
  const { msg, toast } = useToast();

  const mut = useMutation({
    mutationFn: async () => {
      const sanHosts = sans.split(",").map((s) => s.trim()).filter(Boolean);
      await apiClient.post("/tls/generate-self-signed", { cn: cn_, days, san_hosts: sanHosts }, {});
    },
    onSuccess: () => { toast("Self-signed certificate generated and applied."); onSuccess(); },
    onError: (e: unknown) => toast((e as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? "Failed to generate certificate.", false),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <RotateCcw className="w-4 h-4 text-muted-foreground" />
          Generate Self-Signed Certificate
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {msg && (
          <div className={cn("text-sm px-3 py-2 rounded-lg border", msg.ok ? "border-green-500/30 text-green-400 bg-green-500/5" : "border-red-500/30 text-red-400 bg-red-500/5")}>
            {msg.text}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Common Name (CN)</Label>
            <Input value={cn_} onChange={(e) => setCn(e.target.value)} placeholder="sudo-pi.local" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Validity (days)</Label>
            <Input
              type="number"
              value={days}
              min={1}
              max={3650}
              onChange={(e) => setDays(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Subject Alternative Names (comma-separated)</Label>
            <Input value={sans} onChange={(e) => setSans(e.target.value)} placeholder="sudo-pi.local,192.168.1.1,localhost" />
            <p className="text-[11px] text-muted-foreground">Include all hostnames and IPs you'll use to access the dashboard.</p>
          </div>
        </div>
        <Button
          onClick={() => mut.mutate()}
          disabled={mut.isPending || !cn_.trim()}
          className="gap-1.5"
        >
          {mut.isPending && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
          Generate & Apply
        </Button>
        <p className="text-xs text-muted-foreground">
          This will replace the current certificate and reload nginx. Browsers will show a security warning for self-signed certs.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Section: Upload Custom Cert ─────────────────────────────────────────────

function UploadCertCard({ onSuccess }: { onSuccess: () => void }) {
  const [certPem, setCertPem] = useState("");
  const [keyPem, setKeyPem] = useState("");
  const { msg, toast } = useToast();

  const mut = useMutation({
    mutationFn: async () => {
      await apiClient.post("/tls/upload", { cert_pem: certPem, key_pem: keyPem }, {});
    },
    onSuccess: () => { toast("Certificate uploaded and applied."); onSuccess(); },
    onError: (e: unknown) => toast((e as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? "Upload failed.", false),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Upload className="w-4 h-4 text-muted-foreground" />
          Upload Custom Certificate
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {msg && (
          <div className={cn("text-sm px-3 py-2 rounded-lg border", msg.ok ? "border-green-500/30 text-green-400 bg-green-500/5" : "border-red-500/30 text-red-400 bg-red-500/5")}>
            {msg.text}
          </div>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs">Certificate (PEM)</Label>
          <textarea
            value={certPem}
            onChange={(e) => setCertPem(e.target.value)}
            rows={7}
            placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Private Key (PEM)</Label>
          <textarea
            value={keyPem}
            onChange={(e) => setKeyPem(e.target.value)}
            rows={7}
            placeholder={"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
          />
        </div>
        <Button
          onClick={() => mut.mutate()}
          disabled={mut.isPending || !certPem.trim() || !keyPem.trim()}
          className="gap-1.5"
        >
          {mut.isPending && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
          Upload & Apply
        </Button>
        <p className="text-xs text-muted-foreground">
          The certificate and key modulus will be verified before installation. nginx is reloaded automatically.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Section: Let's Encrypt ──────────────────────────────────────────────────

function LetsEncryptCard({ onSuccess }: { onSuccess: () => void }) {
  const [domain, setDomain] = useState("");
  const [email, setEmail] = useState("");
  const { msg, toast } = useToast();

  const { data: certbotAvailable } = useQuery({
    queryKey: ["tls-certbot"],
    queryFn: async () => {
      const { data } = await apiClient.get<{ available: boolean; version: string | null }>("/tls/certbot");
      return data;
    },
  });

  const mut = useMutation({
    mutationFn: async () => {
      await apiClient.post("/tls/letsencrypt", { domain, email }, {});
    },
    onSuccess: () => { toast("Let's Encrypt certificate issued and installed."); onSuccess(); },
    onError: (e: unknown) => toast((e as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? "Certbot failed.", false),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Globe className="w-4 h-4 text-muted-foreground" />
          Let's Encrypt (ACME)
          {certbotAvailable !== undefined && (
            <span className={cn("ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full", certbotAvailable.available ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400")}>
              {certbotAvailable.available ? `certbot ${certbotAvailable.version ?? ""}` : "certbot not found"}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {msg && (
          <div className={cn("text-sm px-3 py-2 rounded-lg border", msg.ok ? "border-green-500/30 text-green-400 bg-green-500/5" : "border-red-500/30 text-red-400 bg-red-500/5")}>
            {msg.text}
          </div>
        )}
        {certbotAvailable && !certbotAvailable.available && (
          <div className="text-sm px-3 py-2 rounded-lg border border-yellow-500/30 text-yellow-400 bg-yellow-500/5">
            certbot is not installed. Run <code className="font-mono text-xs">sudo apt install certbot python3-certbot-nginx</code> to enable this feature.
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Domain name</Label>
            <Input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="dashboard.example.com"
              disabled={!certbotAvailable?.available}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Email address (for expiry notices)</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              disabled={!certbotAvailable?.available}
            />
          </div>
        </div>
        <Button
          onClick={() => mut.mutate()}
          disabled={mut.isPending || !domain.trim() || !email.trim() || !certbotAvailable?.available}
          className="gap-1.5"
        >
          {mut.isPending && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
          Request Certificate
        </Button>
        <p className="text-xs text-muted-foreground">
          Your domain must resolve publicly to this server's IP. Certbot uses the HTTP-01 challenge via nginx.
          This may take 30–60 seconds.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TlsPage() {
  const qc = useQueryClient();

  const { data: cert, isLoading, isFetching, refetch } = useQuery<CertInfo | null>({
    queryKey: ["tls-info"],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get<CertInfo>("/tls/info");
        return data;
      } catch (e: unknown) {
        const err = e as { response?: { status?: number } };
        if (err.response?.status === 404) return null;
        throw e;
      }
    },
    staleTime: 60_000,
  });

  function invalidateCert() {
    qc.invalidateQueries({ queryKey: ["tls-info"] });
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <KeyRound className="w-5 h-5 text-primary" />
        <div>
          <h2 className="text-lg font-semibold">TLS Certificate Manager</h2>
          <p className="text-sm text-muted-foreground">
            Manage the HTTPS certificate served by nginx for this dashboard.
          </p>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="h-48 rounded-xl bg-muted animate-pulse" />
      )}

      {/* Cert info */}
      {!isLoading && cert && (
        <CertInfoCard cert={cert} refetch={refetch} isFetching={isFetching} />
      )}

      {/* No cert found */}
      {!isLoading && cert === null && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 px-5 py-4 text-sm text-yellow-400">
          No certificate found at <code className="font-mono text-xs">/etc/nginx/ssl/sudo-pi.crt</code>.
          Generate a self-signed certificate below to enable HTTPS.
        </div>
      )}

      {/* Action cards */}
      <GenerateSelfSignedCard onSuccess={invalidateCert} />
      <UploadCertCard onSuccess={invalidateCert} />
      <LetsEncryptCard onSuccess={invalidateCert} />
    </div>
  );
}
