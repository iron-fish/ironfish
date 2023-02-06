/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { LanguageCode } from '@ironfish/rust-nodejs'
import inquirer from 'inquirer'

export const LANGUAGES = {
  English: LanguageCode.English,
  ChineseSimplified: LanguageCode.ChineseSimplified,
  ChineseTraditional: LanguageCode.ChineseTraditional,
  French: LanguageCode.French,
  Italian: LanguageCode.Italian,
  Japanese: LanguageCode.Japanese,
  Korean: LanguageCode.Korean,
  Spanish: LanguageCode.Spanish,
} as const

type LanguageCodeKey = keyof typeof LANGUAGE_CODES
type LanguageKey = keyof typeof LANGUAGES

export const LANGUAGE_KEYS = Object.keys(LANGUAGES) as Array<LanguageKey>
export const LANGUAGE_VALUES = Object.values(LANGUAGES) as Array<LanguageCode>

const LANGUAGE_CODES = {
  en: LanguageCode.English,
  fr: LanguageCode.French,
  it: LanguageCode.Italian,
  ja: LanguageCode.Japanese,
  ko: LanguageCode.Korean,
  es: LanguageCode.Spanish,
}
const CHINESE_TRADITIONAL_CODES = ['zh-cht', 'zh-hant', 'zh-hk', 'zh-mo', 'zh-tw']
const CHINESE_SIMPLIFIED_CODES = ['zh', 'zh-chs', 'zh-hans', 'zh-cn', 'zh-sg']

export async function selectLanguage(): Promise<LanguageCode> {
  const response = await inquirer.prompt<{
    language: LanguageKey
  }>([
    {
      name: 'language',
      message: `Select your language`,
      type: 'list',
      choices: LANGUAGE_KEYS,
    },
  ])
  return LANGUAGES[response.language]
}

export function inferLanguageCode(): LanguageCode | null {
  const languageCode = Intl.DateTimeFormat().resolvedOptions().locale
  if (languageCode.toLowerCase() in CHINESE_SIMPLIFIED_CODES) {
    return LanguageCode.ChineseSimplified
  }
  if (languageCode.toLowerCase() in CHINESE_TRADITIONAL_CODES) {
    return LanguageCode.ChineseTraditional
  }
  const simpleCode = languageCode?.split('-')[0].toLowerCase()
  if (simpleCode && simpleCode in LANGUAGE_CODES) {
    return LANGUAGE_CODES[simpleCode as LanguageCodeKey]
  }
  return null
}

export function languageCodeToKey(code: LanguageCode): LanguageKey {
  const key = Object.entries(LANGUAGES).find(([_, value]) => value === code)?.[0]
  if (key) {
    return key as LanguageKey
  }
  throw new Error(`No language key found for language code: ${code}`)
}
