/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert, Config } from '@ironfish/sdk'
import { spawn } from 'child_process'

export function launchEditor(file: string, config?: Config): Promise<number | null> {
  let editor = process.env.EDITOR

  if (!editor && config) {
    editor = config.get('editor')
  }

  if (!editor) {
    throw new Error(
      `you must set the EDITOR environment variable or 'editor' in the ironfish config`,
    )
  }

  return new Promise<number | null>((resolve, reject) => {
    Assert.isNotUndefined(editor)
    const process = spawn(editor, [file], { stdio: 'inherit' })
    process.on('exit', (code) => resolve(code))
    process.on('error', (error) => reject(error))
  })
}
