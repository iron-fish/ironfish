# Deploy Ironfish on Akash Network 
# Развертка Ironfish в Akash Network 
<div align="center">

![pba](https://user-images.githubusercontent.com/23629420/163564929-166f6a01-a6e2-4412-a4e9-40e54c821f05.png)
| [Akash Network](https://akash.network/) | [Forum Akash Network](https://forum.akash.network/) | 
|:--:|:--:|
___
Before you start - subscribe to our news channels: 

Прежде чем начать - подпишитесь на наши новостные каналы:

| [Discord Akash](https://discord.gg/3SNdg3BS) | [Telegram Akash EN](https://t.me/AkashNW) | [Telegram Akash RU](https://t.me/akash_ru) | [TwitterAkash](https://twitter.com/akashnet_) | [TwitterAkashRU](https://twitter.com/akash_ru) |
|:--:|:--:|:--:|:--:|:--:|

</div>

<div align="center">
  
[English version](https://github.com/Dimokus88/ironfish/blob/main/README.md#english-version) | [Русская версия](https://github.com/Dimokus88/ironfish/blob/main/README.md#%D1%80%D1%83%D1%81%D1%81%D0%BA%D0%B0%D1%8F-%D0%B2%D0%B5%D1%80%D1%81%D0%B8%D1%8F)
  
</div>

___
# English-version
## 1. Registration in the rewards program.
 Go to site IronFish and [create account](https://testnet.ironfish.network/signup). Write your ```Email```, ```Github```, ```Discord``` or ```Telegram``` and country. And write your ```Graffiti``` it is needed for identification in the network and accrual of points for tasks.
![image](https://user-images.githubusercontent.com/23629420/169029990-ae514caa-2ded-4b99-85d2-0a901bde75e3.png)
## 2. Deploy Ironfish

>You must have more than ***5 AKT*** on your Akash wallet (5 АКТ will be blocked for deployment + transaction gas payment). АКТ can be found on the exchanges Gate, AsendeX, Osmosis . Also in our community[Akash RU](https://t.me/akash_ru) we regularly hold events in which we distribute АКТ.

* Open ***Akashlytics***,if you don't have it installed, then [link for download](https://www.akashlytics.com/deploy).

* We check the presence of a balance  ***(>5АКТ)*** and the presence of an installed certificate.

![image](https://user-images.githubusercontent.com/23629420/165339432-6f053e43-4fa2-4429-8eb7-d2fc66f47c70.png)

* Click ***CREATE DEPLOYMENT***. Select ***Empty*** and copy the contents there [deploy.yml](https://github.com/Dimokus88/ironfish/blob/main/deploy.yml) .

## 2.1 If you are deploy a node for the first time and you do not have ```wallet.json```:

a) Fill in the following variables:
* ```my_root_password``` - password  ```root``` user, for connection to container via ```ssh```.
* ```NODE_NAME```        - Node name (moniker).
* ```Graffiti```         - Your ```Graffiti``` from registration on the site IronFish (***ATTENTION! Case sensitive!!!***)
* ```POOL```             - mining pool. You can leave it as default, delete if you want to mine yourself or enter the address of your mining pool.
* ```THREADS```          - set max cpu for mining using the formula [number of leased cpu] - [1] = THREADS .
> ```LINK_WALLET```      - put # at the beginning of the line.

Below, in the ```resources``` field, we set the capacity to be rented. Recommended for IronFish node```6 CPU x 8 GB RAM x 15 GB SSD```.

Click on ```CREATE DEPLOYMENT``` and we are waiting for the appearance of providers with free capacities (BIDS)..

![image](https://user-images.githubusercontent.com/23629420/165608527-da85c84e-edcc-4b15-8843-441d3e76dcb6.png)

We choose the one that suits us in terms of price and equipment. Then we press ```ACCEPT BID```.

b ) Go to tab ***LOGS->LOGS***

c) Wait create ```wallet.json```, a view message will appear (about 8 minutes from the start of the container).
![image](https://user-images.githubusercontent.com/23629420/169107125-4e30453a-3666-4b1c-bdd7-93e552075b9e.png)


d)Go to tab ***SHELL*** and type ```cat /root/.ironfish/wallet.json```.Copy full answer and save as ```wallet.json```.

![image](https://user-images.githubusercontent.com/23629420/169136066-18898162-42dc-41f0-92ff-ae797562be02.png)

f) Place file ```wallet.json```in google drive,and open access to the file on google drive and copy its link, it will look like:

```https://drive.google.com/open?id=xxxxxxxxxxxxxx-xxxxxxxxxxxx&authuser=gmail%40gmail.com&usp=drive_fs```

 you need to take a part:  ```id=xxxxxxxxxxxxxx-xxxxxxxxxxxx``` and put in front of it: ```https://drive.google.com/uc?export=download&```.
 
Thus, you will get a link to a direct download of the file:

```https://drive.google.com/uc?export=download&id=xxxxxxxxxxxxxx-xxxxxxxxxxxx```

g) Change the manifest in the tab ***UPDATE***  following the example from p.2.2 (see below) and click ***UPDATE DEPLOYMENT***

## 2.2 If you already have ```wallet.json```:
>Place file ```wallet.json```in google drive,and open access to the file on google drive and copy its link, it will look like:
```https://drive.google.com/open?id=xxxxxxxxxxxxxx-xxxxxxxxxxxx&authuser=gmail%40gmail.com&usp=drive_fs```
 you need to take a part:  ```id=xxxxxxxxxxxxxx-xxxxxxxxxxxx``` and put in front of it: ```https://drive.google.com/uc?export=download&```. 
Thus, you will get a link to a direct download of the file:
```https://drive.google.com/uc?export=download&id=xxxxxxxxxxxxxx-xxxxxxxxxxxx```

Fill in the following variables:
* ```my_root_password``` - password  ```root``` user, for connection to container via ```ssh```.
* ```LINK_WALLET```      - link of download your ```wallet.json```.
* ```NODE_NAME```        - Node name (moniker).
* ```Graffiti```         - Your ```Graffiti``` from registration on the site IronFish (***ATTENTION! Case sensitive!!!***)
* ```THREADS```          - set max cpu for mining using the formula [number of leased cpu] - [1] = THREADS .
* ```POOL```             - mining pool. You can leave it as default, delete if you want to mine yourself or enter the address of your mining pool.

Run the deployment, the node will start syncing automatically. Example log output:

![image](https://user-images.githubusercontent.com/23629420/169114122-24e056ac-c11b-4e9e-ae7b-d26bc06863b3.png)

After synchronization, the mining process will begin. Also, every 15 minutes a transaction ```0.1 IRON``` will be sent to the general bank, for which points in the rating will be awarded.

[Explorer IronFish](https://explorer.ironfish.network/)

# Useful commands

In the ```SHELL``` tab you can use the following commands:

```ironfish accounts:balance```                                                  - balance check

```ironfish accounts:publickey```                                                - show your public key

```ironfish status```                                                            - node status

```ironfish config:show```                                                       - show configuration

```ironfish chain:forks```                                                       - network fork check (should be 0)

```ironfish accounts:pay -a 2 -o 0.00000001 -t 997c...7fc52ed -f Savings```     - Send 2 coins from an account named "Savings"

You can read more about IronFish commands on the [official website](https://ironfish.network/docs/onboarding/iron-fish-cli).

## Thank you for choosing Akash Network!
___
# Русская версия
## 1. Регистрация в программе вознаграждений.
 Преходим на сайт проекта и[ создаем учетную запись ](https://testnet.ironfish.network/signup) Укажите ваш ```Email```, ```Github```, ```Discord``` или ```Telegram```, страну проживания. Также укажите ваш ```Graffiti``` он будет необходим для индетификации в сети и начисления баллов за задания. 
![image](https://user-images.githubusercontent.com/23629420/169029990-ae514caa-2ded-4b99-85d2-0a901bde75e3.png)
## 2. Разворачиваем Ironfish

>На вашем кошельке Akash должно быть более ***5 АКТ*** (5 АКТ будут заблокированы на развертывание + оплата газа транзакций). АКТ можно пробрести на биржах Gate, AsendeX, Osmosis . Так же в нашем сообществе [Akash RU](https://t.me/akash_ru) мы регулярно проводим эвенты в которых раздаем АКТ.

* Открываем ***Akashlytics***, если он у вас не установлен - то вот [ссылка на скачивание](https://www.akashlytics.com/deploy).

* Проверяем наличие баланса ***(>5АКТ)*** и наличие установленного сертификата.

![image](https://user-images.githubusercontent.com/23629420/165339432-6f053e43-4fa2-4429-8eb7-d2fc66f47c70.png)

* Нажимаем ***CREATE DEPLOYMENT***. Выбираем ***Empty***(пустой template) и копируем туда содержимое [deploy.yml](https://github.com/Dimokus88/ironfish/blob/main/deploy.yml) .

## 2.1 Если разворачиваете ноду первый раз и у вас нет ```wallet.json```:

а) Заполняете следующие переменные:
* ```my_root_password``` - пароль ```root``` пользователя, для подключения к контейнеру по ```ssh```.
* ```NODE_NAME```        - имя ноды.
* ```Graffiti```         - Ваше ```Graffiti``` из регистрации на сайте IronFish (***ВНИМАНИЕ! Чувствительно к регистру!!!***)
* ```POOL```             - майнинговый пул. Можете оставить по-умолчанию, удалить если хотите майнить самостоятельно или введите адрес вашего майнингово пула.
* ```THREADS```          - установите max cpu для майнинга по формуле [количество арендованных cpu] - [1] = THREADS
> ```LINK_WALLET```      - закомментируйте, поставив # в начале строки.

Ниже, в поле ```resources``` мы выставляем арендуюмую мощность. для ноды IronFish рекомендуется ```6 CPU x 8 GB RAM x 15 GB SSD```.

Нажимаем кнопку ```CREATE DEPLOYMENT``` и ждем появления провайдеров, со свободными мощностями (BIDS).

![image](https://user-images.githubusercontent.com/23629420/165608527-da85c84e-edcc-4b15-8843-441d3e76dcb6.png)

Выбираем подходящий для нас по цене и оборудованию. После чего нажимаем ```ACCEPT BID```.

б )Перейдите во вкладку ***LOGS->LOGS***

в) Дождитесь создания ```wallet.json```, появится соответствующее сообщение (около минут 8 от запуска контейнера).
![image](https://user-images.githubusercontent.com/23629420/169107125-4e30453a-3666-4b1c-bdd7-93e552075b9e.png)


г)Перейдите во вкладку ***SHELL*** и введите ```cat /root/.ironfish/wallet.json```. Скопируйте весь ответ в текстовый файл и сохраните его как ```wallet.json```.

![image](https://user-images.githubusercontent.com/23629420/169136066-18898162-42dc-41f0-92ff-ae797562be02.png)

д) Разместите файл ```wallet.json``` на Google диске и откройте доступ к файлу, скопируйте его ссылку, она будет вида:

```https://drive.google.com/open?id=xxxxxxxxxxxxxx-xxxxxxxxxxxx&authuser=gmail%40gmail.com&usp=drive_fs```

 вам нужно взять часть: ```id=xxxxxxxxxxxxxx-xxxxxxxxxxxx``` и вставить перед ней: ```https://drive.google.com/uc?export=download&```.
 
Таким образом, у вас получится ссылка на прямое скачивание файла:

```https://drive.google.com/uc?export=download&id=xxxxxxxxxxxxxx-xxxxxxxxxxxx```

ж) Измените манифест во вкладке ***UPDATE*** по примеру из п.2.2 (см ниже) и нажмите ***UPDATE DEPLOYMENT***

## 2.2 Если у вас уже есть ```wallet.json```:
>Сохраните файл ```wallet.json``` на Google диске и откройте доступ к файлу, скопируйте его ссылку, она будет вида:
```https://drive.google.com/open?id=xxxxxxxxxxxxxx-xxxxxxxxxxxx&authuser=gmail%40gmail.com&usp=drive_fs```
 вам нужно взять часть: ```id=xxxxxxxxxxxxxx-xxxxxxxxxxxx``` и вставить перед ней: ```https://drive.google.com/uc?export=download&```. 
Таким образом, у вас получится ссылка на прямое скачивание файла:
```https://drive.google.com/uc?export=download&id=xxxxxxxxxxxxxx-xxxxxxxxxxxx```

Заполняете следующие переменные:
* ```my_root_password``` - пароль ```root``` пользователя, для подключения к контейнеру по ```ssh```.
* ```LINK_WALLET```      - адрес скачивания вашего ```wallet.json```.
* ```NODE_NAME```        - имя ноды.
* ```Graffiti```         - Ваше ```Graffiti``` из регистрации на сайте IronFish (ВНИМАНИЕ! Чувствительно к регистру!!!
* ```POOL```             - майнинговый пул. Можете оставить по-умолчанию, удалить если хотите майнить самостоятельно или введите адрес вашего майнингово пула.
*  ```THREADS```          - установите max cpu для майнинга по формуле [количество арендованных cpu] - [1] = THREADS

Запустите развертывание, нода начнет синхронизацию автоматически.Пример вывода в логах: 

![image](https://user-images.githubusercontent.com/23629420/169114122-24e056ac-c11b-4e9e-ae7b-d26bc06863b3.png)

После синхронизации начнется процесс майнинга. Так же, каждые 15 минут будет отправляться транзакция ```0,1 IRON``` в общий банк, за которую будут начислятся баллы в рейтинге.

[Explorer IronFish](https://explorer.ironfish.network/)

# Полезные команды

Во вкладке ```SHELL``` вы можете воспользоваться следующими командами:

```ironfish accounts:balance```                                                - проверка баланса

```ironfish accounts:publickey```                                              - показать ваш публичный адрес

```ironfish status```                                                          - статус ноды

```ironfish config:show```                                                     - просмотр конфигурации

```ironfish chain:forks```                                                     - проверка форка сети (должно быть значение 0)

```ironfish accounts:pay -a 2 -o 0.00000001 -t 997c...7fc52ed -f Savings```    - Отправка 2-х монет с аккаунта под именем "Savings"

Более подробно о командах IronFish можно прочитать на [официальном сайте](https://ironfish.network/docs/onboarding/iron-fish-cli).

## Спасибо что используете Akash Network!
