/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { FileSystem, PromiseUtils } from '@ironfish/sdk'
import readline from 'readline'

// Most effective way to take in a large textual prompt input without affecting UX
export async function longPrompt(
  question: string,
  options?: {
    required?: boolean
  },
  readlineInterface?: readline.Interface,
): Promise<string> {
  const rl =
    readlineInterface ||
    readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

  const userInput = await new Promise<string>((resolve) => {
    rl.question(question + ': ', (answer) => {
      resolve(answer.trim())
    })
  })

  if (userInput.length === 0 && options?.required) {
    return longPrompt(question, options, rl)
  }

  rl.close()

  return userInput
}

export async function importFile(fileSystem: FileSystem, path: string): Promise<string> {
  const resolved = fileSystem.resolve(path)
  const data = await fileSystem.readFile(resolved)
  return data.trim()
}

export async function importPipe(): Promise<string> {
  let data = ''

  const onData = (dataIn: string): void => {
    data += dataIn.trim()
  }

  process.stdin.setEncoding('utf8')
  process.stdin.on('data', onData)

  while (!process.stdin.readableEnded) {
    await PromiseUtils.sleep(100)
  }

  process.stdin.off('data', onData)

  return data
}
