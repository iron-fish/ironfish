/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import fs from 'fs'
import path from 'path'
import { IJSON } from '../../serde'
import { getCurrentTestPath } from '../utils'

const FIXTURE_FOLDER = '__fixtures__'

export type FixtureGenerate<T> = () => Promise<T> | T
export type FixtureRestore<T> = (fixture: T) => Promise<void> | void
export type FitxureDeserialize<T, TSerialized> = (data: TSerialized) => Promise<T> | T
export type FixtureSerialize<T, TSerialized> = (
  fixture: T,
) => Promise<TSerialized> | TSerialized

const fixtureIds = new Map<string, { id: number; disabled: boolean }>()
const fixtureCache = new Map<string, Map<string, unknown[]>>()

export function shouldUpdateFixtures(): boolean {
  // Use the same parameters as jest snapshots for usability
  return process.argv.indexOf('--updateSnapshot') !== -1 || process.argv.indexOf('-u') !== -1
}

export function disableFixtures(): void {
  const currentTestName = expect.getState().currentTestName || ''
  const testName = currentTestName.replace(/ /g, '_')
  const fixtureInfo = fixtureIds.get(testName) || { id: 0, disabled: false }
  fixtureIds.set(testName, fixtureInfo)
  fixtureInfo.disabled = true
}

export async function useFixture<TFixture, TSerialized = unknown>(
  generate: FixtureGenerate<TFixture>,
  options: {
    restore?: FixtureRestore<TFixture>
    process?: FixtureRestore<TFixture>
    deserialize?: FitxureDeserialize<TFixture, TSerialized>
    serialize?: FixtureSerialize<TFixture, TSerialized>
  } = {},
): Promise<TFixture> {
  const testPath = getCurrentTestPath()
  const testName = expect.getState().currentTestName || ''
  const testDir = path.dirname(testPath)
  const testFile = path.basename(testPath)

  const fixtureInfo = fixtureIds.get(testName) || { id: -1, disabled: false }
  const fixtureId = (fixtureInfo.id += 1)
  fixtureIds.set(testName, fixtureInfo)

  const fixtureDir = path.join(testDir, FIXTURE_FOLDER)
  const fixtureName = `${testFile}.fixture`
  const fixturePath = path.join(fixtureDir, fixtureName)

  const updateFixtures = shouldUpdateFixtures()

  let fixtures = fixtureCache.get(testPath)

  // Load serialized fixtures in if they are not loaded
  if (!fixtures) {
    fixtures = new Map<string, TSerialized[]>()

    if (fs.existsSync(fixturePath)) {
      const buffer = await fs.promises.readFile(fixturePath)
      const data = IJSON.parse(buffer.toString('utf8')) as Record<string, TSerialized[]>

      for (const test in data) {
        fixtures.set(test, data[test])
      }
    }

    fixtureCache.set(testPath, fixtures)
  }

  let fixture: TFixture | null = null

  const serializedAll = fixtures.get(testName) || []
  fixtures.set(testName, serializedAll)

  if (!updateFixtures && !fixtureInfo.disabled && serializedAll[fixtureId]) {
    // deserialize existing fixture
    if (options.deserialize) {
      const serialized = serializedAll[fixtureId] as TSerialized
      fixture = await options.deserialize(serialized)
    } else {
      fixture = serializedAll[fixtureId] as TFixture
    }

    if (options.restore) {
      await options.restore(fixture)
    }
  } else {
    // generate the fixture
    fixture = await generate()
    const serialized = options.serialize ? await options?.serialize(fixture) : fixture
    serializedAll[fixtureId] = serialized

    if (!fs.existsSync(fixtureDir)) {
      await fs.promises.mkdir(fixtureDir)
    }

    const result = Object.fromEntries(fixtures.entries())
    const data = IJSON.stringify(result, '  ')
    await fs.promises.writeFile(fixturePath, data)
  }

  if (options.process) {
    await options.process(fixture)
  }

  return fixture
}
