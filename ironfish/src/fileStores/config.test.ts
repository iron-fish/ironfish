/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { mockFileSystem } from '../network/testUtilities/mockHostsStore'
import {
  Config,
  ConfigOptionsSchema,
  DEFAULT_EXPLORER_BLOCKS_URL,
  isPercent,
  isPort,
  isUrl,
  isWholeNumber,
  noWhitespaceBegEnd,
} from './config'

function valid(schema: yup.ObjectSchema, obj: unknown) {
  return schema.isValidSync(obj)
}

// Tests the number validations in the config schema
describe('ConfigOptionsSchema::numbers', () => {
  type Config = {
    int1: number
    int2: number
    port1: number
    port2: number
    percent: number
  }

  const schema: yup.ObjectSchema<Partial<Config>> = yup
    .object({
      int1: isWholeNumber,
      int2: isWholeNumber,
      port1: isPort,
      port2: isPort,
      percent: isPercent,
    })
    .defined()

  {
    const obj = {
      int1: 0,
      int2: 42,
    }
    it('isWholeNumber', () => {
      expect(valid(schema, obj)).toBe(true)
    })
  }
  {
    const obj = { int1: false }
    it('boolIsNotInteger', () => {
      expect(valid(schema, obj)).toBe(false)
    })
  }
  {
    const obj = { int1: 4.2 }
    it('floatIsNotInteger', () => {
      expect(valid(schema, obj)).toBe(false)
    })
  }
  {
    const obj = { int1: -1 }
    it('isNotPosInteger', () => {
      expect(valid(schema, obj)).toBe(false)
    })
  }
  {
    const obj = { port1: 1, port2: 65535 }
    it('isPortRange', () => {
      expect(valid(schema, obj)).toBe(true)
    })
  }
  {
    const obj = { port1: -1 }
    it('isNotPort', () => {
      expect(valid(schema, obj)).toBe(false)
    })
  }
  {
    const obj = { percent: 0 }
    it('isPercentLow', () => {
      expect(valid(schema, obj)).toBe(true)
    })
  }
  {
    const obj = { percent: 100 }
    it('isPercentHigh', () => {
      expect(valid(schema, obj)).toBe(true)
    })
  }
  {
    const obj = { percent: '10%' }
    it('stringIsNotPercent', () => {
      expect(valid(schema, obj)).toBe(false)
    })
  }
  {
    const obj = { percent: 101 }
    it('outOfRangePercent', () => {
      expect(valid(schema, obj)).toBe(false)
    })
  }
})

// Tests the string validations in the config schema
describe('ConfigOptionsSchema::strings', () => {
  type Config = {
    s1: string
    s2: string
    url1: string
  }

  const schema: yup.ObjectSchema<Partial<Config>> = yup
    .object({
      s1: noWhitespaceBegEnd,
      s2: noWhitespaceBegEnd,
      url1: isUrl,
    })
    .defined()

  {
    const obj = {
      s1: '/usr/bin/nvim',
      s2: String.raw`C:\ironfish\is best`,
    }
    it('isPath', () => {
      expect(valid(schema, obj)).toBe(true)
    })
  }
  {
    const obj = {
      s1: ' /usr/bin/nvim',
    }
    it('isNotPathLeadingWhitespace', () => {
      expect(valid(schema, obj)).toBe(false)
    })
  }
  {
    const obj = {
      s1: '/usr/bin/nvim   ',
    }
    it('isNotPathTrailingWhitspace', () => {
      expect(valid(schema, obj)).toBe(false)
    })
  }
  {
    const obj = {
      url1: DEFAULT_EXPLORER_BLOCKS_URL,
    }
    it('isUrl', () => {
      expect(valid(schema, obj)).toBe(true)
    })
  }
  {
    const obj = {
      url1: '192.168.1.0',
    }
    it('ipIsNotUrl', () => {
      expect(valid(schema, obj)).toBe(false)
    })
  }
})

// Tests the default config options against the schema
describe('ConfigOptionsSchema', () => {
  const configOptions = Config.GetDefaults(mockFileSystem(), 'foo')

  it('ConfigDefaults', () => {
    expect(valid(ConfigOptionsSchema, configOptions)).toBe(true)
  })
})
