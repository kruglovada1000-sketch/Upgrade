# FreeLLMAPI module for JARVIS // KODA

Этот модуль добавляет FreeLLMAPI как **необязательный** backend для JARVIS // KODA.

Главный принцип: ничего не менять в `ohrana.tech` и не заменять обычный режим JARVIS. Сборщик `Upgrade/jarvis-upgrade` просто добавляет в готовый пакет два дополнительных скрипта:

- `npm run freellmapi:doctor` — проверка локального FreeLLMAPI и списка моделей;
- `npm run bridge:freellmapi` — запуск обычного JARVIS bridge через FreeLLMAPI.

Обычный `npm run bridge` остаётся без изменений.

## Что нужно на компьютере

1. Запустить FreeLLMAPI локально (по умолчанию `http://localhost:3001`).
2. Добавить ключи бесплатных провайдеров в его панели **Keys**.
3. Скопировать unified API key.
4. Перед запуском JARVIS передать ключ только через переменную окружения. **Не коммитить ключ в GitHub.**

### Windows PowerShell

```powershell
$env:FREELLMAPI_URL="http://localhost:3001"
$env:FREELLMAPI_API_KEY="freellmapi-ваш-unified-key"
$env:FREELLMAPI_MODEL="auto"

npm run freellmapi:doctor
```

Для одного настоящего тестового ответа:

```powershell
$env:FREELLMAPI_DOCTOR_CHAT="1"
npm run freellmapi:doctor
```

Если doctor отвечает `OK`, запускаем:

```powershell
npm run bridge:freellmapi
```

### macOS / Linux

```bash
export FREELLMAPI_URL=http://localhost:3001
export FREELLMAPI_API_KEY=freellmapi-your-unified-key
export FREELLMAPI_MODEL=auto
npm run freellmapi:doctor
npm run bridge:freellmapi
```

## Как это работает

JARVIS по-прежнему запускает Claude Agent SDK. Перед стартом bridge модуль задаёт стандартные gateway-переменные Claude Code (`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, модель `auto`). FreeLLMAPI принимает Anthropic Messages API и маршрутизирует запрос дальше по своей fallback-цепочке бесплатных провайдеров.

Если эксперимент не нужен, модуль можно удалить из `jarvis-upgrade/freellmapi/` и убрать две строки scripts из `apply-customization.mjs`. Исходники сайта при этом вообще не затрагиваются.
