# Debezium PostgreSQL Connector - Transactional Outbox Pattern Notes

## Architecture

```text
Business Tables (orders, payments, users)
                ↓
       INSERT INTO outbox_event
                ↓
          PostgreSQL WAL
                ↓
             Debezium
                ↓
      ExtractNewRecordState
                ↓
      Rename payload field
                ↓
             Kafka Topic
                ↓
             Consumers
```

---

# Connector Configuration

```json
{
  "name": "order-svc-postgres-connector",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "topic.prefix": "order-svc.created",
    "database.hostname": "database2",
    "database.port": "5432",
    "database.user": "postgresql",
    "database.password": "postgresql",
    "database.dbname": "kafka_hqh",
    "database.server.name": "kafka_hqh",
    "plugin.name": "pgoutput",
    "publication.autocreate.mode": "filtered",
    "table.include.list": "public.outbox_event",
    "snapshot.mode": "never",
    "slot.name": "debezium_order_svc",
    "slot.drop.on.stop": "false",
    "database.server.id": "184054",
    "include.schema.changes": "false",
    "schema.history.internal.kafka.bootstrap.servers": "kafka:9092",
    "schema.history.internal.kafka.topic": "schema-history.kafka_hqh",
    "heartbeat.interval.ms": "10000",
    "max.batch.size": "2048",
    "max.queue.size": "8192",
    "key.converter": "org.apache.kafka.connect.json.JsonConverter",
    "key.converter.schemas.enable": "false",
    "value.converter": "org.apache.kafka.connect.json.JsonConverter",
    "value.converter.schemas.enable": "false",
    "transforms": "unwrap,rename",
    "transforms.unwrap.type": "io.debezium.transforms.ExtractNewRecordState",
    "transforms.unwrap.drop.tombstones": "false",
    "transforms.unwrap.delete.handling.mode": "rewrite",
    "transforms.unwrap.add.headers": "op",
    "transforms.unwrap.add.fields": "op,source.table:table,source.ts_ms:ts_ms",
    "transforms.rename.type": "org.apache.kafka.connect.transforms.ReplaceField$Value",
    "transforms.rename.renames": "payload:event_payload"
  }
}
```

---

# Configuration Explanation

## 1. Connector

### name

```json
"name": "order-svc-postgres-connector"
```

Tên của connector trong Kafka Connect.

---

### connector.class

```json
"connector.class": "io.debezium.connector.postgresql.PostgresConnector"
```

Sử dụng Debezium PostgreSQL Connector để đọc WAL.

---

# 2. Topic

### topic.prefix

```json
"topic.prefix": "order-svc.created"
```

Topic được tạo theo format:

```text
<prefix>.<schema>.<table>
```

Ví dụ:

```text
order-svc.created.public.outbox_event
```

---

# 3. Database Connection

### database.hostname

```json
"database.hostname": "database2"
```

Hostname của PostgreSQL.

### database.port

```json
"database.port": "5432"
```

Port PostgreSQL.

### database.user

```json
"database.user": "postgresql"
```

Database user.

### database.password

```json
"database.password": "postgresql"
```

Database password.

### database.dbname

```json
"database.dbname": "kafka_hqh"
```

Tên database.

---

# 4. database.server.name

```json
"database.server.name": "kafka_hqh"
```

Field cũ của Debezium dùng để prefix topic.

Trong Debezium version mới:

```text
topic.prefix
```

đã thay thế phần lớn chức năng này.

Có thể bỏ trong PostgreSQL Connector mới.

---

# 5. Logical Decoding Plugin

### plugin.name

```json
"plugin.name": "pgoutput"
```

Debezium sử dụng plugin `pgoutput` để đọc PostgreSQL WAL.

Ưu điểm:

- Native PostgreSQL
- Hiệu năng tốt
- Không cần extension ngoài

---

# 6. Publication

### publication.autocreate.mode

```json
"publication.autocreate.mode": "filtered"
```

Debezium tự tạo publication chỉ cho các bảng được khai báo trong:

```json
table.include.list
```

Ví dụ:

```sql
CREATE PUBLICATION dbz_publication
FOR TABLE public.outbox_event;
```

---

# 7. Table Filter

### table.include.list

```json
"table.include.list": "public.outbox_event"
```

Chỉ CDC:

```text
public.outbox_event
```

Không CDC:

```text
orders
payments
users
```

Đây là cấu hình điển hình của Transactional Outbox Pattern.

---

# 8. Snapshot

### snapshot.mode

```json
"snapshot.mode": "never"
```

Không đọc dữ liệu cũ.

Chỉ đọc các thay đổi mới trong WAL.

Phù hợp với Outbox Pattern.

---

# 9. Replication Slot

### slot.name

```json
"slot.name": "debezium_order_svc"
```

Tên replication slot.

Slot lưu:

```text
LSN cuối cùng đã đọc
```

giúp connector restart mà không mất event.

---

### slot.drop.on.stop

```json
"slot.drop.on.stop": "false"
```

Không xoá replication slot khi connector dừng.

Giúp resume từ LSN cũ.

Production nên để:

```text
false
```

---

# 10. database.server.id

```json
"database.server.id": "184054"
```

Field dành cho MySQL Connector.

PostgreSQL Connector không sử dụng.

Có thể xoá.

---

# 11. Schema Changes

### include.schema.changes

```json
"include.schema.changes": "false"
```

Không publish DDL event:

- CREATE TABLE
- ALTER TABLE
- DROP TABLE

---

# 12. Schema History

### schema.history.internal.kafka.bootstrap.servers

```json
"kafka:9092"
```

Kafka bootstrap servers.

### schema.history.internal.kafka.topic

```json
"schema-history.kafka_hqh"
```

Topic lưu lịch sử schema.

Debezium sử dụng để rebuild schema khi restart.

---

# 13. Heartbeat

### heartbeat.interval.ms

```json
"heartbeat.interval.ms": "10000"
```

Gửi heartbeat mỗi 10 giây.

Mục đích:

- Giữ replication slot active
- Update LSN
- Tránh WAL phình to

---

# 14. Batch Processing

### max.batch.size

```json
"max.batch.size": "2048"
```

Mỗi lần poll tối đa:

```text
2048 events
```

---

### max.queue.size

```json
"max.queue.size": "8192"
```

Queue nội bộ tối đa:

```text
8192 records
```

Nếu Kafka chậm:

```text
WAL → Queue(8192) → Kafka
```

Debezium sẽ backpressure.

---

# 15. Message Converter

### key.converter

```json
"org.apache.kafka.connect.json.JsonConverter"
```

### value.converter

```json
"org.apache.kafka.connect.json.JsonConverter"
```

### schemas.enable

```json
false
```

Kafka message:

```json
{
  "id": 1,
  "payload": {}
}
```

Thay vì:

```json
{
  "schema": {},
  "payload": {}
}
```

Giúp message nhỏ hơn.

---

# 16. SMT (Single Message Transformation)

```json
"transforms": "unwrap,rename"
```

Flow:

```text
Event
 ↓
unwrap
 ↓
rename
 ↓
Kafka
```

---

# 17. ExtractNewRecordState

### transforms.unwrap.type

```json
"io.debezium.transforms.ExtractNewRecordState"
```

Raw Debezium Event:

```json
{
  "before": null,
  "after": {
    "id": 1,
    "payload": {}
  },
  "op": "c"
}
```

Sau khi unwrap:

```json
{
  "id": 1,
  "payload": {}
}
```

Consumer dễ xử lý hơn.

---

### transforms.unwrap.drop.tombstones

```json
false
```

Giữ tombstone message.

Phù hợp với:

- Compacted Topic
- Cache Invalidation
- Search Index Deletion

---

### transforms.unwrap.delete.handling.mode

```json
"rewrite"
```

Delete:

```json
{
  "__deleted": "true"
}
```

thay vì:

```json
null
```

---

### transforms.unwrap.add.headers

```json
"op"
```

Kafka Header:

```text
op=c
op=u
op=d
op=r
```

Meaning:

- c = create
- u = update
- d = delete
- r = snapshot

---

### transforms.unwrap.add.fields

```json
"op,source.table:table,source.ts_ms:ts_ms"
```

Payload cuối:

```json
{
  "id": 1,
  "__op": "c",
  "__table": "outbox_event",
  "__ts_ms": 1750435200000
}
```

Dùng cho:

- Audit
- Debugging
- Tracing

---

# 18. Rename Field

### transforms.rename.type

```json
"org.apache.kafka.connect.transforms.ReplaceField$Value"
```

Đổi tên field trong message value.

---

### transforms.rename.renames

```json
"payload:event_payload"
```

Trước:

```json
{
  "payload": {
    "orderId": 1
  }
}
```

Sau:

```json
{
  "event_payload": {
    "orderId": 1
  }
}
```

---

# Final Kafka Message Example

```json
{
  "id": "evt-123",
  "aggregate_type": "Order",
  "aggregate_id": "1",
  "event_type": "OrderCreated",
  "event_payload": {
    "orderId": 1,
    "amount": 100
  },
  "__op": "c",
  "__table": "outbox_event",
  "__ts_ms": 1750435200000
}
```

---

# Production Architecture

```text
Business Tables
       ↓
Insert Outbox Event
       ↓
PostgreSQL WAL
       ↓
Debezium
       ↓
ExtractNewRecordState
       ↓
Rename payload
       ↓
Kafka Topic
       ↓
Consumers
```

Pattern:

```text
Transactional Outbox
        +
Debezium CDC
        +
Kafka
```

Là kiến trúc phổ biến trong hệ thống Microservices Production.
