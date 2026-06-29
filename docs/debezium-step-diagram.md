# Debezium CDC flow (Outbox)

> [Bản tiếng Việt](./debezium-step-diagram.vi.md)

```mermaid
sequenceDiagram
  participant App as order-svc
  participant PG as PostgreSQL
  participant WAL as WAL
  participant Slot as replication slot
  participant DBZ as Debezium
  participant Off as _connect-offsets
  participant K as Kafka topic

  Note over Slot,WAL: Background: slot retains WAL from restart_lsn<br/>(always active — not a step after each INSERT)

  App->>PG: INSERT outbox_event
  PG->>WAL: write INSERT + COMMIT
  Slot->>WAL: retain WAL from restart_lsn
  DBZ->>WAL: read new changes
  DBZ->>K: publish message
  DBZ->>Off: save new LSN
  DBZ->>Slot: confirm flush LSN
```

## What is a replication slot?

In the diagram, the **replication slot** (`debezium_order_svc` in this project) is **not** a per-INSERT processing step — it is a **background** mechanism Postgres uses to retain WAL for Debezium.

When Debezium connects to Postgres, it creates (or reuses) a **logical replication slot**. The slot tells Postgres:

> “Do not delete WAL from `restart_lsn` onward until I confirm I have finished reading.”

So the line `Slot->>WAL: retain WAL from restart_lsn` means: **the slot holds WAL**, preventing Postgres from recycling/discarding WAL too early.

### Actual flow

1. App INSERT → Postgres writes to **WAL** (change log).
2. **Slot** retains WAL — without a slot, Postgres may delete old WAL to save disk.
3. Debezium reads WAL via the slot.
4. Debezium publishes to Kafka.
5. Debezium **confirms flush LSN** to the slot → Postgres knows “this WAL segment is fully processed, safe to clean up.”

### How is it different from `_connect-offsets`?

Same LSN, **two roles**:

| | Replication slot (Postgres) | `_connect-offsets` (Kafka) |
| --- | --- | --- |
| Owned by | PostgreSQL | Kafka Connect / Debezium |
| Purpose | Retain WAL, prevent data loss | Debezium knows where to resume on restart |
| Read by | Postgres WAL manager | Debezium on startup |

- **Kafka offset** = Debezium’s bookmark (“continue reading from here”).
- **Replication slot** = Postgres’s bookmark (“keep WAL up to here for the consumer”).

Postgres **does not read** `_connect-offsets`. It only learns progress via **confirm flush** on the slot.

### Common slot-related failures

- **Two connectors sharing one slot** → only one connector can read WAL.
- **Empty publication** (no tables) → slot stays active but captures no INSERTs.
- **After `prisma migrate reset`** → WAL resets but old offset remains → connector gets stuck.

Verify with `pnpm debezium:check` — compare `confirmed_flush_lsn` (slot) with the Debezium offset.

**In short:** the replication slot in the diagram = Postgres **retaining WAL** so Debezium does not lose events when reading slowly or restarting. It is not a business-logic step, but a CDC safety mechanism.

## Why two offsets? (Kafka + Postgres)

Debezium tracks progress in **two places** at `save new LSN` and `confirm flush LSN`. Same LSN, different jobs.

| | `save new LSN` → Kafka `_connect-offsets` | `confirm flush LSN` → Postgres slot `confirmed_flush_lsn` |
| --- | --- | --- |
| **Stored where** | Kafka topic `_connect-offsets` | Postgres system catalog `pg_replication_slots` |
| **Who owns it** | Kafka Connect / Debezium | PostgreSQL |
| **Who reads it** | Debezium when **connector restarts** | Postgres WAL manager |
| **Answers** | “Where should Debezium **resume reading**?” | “Which WAL is **safely processed**?” |
| **If missing / wrong** | Connector resumes from wrong LSN → stuck, duplicates, or missed events | WAL cannot be recycled → disk grows; or WAL deleted too early → data loss |

### Kafka offset (`save new LSN`) — bookmark for Debezium

- Debezium is **stateless between restarts**; Kafka Connect persists progress in `_connect-offsets`.
- On restart, Debezium loads this offset and continues streaming from that LSN.
- **Typical failure:** after `prisma migrate reset`, Postgres WAL starts over but `_connect-offsets` still holds an old LSN → connector waits for WAL that no longer exists (`pnpm debezium:reset`).

### Postgres slot (`confirm flush LSN`) — bookmark for the database

- The replication slot tells Postgres: **do not discard WAL** until Debezium confirms it has processed up to `confirmed_flush_lsn`.
- `confirm flush LSN` is Debezium **acknowledging** Postgres: “I have handled everything up to this LSN.”
- **Why Postgres needs its own copy:** Kafka offset is Debezium’s private resume point; Postgres does not read `_connect-offsets`. Postgres only knows what was flushed via the replication protocol.

### Why not only one?

```text
Kafka offset alone     → Postgres would not know which WAL is safe to delete
Postgres slot alone    → Debezium would not know where to resume after restart
Both, same LSN         → safe WAL retention + correct resume (pnpm debezium:check)
```

### Analogy

- **Kafka offset** = your ebook app remembers “last page read” on **your device**
- **Postgres slot** = the library knows which pages it must **keep** until you confirm you finished them

Both refer to the same page number (LSN), but one is for the **reader**, one is for the **storage system**.
