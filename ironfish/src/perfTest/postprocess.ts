/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
import { readJSON, writeCSV, unZipFromFile } from 'https://deno.land/x/flat@0.0.15/mod.ts'

const inputFile = Deno.args[0]
const filepath = './testResult'
const filename = 'tests.json'

const result = await unZipFromFile(inputFile, filepath)
const output = result ? 'File unzipped successfully' : 'Error unzipping'
const data = await readJSON(`${filepath}/${filename}`)
const csvData= data.cases.map((case) => {
    return { "test_name" : case.test_name ,
             "time": case.states[0].success.time,
             "commit": data.formatted.stats.commit,
           }
})

await writeCSV('perf_tests.csv', csvData, {append: true})