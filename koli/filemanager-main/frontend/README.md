# GlassCloud Frontend

React + Vite клиент для локального файлообменника.

## Запуск

```bash
npm install
npm run dev
```

Dev-сервер: `http://localhost:5173`

`vite.config.ts` уже проксирует `/api` в `http://localhost:5000`, поэтому фронт подключён к Flask API без ручной настройки CORS в браузере.

## Основные роуты UI

- `/` — вход / регистрация
- `/home/cloud/:username` — личное облако
- `/share/:shareCode` — публичный доступ к файлу по уникальному hex-коду

## Где находится интеграция с API

- `src/lib/api.ts` — все запросы к серверу, токен, ошибки, скачивание файлов
- `src/pages/Home.tsx` — логин/регистрация через API
- `src/pages/Cloud.tsx` — проверка авторизации (`/api/auth/me`)
- `src/components/FileManager.tsx` — файлы/папки/удаление/шаринг + `Private`-переключатель
- `src/pages/Share.tsx` — просмотр/скачивание файла по коду
