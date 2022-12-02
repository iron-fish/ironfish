/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NodeFileProvider } from '../fileSystems'
import { Config } from './config'

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
describe('Config', () => {
  it('isBootstrapNodesSet should return false when default config used', async () => {
    const fileSystem = new NodeFileProvider()
    await fileSystem.init()
    const config = new Config(fileSystem, '')
    expect(config.isBootstrapNodesSet()).toBe(false)
  })
  it('isBootstrapNodesSet should return true when config is overriden', async () => {
    const fileSystem = new NodeFileProvider()
    await fileSystem.init()
    const config = new Config(fileSystem, '')
    config.setOverride('bootstrapNodes', [])
    expect(config.isBootstrapNodesSet()).toBe(true)
  })
})
