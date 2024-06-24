import * as yup from 'yup'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { getAccount } from './utils'

export type EncryptWalletRequest = { passphrase: string, account: string }
export type EncryptWalletResponse = {}

export const EncryptWalletRequestSchema: yup.ObjectSchema<EncryptWalletRequest> = yup
  .object({
    account: yup.string().defined(),
    passphrase: yup.string().defined(),
  })
  .defined()

export const EncryptWalletResponseSchema: yup.ObjectSchema<EncryptWalletResponse> = yup
  .object({
  })
  .defined()

routes.register<typeof EncryptWalletRequestSchema, EncryptWalletResponse>(
  `${ApiNamespace.wallet}/createAccount`,
  EncryptWalletRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'wallet')

    const account = getAccount(context.wallet, request.data.account)

    request.end({})
  },
)
