# Server

Flask API для локального файлообменника.

## Запуск локально

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python rega.py
```

Сервер: `http://localhost:5000`

## Запуск через Docker Compose

Запускается вместе с фронтом командой из корня `itogo`:

```bash
docker compose up --build
```

## База и файлы

- SQLite: `server/data/app.db`
- Загруженные файлы: `server/data/uploads/`

## Основные API

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/files`
- `POST /api/folders`
- `POST /api/files/upload`
- `PATCH /api/items/:id` (rename)
- `PATCH /api/items/:id/privacy` (private/public)
- `DELETE /api/items/:id`
- `POST /api/items/:id/share` (получить ссылку по hex-коду)
- `GET /api/files/:id/download`
- `GET /api/public/:shareCode`
- `GET /api/public/:shareCode/download`

Если существует `../frontend/dist`, сервер раздаёт фронт со страницы `/`.
