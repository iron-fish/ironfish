/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable no-console */
import { Hook } from '@oclif/config'
import { Package } from 'ironfish'
import { Platform } from 'ironfish'

const VersionHook: Hook<'init'> = (): void => {
  const isVersionCmd = process.argv[2] === 'version'
  const hasDashVersion = process.argv.some((a) => a === '--version')
  const showVersion = isVersionCmd || hasDashVersion

  if (showVersion) {
    const runtime = Platform.getRuntime()

    console.log(`name       ${Package.name}`)
    console.log(`version    ${Package.version}`)
    console.log(`git        ${Package.git}`)
    console.log(`runtime    ${runtime.type}/${runtime.runtime}`)

    return process.exit(0)
  }
}

export default VersionHook
