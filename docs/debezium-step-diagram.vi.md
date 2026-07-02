# Luồng Debezium CDC (Outbox)

> [English version](./debezium-step-diagram.md)

```mermaid
sequenceDiagram
  participant App as order-svc
  participant PG as PostgreSQL
  participant WAL as WAL
  participant Slot as replication slot
  participant DBZ as Debezium
  participant Off as _connect-offsets
  participant K as Kafka topic

  Note over Slot,WAL: Nền: slot giữ WAL từ restart_lsn<br/>(luôn active — không phải bước sau mỗi INSERT)

  App->>PG: 1. INSERT outbox_event
  PG->>WAL: 2. ghi INSERT + COMMIT
  PG-->>App: 3. COMMIT OK

  DBZ->>Slot: 4. đọc thay đổi mới (logical decoding)
  Slot->>WAL: 5. decode WAL từ restart_lsn
  WAL-->>DBZ: 6. row change (op, before/after)

  DBZ->>K: 7. publish message (sau SMT)
  DBZ->>Off: 8. lưu LSN mới (offset flush định kỳ)
  DBZ->>Slot: 9. confirm flush LSN
  Slot->>WAL: 10. advance restart_lsn → WAL cũ có thể dọn
```

## Replication slot là gì?

Trong diagram, **replication slot** (`debezium_order_svc` trong project) **không phải** bước xử lý từng INSERT — nó là cơ chế **nền** Postgres dùng để giữ WAL cho Debezium.

Khi Debezium kết nối Postgres, nó tạo (hoặc tái sử dụng) một **logical replication slot**. Slot báo với Postgres:

> “Đừng xóa WAL từ vị trí `restart_lsn` trở đi, cho đến khi tôi confirm đã đọc xong.”

Vì vậy dòng `Slot->>WAL: giữ WAL từ restart_lsn` nghĩa là: **slot giữ WAL**, không cho Postgres recycle/dọn WAL quá sớm.

### Luồng thực tế

1. App INSERT → Postgres ghi vào **WAL** (log thay đổi).
2. **Slot** giữ WAL — nếu không có slot, Postgres có thể xóa WAL cũ để tiết kiệm disk.
3. Debezium đọc WAL qua slot.
4. Debezium publish lên Kafka.
5. Debezium **confirm flush LSN** về slot → Postgres biết “đoạn WAL này đã xử lý xong, có thể dọn”.

### Khác gì với `_connect-offsets`?

Cùng một LSN nhưng **hai vai trò**:

| | Replication slot (Postgres) | `_connect-offsets` (Kafka) |
| --- | --- | --- |
| Ai sở hữu | PostgreSQL | Kafka Connect / Debezium |
| Mục đích | Giữ WAL, tránh mất data | Debezium biết resume ở đâu khi restart |
| Ai đọc | Postgres WAL manager | Debezium khi khởi động lại |

- **Kafka offset** = bookmark của Debezium (“đọc tiếp từ đây”).
- **Replication slot** = bookmark của Postgres (“giữ WAL đến đây cho consumer”).

Postgres **không đọc** `_connect-offsets`. Nó chỉ biết tiến độ qua **confirm flush** trên slot.

### Lỗi thường gặp liên quan slot

- **2 connector dùng chung 1 slot** → chỉ một connector đọc được WAL.
- **Publication trống** (không có bảng) → slot vẫn active nhưng không capture INSERT nào.
- **Sau `prisma migrate reset`** → WAL reset nhưng offset cũ còn → connector bị stuck.

Kiểm tra bằng `pnpm debezium:check` — so sánh `confirmed_flush_lsn` (slot) với offset Debezium.

**Tóm lại:** replication slot trong diagram = Postgres **giữ WAL** để Debezium không bị mất event khi đọc chậm hoặc restart. Đây không phải bước business logic, mà là cơ chế an toàn của CDC.

## Tại sao có hai offset? (Kafka + Postgres)

Debezium theo dõi tiến độ ở **hai nơi**: `lưu LSN mới` và `confirm flush LSN`. Cùng một LSN, nhưng nhiệm vụ khác nhau.

| | `lưu LSN mới` → Kafka `_connect-offsets` | `confirm flush LSN` → Postgres slot `confirmed_flush_lsn` |
| --- | --- | --- |
| **Lưu ở đâu** | Kafka topic `_connect-offsets` | Catalog hệ thống Postgres `pg_replication_slots` |
| **Ai sở hữu** | Kafka Connect / Debezium | PostgreSQL |
| **Ai đọc** | Debezium khi **connector restart** | Postgres WAL manager |
| **Trả lời câu hỏi** | “Debezium nên **đọc tiếp từ đâu**?” | “WAL nào đã **xử lý an toàn**?” |
| **Nếu sai / thiếu** | Connector resume sai LSN → stuck, trùng lặp, hoặc mất event | WAL không được recycle → disk tăng; hoặc WAL bị xóa sớm → mất data |

### Kafka offset (`lưu LSN mới`) — bookmark cho Debezium

- Debezium **stateless giữa các lần restart**; Kafka Connect lưu tiến độ trong `_connect-offsets`.
- Khi restart, Debezium load offset này và tiếp tục stream từ LSN đó.
- **Lỗi hay gặp:** sau `prisma migrate reset`, Postgres WAL bắt đầu lại nhưng `_connect-offsets` vẫn giữ LSN cũ → connector chờ WAL không còn tồn tại (`pnpm debezium:reset`).

### Postgres slot (`confirm flush LSN`) — bookmark cho database

- Replication slot báo Postgres: **đừng xóa WAL** cho đến khi Debezium confirm đã xử lý tới `confirmed_flush_lsn`.
- `confirm flush LSN` là Debezium **xác nhận** với Postgres: “Tôi đã xử lý xong mọi thứ tới LSN này.”
- **Vì sao Postgres cần bản copy riêng:** Kafka offset là điểm resume riêng của Debezium; Postgres không đọc `_connect-offsets`. Postgres chỉ biết tiến độ qua replication protocol.

### Tại sao không chỉ cần một cái?

```text
Chỉ Kafka offset     → Postgres không biết WAL nào an toàn để xóa
Chỉ Postgres slot    → Debezium không biết resume ở đâu sau restart
Cả hai, cùng LSN     → giữ WAL an toàn + resume đúng (pnpm debezium:check)
```

### Ví von

- **Kafka offset** = app sách điện tử ghi nhớ “trang đọc cuối” trên **thiết bị của bạn**
- **Postgres slot** = thư viện biết phải **giữ** những trang nào cho đến khi bạn xác nhận đã đọc xong

Cả hai đều trỏ cùng một số trang (LSN), nhưng một cái phục vụ **người đọc**, một cái phục vụ **hệ thống lưu trữ**.
