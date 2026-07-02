# Database Replication — Nội dung Slide

> Tài liệu trình bày về cơ chế replication, các chế độ sync/async/semi, replication lag, replication slot, và giới thiệu CDC.

---

## Slide 1 — Giới thiệu

**Database Replication là gì?**

- Sao chép dữ liệu từ **Primary** (master) sang **Replica** (standby)
- Mục đích chính:
  - **High Availability (HA):** failover khi primary hỏng
  - **Read scaling:** đọc từ replica, giảm tải primary
  - **Disaster recovery:** bản sao ở khu vực/DC khác
- Cơ chế cốt lõi: ghi thay đổi vào **WAL** (Write-Ahead Log) trên primary → gửi sang replica → replay

**Kiến trúc demo (project này):**

```
Client → Primary (pg-primary :5532)
              ↓ WAL stream
         Replica1 (:5533)  +  Replica2 (:5534)
```

---

## Slide 2 — Replication hoạt động như thế nào?

**Nguyên lý cốt lõi: Write-Ahead Log (WAL)**

- Mọi thay đổi (INSERT/UPDATE/DELETE) được ghi vào **WAL trước**, rồi mới apply vào data files
- WAL = nhật ký tuần tự các thay đổi — giống "log giao dịch"
- Replica **không copy query** từ primary — nó **replay WAL** để tái tạo cùng trạng thái dữ liệu

**Hai giai đoạn chính:**

```
Giai đoạn 1 — Bootstrap (lần đầu)          Giai đoạn 2 — Streaming (liên tục)
─────────────────────────────────          ──────────────────────────────────
Primary (full data)                        Primary ghi WAL liên tục
       │ pg_basebackup                            │
       ▼                                           ▼ WAL stream
Replica (bản sao ban đầu)                  Replica replay WAL → cập nhật dữ liệu
```

**Giai đoạn 1 — Bootstrap (`pg_basebackup`):**

- Replica khởi tạo lần đầu: clone **toàn bộ data directory** từ primary
- Trong project: `replication/replica/entrypoint.sh` chạy `pg_basebackup -R -C -S`
  - `-R`: tạo `standby.signal` + cấu hình kết nối primary
  - `-C -S`: tạo **replication slot** riêng (`replica1_slot`, `replica2_slot`)
- Sau bước này replica đã có snapshot ban đầu, sẵn sàng nhận WAL mới

**Giai đoạn 2 — Streaming Replication (liên tục):**

```
Client → Primary
           │
           ├─ 1. Ghi thay đổi vào WAL
           ├─ 2. Commit transaction
           │
           └─ 3. walsender process gửi WAL ──► walreceiver trên Replica
                                                    │
                                                    ├─ 4. Ghi vào WAL local
                                                    └─ 5. Replay → apply vào bảng
```

**Các thành phần quan trọng:**

| Thành phần                    | Vai trò                                                  |
| ----------------------------- | -------------------------------------------------------- |
| **WAL**                       | Log thay đổi trên primary, nguồn dữ liệu cho replication |
| **LSN** (Log Sequence Number) | "Địa chỉ" trong WAL — đánh dấu vị trí đã xử lý           |
| **walsender**                 | Process trên primary, stream WAL tới replica             |
| **walreceiver**               | Process trên replica, nhận WAL từ primary                |
| **Replication slot**          | Giữ WAL, tránh primary xóa sớm (xem Slide 3)             |
| **standby.signal**            | File đánh dấu instance này là replica (read-only)        |

**Physical vs Logical Replication:**

|                       | Physical (Streaming)         | Logical (CDC)                  |
| --------------------- | ---------------------------- | ------------------------------ |
| Copy gì               | Toàn bộ WAL bytes            | Decode WAL → row-level changes |
| Consumer              | Standby DB (replica)         | Debezium, service khác         |
| Replica có thể query? | Có (hot standby)             | Không — không phải DB replica  |
| Ví dụ project         | `pg-replica1`, `pg-replica2` | Debezium → Kafka               |

**Trạng thái replica:**

- Replica luôn ở chế độ **read-only** — ghi sẽ bị từ chối
- Primary chết → promote replica lên primary (failover)
- Replica lag = khoảng cách LSN giữa primary và replica (xem Slide 10)

**Kiểm tra replication đang chạy:**

```sql
-- Trên primary: xem replica đã kết nối chưa
SELECT application_name, state, sync_state,
       write_lag, flush_lag, replay_lag
FROM pg_stat_replication;
```

```bash
# Demo trong project
cd replication && docker compose up -d
bash replication/test.sh
```

---

## Slide 3 — Replication Slot là gì?

**Định nghĩa:** cơ chế trên PostgreSQL giúp **consumer** (replica hoặc CDC tool) đọc WAL mà **không bị mất dữ liệu** — Postgres sẽ không xóa/recycle WAL cho đến khi consumer xác nhận đã đọc xong.

**Vấn đề slot giải quyết:**

- WAL là log vòng — Postgres muốn **dọn WAL cũ** để tiết kiệm disk
- Consumer (replica, Debezium) có thể đọc **chậm hơn** tốc độ ghi
- Không có slot → Postgres xóa WAL cũ → consumer mất event / replica không sync được

**Slot báo với Postgres:**

> "Đừng xóa WAL từ vị trí `restart_lsn` trở đi, cho đến khi tôi confirm đã đọc xong."

**Hai loại slot:**

| Loại              | Dùng cho                                | Ví dụ trong project              |
| ----------------- | --------------------------------------- | -------------------------------- |
| **Physical slot** | Streaming replication → standby replica | `replica1_slot`, `replica2_slot` |
| **Logical slot**  | Logical decoding → CDC (Debezium)       | `debezium_order_svc`             |

**Các trường quan trọng (`pg_replication_slots`):**

| Trường                | Ý nghĩa                                                |
| --------------------- | ------------------------------------------------------ |
| `slot_name`           | Tên slot (mỗi consumer nên có slot riêng)              |
| `slot_type`           | `physical` hoặc `logical`                              |
| `restart_lsn`         | Vị trí WAL tối thiểu slot cần giữ                      |
| `confirmed_flush_lsn` | Consumer đã confirm đọc xong tới đây                   |
| `active`              | Có consumer đang kết nối không                         |
| `wal_status`          | Trạng thái WAL: `reserved` / `extended` / `unreserved` |

**Luồng hoạt động:**

```
Primary ghi WAL
      ↓
Slot giữ WAL (không cho dọn sớm)
      ↓
Consumer đọc WAL (replica replay hoặc Debezium publish Kafka)
      ↓
Consumer confirm flush LSN → Postgres có thể dọn WAL cũ
```

**Khác gì với `_connect-offsets` (Kafka)?** _(chỉ áp dụng cho CDC/Debezium)_

|           | Replication slot (Postgres) | `_connect-offsets` (Kafka)             |
| --------- | --------------------------- | -------------------------------------- |
| Ai sở hữu | PostgreSQL                  | Kafka Connect / Debezium               |
| Mục đích  | Giữ WAL, tránh mất data     | Debezium biết resume ở đâu khi restart |
| Ai đọc    | Postgres WAL manager        | Debezium khi khởi động lại             |
| Trả lời   | "WAL nào an toàn để xóa?"   | "Đọc tiếp từ LSN nào?"                 |

Postgres **không đọc** Kafka offset — chỉ biết tiến độ qua **confirm flush** trên slot.

**Ví von:**

- **Kafka offset** = app sách điện tử ghi nhớ "trang đọc cuối" trên thiết bị của bạn
- **Replication slot** = thư viện biết phải **giữ** những trang nào cho đến khi bạn xác nhận đọc xong

**Rủi ro cần lưu ý:**

- Consumer chết / đọc quá chậm → WAL tích lũy → **disk đầy** trên primary
- **2 connector dùng chung 1 slot** → chỉ 1 connector đọc được WAL
- **Publication trống** → slot active nhưng không capture INSERT nào
- Sau `prisma migrate reset` → WAL reset nhưng offset cũ còn → connector stuck

**Cách kiểm tra:**

```sql
SELECT slot_name, slot_type, active, restart_lsn, confirmed_flush_lsn,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS retained_wal
FROM pg_replication_slots;
```

```bash
pnpm debezium:check   # so sánh confirmed_flush_lsn với offset Debezium
```

**Tóm lại:** replication slot không phải bước business logic — đây là **cơ chế an toàn** giữ WAL cho consumer, dùng cho cả **physical replication** (HA) lẫn **logical replication** (CDC).

---

## Slide 4 — Ba chế độ Replication (tổng quan)

| Chế độ        | Primary trả Success khi nào?   | Latency    | RPO              | Consistency |
| ------------- | ------------------------------ | ---------- | ---------------- | ----------- |
| **Async**     | Commit local xong              | Thấp       | > 0 (có thể mất) | Eventual    |
| **Semi-sync** | Ít nhất 1 replica **nhận** WAL | Trung bình | Rất thấp         | Gần mạnh    |
| **Sync**      | Replica **replay** WAL xong    | Cao        | 0                | Strong      |

> **RPO** (Recovery Point Objective): lượng dữ liệu tối đa có thể mất khi sự cố.

---

## Slide 5 — Asynchronous Replication (Bất đồng bộ)

**Luồng hoạt động:**

```
Client → INSERT → Primary ghi WAL → Commit → Success (ngay)
                                      ↓ (background)
                              Gửi WAL → Replica replay
```

**Điểm mạnh:**

- Latency thấp, throughput cao — client không chờ replica
- Replica chậm/chết **không ảnh hưởng** ghi trên primary
- Phù hợp replica đặt xa về địa lý

**Điểm yếu:**

- **RPO > 0:** primary chết trước khi WAL kịp gửi → mất giao dịch đã commit
- **Replication lag:** đọc replica có thể thấy dữ liệu cũ
- Failover có thể thiếu dữ liệu mới nhất

**Khi nào dùng:** analytics, read-replica báo cáo, cache, log — ưu tiên hiệu năng, chấp nhận mất ít dữ liệu.

**PostgreSQL config:**

```sql
synchronous_standby_names = ''
synchronous_commit = 'on'
```

---

## Slide 6 — Synchronous Replication (Đồng bộ)

**Luồng hoạt động:**

```
Client → INSERT → Primary ghi WAL → Gửi WAL → Replica replay → ACK
                                                      ↓
                                              Primary commit → Success
```

**Điểm mạnh:**

- **RPO = 0:** replica luôn có đủ dữ liệu đã commit
- **Strong consistency:** đọc replica = dữ liệu mới nhất
- Failover an toàn, không lo mất giao dịch

**Điểm yếu:**

- Latency cao — mỗi ghi phải chờ round-trip mạng + replay
- **Phụ thuộc replica:** replica chết → ghi bị treo/từ chối
- Replica càng xa → latency càng lớn

**Khi nào dùng:** tài chính, thanh toán, dữ liệu không được phép mất.

**PostgreSQL config:**

```sql
synchronous_standby_names = 'FIRST 1 (replica1, replica2)'
synchronous_commit = 'remote_apply'   -- chờ replay xong
```

---

## Slide 7 — Semi-synchronous Replication (Bán đồng bộ)

**Luồng hoạt động:**

```
Client → INSERT → Primary ghi WAL → Commit → Gửi WAL → Replica ACK (đã nhận)
                                                              ↓
                                                      Success cho client
                                              (Replica replay sau — background)
```

**Ý tưởng:** dung hòa giữa async và sync — chờ replica **nhận** WAL, **không chờ replay**.

**Điểm mạnh:**

- Giảm rủi ro mất dữ liệu so với async (WAL đã tới ít nhất 1 replica)
- Latency thấp hơn sync (không chờ replay)
- Cân bằng tốt giữa độ bền và hiệu năng

**Điểm yếu:**

- Vẫn có cửa sổ rủi ro nhỏ: replica nhận WAL nhưng chưa replay, cả primary + replica cùng hỏng
- Latency cao hơn async (phải chờ ACK)
- Nhiều DB tự **fallback về async** khi không có replica ACK trong timeout

**Khi nào dùng:** e-commerce, đơn hàng — cần độ bền cao nhưng không chấp nhận latency của sync.

**PostgreSQL config:**

```sql
synchronous_standby_names = 'FIRST 1 (replica1, replica2)'
synchronous_commit = 'remote_write'   -- chờ replica nhận + ghi OS
```

---

## Slide 8 — So sánh trực quan 3 chế độ

```
         ASYNC              SEMI-SYNC              SYNC
Client ──► Primary          Client ──► Primary     Client ──► Primary
           │ commit ✓                      │ commit ✓              │ ghi WAL
           │ Success                       │ gửi WAL               │ gửi WAL
           ▼ (sau)                         │ ACK ✓                 ▼ replay ✓
         gửi WAL                           │ Success               ACK ✓
           ▼                               ▼ (sau)                 commit ✓
         replay                           replay                  Success
```

| Tiêu chí                    | Sync      | Semi-sync        | Async      |
| --------------------------- | --------- | ---------------- | ---------- |
| Độ trễ ghi                  | Cao       | Trung bình       | Thấp       |
| RPO                         | 0         | Rất thấp         | Có thể cao |
| Phụ thuộc replica           | Cao       | Trung bình       | Thấp       |
| Replica chết → ghi bị treo? | Có (sync) | Có thể (timeout) | Không      |

**Bonus — Quorum sync (PostgreSQL):**

```sql
synchronous_standby_names = 'ANY 1 (replica1, replica2)'
```

Chờ **bất kỳ 1** replica flush → không treo khi 1 replica chết.

---

## Slide 9 — Replication Lag là gì?

**Định nghĩa:** khoảng thời gian replica **chậm hơn** primary — dữ liệu trên replica chưa cập nhật kịp.

**Ba loại lag (PostgreSQL `pg_stat_replication`):**

| Metric       | Ý nghĩa                                        |
| ------------ | ---------------------------------------------- |
| `write_lag`  | WAL đã gửi nhưng replica chưa ghi vào buffer   |
| `flush_lag`  | Replica ghi buffer nhưng chưa fsync xuống disk |
| `replay_lag` | Replica đã nhận WAL nhưng chưa apply vào bảng  |

**Nguyên nhân phổ biến:**

- Replica yếu hơn primary (CPU, disk I/O)
- Mạng chậm hoặc không ổn định
- Primary ghi quá nhanh (burst traffic)
- Replica đang chạy query nặng (contention)
- Long-running transaction trên replica chặn replay

**Hậu quả:**

- Đọc từ replica → **stale data** (dữ liệu cũ)
- Failover → replica promote lên primary nhưng thiếu giao dịch gần nhất
- Monitoring báo độ trễ cao → cảnh báo sớm

**Cách đo:**

```sql
-- Trên primary
SELECT application_name, write_lag, flush_lag, replay_lag
FROM pg_stat_replication;

-- Trên replica
SELECT now() - pg_last_xact_replay_timestamp() AS replica_lag;
```

---

## Slide 10 — Replication Lag: Demo & Giải pháp

**Demo trong project:** `bash replication/tests/lag.sh`

- Pause replay trên replica → tạo lag cố ý
- Ghi trên primary → đọc replica → thấy dữ liệu chưa có
- Resume replay → dữ liệu xuất hiện

**Giảm lag:**

- Tăng tài nguyên replica (CPU, RAM, SSD)
- Giảm query nặng trên replica (chỉ dùng cho read đơn giản)
- Dùng **semi-sync** hoặc **sync** nếu cần đảm bảo dữ liệu mới
- Monitoring + alert khi `replay_lag > threshold`

**Ứng dụng thực tế:**

- **Read-after-write consistency:** sau khi ghi, đọc từ primary (không đọc replica ngay)
- **Sticky session:** user luôn đọc cùng replica đã sync
- **Lag-aware routing:** route read tới replica có lag thấp

---

## Slide 11 — CDC là gì? (Change Data Capture)

**Định nghĩa:** bắt và stream **mọi thay đổi** trong database (INSERT, UPDATE, DELETE) theo thời gian thực — **không cần poll/query lặp lại**.

**Khác gì với Replication thông thường?**

|             | DB Replication                   | CDC                                  |
| ----------- | -------------------------------- | ------------------------------------ |
| Mục đích    | Sao chép toàn bộ DB sang replica | Stream thay đổi cho service khác     |
| Consumer    | Replica DB (replay WAL)          | Kafka, microservice, data warehouse  |
| Granularity | Toàn bộ database                 | Từng bảng / từng row change          |
| Use case    | HA, read scaling                 | Event-driven architecture, sync data |

**Nguồn dữ liệu CDC:**

- **WAL / Transaction log** (Debezium, PostgreSQL logical replication)
- **Trigger + bảng audit**
- **Timestamp polling** (kém hiệu quả, không real-time)

---

## Slide 12 — CDC với Debezium (trong project này)

**Kiến trúc Outbox Pattern:**

```
order-svc → INSERT outbox_event → PostgreSQL WAL
                                        ↓
                                   Debezium (đọc WAL qua slot)
                                        ↓
                                   Kafka topic
                                        ↓
                              notification-svc, payment-svc, ...
```

**Tại sao dùng Outbox Pattern?**

- Ghi business data + event trong **cùng 1 transaction** → đảm bảo atomic
- Tránh dual-write problem (ghi DB + publish Kafka riêng → có thể mất 1 trong 2)
- Debezium chỉ CDC bảng `outbox_event`, không đọc trực tiếp bảng business

**Replication slot:** Debezium dùng logical slot `debezium_order_svc` (xem Slide 3).

---

## Slide 13 — Debezium SMT: Filter, Unwrap, Route, Mask

**SMT (Single Message Transformations) là gì?**

- Processor nhẹ chạy **trong Kafka Connect**, biến đổi từng record **trước khi** publish lên Kafka
- Không cần viết consumer riêng — xử lý in-flight ngay tại connector
- Có thể **chain** nhiều SMT: output của SMT trước = input của SMT sau

**Pipeline trong project (`debezium/postgres-connector.json`):**

```
Raw CDC Event → Filter → Unwrap → Rename → Route → Kafka Topic
                  ↓         ↓        ↓         ↓
              lọc event  flatten  đổi tên   đổi topic
```

```json
"transforms": "filter,unwrap,rename,route"
```

> Best practice: **Filter trước** để loại record sớm, giảm tải các SMT phía sau.

---

### 1. Filter — Lọc record

**Mục đích:** drop record không cần thiết — chỉ giữ event thỏa điều kiện.

| Thuộc tính    | Ý nghĩa                                                   |
| ------------- | --------------------------------------------------------- |
| `condition`   | Biểu thức Groovy — `true` = **giữ lại**, `false` = **bỏ** |
| `topic.regex` | Chỉ áp filter cho topic khớp regex                        |

**Config trong project:**

```json
"transforms.filter.type": "io.debezium.transforms.Filter",
"transforms.filter.language": "jsr223.groovy",
"transforms.filter.condition": "value.after.aggregate_type == 'Order1'",
"transforms.filter.topic.regex": "order-svc\\.created\\.public\\.outbox_event.*"
```

**Ví dụ khác (từ blog):**

```properties
# Chỉ giữ INSERT/UPDATE, bỏ DELETE
transforms.filter.condition=value.op != 'd'

# Bỏ bảng audit_log
transforms.filter.condition=value.source.table != 'audit_log'

# Chỉ giữ order status = completed
transforms.filter.condition=value.after != null && value.after.status == 'completed'
```

---

### 2. Unwrap — Flatten event (`ExtractNewRecordState`)

**Mục đích:** Debezium event raw có cấu trúc phức tạp (`before`/`after`/`source`/`op`) — unwrap **chỉ lấy trạng thái mới** (`after`) cho consumer dễ đọc.

**Trước unwrap:**

```json
{
  "before": null,
  "after": {
    "id": "uuid-123",
    "aggregate_type": "Order1",
    "payload": "{\"orderId\": 1001}"
  },
  "source": { "table": "outbox_event", "ts_ms": 1706400000000 },
  "op": "c"
}
```

**Sau unwrap:**

```json
{
  "id": "uuid-123",
  "aggregate_type": "Order1",
  "payload": "{\"orderId\": 1001}",
  "__op": "c",
  "__table": "outbox_event",
  "__ts_ms": 1706400000000
}
```

**Config trong project:**

```json
"transforms.unwrap.type": "io.debezium.transforms.ExtractNewRecordState",
"transforms.unwrap.drop.tombstones": "false",
"transforms.unwrap.delete.handling.mode": "rewrite",
"transforms.unwrap.add.headers": "op",
"transforms.unwrap.add.fields": "op,source.table:table,source.ts_ms:ts_ms"
```

| Option                         | Ý nghĩa                                              |
| ------------------------------ | ---------------------------------------------------- |
| `delete.handling.mode=rewrite` | DELETE → giữ primary key, thêm flag `__deleted=true` |
| `drop.tombstones=false`        | Giữ tombstone message (Kafka compacted topic)        |
| `add.fields`                   | Thêm metadata (`op`, `table`, `ts_ms`) vào value     |
| `add.headers`                  | Thêm `op` vào Kafka header                           |

---

### 3. Route — Đổi tên Kafka topic

**Mục đích:** route event sang topic khác theo regex — tách topic theo bảng, service, hoặc convention đặt tên.

**Config trong project:**

```json
"transforms.route.type": "org.apache.kafka.connect.transforms.RegexRouter",
"transforms.route.regex": "(.*)\\.public\\.(.*)",
"transforms.route.replacement": "cdc.$1.$2"
```

**Ví dụ transform:**

```
order-svc.created.public.outbox_event
        ↓ RegexRouter
cdc.order-svc.created.outbox_event
```

Consumer subscribe topic `cdc.order-svc.created.outbox_event` thay vì topic mặc định dài của Debezium.

**Route theo content (Debezium `ByLogicalTableRouter`):**

```properties
transforms.route.type=io.debezium.transforms.ByLogicalTableRouter
transforms.route.topic.regex=(.*)customers(.*)
transforms.route.topic.replacement=$1customers-$2
```

---

### 4. Mask — Che dữ liệu nhạy cảm

**Mục đích:** mask field trước khi event rời connector — bảo vệ PII/sensitive data.

```json
"transforms": "filter,unwrap,mask,route",
"transforms.mask.type": "org.apache.kafka.connect.transforms.MaskField$Value",
"transforms.mask.fields": "email,phone,ssn,password",
"transforms.mask.replacement": "***REDACTED***"
```

**Kết quả:** field `email: "user@example.com"` → `email: "***REDACTED***"`

**Dùng predicate để mask có điều kiện:**

```properties
predicates=isCustomerTable
predicates.isCustomerTable.type=org.apache.kafka.connect.transforms.predicates.TopicNameMatches
predicates.isCustomerTable.pattern=.*customers.*

transforms.mask.predicate=isCustomerTable
```

---

### Bonus: Rename (project đang dùng)

Đổi tên field cho khớp schema downstream:

```json
"transforms.rename.type": "org.apache.kafka.connect.transforms.ReplaceField$Value",
"transforms.rename.renames": "payload:event_payload"
```

`payload` → `event_payload` — consumer nhận field name rõ nghĩa hơn.

---

### Chain đầy đủ (blog reference)

```
Raw Event → Filter → Unwrap → Route → Mask → Rename → Final Event
```

| Thứ tự khuyến nghị      | Lý do                               |
| ----------------------- | ----------------------------------- |
| Filter đầu tiên         | Drop sớm, giảm CPU                  |
| Unwrap trước Route/Mask | Consumer nhận structure phẳng       |
| Route sau Unwrap        | Topic name dựa trên data đã flatten |
| Mask trước khi publish  | Không để sensitive data lên Kafka   |

**Lưu ý:**

- Mỗi SMT thêm overhead — monitor latency qua JMX metrics
- Test kỹ — filter sai có thể **im lặng drop** event
- Expression Groovy phức tạp → chậm hơn expression đơn giản

---

## Slide 14 — CDC: Luồng chi tiết

```
1. App INSERT vào outbox_event
2. Postgres ghi WAL + COMMIT
3. Slot giữ WAL (không cho Postgres dọn sớm)
4. Debezium đọc thay đổi mới từ WAL
5. SMT chain: Filter → Unwrap → Rename → Route (Slide 13)
6. Publish message lên Kafka topic (cdc.order-svc.created.outbox_event)
7. Debezium lưu LSN mới vào _connect-offsets (Kafka)
8. Debezium confirm flush LSN về slot → Postgres có thể dọn WAL cũ
9. Consumer (notification-svc) nhận event và xử lý
```

**Lỗi thường gặp:**

- 2 connector dùng chung 1 slot → chỉ 1 connector đọc được
- Publication trống → slot active nhưng không capture INSERT
- Sau `prisma migrate reset` → WAL reset nhưng offset cũ còn → connector stuck

**Kiểm tra:** `pnpm debezium:check`

---

## Slide 15 — Khi nào dùng gì? (Tổng kết)

**Chọn chế độ Replication:**

| Scenario                                   | Gợi ý           |
| ------------------------------------------ | --------------- |
| Báo cáo, analytics, log                    | **Async**       |
| E-commerce, đơn hàng                       | **Semi-sync**   |
| Thanh toán, tài chính                      | **Sync**        |
| Cần HA nhưng không treo khi 1 replica chết | **Quorum sync** |

**Chọn CDC khi:**

- Microservices cần **reactive** với thay đổi DB
- Sync data sang data warehouse / search index
- Event-driven architecture (Outbox → Kafka → consumers)
- Cần audit trail mọi thay đổi

**Replication vs CDC — bổ sung cho nhau:**

- **Replication** = durability + HA + read scaling (cùng loại DB)
- **CDC** = integration + event streaming (khác loại system)

---

**Q&A**
