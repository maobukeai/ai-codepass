import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enResources from '../locales/en.json';
import zhCnResources from '../locales/zh-CN.json';

const languageAliases: Record<string, string> = {
  'zh-CN': 'zh-cn',
  'zh-cn': 'zh-cn',
  'zh-TW': 'zh-cn',
  'zh-tw': 'zh-cn',
  'zh': 'zh-cn',
  'en-US': 'en',
  'en-us': 'en',
  'en': 'en',
};

export const supportedLanguages = [
  'zh-cn',
  'en',
];

let i18nBootstrapped = false;

export function normalizeLanguage(lang: string | null | undefined): string {
  if (!lang || typeof lang !== 'string') {
    return 'zh-cn';
  }
  const trimmed = lang.trim();
  if (!trimmed) {
    return 'zh-cn';
  }

  if (languageAliases[trimmed]) {
    return languageAliases[trimmed];
  }

  const lower = trimmed.toLowerCase();
  if (languageAliases[lower]) {
    return languageAliases[lower];
  }

  return 'en';
}

function resolveSupportedLanguage(lang: string): string {
  const normalized = normalizeLanguage(lang);
  return supportedLanguages.includes(normalized) ? normalized : 'zh-cn';
}

function getSavedLanguage(): string {
  try {
    return resolveSupportedLanguage(localStorage.getItem('app-language') || 'zh-cn');
  } catch {
    return 'zh-cn';
  }
}

function bootstrapI18n(savedLanguage: string): string {
  if (i18nBootstrapped) {
    return savedLanguage;
  }

  i18n
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: enResources },
        'zh-cn': { translation: zhCnResources },
      },
      lng: savedLanguage,
      fallbackLng: 'zh-cn',
      supportedLngs: supportedLanguages,
      lowerCaseLng: true,
      load: 'currentOnly',
      initImmediate: false,
      interpolation: {
        escapeValue: false, // React 已经处理了 XSS
      },
    });

  i18nBootstrapped = true;
  return savedLanguage;
}

export async function initI18n(): Promise<void> {
  const savedLanguage = getSavedLanguage();
  bootstrapI18n(savedLanguage);
  if (i18n.language !== savedLanguage) {
    await i18n.changeLanguage(savedLanguage);
  }
}

export async function syncLanguage(lang: string): Promise<string> {
  await initI18n();
  const resolved = resolveSupportedLanguage(lang);
  if (i18n.language !== resolved) {
    await i18n.changeLanguage(resolved);
  }
  try {
    localStorage.setItem('app-language', resolved);
  } catch {
    // ignore localStorage write failures
  }
  return resolved;
}

/**
 * 切换语言
 */
export async function changeLanguage(lang: string): Promise<void> {
  await syncLanguage(lang);
}

/**
 * 获取当前语言
 */
export function getCurrentLanguage(): string {
  return normalizeLanguage(i18n.language || 'zh-cn');
}

export default i18n;
