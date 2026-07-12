// Complete theme definitions for SUDO-Pi.
// Each theme defines ALL CSS custom properties so themes are fully self-contained.

export interface ThemeVars {
  background: string;
  foreground: string;
  card: string;
  "card-foreground": string;
  popover: string;
  "popover-foreground": string;
  primary: string;
  "primary-foreground": string;
  secondary: string;
  "secondary-foreground": string;
  muted: string;
  "muted-foreground": string;
  accent: string;
  "accent-foreground": string;
  destructive: string;
  "destructive-foreground": string;
  border: string;
  input: string;
  ring: string;
  success: string;
  "success-foreground": string;
  warning: string;
  "warning-foreground": string;
  info: string;
  "info-foreground": string;
  radius: string;
}

export interface AppTheme {
  id: string;
  name: string;
  dark: boolean;
  description: string;
  category: "dark" | "light" | "special";
  emoji: string;
  preview: {
    bg: string;
    card: string;
    primary: string;
    text: string;
    border: string;
  };
  vars: ThemeVars;
}

export interface CustomTheme extends AppTheme {
  isCustom: true;
}

export const THEMES: AppTheme[] = [
  // ═══════════════════════════════════════════════════════════════
  //  DARK THEMES
  // ═══════════════════════════════════════════════════════════════

  {
    id: "onyx",
    name: "Onyx",
    dark: true,
    description: "Deep obsidian with electric violet. The default SUDO-Pi signature look.",
    category: "dark",
    emoji: "💎",
    preview: {
      bg: "hsl(260,55%,3.5%)",
      card: "hsl(262,42%,6.5%)",
      primary: "hsl(263,78%,66%)",
      text: "hsl(260,8%,94%)",
      border: "hsl(262,26%,11%)",
    },
    vars: {
      background: "260 55% 3.5%",
      foreground: "260 8% 94%",
      card: "262 42% 6.5%",
      "card-foreground": "260 8% 94%",
      popover: "262 50% 4.5%",
      "popover-foreground": "260 8% 94%",
      primary: "263 78% 66%",
      "primary-foreground": "260 100% 99%",
      secondary: "262 26% 13%",
      "secondary-foreground": "260 8% 88%",
      muted: "262 32% 9%",
      "muted-foreground": "262 8% 52%",
      accent: "262 24% 17%",
      "accent-foreground": "260 8% 94%",
      destructive: "0 72% 58%",
      "destructive-foreground": "0 0% 98%",
      border: "262 26% 11%",
      input: "262 32% 9%",
      ring: "263 78% 66%",
      success: "142 66% 44%",
      "success-foreground": "260 55% 4%",
      warning: "38 90% 52%",
      "warning-foreground": "260 55% 4%",
      info: "187 85% 50%",
      "info-foreground": "260 55% 4%",
      radius: "0.8rem",
    },
  },

  {
    id: "midnight",
    name: "Midnight Navy",
    dark: true,
    description: "Deep naval blue with electric sky-blue. Professional, cool, trustworthy.",
    category: "dark",
    emoji: "🌊",
    preview: {
      bg: "hsl(222,55%,4%)",
      card: "hsl(220,45%,7%)",
      primary: "hsl(210,90%,60%)",
      text: "hsl(220,8%,94%)",
      border: "hsl(220,28%,11%)",
    },
    vars: {
      background: "222 55% 4%",
      foreground: "220 8% 94%",
      card: "220 45% 7%",
      "card-foreground": "220 8% 94%",
      popover: "222 52% 4.5%",
      "popover-foreground": "220 8% 94%",
      primary: "210 90% 60%",
      "primary-foreground": "220 100% 99%",
      secondary: "220 28% 13%",
      "secondary-foreground": "220 8% 88%",
      muted: "220 32% 9%",
      "muted-foreground": "220 10% 52%",
      accent: "220 26% 17%",
      "accent-foreground": "220 8% 94%",
      destructive: "0 72% 58%",
      "destructive-foreground": "0 0% 98%",
      border: "220 28% 11%",
      input: "220 32% 9%",
      ring: "210 90% 60%",
      success: "142 66% 44%",
      "success-foreground": "222 55% 4%",
      warning: "38 90% 52%",
      "warning-foreground": "222 55% 4%",
      info: "187 85% 50%",
      "info-foreground": "222 55% 4%",
      radius: "0.8rem",
    },
  },

  {
    id: "matrix",
    name: "Matrix",
    dark: true,
    description: "Pure black canvas, phosphor green terminal glow. Enter the simulation.",
    category: "special",
    emoji: "🖥️",
    preview: {
      bg: "hsl(0,0%,2%)",
      card: "hsl(120,10%,4.5%)",
      primary: "hsl(120,100%,38%)",
      text: "hsl(120,30%,88%)",
      border: "hsl(120,20%,10%)",
    },
    vars: {
      background: "0 0% 2%",
      foreground: "120 30% 88%",
      card: "120 10% 4.5%",
      "card-foreground": "120 30% 88%",
      popover: "0 0% 3%",
      "popover-foreground": "120 30% 88%",
      primary: "120 100% 38%",
      "primary-foreground": "0 0% 3%",
      secondary: "120 15% 9%",
      "secondary-foreground": "120 20% 80%",
      muted: "120 10% 7%",
      "muted-foreground": "120 15% 48%",
      accent: "120 15% 12%",
      "accent-foreground": "120 30% 88%",
      destructive: "0 72% 50%",
      "destructive-foreground": "0 0% 98%",
      border: "120 20% 10%",
      input: "120 10% 7%",
      ring: "120 100% 38%",
      success: "120 100% 38%",
      "success-foreground": "0 0% 2%",
      warning: "60 90% 48%",
      "warning-foreground": "0 0% 2%",
      info: "180 80% 42%",
      "info-foreground": "0 0% 2%",
      radius: "0.2rem",
    },
  },

  {
    id: "crimson",
    name: "Crimson Night",
    dark: true,
    description: "Dark maroon shadows with vivid scarlet. Bold, intense, dramatic.",
    category: "dark",
    emoji: "🔴",
    preview: {
      bg: "hsl(355,40%,3.5%)",
      card: "hsl(355,32%,6.5%)",
      primary: "hsl(0,85%,62%)",
      text: "hsl(355,8%,94%)",
      border: "hsl(355,22%,11%)",
    },
    vars: {
      background: "355 40% 3.5%",
      foreground: "355 8% 94%",
      card: "355 32% 6.5%",
      "card-foreground": "355 8% 94%",
      popover: "355 45% 4.5%",
      "popover-foreground": "355 8% 94%",
      primary: "0 85% 62%",
      "primary-foreground": "355 100% 99%",
      secondary: "355 22% 13%",
      "secondary-foreground": "355 8% 88%",
      muted: "355 28% 9%",
      "muted-foreground": "355 8% 52%",
      accent: "355 20% 17%",
      "accent-foreground": "355 8% 94%",
      destructive: "0 85% 62%",
      "destructive-foreground": "0 0% 98%",
      border: "355 22% 11%",
      input: "355 28% 9%",
      ring: "0 85% 62%",
      success: "142 60% 44%",
      "success-foreground": "355 40% 3.5%",
      warning: "38 90% 52%",
      "warning-foreground": "355 40% 3.5%",
      info: "200 85% 50%",
      "info-foreground": "355 40% 3.5%",
      radius: "0.75rem",
    },
  },

  {
    id: "carbon",
    name: "Carbon",
    dark: true,
    description: "Industrial charcoal with blazing orange. Raw, mechanical, powerful.",
    category: "dark",
    emoji: "🔥",
    preview: {
      bg: "hsl(20,8%,3%)",
      card: "hsl(20,6%,6%)",
      primary: "hsl(25,95%,52%)",
      text: "hsl(20,8%,94%)",
      border: "hsl(20,6%,11%)",
    },
    vars: {
      background: "20 8% 3%",
      foreground: "20 8% 94%",
      card: "20 6% 6%",
      "card-foreground": "20 8% 94%",
      popover: "20 8% 4%",
      "popover-foreground": "20 8% 94%",
      primary: "25 95% 52%",
      "primary-foreground": "20 100% 4%",
      secondary: "20 6% 12%",
      "secondary-foreground": "20 8% 88%",
      muted: "20 6% 8%",
      "muted-foreground": "20 6% 50%",
      accent: "20 6% 15%",
      "accent-foreground": "20 8% 94%",
      destructive: "0 72% 52%",
      "destructive-foreground": "0 0% 98%",
      border: "20 6% 11%",
      input: "20 6% 8%",
      ring: "25 95% 52%",
      success: "142 60% 44%",
      "success-foreground": "20 8% 3%",
      warning: "38 95% 52%",
      "warning-foreground": "20 8% 3%",
      info: "200 85% 50%",
      "info-foreground": "20 8% 3%",
      radius: "0.4rem",
    },
  },

  {
    id: "forest",
    name: "Deep Forest",
    dark: true,
    description: "Rich forest greens with emerald accent. Natural, focused, and calming.",
    category: "dark",
    emoji: "🌿",
    preview: {
      bg: "hsl(150,35%,3.5%)",
      card: "hsl(150,28%,6.5%)",
      primary: "hsl(152,65%,44%)",
      text: "hsl(150,8%,94%)",
      border: "hsl(150,20%,11%)",
    },
    vars: {
      background: "150 35% 3.5%",
      foreground: "150 8% 94%",
      card: "150 28% 6.5%",
      "card-foreground": "150 8% 94%",
      popover: "150 38% 4.5%",
      "popover-foreground": "150 8% 94%",
      primary: "152 65% 44%",
      "primary-foreground": "150 100% 4%",
      secondary: "150 20% 13%",
      "secondary-foreground": "150 8% 88%",
      muted: "150 24% 9%",
      "muted-foreground": "150 8% 52%",
      accent: "150 18% 17%",
      "accent-foreground": "150 8% 94%",
      destructive: "0 72% 58%",
      "destructive-foreground": "0 0% 98%",
      border: "150 20% 11%",
      input: "150 24% 9%",
      ring: "152 65% 44%",
      success: "142 66% 44%",
      "success-foreground": "150 35% 3.5%",
      warning: "38 90% 52%",
      "warning-foreground": "150 35% 3.5%",
      info: "187 85% 50%",
      "info-foreground": "150 35% 3.5%",
      radius: "0.8rem",
    },
  },

  {
    id: "ocean",
    name: "Ocean Deep",
    dark: true,
    description: "Dark ocean teal with vibrant cyan. Deep, refreshing, infinite.",
    category: "dark",
    emoji: "🌊",
    preview: {
      bg: "hsl(200,50%,3.5%)",
      card: "hsl(200,40%,6.5%)",
      primary: "hsl(187,90%,50%)",
      text: "hsl(200,8%,94%)",
      border: "hsl(200,28%,11%)",
    },
    vars: {
      background: "200 50% 3.5%",
      foreground: "200 8% 94%",
      card: "200 40% 6.5%",
      "card-foreground": "200 8% 94%",
      popover: "200 52% 4.5%",
      "popover-foreground": "200 8% 94%",
      primary: "187 90% 50%",
      "primary-foreground": "200 100% 4%",
      secondary: "200 28% 13%",
      "secondary-foreground": "200 8% 88%",
      muted: "200 34% 9%",
      "muted-foreground": "200 10% 52%",
      accent: "200 26% 17%",
      "accent-foreground": "200 8% 94%",
      destructive: "0 72% 58%",
      "destructive-foreground": "0 0% 98%",
      border: "200 28% 11%",
      input: "200 34% 9%",
      ring: "187 90% 50%",
      success: "142 66% 44%",
      "success-foreground": "200 50% 3.5%",
      warning: "38 90% 52%",
      "warning-foreground": "200 50% 3.5%",
      info: "187 85% 50%",
      "info-foreground": "200 50% 3.5%",
      radius: "0.8rem",
    },
  },

  {
    id: "amber",
    name: "Amber Dusk",
    dark: true,
    description: "Warm amber darkness with golden accent. Cozy, rich, distinctive.",
    category: "dark",
    emoji: "🌅",
    preview: {
      bg: "hsl(35,35%,3.5%)",
      card: "hsl(35,28%,6.5%)",
      primary: "hsl(38,95%,55%)",
      text: "hsl(35,8%,94%)",
      border: "hsl(35,20%,11%)",
    },
    vars: {
      background: "35 35% 3.5%",
      foreground: "35 8% 94%",
      card: "35 28% 6.5%",
      "card-foreground": "35 8% 94%",
      popover: "35 38% 4.5%",
      "popover-foreground": "35 8% 94%",
      primary: "38 95% 55%",
      "primary-foreground": "35 100% 4%",
      secondary: "35 20% 13%",
      "secondary-foreground": "35 8% 88%",
      muted: "35 24% 9%",
      "muted-foreground": "35 8% 52%",
      accent: "35 18% 17%",
      "accent-foreground": "35 8% 94%",
      destructive: "0 72% 58%",
      "destructive-foreground": "0 0% 98%",
      border: "35 20% 11%",
      input: "35 24% 9%",
      ring: "38 95% 55%",
      success: "142 66% 44%",
      "success-foreground": "35 35% 3.5%",
      warning: "38 95% 55%",
      "warning-foreground": "35 35% 3.5%",
      info: "200 85% 50%",
      "info-foreground": "35 35% 3.5%",
      radius: "0.75rem",
    },
  },

  {
    id: "copper",
    name: "Copper Forge",
    dark: true,
    description: "Burnished copper shadows with rust accent. Warm industrial character.",
    category: "dark",
    emoji: "⚙️",
    preview: {
      bg: "hsl(15,30%,3.5%)",
      card: "hsl(15,24%,6.5%)",
      primary: "hsl(20,80%,52%)",
      text: "hsl(15,8%,94%)",
      border: "hsl(15,16%,11%)",
    },
    vars: {
      background: "15 30% 3.5%",
      foreground: "15 8% 94%",
      card: "15 24% 6.5%",
      "card-foreground": "15 8% 94%",
      popover: "15 32% 4.5%",
      "popover-foreground": "15 8% 94%",
      primary: "20 80% 52%",
      "primary-foreground": "15 100% 4%",
      secondary: "15 16% 13%",
      "secondary-foreground": "15 8% 88%",
      muted: "15 20% 9%",
      "muted-foreground": "15 8% 52%",
      accent: "15 14% 17%",
      "accent-foreground": "15 8% 94%",
      destructive: "0 72% 58%",
      "destructive-foreground": "0 0% 98%",
      border: "15 16% 11%",
      input: "15 20% 9%",
      ring: "20 80% 52%",
      success: "142 60% 44%",
      "success-foreground": "15 30% 3.5%",
      warning: "38 90% 52%",
      "warning-foreground": "15 30% 3.5%",
      info: "200 85% 50%",
      "info-foreground": "15 30% 3.5%",
      radius: "0.6rem",
    },
  },

  {
    id: "slate-dark",
    name: "Slate Pro",
    dark: true,
    description: "Refined blue-gray with cobalt accent. Clean, corporate, professional.",
    category: "dark",
    emoji: "🔷",
    preview: {
      bg: "hsl(230,40%,4%)",
      card: "hsl(228,32%,7%)",
      primary: "hsl(215,80%,58%)",
      text: "hsl(230,8%,94%)",
      border: "hsl(228,22%,11%)",
    },
    vars: {
      background: "230 40% 4%",
      foreground: "230 8% 94%",
      card: "228 32% 7%",
      "card-foreground": "230 8% 94%",
      popover: "230 44% 4.5%",
      "popover-foreground": "230 8% 94%",
      primary: "215 80% 58%",
      "primary-foreground": "230 100% 99%",
      secondary: "228 22% 13%",
      "secondary-foreground": "230 8% 88%",
      muted: "228 26% 9%",
      "muted-foreground": "228 10% 52%",
      accent: "228 20% 17%",
      "accent-foreground": "230 8% 94%",
      destructive: "0 72% 58%",
      "destructive-foreground": "0 0% 98%",
      border: "228 22% 11%",
      input: "228 26% 9%",
      ring: "215 80% 58%",
      success: "142 60% 44%",
      "success-foreground": "230 40% 4%",
      warning: "38 90% 52%",
      "warning-foreground": "230 40% 4%",
      info: "187 85% 50%",
      "info-foreground": "230 40% 4%",
      radius: "0.8rem",
    },
  },

  {
    id: "rose-dark",
    name: "Rose Noir",
    dark: true,
    description: "Moody dark rose with vibrant pink. Fashionable and bold.",
    category: "dark",
    emoji: "🌹",
    preview: {
      bg: "hsl(330,40%,3.5%)",
      card: "hsl(330,32%,6.5%)",
      primary: "hsl(340,85%,62%)",
      text: "hsl(330,8%,94%)",
      border: "hsl(330,22%,11%)",
    },
    vars: {
      background: "330 40% 3.5%",
      foreground: "330 8% 94%",
      card: "330 32% 6.5%",
      "card-foreground": "330 8% 94%",
      popover: "330 45% 4.5%",
      "popover-foreground": "330 8% 94%",
      primary: "340 85% 62%",
      "primary-foreground": "330 100% 99%",
      secondary: "330 22% 13%",
      "secondary-foreground": "330 8% 88%",
      muted: "330 28% 9%",
      "muted-foreground": "330 8% 52%",
      accent: "330 20% 17%",
      "accent-foreground": "330 8% 94%",
      destructive: "0 72% 58%",
      "destructive-foreground": "0 0% 98%",
      border: "330 22% 11%",
      input: "330 28% 9%",
      ring: "340 85% 62%",
      success: "142 60% 44%",
      "success-foreground": "330 40% 3.5%",
      warning: "38 90% 52%",
      "warning-foreground": "330 40% 3.5%",
      info: "200 85% 50%",
      "info-foreground": "330 40% 3.5%",
      radius: "0.9rem",
    },
  },

  // ═══════════════════════════════════════════════════════════════
  //  SPECIAL / MONOCHROME
  // ═══════════════════════════════════════════════════════════════

  {
    id: "mono-dark",
    name: "Mono Dark",
    dark: true,
    description: "Pure grayscale darkness. No color noise. Maximum contrast and focus.",
    category: "special",
    emoji: "◼",
    preview: {
      bg: "hsl(0,0%,5%)",
      card: "hsl(0,0%,9%)",
      primary: "hsl(0,0%,72%)",
      text: "hsl(0,0%,94%)",
      border: "hsl(0,0%,14%)",
    },
    vars: {
      background: "0 0% 5%",
      foreground: "0 0% 94%",
      card: "0 0% 9%",
      "card-foreground": "0 0% 94%",
      popover: "0 0% 7%",
      "popover-foreground": "0 0% 94%",
      primary: "0 0% 72%",
      "primary-foreground": "0 0% 5%",
      secondary: "0 0% 14%",
      "secondary-foreground": "0 0% 88%",
      muted: "0 0% 11%",
      "muted-foreground": "0 0% 50%",
      accent: "0 0% 18%",
      "accent-foreground": "0 0% 94%",
      destructive: "0 0% 62%",
      "destructive-foreground": "0 0% 5%",
      border: "0 0% 14%",
      input: "0 0% 11%",
      ring: "0 0% 72%",
      success: "0 0% 68%",
      "success-foreground": "0 0% 5%",
      warning: "0 0% 55%",
      "warning-foreground": "0 0% 5%",
      info: "0 0% 72%",
      "info-foreground": "0 0% 5%",
      radius: "0.5rem",
    },
  },

  // ═══════════════════════════════════════════════════════════════
  //  LIGHT THEMES
  // ═══════════════════════════════════════════════════════════════

  {
    id: "arctic",
    name: "Arctic",
    dark: false,
    description: "Crisp white with deep sky blue. Clean, airy, and focused.",
    category: "light",
    emoji: "❄️",
    preview: {
      bg: "hsl(200,30%,97%)",
      card: "hsl(0,0%,100%)",
      primary: "hsl(200,85%,38%)",
      text: "hsl(200,30%,10%)",
      border: "hsl(200,18%,86%)",
    },
    vars: {
      background: "200 30% 97%",
      foreground: "200 30% 10%",
      card: "0 0% 100%",
      "card-foreground": "200 30% 10%",
      popover: "0 0% 100%",
      "popover-foreground": "200 30% 10%",
      primary: "200 85% 38%",
      "primary-foreground": "0 0% 100%",
      secondary: "200 18% 91%",
      "secondary-foreground": "200 25% 22%",
      muted: "200 20% 94%",
      "muted-foreground": "200 12% 44%",
      accent: "200 85% 38%",
      "accent-foreground": "0 0% 100%",
      destructive: "0 72% 48%",
      "destructive-foreground": "0 0% 98%",
      border: "200 18% 86%",
      input: "200 20% 94%",
      ring: "200 85% 38%",
      success: "142 60% 32%",
      "success-foreground": "0 0% 100%",
      warning: "35 88% 40%",
      "warning-foreground": "0 0% 100%",
      info: "200 80% 38%",
      "info-foreground": "0 0% 100%",
      radius: "0.6rem",
    },
  },

  {
    id: "sakura",
    name: "Sakura",
    dark: false,
    description: "Warm blossom white with rose-pink accent. Soft, elegant, inviting.",
    category: "light",
    emoji: "🌸",
    preview: {
      bg: "hsl(340,28%,97%)",
      card: "hsl(0,0%,100%)",
      primary: "hsl(345,78%,55%)",
      text: "hsl(340,28%,10%)",
      border: "hsl(340,16%,86%)",
    },
    vars: {
      background: "340 28% 97%",
      foreground: "340 28% 10%",
      card: "0 0% 100%",
      "card-foreground": "340 28% 10%",
      popover: "0 0% 100%",
      "popover-foreground": "340 28% 10%",
      primary: "345 78% 55%",
      "primary-foreground": "0 0% 100%",
      secondary: "340 16% 91%",
      "secondary-foreground": "340 22% 22%",
      muted: "340 18% 94%",
      "muted-foreground": "340 10% 44%",
      accent: "345 78% 55%",
      "accent-foreground": "0 0% 100%",
      destructive: "0 72% 48%",
      "destructive-foreground": "0 0% 98%",
      border: "340 16% 86%",
      input: "340 18% 94%",
      ring: "345 78% 55%",
      success: "142 56% 32%",
      "success-foreground": "0 0% 100%",
      warning: "35 88% 42%",
      "warning-foreground": "0 0% 100%",
      info: "200 80% 40%",
      "info-foreground": "0 0% 100%",
      radius: "1.2rem",
    },
  },

  {
    id: "lavender",
    name: "Lavender",
    dark: false,
    description: "Soft violet-tinted white with purple accent. Calm, refined, creative.",
    category: "light",
    emoji: "💜",
    preview: {
      bg: "hsl(263,25%,97%)",
      card: "hsl(0,0%,100%)",
      primary: "hsl(263,68%,50%)",
      text: "hsl(263,25%,10%)",
      border: "hsl(263,14%,86%)",
    },
    vars: {
      background: "263 25% 97%",
      foreground: "263 25% 10%",
      card: "0 0% 100%",
      "card-foreground": "263 25% 10%",
      popover: "0 0% 100%",
      "popover-foreground": "263 25% 10%",
      primary: "263 68% 50%",
      "primary-foreground": "0 0% 100%",
      secondary: "263 14% 91%",
      "secondary-foreground": "263 20% 22%",
      muted: "263 16% 94%",
      "muted-foreground": "263 10% 44%",
      accent: "263 68% 50%",
      "accent-foreground": "0 0% 100%",
      destructive: "0 72% 48%",
      "destructive-foreground": "0 0% 98%",
      border: "263 14% 86%",
      input: "263 16% 94%",
      ring: "263 68% 50%",
      success: "142 56% 32%",
      "success-foreground": "0 0% 100%",
      warning: "35 88% 42%",
      "warning-foreground": "0 0% 100%",
      info: "200 80% 40%",
      "info-foreground": "0 0% 100%",
      radius: "0.8rem",
    },
  },

  {
    id: "sand",
    name: "Desert Sand",
    dark: false,
    description: "Warm sandy beige with terracotta accent. Natural, warm, editorial.",
    category: "light",
    emoji: "🏜️",
    preview: {
      bg: "hsl(35,25%,96%)",
      card: "hsl(35,20%,99%)",
      primary: "hsl(18,72%,48%)",
      text: "hsl(35,30%,12%)",
      border: "hsl(35,18%,84%)",
    },
    vars: {
      background: "35 25% 96%",
      foreground: "35 30% 12%",
      card: "35 20% 99%",
      "card-foreground": "35 30% 12%",
      popover: "35 20% 99%",
      "popover-foreground": "35 30% 12%",
      primary: "18 72% 48%",
      "primary-foreground": "0 0% 100%",
      secondary: "35 14% 90%",
      "secondary-foreground": "35 22% 22%",
      muted: "35 16% 93%",
      "muted-foreground": "35 10% 42%",
      accent: "18 72% 48%",
      "accent-foreground": "0 0% 100%",
      destructive: "0 68% 46%",
      "destructive-foreground": "0 0% 98%",
      border: "35 18% 84%",
      input: "35 16% 93%",
      ring: "18 72% 48%",
      success: "142 52% 32%",
      "success-foreground": "0 0% 100%",
      warning: "38 85% 40%",
      "warning-foreground": "0 0% 100%",
      info: "200 75% 38%",
      "info-foreground": "0 0% 100%",
      radius: "0.7rem",
    },
  },

  {
    id: "mono-light",
    name: "Mono Light",
    dark: false,
    description: "Pure white with grayscale tones. Minimal, timeless, content-first.",
    category: "special",
    emoji: "◻",
    preview: {
      bg: "hsl(0,0%,96%)",
      card: "hsl(0,0%,100%)",
      primary: "hsl(0,0%,18%)",
      text: "hsl(0,0%,10%)",
      border: "hsl(0,0%,85%)",
    },
    vars: {
      background: "0 0% 96%",
      foreground: "0 0% 10%",
      card: "0 0% 100%",
      "card-foreground": "0 0% 10%",
      popover: "0 0% 100%",
      "popover-foreground": "0 0% 10%",
      primary: "0 0% 18%",
      "primary-foreground": "0 0% 100%",
      secondary: "0 0% 90%",
      "secondary-foreground": "0 0% 22%",
      muted: "0 0% 93%",
      "muted-foreground": "0 0% 44%",
      accent: "0 0% 18%",
      "accent-foreground": "0 0% 100%",
      destructive: "0 60% 45%",
      "destructive-foreground": "0 0% 98%",
      border: "0 0% 85%",
      input: "0 0% 93%",
      ring: "0 0% 18%",
      success: "142 50% 30%",
      "success-foreground": "0 0% 100%",
      warning: "35 75% 38%",
      "warning-foreground": "0 0% 100%",
      info: "200 65% 36%",
      "info-foreground": "0 0% 100%",
      radius: "0.5rem",
    },
  },
];

export const DEFAULT_THEME_ID = "onyx";

export function getTheme(id: string, customThemes: CustomTheme[] = []): AppTheme {
  const all = [...THEMES, ...customThemes];
  return all.find((t) => t.id === id) ?? THEMES[0];
}

// ── Color conversion utilities ─────────────────────────────────────────────

export function hslStringToHex(hslStr: string): string {
  const parts = hslStr.trim().split(/\s+/);
  if (parts.length < 3) return "#888888";
  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;
  return hslToHex(h, s, l);
}

export function hexToHslString(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return "0 0% 50%";
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
