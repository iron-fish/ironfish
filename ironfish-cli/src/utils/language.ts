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

type LanguageKey = keyof typeof LANGUAGES

export const LANGUAGE_KEYS = Object.keys(LANGUAGES) as Array<LanguageKey>

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
