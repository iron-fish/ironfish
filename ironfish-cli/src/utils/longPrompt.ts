/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import readline from 'readline'

async function recursePrompt(
  rl: readline.Interface,
  question: string,
  options?: {
    required?: boolean
  },
): Promise<string> {
  const promise = new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim())
    })
  })

  let userInput = (await promise) as string

  if (userInput.length === 0 && options?.required) {
    userInput = await recursePrompt(rl, question, options)
  }

  return userInput
}

// Most effective way to take in a large textual prompt input without affecting UX
export async function longPrompt(
  question: string,
  options?: {
    required?: boolean
  },
): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const userInput = await recursePrompt(rl, question, options)

  rl.close()

  return userInput
}
