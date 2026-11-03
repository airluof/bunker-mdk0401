# Загрузка 180 иллюстраций в GitHub

## Что понадобится

- GitHub Desktop: https://desktop.github.com/
- Архив `Bunker_Assets_180_Complete.zip`, скачанный из этого чата.
- Локальная копия репозитория `airluof/bunker-mdk0401`.

## Порядок действий

1. Установи и открой GitHub Desktop.
2. Выбери **File → Clone repository**.
3. Найди `airluof/bunker-mdk0401` и клонируй его на компьютер.
4. Скачай `Bunker_Assets_180_Complete.zip` и положи ZIP в корневую папку репозитория (рядом с `README.md`).
5. В папке репозитория открой PowerShell.
6. Запусти:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\import-assets.ps1
   ```

   Скрипт распакует архив, сохранит оригинальные имена PNG, разместит 30 файлов в каждой из шести категорий и проверит их количество. Он не изменяет изображения.

7. Открой GitHub Desktop. В списке Changes должны появиться 180 PNG и обновлённые метаданные.
8. В поле Summary напиши `Add 180 Bunker card illustrations`.
9. Нажми **Commit to main**, затем **Push origin**.

## Ожидаемая структура

```text
public/assets/cards/
  roles/              # 30 PNG
  skills/             # 30 PNG
  baggage/            # 30 PNG
  vulnerabilities/    # 30 PNG
  crises/             # 30 PNG
  actions/            # 30 PNG
  manifest.json
  manifest.csv
```

Дополнительные метаданные будут находиться в `assets/`.

## Важно

- Не переименовывай экспортированные файлы.
- Не загружай ZIP-архив в сам репозиторий — загружай PNG из категорий.
- Не добавляй ключи Supabase, пароли, токены или персональные данные.
- Репозиторий публичный: опубликованные PNG и документация будут доступны другим пользователям.
- Перед отправкой коммита убедись, что добавилось ровно 180 PNG.
