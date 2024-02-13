/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import readline from 'readline'

// Most effective way to take in a large textual prompt input without affecting UX
function fetchResponse(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

export async function largePrompt(
  question: string,
  options?: {
    required?: boolean
  },
): Promise<string> {
  let userInput = (await fetchResponse(question)).trim()

  while (userInput.length === 0 && options?.required) {
    userInput = (await fetchResponse(question)).trim()
  }

  return userInput
}
