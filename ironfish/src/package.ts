/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import pkgJson from '../package.json'

interface PackageJson {
  name: string
  license: string
  version: string
  gitHash?: string
}

export type Package = {
  name: string
  license: string
  version: string
  git: string
}

export const getPackageFrom = (p: PackageJson): Package => ({
  name: p.name,
  license: p.license,
  version: p.version,
  git: p.gitHash || 'src',
})

export const IronfishPKG = getPackageFrom(pkgJson)
