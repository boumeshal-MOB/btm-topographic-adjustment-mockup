import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/i18n/locales/en/topographicAdjustment.json';
import fr from '@/i18n/locales/fr/topographicAdjustment.json';

export const I18N_NAMESPACE = 'topographicAdjustment';
export const LANGUAGE_STORAGE_KEY = 'btm-topographic-adjustment-language';
export const SUPPORTED_LANGUAGES = ['en', 'fr'] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export function normaliseLanguage(language: string | undefined): SupportedLanguage {
  return language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

/**
 * A surveyor working in French should not have to re-pick the language on every visit, and a
 * French browser should not open in English. Order: explicit previous choice, then the browser,
 * then English.
 */
function initialLanguage(): SupportedLanguage {
  if (typeof window === 'undefined') return 'en';
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === 'en' || stored === 'fr') return stored;
    return normaliseLanguage(window.navigator.language);
  } catch {
    return 'en'; // privacy mode / storage unavailable
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { [I18N_NAMESPACE]: en },
    fr: { [I18N_NAMESPACE]: fr },
  },
  lng: initialLanguage(),
  fallbackLng: 'en',
  supportedLngs: SUPPORTED_LANGUAGES,
  load: 'languageOnly',
  defaultNS: I18N_NAMESPACE,
  ns: [I18N_NAMESPACE],
  interpolation: { escapeValue: false },
  returnNull: false,
});

function applyLanguage(language: string | undefined): void {
  const supported = normaliseLanguage(language);
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(LANGUAGE_STORAGE_KEY, supported);
  } catch {
    // storage unavailable — the choice still applies for this session
  }
  // Keeps assistive technology and hyphenation on the right language (WCAG 3.1.1).
  if (typeof document !== 'undefined') document.documentElement.lang = supported;
}

i18n.on('languageChanged', applyLanguage);
applyLanguage(i18n.resolvedLanguage);

export default i18n;
