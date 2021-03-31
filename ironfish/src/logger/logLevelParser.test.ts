/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { LogLevel } from 'consola'
import { parseLogLevelConfig } from './logLevelParser'

describe('parseLogLevelConfig', () => {
  it('should handle multiple entries separated by commas', () => {
    const parsed = parseLogLevelConfig('tag:error,tagtwo:warn')
    expect(parsed).toHaveLength(2)
    expect(parsed[0][0]).toBe('tag')
    expect(parsed[0][1]).toBe(LogLevel.Error)
    expect(parsed[1][0]).toBe('tagtwo')
    expect(parsed[1][1]).toBe(LogLevel.Warn)
  })

  it('should convert mixed-case tags to lowercase', () => {
    const parsed = parseLogLevelConfig('TeSt:info')
    expect(parsed).toHaveLength(1)
    expect(parsed[0][0]).toBe('test')
    expect(parsed[0][1]).toBe(LogLevel.Info)
  })

  it('should convert mixed-case log levels to lowercase', () => {
    const parsed = parseLogLevelConfig('test:InFo')
    expect(parsed).toHaveLength(1)
    expect(parsed[0][0]).toBe('test')
    expect(parsed[0][1]).toBe(LogLevel.Info)
  })

  it('should parse standalone log levels into wildcard tag', () => {
    const parsed = parseLogLevelConfig('warn')
    expect(parsed).toHaveLength(1)
    expect(parsed[0][0]).toBe('*')
    expect(parsed[0][1]).toBe(LogLevel.Warn)
  })

  it('should throw when passed an invalid log level', () => {
    expect(() => parseLogLevelConfig('test:qwer')).toThrowError()
  })

  it('should throw when passed a config with too many colons', () => {
    expect(() => parseLogLevelConfig('test::warn')).toThrowError()
  })
})
