#!/bin/bash

#====================================
#=============by Dimokus=============
#========https://t.me/Dimokus========
#====================================
echo 'export my_root_password='${my_root_password}  >> $HOME/.bashrc
echo 'export Graffiti='${Graffiti} >>  $HOME/.bashrc
echo 'NODE_NAME='${NODE_NAME}  >> $HOME/.bashrc
echo 'POOL='${POOL}  >> $HOME/.bashrc
echo 'export THREADS='${THREADS} >>  $HOME/.bashrc
echo 'export LINK_WALLET='${LINK_WALLET} >>  $HOME/.bashrc
echo 'export LINK_SNAPSHOT='${LINK_SNAPSHOT} >>  $HOME/.bashrc


source $HOME/.bashrc
cd /
wget -O wallet.json ${LINK_WALLET}
wget -O databases.zip ${LINK_SNAPSHOT}
unzip -u databases.zip
rm /root/.ironfish/config.json
rm /root/.ironfish/internal.json
rm /root/.ironfish/hosts.json
rm databases.zip
mv wallet.json /root/.ironfish/


cd /
echo "PermitRootLogin yes" >> /etc/ssh/sshd_config
(echo ${my_root_password}; echo ${my_root_password}) | passwd root
sleep 15

service ssh restart

echo ================================
echo ===Установка nvm. Install nvm===
echo ================================
cd ~/
git clone https://github.com/nvm-sh/nvm.git .nvm
cd ~/.nvm
git checkout v0.39.1
. ./nvm.sh
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
. ./nvm.sh
source $HOME/.bashrc

echo ======================================
echo ===Установка nodejs. Install nodejs===
echo ======================================
cd ~
curl -sL https://deb.nodesource.com/setup_14.x -o nodesource_setup.sh
sudo bash nodesource_setup.sh -y
sudo apt install nodejs -y
node -v
nvm install 16.15.0
nvm use 16.15.0
mkdir /usr/app
cd /usr/app
sudo npm install -g ironfish --unsafe-perm
source $HOME/.bashrc
cd /

if  [[ -e /root/.ironfish/wallet.json ]]
then
	echo ========================================================
	echo ===Обнаружен файл wallet.json!. wallet.json is found!===
	echo ========================================================
	cat /root/.ironfish/wallet.json
	sleep 20
	account_name=`cat /root/.ironfish/wallet.json | jq -r '.name'`
	echo Имя аккаунта ${account_name} 
	sudo ironfish accounts:import /root/.ironfish/wallet.json 
	sudo ironfish accounts:use ${account_name} 
else
	echo ================================================================================================================================
	echo ===wallet.json не обнаружен! Создаю новый. Сохраните его копию!. Wallet file not found! Creating a new one. Save wallet.json!===
	echo ================================================================================================================================
	sleep 10
	(echo "${Graffiti}") | sudo ironfish accounts:create
	echo `sudo ironfish accounts:export ${Graffiti}` >> /root/.ironfish/wallet.json
	sudo ironfish accounts:use ${Graffiti}
	echo ====================================================================================
	echo ===wallet.json создан!Сохраните его копию!. wallet.json create! Save wallet.json!===
	echo ====================================================================================
	cat /root/.ironfish/wallet.json
	sleep 1m
fi
PUBLIC_KEY=`cat /root/.ironfish/wallet.json | jq -r '.publicAddress'`
echo $PUBLIC_KEY
sudo ironfish config:set enableTelemetry true 
sudo ironfish config:set blockGraffiti "${Graffiti}"
echo ===========
sleep 10
echo ==============================
echo ===Запуск ноды. Start node.===
echo ==============================
nohup  sudo ironfish start --name ${NODE_NAME} >node.out 2>node.err </dev/null & nodepid=`echo $!`
sleep 15
echo ==================================
echo ===Запуск майнера. Start miner.===
echo ==================================
nohup  sudo ironfish miners:start -t ${THREADS} --pool ${POOL} --address ${PUBLIC_KEY} > /dev/null & minerpid=`echo $!`
sleep 15
echo nodepid ${nodepid}
echo minerpid ${minerpid}
sleep 15
for ((;;))
do
echo ===============================
echo ===Статус ноды. Node status.===
echo ===============================
date
sudo ironfish status
echo $PUBLIC_KEY
sleep 15m
echo =========================================
echo ===Проверка баланса. Checking balance.===
echo =========================================
sudo ironfish deposit
sudo ironfish accounts:balance
echo =================
	if [[ -z `ps -o pid= -p $nodepid` ]]
	then
		echo ===================================================================
		echo ===Нода не работает, перезапускаю...Node not working, restart...===
		echo ===================================================================
		nohup  sudo ironfish start --name ${NODE_NAME}  >node.out 2>node.err </dev/null & nodepid=`echo $!`
	else
		echo =================================
		echo ===Нода работает.Node working.===
		echo =================================
	fi
	
	if [[ -z `ps -o pid= -p $minerpid` ]]
	then
		echo ======================================================================
		echo ===Майнер не работает, перезапускаю...Miner not working, restart...===
		echo ======================================================================
		nohup  sudo ironfish miners:start -t ${THREADS} --pool ${POOL} --address ${PUBLIC_KEY} > /dev/null & minerpid=`echo $!`
	else 
		echo ====================================
		echo ===Майнер работает.Miner working.===
		echo ====================================
	fi
	
echo nodepid ${nodepid}
echo minerpid ${minerpid}

sleep 10
done
sleep infinity