'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import type { UILanguage } from '@/lib/i18n'
import { SUPPORTED_LANGUAGES } from '@/lib/i18n'

interface LangContextValue {
  lang: UILanguage
  setLang: (l: UILanguage) => void
}

const LangContext = createContext<LangContextValue>({ lang: 'en', setLang: () => {} })

const SUPPORTED_CODES: UILanguage[] = SUPPORTED_LANGUAGES.map((l) => l.code)

function isSupported(code: string): code is UILanguage {
  return SUPPORTED_CODES.includes(code as UILanguage)
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<UILanguage>('en')

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('mm-lang') : null
    if (saved && isSupported(saved)) {
      setLangState(saved)
      return
    }
    // Auto-detect from browser
    if (typeof window !== 'undefined') {
      const browserLang = navigator.language.split('-')[0]
      if (isSupported(browserLang)) setLangState(browserLang as UILanguage)
    }
  }, [])

  const setLang = (l: UILanguage) => {
    setLangState(l)
    if (typeof window !== 'undefined') localStorage.setItem('mm-lang', l)
    // Also persist to server so AI uses the right language for replies
    fetch('/api/me/language', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: l }),
    }).catch(() => {})
  }

  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>
}

export function useLang() {
  return useContext(LangContext)
}

// Language picker UI — dropdown with native names + flags
export function LanguagePicker({ className = '' }: { className?: string }) {
  const { lang, setLang } = useLang()
  return (
    <div className={`relative ${className}`}>
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as UILanguage)}
        className="appearance-none bg-white border border-ink-200 rounded-lg px-3 py-1.5 pr-8 text-sm text-ink-700 cursor-pointer hover:border-ink-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
      >
        {SUPPORTED_LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.native} {l.code !== 'en' && `(${l.label})`}
          </option>
        ))}
      </select>
      <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none text-ink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  )
}