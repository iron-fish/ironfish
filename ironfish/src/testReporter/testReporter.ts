/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { format } from '@fast-csv/format'
import { Reporter, TestContext } from '@jest/reporters'
import { AggregatedResult, Test, TestResult } from '@jest/test-result'
import { Config } from '@jest/types'
import { createWriteStream, existsSync, mkdirSync } from 'fs'
import path from 'path'

type CustomReporter = Pick<Reporter, 'onRunComplete'>

interface Options {
  outputDirectory: string
}

export default class TestReporter implements CustomReporter {
  private globalConfig
  private reporterConfig: Options = {
    outputDirectory: '',
  }

  constructor(globalConfig: Config.GlobalConfig, reporterConfig: Record<string, unknown>) {
    this.globalConfig = globalConfig
    const outputDirectory = Object.entries(reporterConfig).find(
      (entry) => entry[0] === 'outputDirectory',
    )
    if (outputDirectory) {
      this.reporterConfig.outputDirectory = String(outputDirectory[1])
    }
  }
  onRunComplete!: (
    testContexts: Set<TestContext>,
    results: AggregatedResult,
  ) => void | Promise<void>

  public onTestResult(
    _test: Test,
    testResult: TestResult,
    _aggregatedResults: AggregatedResult,
  ): void {
    const testFileName = path.parse(testResult.testFilePath).name

    if (!testFileName.includes('perf')) {
      return
    }

    if (!existsSync(`${this.globalConfig.rootDir}/${this.reporterConfig.outputDirectory}`)) {
      mkdirSync(`${this.globalConfig.rootDir}/${this.reporterConfig.outputDirectory}`)
    }

    const writeStream = createWriteStream(
      `${this.globalConfig.rootDir}/${this.reporterConfig.outputDirectory}/${testFileName}.csv`,
    )

    // filter console log
    const consoleOutputs = testResult.console?.filter((output) => output.type === 'log')

    // annotation headers for influx data
    let datatypeHeader = '#datatype,measurement,field,field,time'
    let groupHeader = '#group,false,false,false'
    let defaultHeader = '#default,,,'
    if (consoleOutputs && consoleOutputs[0]) {
      const entries = consoleOutputs[0].message.split(',')
      entries.forEach((input) => {
        const entry = input.split(':')
        const value = entry[1]
        if (value) {
          const trim = value.replace(/[^\d.-]/g, '')
          if (trim.includes('.')) {
            datatypeHeader = datatypeHeader.concat(',double')
          } else {
            datatypeHeader = datatypeHeader.concat(',long')
          }
          groupHeader = groupHeader.concat(',false')
          defaultHeader = defaultHeader.concat(',')
        }
      })
    }

    writeStream.write(datatypeHeader + '\n')
    writeStream.write(groupHeader + '\n')
    writeStream.write(defaultHeader + '\n')

    const stream = format({ headers: true })
    stream.pipe(writeStream)

    testResult.testResults.forEach((result, i) => {
      const row: Record<string, string> = {
        measurement: 'perf-test',
        file: testFileName.split('.')[0],
        name: result.title,
        duration: String(result.duration),
        time: String(Date.now()),
      }

      if (consoleOutputs && consoleOutputs[i]) {
        const entries = consoleOutputs[i].message.split(',')
        entries.forEach((input) => {
          const entry = input.split(':')
          const key = entry[0]
          const value = entry[1]
          if (key && value) {
            row[key.trim()] = value.replace(/[^\d.-]/g, '')
          }
        })
      }
      stream.write(row)
    })
    writeStream.end()
  }
}
