#!/bin/bash

#====================================
#=============by Dimokus=============
#========https://t.me/Dimokus========
#====================================
echo 'export my_root_password='${my_root_password}  >> $HOME/.bashrc
echo 'export LINK_SNAPSHOT='${LINK_SNAPSHOT} >>  $HOME/.bashrc
echo 'export TIME='${TIME} >>  $HOME/.bashrc
apt install nginx
source $HOME/.bashrc
service nginx start
cd /
wget -O databases.zip ${LINK_SNAPSHOT}
unzip -u databases.zip
rm /root/.ironfish/config.json
rm /root/.ironfish/internal.json
rm /root/.ironfish/hosts.json
mv databases.zip /var/www/html/ 

cd /
echo "PermitRootLogin yes" >> /etc/ssh/sshd_config
(echo ${my_root_password}; echo ${my_root_password}) | passwd root
sleep 15

service ssh restart


echo -e '\n\e[42m Установка nvm. Install nvm \e[0m\n'
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
echo ===========
sleep 10
nohup  sudo ironfish start > /dev/null 2>&1& 
sleep 15
source $HOME/.bashrc
sleep 15
for ((;;))
do
	sleep $TIME
	date
	echo == Stopping ironfish===
	sudo ironfish stop
	sleep 1m
	sudo ironfish status
	echo ==Creating snapshot===
	cd /
	rm /var/www/html/databases.zip
	zip -r -0 /var/www/html/databases.zip /root/.ironfish/* 
	echo =========Snapshot is create=========
	sleep 1
	nohup  sudo ironfish start > /dev/null 2>&1&
	sleep 20
	sudo ironfish status
	echo =========Archivating blockchain is complete============
	date
done
