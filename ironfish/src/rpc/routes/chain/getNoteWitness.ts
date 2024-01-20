/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { GENESIS_BLOCK_SEQUENCE } from '../../../primitives'
import { RpcValidationError } from '../../adapters'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'

export type GetNoteWitnessRequest = {
  index: number
  confirmations?: number
}

export type GetNoteWitnessResponse = {
  treeSize: number
  rootHash: string
  authPath: {
    side: 'Left' | 'Right'
    hashOfSibling: string
  }[]
}

export const GetNoteWitnessRequestSchema: yup.ObjectSchema<GetNoteWitnessRequest> = yup
  .object({
    index: yup.number().min(0).defined(),
    confirmations: yup.number().min(0),
  })
  .defined()

export const GetNoteWitnessResponseSchema: yup.ObjectSchema<GetNoteWitnessResponse> = yup
  .object({
    treeSize: yup.number().defined(),
    rootHash: yup.string().defined(),
    authPath: yup
      .array(
        yup
          .object({
            side: yup.string().oneOf(['Left', 'Right']).defined(),
            hashOfSibling: yup.string().defined(),
          })
          .defined(),
      )
      .defined(),
  })
  .defined()

routes.register<typeof GetNoteWitnessRequestSchema, GetNoteWitnessResponse>(
  `${ApiNamespace.chain}/getNoteWitness`,
  GetNoteWitnessRequestSchema,
  async (request, node): Promise<void> => {
    Assert.isInstanceOf(node, FullNode)
    const { chain } = node

    const confirmations = request.data.confirmations ?? node.config.get('confirmations')

    const maxConfirmedSequence = Math.max(
      chain.head.sequence - confirmations,
      GENESIS_BLOCK_SEQUENCE,
    )
    const maxConfirmedHeader = await chain.getHeaderAtSequence(maxConfirmedSequence)

    Assert.isNotNull(maxConfirmedHeader)
    Assert.isNotNull(maxConfirmedHeader?.noteSize)

    const witness = await chain.notes.witness(request.data.index, maxConfirmedHeader.noteSize)

    if (witness === null) {
      throw new RpcValidationError(
        `No confirmed notes exist with index ${request.data.index} in tree of size ${maxConfirmedHeader.noteSize}`,
      )
    }

    const authPath = witness.authenticationPath.map((step) => {
      return {
        side: step.side,
        hashOfSibling: step.hashOfSibling.toString('hex'),
      }
    })

    request.end({
      treeSize: witness.treeSize(),
      rootHash: witness.rootHash.toString('hex'),
      authPath,
    })
  },
)
