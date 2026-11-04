import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import ko from './ko.json';

export const LANG_KEY = 'dt.lang';
export type Lang = 'en' | 'ko';

function storedLang(): Lang {
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (v === 'en' || v === 'ko') return v;
  } catch {
    // storage unavailable
  }
  return 'en';
}

export function setLang(lang: Lang): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // storage unavailable
  }
  void i18n.changeLanguage(lang);
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ko: { translation: ko } },
  lng: storedLang(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
