# JARVIS Trader

Торговый модуль для JARVIS // KODA.

## Статус v0.3

По умолчанию JARVIS Trader остаётся в безопасном `paper`-режиме.

Для Bybit используется **Demo Trading основного аккаунта**, а не Testnet:

- REST endpoint: `https://api-demo.bybit.com`;
- котировки и торговые условия соответствуют Demo Trading Bybit;
- отдельный API key/secret создаётся после переключения основного аккаунта в Demo Trading;
- чтение demo-баланса;
- расчёт сделки через общий Risk Guard;
- demo market-order с обязательными TP/SL;
- аварийное закрытие demo-позиции;
- реальный mainnet endpoint `https://api.bybit.com` в конфигурации отсутствует.

## Базовые команды

```bash
npm run trader:doctor
npm run trader:snapshot
npm run trader:paper -- --symbol BTC --side long --stopPct 1 --takePct 2
```

## Bybit Demo Trading

Переключитесь в обычном аккаунте Bybit в режим **Demo Trading**, затем именно там создайте API key/secret.
Ключ от обычного реального аккаунта и ключ от Testnet для Demo Trading не подходят.

Переменные окружения:

```text
BYBIT_DEMO_API_KEY
BYBIT_DEMO_API_SECRET
```

Для ключа оставьте торговые разрешения ContractTrade: `Order` и `Position`.
JARVIS Trader отклоняет ключ, если у него есть Wallet permissions.

Проверка:

```bash
npm run trader:bybit:doctor
npm run trader:bybit:balance
npm run trader:bybit:snapshot
npm run trader:bybit:preview -- --symbol BTC --side long --stopPct 1 --takePct 2
```

`preview` ничего не отправляет на биржу.

### Отправка Demo-ордера

Даже для виртуальных денег используется двойной предохранитель.
Нужно одновременно установить:

```text
JARVIS_TRADER_DEMO_EXECUTION=YES
```

и передать:

```text
--confirm DEMO
```

Пример:

```bash
npm run trader:bybit:demo -- --symbol BTC --side long --stopPct 1 --takePct 2 --confirm DEMO
```

В сделке используются:

- Bybit category `linear`;
- market order;
- leverage 1x;
- обязательные Stop Loss и Take Profit;
- размер позиции, ограниченный Risk Guard;
- one-way position mode (`positionIdx=0`).

### Аварийное закрытие Demo-позиции

```bash
npm run trader:bybit:close -- --symbol BTC --confirm DEMO
```

Команда требует `JARVIS_TRADER_DEMO_EXECUTION=YES`.

## Ограничения риска

По умолчанию:

- paper starting equity: 10 000 условных USDC;
- риск на одну сделку: не более 0.5% капитала;
- размер позиции: не более 10% капитала;
- не более 1 открытой позиции одновременно;
- дневной лимит потерь: 2%;
- leverage: 1x;
- SL и TP обязательны.

## Что пока НЕ сделано

- нет торговли реальными деньгами Bybit;
- нет endpoint реального mainnet в конфигурации;
- нет автоматического перехода Demo -> Live;
- нет хранения API-ключей в GitHub;
- нет разрешений на вывод средств;
- автоторговый сигнальный цикл будет добавляться после проверки Demo Trading.

Следующий этап: market data -> стратегия JARVIS -> Risk Guard -> Demo order -> контроль позиции -> журнал -> статистика P&L/просадки/win rate/profit factor.
