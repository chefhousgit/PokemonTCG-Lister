# ADR-001 — TradeExecutor boundary

## Status

Accepted

## Context

PTCGPB is licensed CC BY-NC 4.0. This repo must not fork, vendor, or invoke that software, including `PTCGPB.ahk`.

## Decision

Trade fulfillment goes through a `TradeExecutor` interface.

- `ManualExecutor` — checklist the operator confirms
- `StubExecutor` — tests / UI-unchanged swap
- Optional loader for a plugin **outside** this repo (`TRADE_EXECUTOR_PLUGIN`)

A job payload contains identifiers only (`account_key`, instance, friend ID). Resolving those to a local account file or emulator happens only in an external plugin on the operator's machine.

Both the server dispatcher and the agent receiver run `assertSafeJobPayload` and refuse credential-shaped keys and `Accounts/Saved` paths.

## Consequences

Day-one fulfillment is manual. Automation is not part of this codebase.
