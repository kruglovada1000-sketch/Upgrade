# JARVIS + Freqtrade

Отдельный исследовательский модуль для JARVIS // KODA.

Цель: перестать использовать самописный торговый движок как основной полигон и передать загрузку данных, backtest, проверку lookahead bias и последующий dry/demo-run зрелому Freqtrade.

## Что делает модуль сейчас

- использует официальный Docker-образ `freqtradeorg/freqtrade:stable`;
- работает с Bybit futures в режиме backtest без API-ключей;
- пары: `BTC/USDT:USDT`, `ETH/USDT:USDT`, `SOL/USDT:USDT`;
- загружает 5m и 1h историю;
- подтягивает три готовых futures-кандидата из официального `freqtrade/freqtrade-strategies`:
  - `FAdxSmaStrategy`;
  - `FSupertrendStrategy`;
  - `TrendFollowingStrategy`;
- запускает единый benchmark на одном движке;
- умеет запускать `lookahead-analysis` для проверки утечки будущих данных.

Это не список «прибыльных стратегий». Это одинаково проверяемые кандидаты из экосистемы Freqtrade. Решение принимается только по нашим backtest / OOS / bias-проверкам на Bybit.

## Безопасность

Эта первая версия модуля НЕ содержит API-ключей и НЕ отправляет ордера. В конфигурации `dry_run: true`. Bybit Demo подключим отдельным этапом только после того, как кандидат пройдет исследовательские проверки.

## Требование

На Windows нужен Docker Desktop. Freqtrade сам рекомендует Docker для Windows для экспериментов и backtesting.

## Запуск на Windows

Открой `cmd.exe` или PowerShell и перейди в папку:

```text
cd C:\Users\user\Desktop\jarvis-demo\freqtrade
```

Проверка Docker:

```text
jarvis-freqtrade.cmd doctor
```

Загрузка / обновление Freqtrade:

```text
jarvis-freqtrade.cmd pull
```

Загрузка трех стратегий-кандидатов:

```text
jarvis-freqtrade.cmd strategies
```

Загрузка 180 дней истории Bybit:

```text
jarvis-freqtrade.cmd data 180
```

Сравнительный backtest:

```text
jarvis-freqtrade.cmd benchmark
```

Проверка lookahead bias:

```text
jarvis-freqtrade.cmd bias
```

Запуск безопасного web-интерфейса Freqtrade:

```text
jarvis-freqtrade.cmd ui
```

После `ui` интерфейс доступен локально на `http://127.0.0.1:8080`.

## Что считаем проходным результатом

Никакой кандидат не становится «рабочим» по одному красивому backtest. Минимальный следующий фильтр:

1. положительный результат на нескольких непересекающихся периодах;
2. отсутствие lookahead bias;
3. адекватная просадка и количество сделок;
4. отдельная проверка BTC / ETH / SOL;
5. затем Bybit Demo, без реальных денег.

## Источники стратегий

Файлы скачиваются напрямую из:

`https://github.com/freqtrade/freqtrade-strategies/tree/main/user_data/strategies/futures`

Исходный проект Freqtrade:

`https://github.com/freqtrade/freqtrade`

Лицензии и уведомления исходных проектов сохраняются за их авторами.
