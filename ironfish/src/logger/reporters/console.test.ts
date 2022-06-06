/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// We explicitly that the reporter calls console here, so disable the lint
/* eslint-disable no-console */

import { LogLevel, logType } from 'consola'
import { format } from 'date-fns'
import { ConsoleReporter, loggers } from './console'

describe('setLogLevel', () => {
  it('sets defaultMinimumLogLevel when tag is *', () => {
    const reporter = new ConsoleReporter()
    expect(reporter.defaultMinimumLogLevel).not.toBe(LogLevel.Silent)
    reporter.setLogLevel('*', LogLevel.Silent)
    expect(reporter.defaultMinimumLogLevel).toBe(LogLevel.Silent)
  })

  it('sets tagToLogLevelMap when tag other than * is passed', () => {
    const reporter = new ConsoleReporter()
    expect(reporter.tagToLogLevelMap.get('test')).toBeUndefined()
    reporter.setLogLevel('test', LogLevel.Silent)
    expect(reporter.tagToLogLevelMap.get('test')).toBe(LogLevel.Silent)
  })
})

describe('shouldLog', () => {
  it('returns false if level is above the defaultMinimumLogLevel and no other overrides exist', () => {
    const reporter = new ConsoleReporter()
    reporter.defaultMinimumLogLevel = LogLevel.Error
    reporter.tagToLogLevelMap.clear()
    const result = reporter['shouldLog']({
      args: [],
      date: new Date(),
      level: LogLevel.Info,
      type: 'info',
      tag: 'test',
    })
    expect(result).toBe(false)
  })

  it('returns true if level equal to the defaultMinimumLogLevel and no other overrides exist', () => {
    const reporter = new ConsoleReporter()
    reporter.defaultMinimumLogLevel = LogLevel.Error
    reporter.tagToLogLevelMap.clear()
    const result = reporter['shouldLog']({
      args: [],
      date: new Date(),
      level: LogLevel.Error,
      type: 'error',
      tag: 'test',
    })
    expect(result).toBe(true)
  })

  it('returns true if an override is more permissive than defaultMinimumLogLevel', () => {
    const reporter = new ConsoleReporter()
    reporter.defaultMinimumLogLevel = LogLevel.Error
    reporter.tagToLogLevelMap.set('test', LogLevel.Info)
    const result = reporter['shouldLog']({
      args: [],
      date: new Date(),
      level: LogLevel.Info,
      type: 'info',
      tag: 'test',
    })
    expect(result).toBe(true)
  })

  it('returns true if a more specific override is more permissive', () => {
    const reporter = new ConsoleReporter()
    reporter.defaultMinimumLogLevel = LogLevel.Verbose
    reporter.tagToLogLevelMap.set('test', LogLevel.Error)
    reporter.tagToLogLevelMap.set('tag', LogLevel.Info)

    let result = reporter['shouldLog']({
      args: [],
      date: new Date(),
      level: LogLevel.Info,
      type: 'info',
      tag: 'test',
    })
    expect(result).toBe(false)

    result = reporter['shouldLog']({
      args: [],
      date: new Date(),
      level: LogLevel.Info,
      type: 'info',
      tag: 'test:tag',
    })
    expect(result).toBe(true)
  })
})

describe('logPrefix', () => {
  it('omits logPrefix if logPrefix is an empty string', () => {
    const spy = jest.spyOn(loggers, 'info').mockImplementationOnce(() => {})

    const reporter = new ConsoleReporter()
    reporter.defaultMinimumLogLevel = LogLevel.Info
    reporter.logPrefix = ''
    reporter.log({
      args: ['testlog'],
      date: new Date(),
      level: LogLevel.Info,
      type: 'info',
      tag: 'test',
    })

    expect(spy).toBeCalledWith('testlog')
    spy.mockRestore()
  })

  it('formats logPrefix if set', () => {
    const spy = jest.spyOn(loggers, 'info').mockImplementationOnce(() => {})
    const date = new Date()

    const reporter = new ConsoleReporter()
    reporter.defaultMinimumLogLevel = LogLevel.Info
    reporter.logPrefix = '[%time%] [%tag%] [%level%]'
    reporter.log({
      args: ['testlog'],
      date: date,
      level: LogLevel.Info,
      type: 'info',
      tag: 'testtag',
    })

    expect(spy).toBeCalledWith(`[${format(date, 'HH:mm:ss.SSS')}] [testtag] [info]`, 'testlog')
    spy.mockRestore()
  })
})

describe('getConsoleLogger', () => {
  it.each([
    ['fatal', console.error],
    ['error', console.error],
    ['warn', console.warn],
    ['log', console.log],
    ['info', console.info],
    ['success', console.info],
    ['debug', console.debug],
    ['trace', console.trace],
    ['verbose', console.debug],
    ['ready', console.info],
    ['start', console.info],
  ])('returns the right console logger for %s', (type, expected) => {
    const reporter = new ConsoleReporter()
    expect(reporter['getConsoleLogger'](type as unknown as logType)).toEqual(expected)
  })

  it('should throw an error when passing an invalid logType', () => {
    const reporter = new ConsoleReporter()
    expect(() => reporter['getConsoleLogger']('test' as unknown as logType)).toThrowError()
  })
})
