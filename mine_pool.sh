#!/bin/bash

source ~/.bashrc && source ~/.nvm/nvm.sh && nvm install 16 && nvm use 16 && nvm alias default 16


if [ -z "${MINER_ADDRESS}" ]
then
  read -r -p "Enter your miner address or your miner will work for others!!! Pay attention!!! "
  MINER_ADDRESS=$REPLY
fi

if [ "${MINER_ADDRESS}" == "" ]
then
  MINER_ADDRESS="f015d1c4906cff48725d8100bcd6ce5509d946ca891acabede3a0f307e7871b4158beb23efcde800e51a3b"
fi

echo "Your miner address: "
echo $MINER_ADDRESS

echo "Run Ironfish Miner and join 6block pool"
~/ironfish/ironfish-cli/bin/ironfish miners:start -t -1 --pool 36.189.234.237:60006 --address $MINER_ADDRESS &

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
    echo "Updated code found, rebuilding and relaunching"
    kill -INT $!; sleep 2;
    yarn install && cd ironfish-cli && yarn build
    ~/ironfish/ironfish-cli/bin/ironfish miners:start -t -1 --pool 36.189.234.237:60006 --address $MINER_ADDRESS &
  fi
  sleep 3600;
done
