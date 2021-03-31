/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Request, Response } from 'express'
import { FaucetJob } from '../jobs/FaucetJob'
import { Logger } from '../utils/logger'

export async function getFunds(request: Request, response: Response): Promise<Response> {
  const qs = (request.query as unknown) as Paths.GetFunds.QueryParameters

  const { email, publicKey } = qs

  try {
    const job = await FaucetJob(publicKey, email)
    Logger.debug(`Created job: ${job.task_identifier}, id: ${job.id}`)
  } catch (error: unknown) {
    response.status(500)
    if (typeof error === 'object' && error && 'toString' in error) {
      response.send(error.toString())
    }
    return response
  }

  const keyMessage = `Faucet request successfully added to the queue for key: ${publicKey}.`
  const message = email ? `Added ${email} to our newsletter. ${keyMessage}` : keyMessage

  return response.json({ message })
}
