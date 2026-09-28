# JARVIS Trader

Торговый модуль для JARVIS // KODA.

## Статус v0.2

По умолчанию JARVIS Trader остаётся в безопасном `paper`-режиме.

Дополнительно добавлен **Bybit Testnet**:

- публичные котировки Bybit Testnet;
- проверка API-ключа и его разрешений;
- чтение тестового баланса;
- расчёт сделки через общий Risk Guard;
- тестовый market-order с обязательными TP/SL;
- аварийное закрытие тестовой позиции;
- журнал отправленных testnet-команд;
- mainnet endpoint в конфигурации отсутствует.

## Базовые команды

```bash
npm run trader:doctor
npm run trader:snapshot
npm run trader:paper -- --symbol BTC --side long --stopPct 1 --takePct 2
```

## Bybit Testnet

Публичная проверка, ключи не нужны:

```bash
npm run trader:bybit:doctor
npm run trader:bybit:snapshot
```

Для приватных команд нужны **только Testnet API key/secret**, созданные на Bybit Testnet.
Никогда не добавляйте ключи в GitHub и не записывайте их в этот репозиторий.

Переменные окружения:

```text
BYBIT_TESTNET_API_KEY
BYBIT_TESTNET_API_SECRET
```

Для ключа рекомендуется оставить только разрешения ContractTrade: `Order` и `Position`.
JARVIS Trader намеренно отклоняет ключ, если у него есть любые Wallet permissions.

После установки переменных:

```bash
npm run trader:bybit:doctor
npm run trader:bybit:balance
npm run trader:bybit:preview -- --symbol BTC --side long --stopPct 1 --takePct 2
```

`preview` рассчитывает сделку, но ничего не отправляет.

### Отправка тестового ордера

Bybit Testnet order имеет двойной предохранитель.

Нужно одновременно:

```text
JARVIS_TRADER_TESTNET_EXECUTION=YES
```

и флаг:

```text
--confirm TESTNET
```

Пример:

```bash
npm run trader:bybit:test -- --symbol BTC --side long --stopPct 1 --takePct 2 --confirm TESTNET
```

В сделке используются:

- Bybit category `linear`;
- market order;
- leverage 1x;
- обязательные Stop Loss и Take Profit;
- размер позиции, ограниченный Risk Guard;
- позиционный режим `one-way` (`positionIdx=0`).

### Аварийное закрытие

```bash
npm run trader:bybit:close -- --symbol BTC --confirm TESTNET
```

Команда тоже требует `JARVIS_TRADER_TESTNET_EXECUTION=YES` и закрывает только тестовую позицию reduce-only ордером.

## Ограничения риска

По умолчанию:

- paper starting equity: 10 000 условных USDC;
- риск на одну сделку: не более 0.5% капитала;
- размер позиции: не более 10% капитала;
- не более 1 открытой позиции одновременно;
- дневной лимит потерь: 2%;
- leverage: 1x;
- SL и TP обязательны.

Параметры находятся в `trader.config.json`.

## Что пока НЕ сделано

- нет Bybit mainnet execution;
- нет автоматического перехода с testnet на live;
- нет автоторговой стратегии/сигнального цикла;
- нет хранения приватных ключей в GitHub;
- нет разрешений на вывод средств.

Следующий этап после успешной проверки Bybit Testnet: market data -> стратегия JARVIS -> Risk Guard -> testnet order -> контроль позиции -> журнал -> статистика P&L/просадки/win rate/profit factor.
