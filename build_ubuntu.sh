#!/bin/bash

# Install dependencies here. Skip if you have already done.
echo "Start to install dependencies..."

RUST_VERSION=$(rustc --version)
if [ "${RUST_VERSION}" != "rustc 1.60.0 (7737e0b5c 2022-04-04)" ]; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  source $HOME/.cargo/env
fi

NODEJS_VERSION=$(node --version)
if [ "${NODEJS_VERSION}" != "v16.15.0" ]; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
fi

source ~/.bashrc && source ~/.nvm/nvm.sh && nvm install 16 && nvm use 16 && nvm alias default 16
npm install --global yarn
sudo ln -s ~/.nvm/versions/node/v16.15.0/bin/node /usr/bin/node

yarn install
cd ironfish-cli && yarn build
