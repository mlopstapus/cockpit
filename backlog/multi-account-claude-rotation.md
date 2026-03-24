# Backlog: Multi-Account Claude Rate-Limit Rotation

**Deferred from**: 002-nodejs-rewrite
**Date**: 2026-03-24

## Description

Support multiple Claude configuration profiles (e.g. `~/.claude-profiles/account1`, `account2`) so that when one account hits a rate limit, the daemon automatically rotates to the next available account and continues the pipeline.

## Why Deferred

Out of scope for the initial Node.js rewrite to keep the implementation focused. The rewrite itself is a significant migration; account rotation can be layered on top once the core daemon is stable.

## Prior Art

The Python implementation had a working `AccountRotator` class (`backend/services/account_rotator.py`) with rate-limit detection via stdout pattern matching and per-account retry-after tracking. That logic can be ported or adapted.

## Rough Scope

- `config.json` gets an optional `accounts` array with profile dir paths
- Daemon tracks rate-limit state per account (in SQLite or in memory)
- On rate-limit detection in Claude stdout, rotate to next available account
- `cockpit accounts add/remove/list` CLI subcommands
