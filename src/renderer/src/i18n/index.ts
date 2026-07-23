/**
 * Initializes renderer localization and exposes all supported interface resources.
 */

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { APP_LOCALES, type AppLocale } from '@shared/types'
import de from './locales/de'
import en from './locales/en'
import es from './locales/es'
import fr from './locales/fr'
import pt from './locales/pt'
import tr from './locales/tr'
import zh from './locales/zh'

const resources: Record<string, { translation: Record<string, unknown> }> = {
  en: { translation: en as unknown as Record<string, unknown> },
  tr: { translation: tr as unknown as Record<string, unknown> },
  de: { translation: de as unknown as Record<string, unknown> },
  fr: { translation: fr as unknown as Record<string, unknown> },
  pt: { translation: pt as unknown as Record<string, unknown> },
  zh: { translation: zh as unknown as Record<string, unknown> },
  es: { translation: es as unknown as Record<string, unknown> },
}

/** Resolves the operating-system locale until persisted settings finish loading. */
export const getInitialLanguage = (): AppLocale => {
  const candidate = navigator.language.split('-')[0]
  return APP_LOCALES.find((locale) => locale === candidate) ?? 'en'
}

/** Initializes i18next once with English as a complete fallback locale. */
export const initializeI18n = async (): Promise<void> => {
  if (i18n.isInitialized) return
  await i18n.use(initReactI18next).init({
    lng: getInitialLanguage(),
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    resources,
  })
}

export default i18n
