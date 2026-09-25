export type Page =
  | 'dashboard'
  | 'codebuddy'
  | 'codebuddy-cn'
  | 'workbuddy'
  | 'workbuddy-ai'
  | 'qoder'
  | 'qoder-cn'
  | 'qwenwork'
  | 'trae'
  | 'trae-solo'
  | 'trae-cn'
  | 'trae-solo-cn'
  | 'instances'
  | 'settings';

/** Pages that tray / floating-card restore may navigate to after main-window recreate. */
export const MAIN_WINDOW_NAVIGABLE_PAGES: readonly Page[] = [
  'dashboard',
  'codebuddy',
  'codebuddy-cn',
  'workbuddy',
  'workbuddy-ai',
  'qoder',
  'qoder-cn',
  'qwenwork',
  'trae',
  'trae-solo',
  'trae-cn',
  'trae-solo-cn',
  'instances',
  'settings',
] as const;

export function isMainWindowNavigablePage(page: string): page is Page {
  return (MAIN_WINDOW_NAVIGABLE_PAGES as readonly string[]).includes(page);
}
