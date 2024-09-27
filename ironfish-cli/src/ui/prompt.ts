/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ux } from '@oclif/core'
import inquirer from 'inquirer'

async function _inputPrompt(message: string, options?: { password: boolean }): Promise<string> {
  const result: { prompt: string } = await inquirer.prompt({
    type: options?.password ? 'password' : 'input',
    name: 'prompt',
    message: `${message}:`,
  })
  return result.prompt.trim()
}

export async function inputPrompt(
  message: string,
  required: boolean = false,
  options?: { password: boolean },
): Promise<string> {
  let userInput: string = ''

  if (required) {
    while (!userInput) {
      userInput = await _inputPrompt(message, options)
    }
  } else {
    userInput = await _inputPrompt(message, options)
  }

  return userInput
}

export async function confirmInputOrQuit(
  input: string,
  message?: string,
  confirm?: boolean,
): Promise<void> {
  if (confirm) {
    return
  }

  if (!message) {
    message = `Are you sure? Type ${input} to confirm.`
  }

  const entered = await inputPrompt(message, true)

  if (entered !== input) {
    ux.stdout('Operation aborted.')
    ux.exit(0)
  }
}

export async function confirmPrompt(message: string): Promise<boolean> {
  const result: { prompt: boolean } = await inquirer.prompt({
    type: 'confirm',
    // Add a new-line for readability, manually. If the prefix is set to a new-line, it seems to
    // add a space before the message, which is unwanted.
    message: `\n${message}`,
    name: 'prompt',
    prefix: '',
  })
  return result.prompt
}

export async function confirmOrQuit(message?: string, confirm?: boolean): Promise<void> {
  if (confirm) {
    return
  }

  const confirmed = await confirmPrompt(message || 'Do you confirm?')

  if (!confirmed) {
    ux.stdout('Operation aborted.')
    ux.exit(0)
  }
}

export async function listPrompt<T>(
  message: string,
  choices: T[],
  name: (v: T) => string,
  alphebetize: boolean = true,
): Promise<T> {
  const values = choices.map((v) => ({
    name: name(v),
    value: v,
  }))

  if (alphebetize) {
    values.sort((a, b) => a.name.localeCompare(b.name))
  }

  const selection = await inquirer.prompt<{ prompt: T }>([
    {
      name: 'prompt',
      message: message,
      type: 'list',
      choices: values,
    },
  ])

  return selection.prompt
}
