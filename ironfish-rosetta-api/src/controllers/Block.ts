/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Request, Response } from 'express'
import { HandleRequest } from './Controller'

export const block = async (request: Request, response: Response): Promise<void> => {
  await HandleRequest(request, response)
}

export const blockTransaction = async (request: Request, response: Response): Promise<void> => {
  await HandleRequest(request, response)
}
