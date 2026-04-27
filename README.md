# Lampa qBittorrent Downloader

Плагин добавляет пункт `Скачать в qBittorrent` в длинное меню торрента в Lampa. Просмотр через TorrServer MatriX не меняется: обычное нажатие по торренту по-прежнему открывает поток, а долгое нажатие даёт дополнительное действие для скачивания на сервер.

## Файлы

- `lampa-qbit-download.js` — сам плагин для Lampa.
- `qbit-bridge.js` — маленький HTTP-bridge для Mac mini, чтобы телевизор не зависел от CORS и cookie-политик qBittorrent.
- `.env.example` — пример переменных окружения для bridge.
- `run-bridge.sh` — запуск bridge с подхватом `.env`.
- `local.lampa.qbit-bridge.plist` — шаблон launchd-агента для автозапуска bridge на Mac mini.
- `qbit-bridge.test.js` — автотесты bridge с mock qBittorrent.

## Быстрый запуск bridge на Mac mini

```bash
cp .env.example .env
```

Отредактируйте `.env`: укажите `QBIT_URL`, логин, пароль и путь на внешний диск, например:

```bash
QBIT_URL=http://127.0.0.1:8080
QBIT_USERNAME=admin
QBIT_PASSWORD=***
BRIDGE_TOKEN=длинный-случайный-токен
QBIT_SAVE_PATH=/Volumes/Media/Downloads/qBittorrent
```

Запуск вручную:

```bash
./run-bridge.sh
```

или:

```bash
set -a
source .env
set +a
npm run bridge
```

Проверка с другого устройства в сети:

```text
http://IP_ВАШЕГО_MAC_MINI:8787/health
```

Проверка связи bridge с qBittorrent, если задан `BRIDGE_TOKEN`:

```bash
curl -H 'X-Bridge-Token: ваш-токен' http://IP_ВАШЕГО_MAC_MINI:8787/status
```

## Автозапуск bridge через launchd

После настройки `.env` можно установить bridge как пользовательский launchd-агент:

```bash
cp local.lampa.qbit-bridge.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/local.lampa.qbit-bridge.plist
launchctl enable gui/$(id -u)/local.lampa.qbit-bridge
launchctl kickstart -k gui/$(id -u)/local.lampa.qbit-bridge
```

Остановить:

```bash
launchctl bootout gui/$(id -u)/local.lampa.qbit-bridge
```

## Установка плагина в Lampa

Разместите `lampa-qbit-download.js` на любом локальном HTTP-сервере, доступном телевизору. Например, рядом с файлом можно запустить:

```bash
python3 -m http.server 8790
```

В Lampa откройте `Настройки -> Расширения -> Добавить плагин` и укажите:

```text
http://IP_ВАШЕГО_MAC_MINI:8790/lampa-qbit-download.js
```

После установки откройте `Настройки -> qBittorrent загрузка`:

- `Режим подключения`: лучше оставить `Bridge на Mac mini`.
- `Bridge URL`: `http://IP_ВАШЕГО_MAC_MINI:8787`.
- `Bridge токен`: тот же `BRIDGE_TOKEN`, если он задан в `.env`.
- `Категория`, `Теги`, `Путь сохранения`: можно оставить пустыми, тогда bridge возьмёт значения из `.env`.

## Как пользоваться

Откройте карточку фильма или сериала в Lampa, перейдите в торренты, выделите нужную раздачу и сделайте долгое нажатие/кнопку меню. В списке действий появится `Скачать в qBittorrent`.

## Важные замечания

Direct-режим есть в настройках плагина, но на телевизорах часто ломается из-за CORS, CSRF, cookie или Host Header Validation в qBittorrent. Для вашей схемы с Mac mini надёжнее bridge: пароль остаётся на сервере, а Lampa отправляет только magnet/.torrent ссылку.

Bridge слушает локальную сеть, поэтому лучше задать `BRIDGE_TOKEN`: без него любой клиент в вашей сети сможет отправить торрент в qBittorrent.

## Проверка разработки

```bash
node --check qbit-bridge.js
node --check lampa-qbit-download.js
npm test
```
