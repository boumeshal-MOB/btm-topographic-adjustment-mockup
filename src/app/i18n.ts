import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/i18n/locales/en/topographicAdjustment.json';
import fr from '@/i18n/locales/fr/topographicAdjustment.json';

export const I18N_NAMESPACE = 'topographicAdjustment';
export const LANGUAGE_STORAGE_KEY = 'btm-topographic-adjustment-language';
export const SUPPORTED_LANGUAGES = ['en', 'fr'] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

function initialLanguage(): SupportedLanguage {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored === 'en' || stored === 'fr') return stored;
  return window.navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
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

i18n.on('languageChanged', (language) => {
  const supported = language.startsWith('fr') ? 'fr' : 'en';
  if (typeof window !== 'undefined') window.localStorage.setItem(LANGUAGE_STORAGE_KEY, supported);
  if (typeof document !== 'undefined') document.documentElement.lang = supported;
});

if (typeof document !== 'undefined') document.documentElement.lang = i18n.resolvedLanguage ?? initialLanguage();

export default i18n;
