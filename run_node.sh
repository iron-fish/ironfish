#!/bin/bash

source ~/.bashrc && source ~/.nvm/nvm.sh && nvm install 16 && nvm use 16 && nvm alias default 16

echo "Run your Inonfish node? If you want to join a pool, this is not necessary!"
echo "Run full node for 12 hours earns 10points."
echo "Join a mining pool can earn some mining reward which can be used for deposit, 0.1 coin = 1 point."
echo "You can run a node yourself, and run a miner connect to the pool simultaneously."

echo "Set graffiti for running full node."
echo "Skip this step in script if you already have a graffiti before."
~/ironfish/ironfish-cli/bin/ironfish testnet
# Start full node
~/ironfish/ironfish-cli/bin/ironfish start &


function exit_node()
{
    echo "Exiting..."
    kill $!
    exit
}

trap exit_node SIGINT

while :
do
  cd ~/ironfish
  echo "Checking for updates..."
  git stash
  STATUS=$(git pull)

  if [ "$STATUS" != "Already up to date." ]; then
    echo "Updated code found, rebuilding and relaunching node"
    kill -INT $!; sleep 2;
    yarn install && cd ironfish-cli && yarn build
    ~/ironfish/ironfish-cli/bin/ironfish start &
    fi

  sleep 3600;
done



