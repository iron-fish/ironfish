# @ironfish/ironfish-wasm

Iron Fish WASM package that compiles native Iron Fish code to WebAssembly with TypeScript bindings. This package allows you to use Iron Fish cryptographic functionality in browser extensions, web applications, or any JavaScript environment.

## Installation

```bash
npm install @ironfish/ironfish-wasm
```

## Description

This package provides WebAssembly bindings for Iron Fish's core cryptographic functionality, making it possible to use Iron Fish features in web-based applications. The WASM compilation ensures high performance while maintaining compatibility across different JavaScript environments.

## Features

- Native Iron Fish code compiled to WebAssembly
- TypeScript bindings for better developer experience
- Compatible with browser extensions and web applications
- High-performance cryptographic operations
- Cross-platform compatibility

## Usage

```typescript
import { SaplingKey, Note, AssetIdentifier, UnsignedTransaction } from '@ironfish/ironfish-wasm';

// Generate new keys
const senderKey = SaplingKey.random();
const recipientKey = SaplingKey.random();

// Create a native asset note (IRON)
const note = Note.fromParts(
  recipientKey.publicAddress,
  BigInt(100), // Amount
  "Transfer memo",
  AssetIdentifier.native,
  senderKey.publicAddress
);

// Create an unsigned transaction
const bytes = new Uint8Array([/* transaction bytes */]);
const unsignedTx = new UnsignedTransaction(bytes);

// Sign the transaction
const signedTx = unsignedTx.sign(senderKey);

// Get transaction details
console.log({
  fee: signedTx.fee,
  expiration: signedTx.expiration,
  outputs: signedTx.outputs.length,
  spends: signedTx.spends.length
});

// Export keys as hex for storage
const exportedKey = senderKey.toHex();

// Import key from hex
const importedKey = SaplingKey.fromHex(exportedKey);
```

## License

This project is licensed under the MIT License - see the [LICENSE](https://github.com/iron-fish/ironfish/blob/master/LICENSE) file for details.

## Requirements

- Node.js 20.0.0 or higher
- A JavaScript environment with WebAssembly support

## Contributing

See [CONTRIBUTING.md](https://github.com/iron-fish/ironfish/blob/master/CONTRIBUTING.md) for more information on how to contribute to this project.

## Links

- [Iron Fish Website](https://ironfish.network)
- [Documentation](https://ironfish.network/developers/documentation/)

## Support

For questions, issues, or support:
- Join our [Discord](https://discord.ironfish.network)
- File an issue on [GitHub](https://github.com/iron-fish)
