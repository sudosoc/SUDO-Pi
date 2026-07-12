import { useState, useCallback } from "react";
import { Palette, Plus, Trash2, Check, RefreshCw, X } from "lucide-react";
import { useTheme, AppTheme, ThemeVars } from "@/contexts/ThemeContext";
import { hslStringToHex, hexToHslString } from "@/lib/themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ── Key editable properties shown in the customizer ──────────────────────────
const EDITABLE_KEYS: { key: keyof ThemeVars; label: string; desc: string }[] = [
  { key: "background",        label: "Background",    desc: "Main canvas" },
  { key: "card",              label: "Card",          desc: "Surface tiles" },
  { key: "primary",           label: "Accent",        desc: "Buttons & highlights" },
  { key: "foreground",        label: "Text",          desc: "Main text color" },
  { key: "muted-foreground",  label: "Muted text",    desc: "Secondary text" },
  { key: "border",            label: "Border",        desc: "Hairlines & dividers" },
  { key: "destructive",       label: "Danger",        desc: "Delete & error states" },
  { key: "success",           label: "Success",       desc: "Positive states" },
];

const RADIUS_OPTIONS = [
  { label: "Sharp", value: "0rem" },
  { label: "Slight", value: "0.3rem" },
  { label: "Medium", value: "0.6rem" },
  { label: "Rounded", value: "0.9rem" },
  { label: "Pill", value: "1.5rem" },
];

// ── Mini dashboard preview ────────────────────────────────────────────────────
function ThemePreview({ vars }: { vars: ThemeVars }) {
  const bg      = `hsl(${vars.background})`;
  const card    = `hsl(${vars.card})`;
  const primary = `hsl(${vars.primary})`;
  const text    = `hsl(${vars.foreground})`;
  const muted   = `hsl(${vars["muted-foreground"]})`;
  const border  = `hsl(${vars.border})`;
  const radius  = vars.radius;

  return (
    <div
      className="rounded-xl overflow-hidden border"
      style={{ background: bg, borderColor: border }}
    >
      {/* Fake header */}
      <div
        className="px-3 py-2 flex items-center gap-2 border-b"
        style={{ background: card, borderColor: border }}
      >
        <div className="w-4 h-4 rounded-full" style={{ background: primary }} />
        <div className="h-2 w-16 rounded-full" style={{ background: primary, opacity: 0.5 }} />
        <div className="ml-auto h-2 w-8 rounded-full" style={{ background: muted }} />
      </div>

      <div className="flex" style={{ minHeight: 90 }}>
        {/* Fake sidebar */}
        <div className="w-10 border-r flex flex-col gap-1 p-1.5" style={{ background: card, borderColor: border }}>
          {[1, 1, 0.5, 0.5, 0.5].map((opacity, i) => (
            <div
              key={i}
              className="h-2 rounded"
              style={{ background: primary, opacity, width: i === 0 ? "100%" : "80%" }}
            />
          ))}
        </div>

        {/* Fake content */}
        <div className="flex-1 p-2 grid grid-cols-2 gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded p-1.5 border"
              style={{
                background: card,
                borderColor: border,
                borderRadius: radius,
              }}
            >
              <div className="h-1.5 w-8 rounded mb-1" style={{ background: muted }} />
              <div
                className="h-3 w-6 rounded font-bold text-[6px] flex items-center justify-center"
                style={{ background: i === 0 ? primary : "transparent", color: i === 0 ? `hsl(${vars["primary-foreground"]})` : text }}
              >
                {i === 0 ? "●" : "—"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Color picker row ──────────────────────────────────────────────────────────
function ColorRow({
  label,
  desc,
  hslValue,
  onChange,
}: {
  label: string;
  desc: string;
  hslValue: string;
  onChange: (hsl: string) => void;
}) {
  const hex = hslStringToHex(hslValue);

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium">{label}</p>
        <p className="text-[10px] text-muted-foreground/60">{desc}</p>
      </div>
      <label className="relative cursor-pointer group">
        <input
          type="color"
          value={hex}
          onChange={(e) => onChange(hexToHslString(e.target.value))}
          className="sr-only"
        />
        <div
          className="w-8 h-8 rounded-lg border-2 border-border/60 group-hover:border-primary/60 transition-colors shrink-0"
          style={{ background: hex }}
        />
      </label>
      <code className="text-[9px] text-muted-foreground/60 font-mono w-28 shrink-0 truncate">{hslValue}</code>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function ThemeCustomizer({ onClose }: { onClose: () => void }) {
  const { themeId, activeTheme, customThemes, allThemes, setThemeId, saveCustomTheme, deleteCustomTheme } = useTheme();

  const [editing, setEditing] = useState<ThemeVars>({ ...activeTheme.vars });
  const [name, setName]       = useState(activeTheme.name + " Custom");
  const [baseId, setBaseId]   = useState(activeTheme.id);
  const [saved, setSaved]     = useState(false);

  const resetToBase = useCallback((id: string) => {
    const t = allThemes.find((x) => x.id === id);
    if (!t) return;
    setBaseId(id);
    setEditing({ ...t.vars });
    if (!(t as { isCustom?: boolean }).isCustom) {
      setName(t.name + " Custom");
    } else {
      setName(t.name);
    }
  }, [allThemes]);

  const updateVar = useCallback((key: keyof ThemeVars, value: string) => {
    setEditing((prev) => ({ ...prev, [key]: value }));
  }, []);

  function handleSave() {
    const existingId = customThemes.find(
      (t) => t.name.toLowerCase() === name.toLowerCase()
    )?.id;

    const theme: AppTheme = {
      ...(allThemes.find((t) => t.id === baseId) ?? activeTheme),
      id: existingId ?? `custom-${Date.now()}`,
      name: name.trim() || "My Theme",
      isCustom: true,
      vars: editing,
      preview: {
        bg: `hsl(${editing.background})`,
        card: `hsl(${editing.card})`,
        primary: `hsl(${editing.primary})`,
        text: `hsl(${editing.foreground})`,
        border: `hsl(${editing.border})`,
      },
    } as AppTheme;

    saveCustomTheme(theme);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Theme Customizer</h3>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Base picker */}
      <div>
        <Label className="text-xs mb-2 block">Start from</Label>
        <div className="flex flex-wrap gap-1.5">
          {allThemes.map((t) => (
            <button
              key={t.id}
              onClick={() => resetToBase(t.id)}
              className={cn(
                "px-2.5 py-1.5 text-[11px] rounded-lg border transition-all",
                baseId === t.id
                  ? "border-primary bg-primary/10 text-primary font-semibold"
                  : "border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/30",
              )}
            >
              {t.emoji} {t.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: controls */}
        <div className="space-y-4">
          {/* Name */}
          <div>
            <Label className="text-xs mb-1.5 block">Theme name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Custom Theme"
              className="h-8 text-sm"
            />
          </div>

          {/* Colors */}
          <div>
            <Label className="text-xs mb-2 block">Colors</Label>
            <div className="space-y-2.5">
              {EDITABLE_KEYS.map(({ key, label, desc }) => (
                <ColorRow
                  key={key}
                  label={label}
                  desc={desc}
                  hslValue={editing[key] as string}
                  onChange={(v) => updateVar(key, v)}
                />
              ))}
            </div>
          </div>

          {/* Border radius */}
          <div>
            <Label className="text-xs mb-2 block">Corner radius</Label>
            <div className="flex gap-1.5 flex-wrap">
              {RADIUS_OPTIONS.map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => updateVar("radius", value)}
                  className={cn(
                    "px-2.5 py-1 text-[11px] border rounded-lg transition-colors",
                    editing.radius === value
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "border-border/50 text-muted-foreground hover:text-foreground",
                  )}
                  style={{ borderRadius: value === "0rem" ? "4px" : value }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: preview */}
        <div className="space-y-3">
          <Label className="text-xs block">Live preview</Label>
          <ThemePreview vars={editing} />

          {/* Apply without saving */}
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5 text-xs"
            onClick={() => {
              import("@/contexts/ThemeContext").then(({ applyThemeVars }) => {
                applyThemeVars(editing);
              });
            }}
          >
            <RefreshCw className="w-3 h-3" />
            Preview now (temporary)
          </Button>
        </div>
      </div>

      {/* Custom theme management */}
      {customThemes.length > 0 && (
        <div>
          <Label className="text-xs mb-2 block">Saved custom themes</Label>
          <div className="space-y-1.5">
            {customThemes.map((ct) => (
              <div
                key={ct.id}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors",
                  themeId === ct.id ? "border-primary/40 bg-primary/8" : "border-border/50",
                )}
              >
                <div className="w-5 h-5 rounded border" style={{ background: ct.preview.primary, borderColor: ct.preview.border }} />
                <span className="text-xs font-medium flex-1 truncate">{ct.name}</span>
                <button
                  onClick={() => setThemeId(ct.id)}
                  className="text-[10px] text-primary hover:underline"
                >
                  Apply
                </button>
                <button
                  onClick={() => { resetToBase(ct.id); }}
                  className="text-[10px] text-muted-foreground/60 hover:text-foreground"
                >
                  Edit
                </button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="h-5 w-5 text-destructive/50 hover:text-destructive"
                  onClick={() => deleteCustomTheme(ct.id)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save */}
      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          onClick={handleSave}
          className="flex-1 gap-1.5"
        >
          {saved
            ? <><Check className="w-3.5 h-3.5" /> Saved!</>
            : <><Plus className="w-3.5 h-3.5" /> Save as "{name.trim() || "Custom"}"</>
          }
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}
