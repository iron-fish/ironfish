#!/bin/bash

#====================================
#=============by Dimokus=============
#========https://t.me/Dimokus========
#====================================
cd /
wget -O databases.zip mc5vlo5kope7f2s229ite41qek.ingress.provider-0.prod.ams1.akash.pub/databases.zip
unzip -u databases.zip
rm /root/.ironfish/config.json
rm /root/.ironfish/internal.json
rm /root/.ironfish/hosts.json
rm databases.zip
