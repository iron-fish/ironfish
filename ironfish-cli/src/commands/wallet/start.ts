/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
 import { IronfishNode, NodeUtils, PromiseUtils } from '@ironfish/sdk'
import { WalletNode } from '@ironfish/sdk/src/walletNode'
 import { Flags } from '@oclif/core'
 import inspector from 'node:inspector'
 import { IronfishCommand, SIGNALS } from '../../command'
 import {
   ConfigFlag,
   ConfigFlagKey,
   DataDirFlag,
   DataDirFlagKey,
   RpcHttpHostFlag,
   RpcHttpHostFlagKey,
   RpcHttpPortFlag,
   RpcHttpPortFlagKey,
   RpcTcpHostFlag,
   RpcTcpHostFlagKey,
   RpcTcpPortFlag,
   RpcTcpPortFlagKey,
   RpcTcpTlsFlag,
   RpcTcpTlsFlagKey,
   RpcUseHttpFlag,
   RpcUseHttpFlagKey,
   RpcUseIpcFlag,
   RpcUseIpcFlagKey,
   RpcUseTcpFlag,
   RpcUseTcpFlagKey,
   VerboseFlag,
   VerboseFlagKey,
 } from '../../flags'
 import { ONE_FISH_IMAGE } from '../../images'
 
 const DEFAULT_ACCOUNT_NAME = 'default'
 
 export default class Start extends IronfishCommand {
   static description = 'Start the wallet node'
 
   static flags = {
     [VerboseFlagKey]: VerboseFlag,
     [ConfigFlagKey]: ConfigFlag,
     [DataDirFlagKey]: DataDirFlag,
     [RpcUseIpcFlagKey]: { ...RpcUseIpcFlag, allowNo: true },
     [RpcUseTcpFlagKey]: { ...RpcUseTcpFlag, allowNo: true },
     [RpcUseHttpFlagKey]: { ...RpcUseHttpFlag, allowNo: true },
     [RpcTcpTlsFlagKey]: RpcTcpTlsFlag,
     [RpcTcpHostFlagKey]: RpcTcpHostFlag,
     [RpcTcpPortFlagKey]: RpcTcpPortFlag,
     [RpcHttpHostFlagKey]: RpcHttpHostFlag,
     [RpcHttpPortFlagKey]: RpcHttpPortFlag,
     port: Flags.integer({
       char: 'p',
       description: 'Port to run the local ws server on',
     }),
     workers: Flags.integer({
       description:
         'Number of CPU workers to use for long-running operations. 0 disables (likely to cause performance issues), -1 auto-detects based on CPU cores',
     }),
     upgrade: Flags.boolean({
       allowNo: true,
       description: 'Run migrations when an upgrade is required',
     }),
     networkId: Flags.integer({
       char: 'i',
       default: undefined,
       description: 'Network ID of an official Iron Fish network to connect to',
     }),
     customNetwork: Flags.string({
       char: 'c',
       default: undefined,
       description:
         'Path to a JSON file containing the network definition of a custom network to connect to',
     }),
   }
 
   node: WalletNode | null = null
 
   /**
    * This promise is used to wait until start is finished beforer closeFromSignal continues
    * because you can cause errors if you attempt to shutdown while the node is still starting
    * up to reduce shutdown hanging, start should cancel if it detects this.isClosing is true
    * and resolve this promise
    */
   startDonePromise: Promise<void> | null = null
 
   async start(): Promise<void> {
     const [startDonePromise, startDoneResolve] = PromiseUtils.split<void>()
     this.startDonePromise = startDonePromise
 
     const { flags } = await this.parse(Start)
     const {
       name,
       port,
       workers,
       upgrade,
       networkId,
       customNetwork,
     } = flags
 
     if (port !== undefined && port !== this.sdk.config.get('peerPort')) {
       this.sdk.config.setOverride('peerPort', port)
     }

     if (workers !== undefined && workers !== this.sdk.config.get('nodeWorkers')) {
       this.sdk.config.setOverride('nodeWorkers', workers)
     }

     if (name !== undefined && name.trim() !== this.sdk.config.get('nodeName')) {
       this.sdk.config.setOverride('nodeName', name.trim())
     }

     if (upgrade !== undefined && upgrade !== this.sdk.config.get('databaseMigrate')) {
       this.sdk.config.setOverride('databaseMigrate', upgrade)
     }
 
     if (networkId !== undefined && customNetwork !== undefined) {
       throw new Error(
         'Cannot specify both the networkId and customNetwork flags at the same time',
       )
     }

     if (networkId !== undefined && networkId !== this.sdk.config.get('networkId')) {
       this.sdk.config.setOverride('networkId', networkId)
     }

     if (customNetwork !== undefined && customNetwork !== this.sdk.config.get('customNetwork')) {
       this.sdk.config.setOverride('customNetwork', customNetwork)
     }
 
     const node = await this.sdk.walletNode()
 
     this.log(`\n${ONE_FISH_IMAGE}`)
     this.log(`Version       ${node.pkg.version} @ ${node.pkg.git}`)
     if (inspector.url()) {
       this.log(`Inspector     ${String(inspector.url())}`)
     }
     this.log(` `)
 
     await NodeUtils.waitForOpen(node, () => this.closing)
 
     if (this.closing) {
       return startDoneResolve()
     }
 
     if (node.internal.get('isFirstRun')) {
       await this.firstRun(node)
     }
 
     await node.start()
     this.node = node
 
     startDoneResolve()
     this.listenForSignals()
     await node.waitForShutdown()
   }
 
   async closeFromSignal(signal: SIGNALS): Promise<void> {
     this.log(`Shutting down node after ${signal}`)
     await this.startDonePromise
     await this.node?.shutdown()
     await this.node?.closeDB()
   }
 
   /**
    * Information displayed the first time a node is running
    */
   async firstRun(node: IronfishNode): Promise<void> {
     this.log('')
     this.log('Thank you for installing the Iron Fish Wallet.')
 
     if (!node.wallet.getDefaultAccount()) {
       await this.setDefaultAccount(node)
     }
 
     this.log('')
     node.internal.set('isFirstRun', false)
     await node.internal.save()
   }
 
   /**
    * Information displayed if there is no default account for the node
    */
   async setDefaultAccount(node: IronfishNode): Promise<void> {
     if (!node.wallet.accountExists(DEFAULT_ACCOUNT_NAME)) {
       const account = await node.wallet.createAccount(DEFAULT_ACCOUNT_NAME, true)
 
       this.log(`New default account created: ${account.name}`)
       this.log(`Account's public address: ${account.publicAddress}`)
     } else {
       this.log(`The default account is now: ${DEFAULT_ACCOUNT_NAME}`)
       await node.wallet.setDefaultAccount(DEFAULT_ACCOUNT_NAME)
     }
 
     this.log('')
     await node.internal.save()
   }
 }
 