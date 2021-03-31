/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { DATABASE_CONNECTION_STRING } from '../config'

import { Job, quickAddJob } from 'graphile-worker'
export const JOB_NAME = 'getFundsTask'

export async function FaucetJob(publicKey: string, email: string | undefined): Promise<Job> {
  return await quickAddJob({ connectionString: DATABASE_CONNECTION_STRING }, JOB_NAME, {
    publicKey,
    email,
  })
}
