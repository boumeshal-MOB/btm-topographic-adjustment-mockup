import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/i18n/locales/en/topographicAdjustment.json';
import fr from '@/i18n/locales/fr/topographicAdjustment.json';

export const I18N_NAMESPACE = 'topographicAdjustment';

void i18n.use(initReactI18next).init({
  resources: {
    en: { [I18N_NAMESPACE]: en },
    fr: { [I18N_NAMESPACE]: fr },
  },
  lng: 'en',
  fallbackLng: 'en',
  defaultNS: I18N_NAMESPACE,
  ns: [I18N_NAMESPACE],
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
