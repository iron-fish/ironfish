/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as ironfishmodule from '@ironfish/sdk'
import { expect as expectCli, test } from '@oclif/test'
import { v4 as uuid } from 'uuid'
import { IronfishCliPKG } from '../package'

jest.mock('@ironfish/sdk', () => {
  const originalModule = jest.requireActual('@ironfish/sdk')

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return {
    ...originalModule,
    PeerNetwork: jest.fn().mockReturnValue({
      peerManager: {
        onConnect: {
          on: jest.fn(),
        },
        onDisconnect: {
          on: jest.fn(),
        },
      },
      onIsReadyChanged: {
        on: jest.fn(),
      },
      start: jest.fn(),
    }),
  }
})

describe('start command', () => {
  let isFirstRun = true
  let hasGenesisBlock = false
  let telemetryNodeId = ''
  const defaultGraffiti = 'default-graffiti'

  const verifier = {
    verifyConnectedBlock: jest
      .fn()
      .mockReturnValue(Promise.resolve({ valid: true, reason: null })),
  }

  const chain = {
    getBlock: jest.fn().mockReturnValue(Promise.resolve({})),
    verifier: verifier,
    hasGenesisBlock: hasGenesisBlock,
  }

  const setConfig = jest.fn()
  const setOverrideConfig = jest.fn()
  const start = jest.fn()
  const waitForShutdown = jest.fn()

  const ironFishSdkBackup = ironfishmodule.IronfishSdk.init

  beforeEach(() => {
    const configOptions = {
      enableTelemetry: false,
      nodeName: '',
      bootstrapNodes: [],
      blockGraffiti: defaultGraffiti,
      generateNewIdentity: false,
    }

    const internalOptions = {
      isFirstRun,
      networkIdentity: '',
      telemetryNodeId,
    }

    const config = {
      save: jest.fn(),
      set: setConfig,
      setOverride: setOverrideConfig,
      get: jest.fn().mockImplementation((config: 'enableTelemetry') => configOptions[config]),
      getArray: jest
        .fn()
        .mockImplementation((config: 'enableTelemetry') => configOptions[config]),
    }

    const internal = {
      save: jest.fn(),
      set: setConfig,
      get: jest.fn().mockImplementation((config: 'isFirstRun') => internalOptions[config]),
    }

    const accounts = {
      accountExists: jest.fn(),
      getDefaultAccount: jest.fn(),
      createAccount: jest.fn().mockImplementation(
        (name: string) =>
          new ironfishmodule.Account({
            incomingViewKey: '',
            outgoingViewKey: '',
            publicAddress: '',
            rescan: null,
            spendingKey: '',
            name,
          }),
      ),
    }

    const peerNetwork = {
      localPeer: {
        publicIdentity: 'identity',
        privateIdentity: {
          secretKey: '',
        },
      },
    }

    const node = {
      start,
      networkBridge: { attachPeerNetwork: jest.fn() },
      waitForShutdown,
      openDB: jest.fn(),
      closeDB: jest.fn(),
      accounts: accounts,
      peerNetwork: peerNetwork,
      config: config,
      internal: internal,
      chain: chain,
      pkg: IronfishCliPKG,
    }

    ironfishmodule.IronfishSdk.init = jest.fn().mockImplementation(() => ({
      clientMemory: { connect: jest.fn(), createAccount: jest.fn() },
      node: jest.fn().mockReturnValue(node),
      config: config,
      internal: internal,
    }))
  })

  afterEach(() => {
    setConfig.mockReset()
    setOverrideConfig.mockReset()
    start.mockReset()
    ironfishmodule.IronfishSdk.init = ironFishSdkBackup
  })

  describe('First run', () => {
    test
      .stdout()
      .command(['start'])
      .exit(0)
      .it('show the telemetry message, generate the genesis block', (ctx) => {
        // welcome message
        expectCli(ctx.stdout).include(`Peer Identity`)
        // telemetry
        expectCli(ctx.stdout).include(
          `To help improve Iron Fish, opt in to collecting telemetry`,
        )
        expect(setConfig).toHaveBeenCalledWith('isFirstRun', false)
        expect(setConfig).toHaveBeenCalledWith('telemetryNodeId', expect.any(String))
        // start the node
        expect(start).toHaveBeenCalled()
        expect(waitForShutdown).toHaveBeenCalled()
      })
  })

  describe('second run', () => {
    beforeAll(() => {
      isFirstRun = false
      chain.hasGenesisBlock = true
      telemetryNodeId = uuid()
    })
    test
      .stdout()
      .command(['start'])
      .exit(0)
      .it('show the telemetry message, generate the genesis block', (ctx) => {
        // welcome message
        expectCli(ctx.stdout).include(`Peer Identity`)
        expect(setConfig).toHaveBeenCalledTimes(1)
        // start the node
        expect(start).toHaveBeenCalled()
        expect(waitForShutdown).toHaveBeenCalled()
      })
  })

  describe('when first run is false and without a node id in the store', () => {
    beforeAll(() => {
      isFirstRun = false
      telemetryNodeId = ''
    })
    test
      .stdout()
      .command(['start'])
      .exit(0)
      .it('sets the node id', () => {
        expect(setConfig).toHaveBeenCalledTimes(2)
        expect(setConfig).toHaveBeenCalledWith('telemetryNodeId', expect.any(String))
      })
  })

  describe('Filters out empty string bootstrap nodes', () => {
    beforeAll(() => {
      isFirstRun = false
      hasGenesisBlock = true
    })
    test
      .stdout()
      .command(['start', '-b', ''])
      .exit(0)
      .it('Calls setOverride with an empty array', () => {
        expect(setOverrideConfig).toHaveBeenCalledWith('bootstrapNodes', [])
      })
  })

  describe('Allows for multiple bootstrap nodes', () => {
    beforeAll(() => {
      isFirstRun = false
      hasGenesisBlock = true
    })
    test
      .stdout()
      .command(['start', '-b', '127.0.0.1:9033', '-b', '127.0.0.1:9034'])
      .exit(0)
      .it('Allows for multiple bootstrap nodes', () => {
        expect(setOverrideConfig).toHaveBeenCalledWith('bootstrapNodes', [
          '127.0.0.1:9033',
          '127.0.0.1:9034',
        ])
      })
  })

  describe('Allows for comma-separated bootstrap nodes', () => {
    beforeAll(() => {
      isFirstRun = false
      hasGenesisBlock = true
    })
    test
      .stdout()
      .command(['start', '-b', '127.0.0.1:9033, 127.0.0.1:9034'])
      .exit(0)
      .it('Allows for comma-separated bootstrap nodes', () => {
        expect(setOverrideConfig).toHaveBeenCalledWith('bootstrapNodes', [
          '127.0.0.1:9033',
          '127.0.0.1:9034',
        ])
      })
  })

  describe('with the graffiti override', () => {
    describe('when the graffiti is the same as the config graffiti', () => {
      test
        .stdout()
        .command(['start', '-g', defaultGraffiti])
        .exit(0)
        .it('calls setOverride with the graffiti', () => {
          expect(setOverrideConfig).not.toHaveBeenCalled()
        })
    })

    describe('when the graffiti is different as the config graffiti', () => {
      const graffiti = 'some-graffiti'

      test
        .stdout()
        .command(['start', '-g', graffiti])
        .exit(0)
        .it('calls setOverride with the graffiti', () => {
          expect(setOverrideConfig).toHaveBeenCalledWith('blockGraffiti', graffiti)
        })
    })
  })
})
