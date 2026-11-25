/* Colour themes (25 Nov 2026): the person picks their theme in the sidebar; Indigo is the default.
   Each theme sets the page, the lines, the text, the action colour and the sidebar. Red, amber and green
   stay the same in every theme, for what is wrong, late or done. The choice is kept in this browser only. */
export type Theme = { id: string; name: string; ground: string; surface2: string; surface3: string; line: string; lineSoft: string;
  ink: string; inkSoft: string; inkFaint: string; accent: string; sidebar: string; sidebarInk: string };

export const THEMES: Theme[] = [
  { id: 'indigo',   name: 'Indigo',               ground: '#f0f1fa', surface2: '#f6f7fd', surface3: '#e6e7f6', line: '#dcdef0', lineSoft: '#e8e9f6', ink: '#1c1d3a', inkSoft: '#4b4d6e', inkFaint: '#6f7194', accent: '#4338ca', sidebar: '#2f2c7a', sidebarInk: '#eeeefe' },
  { id: 'ocean',    name: 'Ocean blue',           ground: '#edf3fa', surface2: '#f4f8fc', surface3: '#e1eaf5', line: '#d6e1ee', lineSoft: '#e4ecf6', ink: '#14243a', inkSoft: '#46566c', inkFaint: '#66788f', accent: '#1d5fa8', sidebar: '#16467d', sidebarInk: '#eef4fb' },
  { id: 'navy',     name: 'Navy and sand',        ground: '#f4f1ea', surface2: '#f8f6f1', surface3: '#ebe6dc', line: '#e0d9cc', lineSoft: '#ece7dd', ink: '#1b2433', inkSoft: '#4b5566', inkFaint: '#6c7484', accent: '#1e3a5f', sidebar: '#1b2a40', sidebarInk: '#f3f1ea' },
  { id: 'lilac',    name: 'Lilac',                ground: '#f4f1fa', surface2: '#f9f7fd', surface3: '#ebe5f6', line: '#e2dbf0', lineSoft: '#ece7f6', ink: '#251f38', inkSoft: '#554d6c', inkFaint: '#776f8e', accent: '#6d4fc0', sidebar: '#4f3f86', sidebarInk: '#f5f1fd' },
  { id: 'berry',    name: 'Berry magenta',        ground: '#f9eff5', surface2: '#fcf5f9', surface3: '#f2e1eb', line: '#ecd7e2', lineSoft: '#f3e5ec', ink: '#341827', inkSoft: '#674656', inkFaint: '#8a6a7a', accent: '#a3286f', sidebar: '#6e1c4f', sidebarInk: '#fdf0f7' },
  { id: 'plum',     name: 'Plum and rose',        ground: '#f8f0f3', surface2: '#fcf6f8', surface3: '#efe0e7', line: '#e8d8df', lineSoft: '#f1e6eb', ink: '#2f1a28', inkSoft: '#634a58', inkFaint: '#856c7a', accent: '#8e3b6e', sidebar: '#45213c', sidebarInk: '#fbf0f5' },
  { id: 'sage',     name: 'Sage and forest',      ground: '#ecf2ee', surface2: '#f3f7f4', surface3: '#e1eae4', line: '#d6e2da', lineSoft: '#e4ece7', ink: '#1c2b24', inkSoft: '#4a5b52', inkFaint: '#687a70', accent: '#1f5c46', sidebar: '#1f4a3a', sidebarInk: '#f2f7f4' },
  { id: 'teal',     name: 'Teal',                 ground: '#ebf5f4', surface2: '#f3f9f8', surface3: '#ddedeb', line: '#d2e5e3', lineSoft: '#e1eeec', ink: '#132b2a', inkSoft: '#43605d', inkFaint: '#627e7b', accent: '#0f766e', sidebar: '#0e5953', sidebarInk: '#ecf8f6' },
  { id: 'mint',     name: 'Slate and mint',       ground: '#eef4f3', surface2: '#f5f9f8', surface3: '#e2ebe9', line: '#d8e4e2', lineSoft: '#e5edeb', ink: '#1a2633', inkSoft: '#4a5866', inkFaint: '#6a7886', accent: '#1f8a70', sidebar: '#233447', sidebarInk: '#eef5f5' },
  { id: 'terra',    name: 'Terracotta',           ground: '#f9f1eb', surface2: '#fcf6f1', surface3: '#f1e2d6', line: '#ebd9cc', lineSoft: '#f2e6dd', ink: '#36231a', inkSoft: '#6a5244', inkFaint: '#8b7365', accent: '#b0492a', sidebar: '#7d3420', sidebarInk: '#fdf1ea' },
  { id: 'ivory',    name: 'Warm ivory',           ground: '#f6f1e8', surface2: '#f8f3ea', surface3: '#ede5d7', line: '#e4dccd', lineSoft: '#eee7dc', ink: '#2a2620', inkSoft: '#5a5246', inkFaint: '#7c7365', accent: '#1f5c46', sidebar: '#3b352b', sidebarInk: '#fbf7ef' },
  { id: 'charcoal', name: 'Charcoal and mustard', ground: '#f7f4ea', surface2: '#fbf9f2', surface3: '#eee8d6', line: '#e5dfcb', lineSoft: '#eee9d9', ink: '#222222', inkSoft: '#555149', inkFaint: '#75705f', accent: '#2b2b2b', sidebar: '#232323', sidebarInk: '#f5d77a' },
  { id: 'classic',  name: 'BSC classic',          ground: '#f5f4ef', surface2: '#f8f7f2', surface3: '#ecebe3', line: '#d9d8cc', lineSoft: '#e9e8df', ink: '#15170f', inkSoft: '#3f4239', inkFaint: '#646a5c', accent: '#1f6f4a', sidebar: '#162119', sidebarInk: '#f3f6f1' },
];
export const DEFAULT_THEME = 'indigo';
const KEY = 'bsc-plm-theme';

export function savedTheme(): string { try { return localStorage.getItem(KEY) ?? DEFAULT_THEME; } catch { return DEFAULT_THEME; } }
export function applyTheme(id: string) {
  const t = THEMES.find(x => x.id === id) ?? THEMES[0]; const r = document.documentElement;
  const set = (k: string, v: string) => r.style.setProperty(k, v);
  r.setAttribute('data-theme', 'light'); r.setAttribute('data-palette', t.id);
  set('--ground', t.ground); set('--surface', '#ffffff'); set('--surface-2', t.surface2); set('--surface-3', t.surface3);
  set('--line', t.line); set('--line-soft', t.lineSoft); set('--ink', t.ink); set('--ink-soft', t.inkSoft); set('--ink-faint', t.inkFaint);
  set('--accent', t.accent); set('--accent-soft', `color-mix(in srgb, ${t.accent} 11%, #ffffff)`); set('--accent-ink', '#ffffff');
  set('--sidebar', t.sidebar); set('--sidebar-ink', t.sidebarInk); set('--sidebar-soft', `color-mix(in srgb, ${t.sidebarInk} 72%, ${t.sidebar})`);
  set('--sidebar-active', `color-mix(in srgb, ${t.sidebarInk} 18%, ${t.sidebar})`);
  try { localStorage.setItem(KEY, t.id); } catch { /* private window: the theme still applies for this visit */ }
}
