import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light" | "system";
type AccentColor = "cyan" | "purple" | "green" | "orange" | "blue" | "rose";

interface ThemeContextValue {
  theme: Theme;
  accentColor: AccentColor;
  setTheme: (theme: Theme) => void;
  setAccentColor: (color: AccentColor) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const THEME_KEY = "sudo-pi-theme";
const ACCENT_KEY = "sudo-pi-accent";

function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "dark" || stored === "light" || stored === "system") return stored;
  } catch {}
  return "dark";
}

function getStoredAccent(): AccentColor {
  try {
    const stored = localStorage.getItem(ACCENT_KEY);
    if (
      stored === "cyan" ||
      stored === "purple" ||
      stored === "green" ||
      stored === "orange" ||
      stored === "blue" ||
      stored === "rose"
    ) {
      return stored;
    }
  } catch {}
  return "cyan";
}

function applyTheme(theme: Theme, systemPrefersDark: boolean) {
  const root = document.documentElement;
  const useDark =
    theme === "dark" || (theme === "system" && systemPrefersDark);

  if (useDark) {
    root.classList.remove("light");
  } else {
    root.classList.add("light");
  }
}

function applyAccent(color: AccentColor) {
  document.documentElement.setAttribute("data-accent", color);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);
  const [accentColor, setAccentState] = useState<AccentColor>(getStoredAccent);

  // Apply on mount and whenever theme changes
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    applyTheme(theme, mq.matches);

    if (theme !== "system") return;

    // Listen for system preference changes only in system mode
    const handler = (e: MediaQueryListEvent) => {
      applyTheme("system", e.matches);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  // Apply accent on mount and whenever it changes
  useEffect(() => {
    applyAccent(accentColor);
  }, [accentColor]);

  const setTheme = (newTheme: Theme) => {
    try {
      localStorage.setItem(THEME_KEY, newTheme);
    } catch {}
    setThemeState(newTheme);
  };

  const setAccentColor = (color: AccentColor) => {
    try {
      localStorage.setItem(ACCENT_KEY, color);
    } catch {}
    setAccentState(color);
  };

  return (
    <ThemeContext.Provider value={{ theme, accentColor, setTheme, setAccentColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
