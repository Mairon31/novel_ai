# ADR-0003 — Separate GPU workers from the primary workspace

**Date:** 2026-11-04  
**Status:** accepted as an experimental P1.1 architecture.

## Problem

Noble AI should be able to run supported inference on a second computer or suitable remote runtime without transferring the entire story library or unrelated service credentials to that machine.

## Decision

1. The primary API remains bound to `127.0.0.1` by default.
2. The GPU machine runs its own OpenAI-compatible inference service and an independent Noble Worker proxy.
3. The experimental design uses a temporary Cloudflare Quick Tunnel to expose **only** that worker proxy, requiring bearer authentication. The main SQLite database stores worker name, URL, and role; credentials belong in the operating-system keyring.
4. The primary service checks the permitted HTTPS endpoint form and rejects invalid credentials before activating a worker.
5. Remote narrative streaming does not relocate local SQLite story persistence.
6. Images and speech require additional protocols and GPU queues; do not infer that they are implemented merely because narrative workers exist.
7. Do not open the main application directly to LAN/WAN without dedicated session authentication and authorization.

## Consequences and limits

Workers may receive the current inference prompt but must not receive the whole story database or unrelated local files. Temporary tunnels can disconnect. Real Colab inference and 12/16 GB NVIDIA performance still require measured evidence. This structure follows modular design concepts studied in Urakatsu; it does not copy its private worker protocol.

## Next gates

Real remote-GPU benchmarks, role-specific health/capability discovery, reconnect behavior, integrity-checked runtime upgrades with rollback, authenticated LAN access, and image/speech worker adapters.

See the [worker guide](../WORKERS.md).
