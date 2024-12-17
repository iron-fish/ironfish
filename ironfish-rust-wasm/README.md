# Ironfish Rust WASM

This is a WASM build of the Ironfish Rust library.

## Building on Linux

```bash
wasm-pack build --target web --release
```

## Building on Mac

```bash
AR=/opt/homebrew/opt/llvm/bin/llvm-ar CC=/opt/homebrew/opt/llvm/bin/clang cargo build --release --target wasm32-unknown-unknown
```

```bash
wasm-bindgen ../target/wasm32-unknown-unknown/release/ironfish_wasm.wasm --out-dir ./pkg                          
```

Install `wasm-bindgen`

```bash
cargo install -f wasm-bindgen-cli --version 0.2.95
```
