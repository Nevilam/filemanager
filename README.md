# itogo

Локальный файлообменник: фронтенд (`React + Vite`) + сервер (`Flask + SQLite`) уже связаны API.

## Структура

- `frontend/` — клиентское приложение
- `server/` — API, база `SQLite`, хранение загруженных файлов

## Запуск через Docker Compose (рекомендуется)

Из папки `itogo`:

```bash
docker compose up --build
```

Поднимутся сразу 2 сервиса:

- `frontend` — `http://localhost:5173`
- `server` — `http://localhost:5000`

Остановка:

```bash
docker compose down
```

Сбросить данные (БД и файлы) вместе с томом:

```bash
docker compose down -v
```

## Локальный запуск без Docker

### 1) Поднять сервер

```bash
cd server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python rega.py
```

### 2) Поднять фронтенд

В отдельном терминале:

```bash
cd frontend
npm install
npm run dev
```

Фронтенд работает на `http://localhost:5173` и проксирует `/api` в Flask.

## Что уже работает

- Регистрация / вход / выход
- Проверка текущего пользователя (`/api/auth/me`)
- Создание папок
- Загрузка файлов
- Переименование
- Удаление (включая вложенные папки)
- Скачивание файлов
- У каждого загруженного файла есть уникальный hex-код (16 символов)
- Ссылка вида `/share/<hex-код>`
- Переключатель `Private`: только создатель или доступ всем по ссылке
