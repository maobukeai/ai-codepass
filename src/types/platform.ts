import { Page } from './navigation';

export type PlatformId =
  | 'codebuddy'
  | 'codebuddy_cn'
  | 'workbuddy'
  | 'workbuddy_ai'
  | 'qoder'
  | 'qoder_cn'
  | 'qwenwork'
  | 'trae'
  | 'trae_solo'
  | 'trae_cn'
  | 'trae_solo_cn';

export const ALL_PLATFORM_IDS: PlatformId[] = [
  'codebuddy',
  'codebuddy_cn',
  'workbuddy',
  'workbuddy_ai',
  'qoder',
  'qoder_cn',
  'qwenwork',
  'trae',
  'trae_solo',
  'trae_cn',
  'trae_solo_cn',
];

/** Platforms that do not own account lists (service / feature pages). */
export const ACCOUNTLESS_PLATFORM_IDS: readonly PlatformId[] = [];

export function isAccountPlatform(platformId: PlatformId): boolean {
  return !ACCOUNTLESS_PLATFORM_IDS.includes(platformId);
}

export const MENU_HIDDEN_PLATFORM_IDS: PlatformId[] = [];

export const MENU_VISIBLE_PLATFORM_IDS: PlatformId[] = ALL_PLATFORM_IDS.filter(
  (platformId) => !MENU_HIDDEN_PLATFORM_IDS.includes(platformId),
);

export function isMenuVisiblePlatform(platformId: PlatformId): boolean {
  return !MENU_HIDDEN_PLATFORM_IDS.includes(platformId);
}

export const PLATFORM_PAGE_MAP: Record<PlatformId, Page> = {
  codebuddy: 'codebuddy',
  codebuddy_cn: 'codebuddy-cn',
  workbuddy: 'workbuddy',
  workbuddy_ai: 'workbuddy-ai',
  qoder: 'qoder',
  qoder_cn: 'qoder-cn',
  qwenwork: 'qwenwork',
  trae: 'trae',
  trae_solo: 'trae-solo',
  trae_cn: 'trae-cn',
  trae_solo_cn: 'trae-solo-cn',
};
