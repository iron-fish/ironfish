/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BufferSet } from 'buffer-map'
import * as yup from 'yup'
import {
  Assert,
  AsyncUtils,
  Block,
  BlockTemplateSerde,
  GraffitiUtils,
  SerializedBlockTemplate,
  Transaction,
} from '../../..'
import { ValidationError } from '../..'
import { ApiNamespace, router } from '..'

// TODO: This should live somewhere else
const MAX_TRANSACTIONS_PER_BLOCK = 10

export type BlockTemplateStreamRequest = Record<string, never> | undefined
export type BlockTemplateStreamResponse = SerializedBlockTemplate

export const BlockTemplateStreamRequestSchema: yup.MixedSchema<BlockTemplateStreamRequest> = yup
  .mixed()
  .oneOf([undefined] as const)
// TODO: is there a way to make a yup schema re-usable?
// this is a lot of boilerplate we end up having to duplicate for the work submit endpoint
export const BlockTemplateStreamResponseSchema: yup.ObjectSchema<BlockTemplateStreamResponse> =
  yup
    .object({
      header: yup
        .object({
          sequence: yup.number().required(),
          previousBlockHash: yup.string().required(),
          noteCommitment: yup
            .object({
              commitment: yup.string().required(),
              size: yup.number().required(),
            })
            .required()
            .defined(),
          nullifierCommitment: yup
            .object({
              commitment: yup.string().required(),
              size: yup.number().required(),
            })
            .required()
            .defined(),
          target: yup.string().required(),
          randomness: yup.number().required(),
          timestamp: yup.number().required(),
          minersFee: yup.string().required(),
          graffiti: yup.string().required(),
        })
        .required()
        .defined(),
      transactions: yup.array().of(yup.string().required()).required().defined(),
      previousBlockInfo: yup
        .object({
          difficulty: yup.string().required(),
          timestamp: yup.number().required(),
        })
        .required()
        .defined(),
    })
    .required()
    .defined()

router.register<typeof BlockTemplateStreamRequestSchema, BlockTemplateStreamResponse>(
  `${ApiNamespace.miner}/blockTemplateStream`,
  BlockTemplateStreamRequestSchema,
  async (request, node): Promise<void> => {
    // Construct a new block template and send it to the stream listener
    const onConnectBlock = async (block: Block) => {
      const newBlockSequence = block.header.sequence + 1
      // TODO: is there somewhere we can put this that makes more sense and is easier to test? memPool kinda makes sense
      // Fetch pending transactions and associated fees
      const blockTransactions: Transaction[] = []
      const nullifiers = new BufferSet()
      for (const transaction of node.memPool.get()) {
        if (blockTransactions.length >= MAX_TRANSACTIONS_PER_BLOCK) {
          break
        }

        const isExpired = node.chain.verifier.isExpiredSequence(
          transaction.expirationSequence(),
          newBlockSequence,
        )
        if (isExpired) {
          continue
        }

        const isConflicted = await AsyncUtils.find(transaction.spends(), (spend) => {
          return nullifiers.has(spend.nullifier)
        })
        if (isConflicted) {
          continue
        }

        const { valid: isValid } = await node.chain.verifier.verifyTransactionSpends(
          transaction,
        )
        if (!isValid) {
          continue
        }

        for (const spend of transaction.spends()) {
          nullifiers.add(spend.nullifier)
        }

        blockTransactions.push(transaction)
      }

      // Sum the transaction fees
      let totalTransactionFees = BigInt(0)
      const transactionFees = await Promise.all(blockTransactions.map((t) => t.fee()))
      for (const transactionFee of transactionFees) {
        totalTransactionFees += transactionFee
      }

      const account = node.accounts.getDefaultAccount()
      Assert.isNotNull(account)

      // Calculate the final fee for the miner of this block
      const minersFee = await node.strategy.createMinersFee(
        totalTransactionFees,
        newBlockSequence,
        account.spendingKey,
      )
      node.logger.debug(
        `Constructed miner's reward transaction for account ${account.displayName}, block sequence ${newBlockSequence}`,
      )

      // Create the new block as a template for mining
      const newBlock = await node.chain.newBlock(
        blockTransactions,
        minersFee,
        // TODO: cache the config checks if needed for performance
        GraffitiUtils.fromString(node.config.get('blockGraffiti')),
      )

      node.logger.debug(
        `Current block template ${newBlock.header.sequence}, has ${newBlock.transactions.length} transactions`,
      )

      const serializedBlock = BlockTemplateSerde.serialize(newBlock, block)
      request.stream(serializedBlock)
    }

    if (!node.chain.synced && !node.config.get('miningForce')) {
      // TODO: Raise a proper error to the requester
      throw new ValidationError('Node is not synced, try again once the node is fully synced')
    }

    // Wrap the listener function to avoid a deadlock from chain.newBlock()
    const timeoutWrappedListener = (block: Block) => {
      setTimeout(() => {
        void onConnectBlock(block)
      })
    }

    // Begin listening for chain head changes to generate new block templates to send to listeners
    node.chain.onConnectBlock.on(timeoutWrappedListener)

    // Send an initial block template to the requester so they can begin working immediately
    const currentHeadBlock = await node.chain.getBlock(node.chain.head)
    if (currentHeadBlock != null) {
      await onConnectBlock(currentHeadBlock)
    }

    // If the listener stops listening, we no longer need to generate new block templates
    // TODO: Verify that this would work for 2 listeners
    request.onClose.once(() => {
      node.chain.onConnectBlock.off(timeoutWrappedListener)
    })
  },
)
