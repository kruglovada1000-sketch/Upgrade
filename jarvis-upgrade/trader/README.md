# JARVIS Trader

Торговый модуль для JARVIS // KODA.

## Статус v0.4

По умолчанию JARVIS Trader остаётся в безопасном `paper`-режиме.

Для Bybit используется **Demo Trading основного аккаунта**, а не Testnet:

- REST endpoint: `https://api-demo.bybit.com`;
- отдельный API key/secret создаётся после переключения основного аккаунта в Demo Trading;
- чтение demo-баланса;
- расчёт сделки через общий Risk Guard;
- demo market-order с обязательными TP/SL;
- перед demo-ордером плечо принудительно выставляется по Risk Guard (сейчас 1x);
- аварийное закрытие demo-позиции;
- реальный mainnet endpoint `https://api.bybit.com` в конфигурации отсутствует.

## JARVIS ORIGINAL MTF V1

`trader/jarvis-strategy.mjs` — оригинальная реализация стратегии JARVIS // KODA. Код и таблицы параметров сторонних торговых стратегий не копировались.

Архитектурные идеи основаны на общих публичных принципах системного трейдинга: multi-timeframe анализ, тренд/режим рынка, momentum, volatility, volume confirmation, risk/reward и строгий risk guard.

Стратегия использует:

- 4H: EMA50/EMA200, наклон EMA50, ADX — режим и направление рынка;
- 1H: EMA20/EMA50, RSI, MACD histogram — подтверждение направления и momentum;
- 15m: ATR, EMA20, pullback/breakout, volume ratio — точка входа;
- скоринговую модель long/short с порогом входа;
- hard-block условия для плохого/неопределённого рынка;
- динамический Stop Loss на базе ATR;
- Take Profit через заданный reward/risk;
- запрет усреднения убыточной позиции;
- максимум одну открытую позицию;
- плечо 1x.

Команда анализа:

```bash
npm run trader:strategy -- --symbol BTC
```

Результат — `LONG`, `SHORT` или `WAIT`. **Эта команда только анализирует рынок и никогда не отправляет ордер.**

Стратегия не считается прибыльной или превосходящей другие системы до прохождения полноценного backtest / out-of-sample / walk-forward / Monte Carlo и длительного Demo Trading. GitHub-популярность и чужие backtests не являются доказательством будущей доходности.

## Базовые команды

```bash
npm run trader:doctor
npm run trader:snapshot
npm run trader:paper -- --symbol BTC --side long --stopPct 1 --takePct 2
npm run trader:strategy -- --symbol BTC
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

Текущий Demo-профиль:

- paper starting equity: 10 000 условных USDC;
- риск на одну сделку: не более 0.5% капитала;
- размер Demo-позиции: не более 0.1% капитала;
- не более 1 открытой позиции одновременно;
- дневной лимит потерь: 2%;
- leverage: 1x;
- SL и TP обязательны;
- усреднение убыточных позиций запрещено.

## Что пока НЕ сделано

- нет торговли реальными деньгами Bybit;
- нет endpoint реального mainnet в конфигурации;
- нет автоматического перехода Demo -> Live;
- нет хранения API-ключей в GitHub;
- нет разрешений на вывод средств;
- стратегия пока не подключена к автоматической отправке ордеров;
- ещё нужен полноценный backtest, walk-forward, Monte Carlo и журнал статистики.

Следующий этап: historical data -> backtest -> out-of-sample -> walk-forward -> Monte Carlo -> Demo signals -> журнал -> статистика P&L/просадки/win rate/profit factor/expectancy.
