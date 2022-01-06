/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ConsolaReporterLogObject } from 'consola'
import * as yup from 'yup'
import { InterceptReporter } from '../../../logger'
import { IJSON } from '../../../serde'
import { ApiNamespace, router } from '../router'

// eslint-disable-next-line @typescript-eslint/ban-types
export type GetLogStreamRequest = {} | undefined

export type GetLogStreamResponse = {
  level: string
  type: string
  tag: string
  args: string
  date: string
}

export const GetLogStreamRequestSchema: yup.ObjectSchema<GetLogStreamRequest> = yup
  .object({})
  .notRequired()
  .default({})

export const GetLogStreamResponseSchema: yup.ObjectSchema<GetLogStreamResponse> = yup
  .object({
    level: yup.string().defined(),
    type: yup.string().defined(),
    tag: yup.string().defined(),
    args: yup.string().defined(),
    date: yup.string().defined(),
  })
  .defined()

router.register<typeof GetLogStreamRequestSchema, GetLogStreamResponse>(
  `${ApiNamespace.node}/getLogStream`,
  GetLogStreamRequestSchema,
  (request, node): void => {
    const reporter = new InterceptReporter((logObj: ConsolaReporterLogObject): void => {
      request.stream({
        level: String(logObj.level),
        type: logObj.type,
        tag: logObj.tag,
        args: IJSON.stringify(logObj.args),
        date: logObj.date.toISOString(),
      })
    })

    node.logger.addReporter(reporter)

    request.onClose.on(() => {
      node.logger.removeReporter(reporter)
    })
  },
)
