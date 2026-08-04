import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import en from './locales/en.json'
import zhCN from './locales/zh-CN.json'

export type Locale = 'en' | 'zh-CN'
type Messages = typeof en
export type MessageKey = keyof Messages

const localeStorageKey = 'context-canvas.locale.v1'
const messages: Record<Locale, Messages> = { en, 'zh-CN': zhCN }

function initialLocale(): Locale {
  if (typeof window === 'undefined') return 'en'
  return window.localStorage.getItem(localeStorageKey) === 'zh-CN' ? 'zh-CN' : 'en'
}

function formatMessage(message: string, values?: Record<string, string | number>) {
  if (!values) return message
  return Object.entries(values).reduce((result, [key, value]) => result.split(`{{${key}}}`).join(String(value)), message)
}

const I18nContext = createContext<{
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: MessageKey, values?: Record<string, string | number>) => string
} | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)
  const setLocale = (nextLocale: Locale) => {
    setLocaleState(nextLocale)
    window.localStorage.setItem(localeStorageKey, nextLocale)
  }
  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t: (key: MessageKey, values?: Record<string, string | number>) => formatMessage(messages[locale][key] || messages.en[key], values),
    }),
    [locale],
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside I18nProvider')
  return value
}

export function getMessage(locale: Locale, key: MessageKey, values?: Record<string, string | number>) {
  return formatMessage(messages[locale][key] || messages.en[key], values)
}
