import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  AppTheme, CustomTheme, ThemeVars, THEMES, DEFAULT_THEME_ID, getTheme,
} from "@/lib/themes";

export type Density = "comfortable" | "compact";

interface ThemeContextValue {
  themeId: string;
  activeTheme: AppTheme;
  density: Density;
  customThemes: CustomTheme[];
  allThemes: AppTheme[];
  setThemeId: (id: string) => void;
  setDensity: (density: Density) => void;
  saveCustomTheme: (theme: AppTheme) => string;
  deleteCustomTheme: (id: string) => void;
  // Quick dark/light cycle for the header button
  toggleDarkLight: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const THEME_ID_KEY        = "sudo-pi-theme-id";
const DENSITY_KEY         = "sudo-pi-density";
const CUSTOM_THEMES_KEY   = "sudo-pi-custom-themes";
const LAST_DARK_KEY       = "sudo-pi-last-dark";
const LAST_LIGHT_KEY      = "sudo-pi-last-light";

function ls<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? (JSON.parse(v) as T) : fallback;
  } catch { return fallback; }
}
function lsSet(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function getStoredCustomThemes(): CustomTheme[] {
  try {
    const s = localStorage.getItem(CUSTOM_THEMES_KEY);
    return s ? (JSON.parse(s) as CustomTheme[]) : [];
  } catch { return []; }
}

export function applyThemeVars(vars: ThemeVars) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(`--${key}`, value);
  }
  // Drive the `.light` class so that any CSS that still checks it stays correct.
  const bgL = parseFloat(vars.background.split(" ")[2] ?? "0");
  if (bgL > 50) {
    root.classList.add("light");
  } else {
    root.classList.remove("light");
  }
}

function applyDensity(density: Density) {
  document.documentElement.setAttribute("data-density", density);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeIdRaw]   = useState<string>(() => ls(THEME_ID_KEY, DEFAULT_THEME_ID));
  const [density, setDensityRaw]   = useState<Density>(() => ls<Density>(DENSITY_KEY, "comfortable"));
  const [customThemes, setCustom]  = useState<CustomTheme[]>(getStoredCustomThemes);

  const allThemes: AppTheme[] = [...THEMES, ...customThemes];
  const activeTheme = allThemes.find((t) => t.id === themeId) ?? THEMES[0];

  useEffect(() => { applyThemeVars(activeTheme.vars); }, [activeTheme]);
  useEffect(() => { applyDensity(density); }, [density]);

  const setThemeId = useCallback((id: string) => {
    lsSet(THEME_ID_KEY, id);
    const t = allThemes.find((x) => x.id === id);
    if (t) {
      if (t.dark)  lsSet(LAST_DARK_KEY,  id);
      else         lsSet(LAST_LIGHT_KEY, id);
    }
    setThemeIdRaw(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allThemes]);

  const setDensity = useCallback((d: Density) => {
    lsSet(DENSITY_KEY, d);
    setDensityRaw(d);
  }, []);

  const saveCustomTheme = useCallback((base: AppTheme): string => {
    const id = base.id.startsWith("custom-") ? base.id : `custom-${Date.now()}`;
    const ct: CustomTheme = { ...base, id, isCustom: true };
    setCustom((prev) => {
      const next = prev.filter((t) => t.id !== id).concat(ct);
      lsSet(CUSTOM_THEMES_KEY, next);
      return next;
    });
    // Apply immediately
    lsSet(THEME_ID_KEY, id);
    setThemeIdRaw(id);
    return id;
  }, []);

  const deleteCustomTheme = useCallback((id: string) => {
    setCustom((prev) => {
      const next = prev.filter((t) => t.id !== id);
      lsSet(CUSTOM_THEMES_KEY, next);
      return next;
    });
    if (themeId === id) {
      lsSet(THEME_ID_KEY, DEFAULT_THEME_ID);
      setThemeIdRaw(DEFAULT_THEME_ID);
    }
  }, [themeId]);

  const toggleDarkLight = useCallback(() => {
    if (activeTheme.dark) {
      // Switch to light
      const lastLight = ls<string>(LAST_LIGHT_KEY, "arctic");
      const target = allThemes.find((t) => t.id === lastLight && !t.dark) ?? allThemes.find((t) => !t.dark);
      if (target) setThemeId(target.id);
    } else {
      // Switch to dark
      const lastDark = ls<string>(LAST_DARK_KEY, DEFAULT_THEME_ID);
      const target = allThemes.find((t) => t.id === lastDark && t.dark) ?? allThemes.find((t) => t.dark);
      if (target) setThemeId(target.id);
    }
  }, [activeTheme, allThemes, setThemeId]);

  return (
    <ThemeContext.Provider value={{
      themeId,
      activeTheme,
      density,
      customThemes,
      allThemes,
      setThemeId,
      setDensity,
      saveCustomTheme,
      deleteCustomTheme,
      toggleDarkLight,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

// Re-export types for convenience
export type { AppTheme, CustomTheme, ThemeVars };
export { getTheme };
