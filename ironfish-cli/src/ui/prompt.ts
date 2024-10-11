/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Logger } from '@ironfish/sdk'
import { ux } from '@oclif/core'
import inquirer from 'inquirer'
import { longPrompt } from './longPrompt'

export async function collectStrings(
  itemName: string,
  itemAmount: number,
  options?: {
    additionalStrings?: string[]
    allowDuplicate?: boolean
    errorOnDuplicate?: boolean
    logger?: Logger
  },
): Promise<string[]> {
  const strings = new Set(options?.additionalStrings || [])
  const duplicates = []

  for (let i = 0; i < itemAmount; i++) {
    let item
    while (!item) {
      item = await longPrompt(`${itemName} #${i + 1}`, { required: true })

      if (strings.has(item)) {
        if (options?.allowDuplicate) {
          duplicates.push(item)
          continue
        } else if (options?.errorOnDuplicate) {
          throw new Error(`Duplicate ${itemName} found in the list`)
        } else {
          options?.logger?.log(`Duplicate ${itemName}`)
          item = undefined
        }
      }
    }
    strings.add(item)
  }

  return [...strings, ...duplicates]
}

async function _inputPrompt(message: string, options?: { password: boolean }): Promise<string> {
  const result: { prompt: string } = await inquirer.prompt({
    type: options?.password ? 'password' : 'input',
    name: 'prompt',
    message: `${message}:`,
  })
  return result.prompt.trim()
}

export async function inputNumberPrompt(
  logger: Logger,
  message: string,
  options: {
    required?: boolean
    integer?: boolean
  },
): Promise<number> {
  const validateNumber = (input: string): number => {
    const num = Number(input)

    if (isNaN(num)) {
      throw new Error('Input must be a number')
    }

    if (options.integer && num % 1 !== 0) {
      throw new Error('Input must be an integer')
    }

    return num
  }

  if (options.required) {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const userInput = await _inputPrompt(message)
        return validateNumber(userInput)
      } catch (e) {
        if (e instanceof Error) {
          logger.error(e.message)
        } else {
          logger.error('An error occurred. Please try again.')
        }
      }
    }
  }

  return validateNumber(await _inputPrompt(message))
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

export async function confirmList(message: string, action = 'Confirm'): Promise<boolean> {
  const result = await inquirer.prompt<{ confirm: boolean }>([
    {
      name: 'confirm',
      message,
      type: 'list',
      choices: [
        {
          name: action,
          value: true,
          default: true,
        },
        {
          name: 'Cancel',
          value: false,
        },
      ],
    },
  ])

  return result.confirm
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
