const { existsSync, readFileSync } = require('fs')
const { join } = require('path')

const { platform, arch } = process

let nativeBinding = null
let localFileExisted = false
let loadError = null

function isMusl() {
  // For Node 10
  if (!process.report || typeof process.report.getReport !== 'function') {
    try {
      const lddPath = require('child_process').execSync('which ldd').toString().trim();
      return readFileSync(lddPath, 'utf8').includes('musl')
    } catch (e) {
      return true
    }
  } else {
    const { glibcVersionRuntime } = process.report.getReport().header
    return !glibcVersionRuntime
  }
}

switch (platform) {
  case 'android':
    switch (arch) {
      case 'arm64':
        localFileExisted = existsSync(join(__dirname, 'ironfish-rust-nodejs.android-arm64.node'))
        try {
          if (localFileExisted) {
            nativeBinding = require('./ironfish-rust-nodejs.android-arm64.node')
          } else {
            nativeBinding = require('@ironfish/rust-nodejs-android-arm64')
          }
        } catch (e) {
          loadError = e
        }
        break
      case 'arm':
        localFileExisted = existsSync(join(__dirname, 'ironfish-rust-nodejs.android-arm-eabi.node'))
        try {
          if (localFileExisted) {
            nativeBinding = require('./ironfish-rust-nodejs.android-arm-eabi.node')
          } else {
            nativeBinding = require('@ironfish/rust-nodejs-android-arm-eabi')
          }
        } catch (e) {
          loadError = e
        }
        break
      default:
        throw new Error(`Unsupported architecture on Android ${arch}`)
    }
    break
  case 'win32':
    switch (arch) {
      case 'x64':
        localFileExisted = existsSync(
          join(__dirname, 'ironfish-rust-nodejs.win32-x64-msvc.node')
        )
        try {
          if (localFileExisted) {
            nativeBinding = require('./ironfish-rust-nodejs.win32-x64-msvc.node')
          } else {
            nativeBinding = require('@ironfish/rust-nodejs-win32-x64-msvc')
          }
        } catch (e) {
          loadError = e
        }
        break
      case 'ia32':
        localFileExisted = existsSync(
          join(__dirname, 'ironfish-rust-nodejs.win32-ia32-msvc.node')
        )
        try {
          if (localFileExisted) {
            nativeBinding = require('./ironfish-rust-nodejs.win32-ia32-msvc.node')
          } else {
            nativeBinding = require('@ironfish/rust-nodejs-win32-ia32-msvc')
          }
        } catch (e) {
          loadError = e
        }
        break
      case 'arm64':
        localFileExisted = existsSync(
          join(__dirname, 'ironfish-rust-nodejs.win32-arm64-msvc.node')
        )
        try {
          if (localFileExisted) {
            nativeBinding = require('./ironfish-rust-nodejs.win32-arm64-msvc.node')
          } else {
            nativeBinding = require('@ironfish/rust-nodejs-win32-arm64-msvc')
          }
        } catch (e) {
          loadError = e
        }
        break
      default:
        throw new Error(`Unsupported architecture on Windows: ${arch}`)
    }
    break
  case 'darwin':
    localFileExisted = existsSync(join(__dirname, 'ironfish-rust-nodejs.darwin-universal.node'))
    try {
      if (localFileExisted) {
        nativeBinding = require('./ironfish-rust-nodejs.darwin-universal.node')
      } else {
        nativeBinding = require('@ironfish/rust-nodejs-darwin-universal')
      }
      break
    } catch {}
    switch (arch) {
      case 'x64':
        localFileExisted = existsSync(join(__dirname, 'ironfish-rust-nodejs.darwin-x64.node'))
        try {
          if (localFileExisted) {
            nativeBinding = require('./ironfish-rust-nodejs.darwin-x64.node')
          } else {
            nativeBinding = require('@ironfish/rust-nodejs-darwin-x64')
          }
        } catch (e) {
          loadError = e
        }
        break
      case 'arm64':
        localFileExisted = existsSync(
          join(__dirname, 'ironfish-rust-nodejs.darwin-arm64.node')
        )
        try {
          if (localFileExisted) {
            nativeBinding = require('./ironfish-rust-nodejs.darwin-arm64.node')
          } else {
            nativeBinding = require('@ironfish/rust-nodejs-darwin-arm64')
          }
        } catch (e) {
          loadError = e
        }
        break
      default:
        throw new Error(`Unsupported architecture on macOS: ${arch}`)
    }
    break
  case 'freebsd':
    if (arch !== 'x64') {
      throw new Error(`Unsupported architecture on FreeBSD: ${arch}`)
    }
    localFileExisted = existsSync(join(__dirname, 'ironfish-rust-nodejs.freebsd-x64.node'))
    try {
      if (localFileExisted) {
        nativeBinding = require('./ironfish-rust-nodejs.freebsd-x64.node')
      } else {
        nativeBinding = require('@ironfish/rust-nodejs-freebsd-x64')
      }
    } catch (e) {
      loadError = e
    }
    break
  case 'linux':
    switch (arch) {
      case 'x64':
        if (isMusl()) {
          localFileExisted = existsSync(
            join(__dirname, 'ironfish-rust-nodejs.linux-x64-musl.node')
          )
          try {
            if (localFileExisted) {
              nativeBinding = require('./ironfish-rust-nodejs.linux-x64-musl.node')
            } else {
              nativeBinding = require('@ironfish/rust-nodejs-linux-x64-musl')
            }
          } catch (e) {
            loadError = e
          }
        } else {
          localFileExisted = existsSync(
            join(__dirname, 'ironfish-rust-nodejs.linux-x64-gnu.node')
          )
          try {
            if (localFileExisted) {
              nativeBinding = require('./ironfish-rust-nodejs.linux-x64-gnu.node')
            } else {
              nativeBinding = require('@ironfish/rust-nodejs-linux-x64-gnu')
            }
          } catch (e) {
            loadError = e
          }
        }
        break
      case 'arm64':
        if (isMusl()) {
          localFileExisted = existsSync(
            join(__dirname, 'ironfish-rust-nodejs.linux-arm64-musl.node')
          )
          try {
            if (localFileExisted) {
              nativeBinding = require('./ironfish-rust-nodejs.linux-arm64-musl.node')
            } else {
              nativeBinding = require('@ironfish/rust-nodejs-linux-arm64-musl')
            }
          } catch (e) {
            loadError = e
          }
        } else {
          localFileExisted = existsSync(
            join(__dirname, 'ironfish-rust-nodejs.linux-arm64-gnu.node')
          )
          try {
            if (localFileExisted) {
              nativeBinding = require('./ironfish-rust-nodejs.linux-arm64-gnu.node')
            } else {
              nativeBinding = require('@ironfish/rust-nodejs-linux-arm64-gnu')
            }
          } catch (e) {
            loadError = e
          }
        }
        break
      case 'arm':
        localFileExisted = existsSync(
          join(__dirname, 'ironfish-rust-nodejs.linux-arm-gnueabihf.node')
        )
        try {
          if (localFileExisted) {
            nativeBinding = require('./ironfish-rust-nodejs.linux-arm-gnueabihf.node')
          } else {
            nativeBinding = require('@ironfish/rust-nodejs-linux-arm-gnueabihf')
          }
        } catch (e) {
          loadError = e
        }
        break
      default:
        throw new Error(`Unsupported architecture on Linux: ${arch}`)
    }
    break
  default:
    throw new Error(`Unsupported OS: ${platform}, architecture: ${arch}`)
}

if (!nativeBinding) {
  if (loadError) {
    throw loadError
  }
  throw new Error(`Failed to load native binding`)
}

const { contribute, verifyTransform, KEY_LENGTH, NONCE_LENGTH, BoxKeyPair, randomBytes, boxMessage, unboxMessage, RollingFilter, ASSET_ID_LENGTH, ASSET_METADATA_LENGTH, ASSET_NAME_LENGTH, ASSET_OWNER_LENGTH, ASSET_LENGTH, Asset, NOTE_ENCRYPTION_KEY_LENGTH, MAC_LENGTH, ENCRYPTED_NOTE_PLAINTEXT_LENGTH, ENCRYPTED_NOTE_LENGTH, NoteEncrypted, PUBLIC_ADDRESS_LENGTH, RANDOMNESS_LENGTH, MEMO_LENGTH, GENERATOR_LENGTH, AMOUNT_VALUE_LENGTH, DECRYPTED_NOTE_LENGTH, Note, TransactionPosted, PROOF_LENGTH, TRANSACTION_SIGNATURE_LENGTH, TRANSACTION_PUBLIC_KEY_RANDOMNESS_LENGTH, TRANSACTION_EXPIRATION_LENGTH, TRANSACTION_FEE_LENGTH, TRANSACTION_VERSION, Transaction, verifyTransactions, LanguageCode, generateKey, spendingKeyToWords, wordsToSpendingKey, generateKeyFromPrivateKey, incomingViewKeyToPublicAddress, initializeSapling, FoundBlockResult, ThreadPoolHandler, isValidPublicAddress } = nativeBinding

module.exports.contribute = contribute
module.exports.verifyTransform = verifyTransform
module.exports.KEY_LENGTH = KEY_LENGTH
module.exports.NONCE_LENGTH = NONCE_LENGTH
module.exports.BoxKeyPair = BoxKeyPair
module.exports.randomBytes = randomBytes
module.exports.boxMessage = boxMessage
module.exports.unboxMessage = unboxMessage
module.exports.RollingFilter = RollingFilter
module.exports.ASSET_ID_LENGTH = ASSET_ID_LENGTH
module.exports.ASSET_METADATA_LENGTH = ASSET_METADATA_LENGTH
module.exports.ASSET_NAME_LENGTH = ASSET_NAME_LENGTH
module.exports.ASSET_OWNER_LENGTH = ASSET_OWNER_LENGTH
module.exports.ASSET_LENGTH = ASSET_LENGTH
module.exports.Asset = Asset
module.exports.NOTE_ENCRYPTION_KEY_LENGTH = NOTE_ENCRYPTION_KEY_LENGTH
module.exports.MAC_LENGTH = MAC_LENGTH
module.exports.ENCRYPTED_NOTE_PLAINTEXT_LENGTH = ENCRYPTED_NOTE_PLAINTEXT_LENGTH
module.exports.ENCRYPTED_NOTE_LENGTH = ENCRYPTED_NOTE_LENGTH
module.exports.NoteEncrypted = NoteEncrypted
module.exports.PUBLIC_ADDRESS_LENGTH = PUBLIC_ADDRESS_LENGTH
module.exports.RANDOMNESS_LENGTH = RANDOMNESS_LENGTH
module.exports.MEMO_LENGTH = MEMO_LENGTH
module.exports.GENERATOR_LENGTH = GENERATOR_LENGTH
module.exports.AMOUNT_VALUE_LENGTH = AMOUNT_VALUE_LENGTH
module.exports.DECRYPTED_NOTE_LENGTH = DECRYPTED_NOTE_LENGTH
module.exports.Note = Note
module.exports.TransactionPosted = TransactionPosted
module.exports.PROOF_LENGTH = PROOF_LENGTH
module.exports.TRANSACTION_SIGNATURE_LENGTH = TRANSACTION_SIGNATURE_LENGTH
module.exports.TRANSACTION_PUBLIC_KEY_RANDOMNESS_LENGTH = TRANSACTION_PUBLIC_KEY_RANDOMNESS_LENGTH
module.exports.TRANSACTION_EXPIRATION_LENGTH = TRANSACTION_EXPIRATION_LENGTH
module.exports.TRANSACTION_FEE_LENGTH = TRANSACTION_FEE_LENGTH
module.exports.TRANSACTION_VERSION = TRANSACTION_VERSION
module.exports.Transaction = Transaction
module.exports.verifyTransactions = verifyTransactions
module.exports.LanguageCode = LanguageCode
module.exports.generateKey = generateKey
module.exports.spendingKeyToWords = spendingKeyToWords
module.exports.wordsToSpendingKey = wordsToSpendingKey
module.exports.generateKeyFromPrivateKey = generateKeyFromPrivateKey
module.exports.incomingViewKeyToPublicAddress = incomingViewKeyToPublicAddress
module.exports.initializeSapling = initializeSapling
module.exports.FoundBlockResult = FoundBlockResult
module.exports.ThreadPoolHandler = ThreadPoolHandler
module.exports.isValidPublicAddress = isValidPublicAddress
