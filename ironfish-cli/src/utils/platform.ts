/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Platform } from '@ironfish/sdk'
import { spawn } from 'child_process'

/**
 * Opens a resolved path in the OS specific explorer for a relevant path
 * On mac it uses finder, on windows it uses explorer.
 * @param dir The path or file to browse to
 * @returns false if the OS explorer could not be detected
 */
export function browse(dir: string): boolean {
  const platform = Platform.getName()

  switch (platform) {
    case 'win32':
      spawn('explorer', [dir])
      break
    case 'darwin':
      spawn('open', [dir])
      break
    default:
      return false
  }

  return true
}

export const PlatformUtils = {
  browse,
}
