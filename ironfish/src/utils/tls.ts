/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { pki } from 'node-forge'
import tls from 'tls'
import { FileSystem } from '../fileSystems'

async function getTlsOptions(
  fileSystem: FileSystem,
  nodeKeyPath: string,
  nodeCertPath: string,
): Promise<tls.TlsOptions> {
  const nodeKeyExists = await fileSystem.exists(nodeKeyPath)
  const nodeCertExists = await fileSystem.exists(nodeCertPath)

  if (!nodeKeyExists || !nodeCertExists) {
    return await generateTlsCerts(fileSystem, nodeKeyPath, nodeCertPath)
  }

  return {
    key: await fileSystem.readFile(nodeKeyPath),
    cert: await fileSystem.readFile(nodeCertPath),
  }
}

async function generateTlsCerts(
  fileSystem: FileSystem,
  nodeKeyPath: string,
  nodeCertPath: string,
): Promise<tls.TlsOptions> {
  const keyPair = pki.rsa.generateKeyPair(2048)
  const cert = pki.createCertificate()
  cert.publicKey = keyPair.publicKey
  cert.sign(keyPair.privateKey)

  const nodeKeyPem = pki.privateKeyToPem(keyPair.privateKey)
  const nodeCertPem = pki.certificateToPem(cert)

  const nodeKeyDir = fileSystem.dirname(nodeKeyPath)
  const nodeCertDir = fileSystem.dirname(nodeCertPath)

  await fileSystem.mkdir(nodeKeyDir, { recursive: true })
  await fileSystem.mkdir(nodeCertDir, { recursive: true })

  await fileSystem.writeFile(nodeKeyPath, nodeKeyPem)
  await fileSystem.writeFile(nodeCertPath, nodeCertPem)

  return { key: nodeKeyPem, cert: nodeCertPem }
}

export const TlsUtils = { getTlsOptions }
