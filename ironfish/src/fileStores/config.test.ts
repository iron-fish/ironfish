/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { NodeFileProvider } from '../fileSystems'
import { getUniqueTestDataDir } from '../testUtilities'
import { Config } from './config'

describe('Config', () => {
  it('should load and save config', async () => {
    const dir = getUniqueTestDataDir()
    const files = await new NodeFileProvider().init()

    let config = new Config(files, dir, {})
    await config.load()
    expect(config.isSet('miningForce')).toBe(false)

    config.set('miningForce', true)
    expect(config.isSet('miningForce')).toBe(true)

    await config.save()
    config = new Config(files, dir, {})
    await config.load()

    expect(config.isSet('miningForce')).toBe(true)
    expect(config.get('miningForce')).toBe(true)
  })

  it('should let you extend config', async () => {
    const dir = getUniqueTestDataDir()
    const files = await new NodeFileProvider().init()

    const extendDefaults = { bar: 5 }
    const extendSchema = yup.object({ bar: yup.number() }).defined()

    const config = new Config(files, dir, extendDefaults, undefined, extendSchema)
    await config.load()

    expect(config.isSet('bar')).toBe(false)
    expect(config.get('bar')).toBe(5)

    config.set('bar', 10)
    expect(config.isSet('bar')).toBe(true)
    await config.save()
  })
})
