# Lampa qBittorrent Downloader

Плагин добавляет пункт `Скачать в qBittorrent` в длинное меню торрента в Lampa. Просмотр через TorrServer MatriX не меняется: обычное нажатие по торренту по-прежнему открывает поток, а долгое нажатие даёт дополнительное действие для скачивания на сервер.

## Файлы

- `lampa-qbit-download.js` — основной плагин для Lampa: только отправка торрентов в qBittorrent с выбором `Скачать как фильм` / `Скачать как сериал`.
- `lampa-qbit-media.js` — отдельный второй плагин для замены Plex-сценария: список скачанного, запуск через Android TV player и удаление.
- `qbit-bridge.js` — маленький HTTP-bridge для Mac mini, чтобы телевизор не зависел от CORS и cookie-политик qBittorrent; также отдаёт `/downloads`, `/media/:id`, `/delete` для второго media-плагина.
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
QBIT_INCOMPLETE_PATH=/Volumes/Media/Downloads/qBittorrent/.incomplete
QBIT_CATEGORY=lampa
QBIT_MOVIES_PATH=/Volumes/Media/FILMS
QBIT_TV_PATH="/Volumes/Media/TV SHOWS"
QBIT_MOVIES_CATEGORY=films
QBIT_TV_CATEGORY=tv-shows
```

Если Lampa передаёт тип карточки, bridge переопределяет общий `QBIT_SAVE_PATH`:

- фильм → `/Volumes/Media/FILMS`, категория `films`;
- сериал → `/Volumes/Media/TV SHOWS`, категория `tv-shows`.

Если тип не удалось определить, bridge использует общий `QBIT_SAVE_PATH`.

Для защиты Plex от недокачанных файлов на Anton Mac mini включён временный каталог qBittorrent:

```text
/Volumes/Media/Downloads/qBittorrent/.incomplete
```

qBittorrent должен держать незавершённые загрузки там и переносить готовый payload в итоговый save path.

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
- `Категория`, `Теги`, `Путь сохранения`: обычно можно оставить пустыми. Если плагин понял тип карточки, bridge сам направит фильм в `/Volumes/Media/FILMS`, сериал в `/Volumes/Media/TV SHOWS`, и поставит категорию `films` или `tv-shows`.

## Как пользоваться

Откройте карточку фильма или сериала в Lampa, перейдите в торренты, выделите нужную раздачу и сделайте долгое нажатие/кнопку меню. В списке действий появятся:

- `Скачать как фильм` — отправляет в Plex Movies (`/Volumes/Media/FILMS`).
- `Скачать как сериал` — отправляет в Plex TV Shows (`/Volumes/Media/TV SHOWS`).

## Важные замечания

Direct-режим есть в настройках плагина, но на телевизорах часто ломается из-за CORS, CSRF, cookie или Host Header Validation в qBittorrent. Для вашей схемы с Mac mini надёжнее bridge: пароль остаётся на сервере, а Lampa отправляет только magnet/.torrent ссылку.

Bridge слушает локальную сеть, поэтому лучше задать `BRIDGE_TOKEN`: без него любой клиент в вашей сети сможет отправить торрент в qBittorrent.

## Постоянная установка на Anton Mac mini

Актуальная рабочая папка проекта:

```text
/Users/sonomnas/Services/lampa-qbit-downloader
```

Не переносить эту папку без обновления launchd plist: автозапуск macOS завязан на этот путь. Для удобства на Рабочем столе создана папка:

```text
/Users/sonomnas/Desktop/Lampa qBittorrent
```

В ней лежат:

- `README - С чего начать.md` — человеческая памятка.
- `project-files` — ярлык на настоящую папку проекта.
- `ПРОВЕРИТЬ.command` — быстрая диагностика.
- `ПЕРЕЗАПУСТИТЬ.command` — перезапуск launchd-сервисов.
- `ОТКРЫТЬ ФАЙЛЫ ПРОЕКТА.command` — открыть настоящую папку проекта в Finder.

Публичные URL плагинов для web-Lampa:

```text
Основной загрузчик:
https://cdn.jsdelivr.net/gh/dedyushin/lampa-qbit-downloader@main/lampa-qbit-download.js

Отдельный плагин “Скачанное”:
https://cdn.jsdelivr.net/gh/dedyushin/lampa-qbit-downloader@main/lampa-qbit-media.js
```

GitHub repo:

```text
https://github.com/dedyushin/lampa-qbit-downloader
```

Не использовать `raw.githubusercontent.com` как URL плагина: GitHub отдаёт файл как `text/plain` + `nosniff`. jsDelivr отдаёт корректно как JavaScript.

## Автозапуск на Anton Mac mini

Установлены два пользовательских launchd-агента:

```text
/Users/sonomnas/Library/LaunchAgents/local.lampa.qbit-bridge.plist
/Users/sonomnas/Library/LaunchAgents/local.lampa.plugin-server.plist
```

Labels:

```text
local.lampa.qbit-bridge
local.lampa.plugin-server
```

Проверить состояние:

```bash
UID_NUM=$(id -u sonomnas)
launchctl print gui/$UID_NUM/local.lampa.qbit-bridge
launchctl print gui/$UID_NUM/local.lampa.plugin-server
curl -fsS http://192.168.1.149:8787/health
```

Перезапустить:

```bash
UID_NUM=$(id -u sonomnas)
launchctl kickstart -k gui/$UID_NUM/local.lampa.qbit-bridge
launchctl kickstart -k gui/$UID_NUM/local.lampa.plugin-server
```

## Проверка разработки

```bash
node --check qbit-bridge.js
node --check lampa-qbit-download.js
node --check lampa-qbit-media.js
node --check serve-plugin-only.js
npm test
```
