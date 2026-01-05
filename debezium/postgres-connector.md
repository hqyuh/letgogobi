# Debezium PostgreSQL Connector Configuration

Tài liệu giải thích chi tiết từng field trong file `postgres-connector.json`.

## Cấu trúc tổng quan

File cấu hình Debezium connector có 2 phần chính:
- `name`: Tên của connector
- `config`: Object chứa tất cả các cấu hình

---

## Chi tiết từng field

### 1. `name`
- **Giá trị**: `"order-svc-postgres-connector"`
- **Mô tả**: Tên định danh duy nhất cho connector này trong Kafka Connect
- **Lưu ý**: Tên này được sử dụng để quản lý connector (start, stop, restart, delete)

---

### 2. `connector.class`
- **Giá trị**: `"io.debezium.connector.postgresql.PostgresConnector"`
- **Mô tả**: Class Java của connector Debezium cho PostgreSQL
- **Lưu ý**: Đây là class chính xử lý việc kết nối và capture changes từ PostgreSQL

---

### 3. `topic.prefix`
- **Giá trị**: `"order-svc.created"`
- **Mô tả**: Prefix được thêm vào tên của các Kafka topic mà connector tạo ra
- **Ví dụ**: Nếu capture table `outbox_event`, topic sẽ có tên như `order-svc.created.public.outbox_event`
- **Lưu ý**: Nên đặt tên có ý nghĩa để dễ quản lý và routing messages

---

### 4. `database.hostname`
- **Giá trị**: `"database"`
- **Mô tả**: Hostname hoặc IP address của PostgreSQL server
- **Lưu ý**: Trong Docker Compose, thường dùng tên service làm hostname

---

### 5. `database.port`
- **Giá trị**: `"5432"`
- **Mô tả**: Port mà PostgreSQL server đang lắng nghe
- **Mặc định**: 5432 là port mặc định của PostgreSQL

---

### 6. `database.user`
- **Giá trị**: `"postgresql"`
- **Mô tả**: Username để kết nối đến PostgreSQL database
- **Lưu ý**: User này cần có quyền REPLICATION và quyền đọc các table cần capture

---

### 7. `database.password`
- **Giá trị**: `"postgresql"`
- **Mô tả**: Password của user để kết nối đến PostgreSQL
- **Lưu ý**: ⚠️ Trong production nên sử dụng secrets management, không hardcode password

---

### 8. `database.dbname`
- **Giá trị**: `"kafka_hqh"`
- **Mô tả**: Tên của database PostgreSQL cần kết nối
- **Lưu ý**: Connector sẽ capture changes từ database này

---

### 9. `database.server.name`
- **Giá trị**: `"kafka_hqh"`
- **Mô tả**: Logical name của database server, được sử dụng trong tên Kafka topic và schema registry
- **Lưu ý**: Nên đặt tên có ý nghĩa, thường giống với `database.dbname` hoặc tên service

---

### 10. `plugin.name`
- **Giá trị**: `"pgoutput"`
- **Mô tả**: PostgreSQL logical decoding plugin được sử dụng để capture changes
- **Các giá trị có thể**:
  - `pgoutput`: Plugin mặc định từ PostgreSQL 10+, không cần cài đặt thêm
  - `decoderbufs`: Plugin của Debezium (cần cài đặt)
  - `wal2json`: Plugin phổ biến khác (cần cài đặt)
- **Lưu ý**: `pgoutput` là lựa chọn tốt nhất cho PostgreSQL 10+ vì không cần cài đặt thêm

---

### 11. `publication.autocreate.mode`
- **Giá trị**: `"all_tables"`
- **Mô tả**: Cách Debezium tự động tạo PostgreSQL publication
- **Các giá trị có thể**:
  - `all_tables`: Tự động tạo publication bao gồm tất cả tables trong database
  - `filtered`: Chỉ tạo publication cho các tables được chỉ định trong `table.include.list`
  - `disabled`: Không tự động tạo, phải tạo publication thủ công
- **Lưu ý**: Với `table.include.list` chỉ có 1 table, nên dùng `filtered` để tối ưu hơn

---

### 12. `table.include.list`
- **Giá trị**: `"public.outbox_event"`
- **Mô tả**: Danh sách các tables cần capture changes, định dạng `schema.table`
- **Định dạng**: 
  - Có thể chỉ định nhiều tables: `"schema1.table1,schema2.table2"`
  - Có thể dùng pattern: `"public.outbox_*"` để capture tất cả tables bắt đầu bằng `outbox_`
- **Lưu ý**: Chỉ các tables trong list này mới được capture và gửi lên Kafka

---

### 13. `snapshot.mode`
- **Giá trị**: `"never"`
- **Mô tả**: Chế độ snapshot khi connector khởi động
- **Các giá trị có thể**:
  - `never`: Không chạy snapshot, chỉ capture changes từ thời điểm connector start
  - `initial`: Chạy snapshot toàn bộ data khi connector start lần đầu, sau đó capture changes
  - `always`: Luôn chạy snapshot mỗi khi connector start
  - `exported`: Sử dụng snapshot đã được export trước đó
- **Lưu ý**: Với outbox pattern, thường dùng `never` vì chỉ cần capture events mới

---

### 14. `slot.name`
- **Giá trị**: `"debezium_order_svc"`
- **Mô tả**: Tên của PostgreSQL replication slot được tạo để lưu trữ WAL (Write-Ahead Log) changes
- **Lưu ý**: 
  - Replication slot đảm bảo PostgreSQL giữ lại WAL cho đến khi Debezium đọc xong
  - Tên slot phải unique trong database
  - Nếu slot đã tồn tại, connector sẽ sử dụng slot đó

---

### 15. `slot.drop.on.stop`
- **Giá trị**: `"true"`
- **Mô tả**: Có xóa replication slot khi connector dừng không
- **Các giá trị**: `"true"` hoặc `"false"`
- **Lưu ý**: 
  - `true`: Xóa slot khi stop → tiết kiệm disk space nhưng mất dữ liệu nếu chưa đọc hết
  - `false`: Giữ slot → an toàn hơn nhưng tốn disk space nếu connector không chạy lâu
  - ⚠️ Trong production thường set `false` để đảm bảo không mất dữ liệu

---

### 16. `database.server.id`
- **Giá trị**: `"184054"`
- **Mô tả**: Unique identifier cho database server trong Debezium
- **Lưu ý**: 
  - Phải là số unique, không trùng với các connector khác
  - Được sử dụng trong binlog coordinates (tương tự MySQL binlog)
  - Nên chọn số ngẫu nhiên lớn để tránh conflict

---

### 17. `include.schema.changes`
- **Giá trị**: `"false"`
- **Mô tả**: Có capture và gửi schema changes (ALTER TABLE, CREATE TABLE, etc.) lên Kafka không
- **Các giá trị**: `"true"` hoặc `"false"`
- **Lưu ý**: 
  - `false`: Chỉ capture data changes, không capture schema changes
  - `true`: Capture cả data và schema changes → tốn bandwidth và storage hơn
  - Với outbox pattern, thường set `false` vì schema ít thay đổi

---

### 18. `schema.history.internal.kafka.bootstrap.servers`
- **Giá trị**: `"kafka:9092"`
- **Mô tả**: Kafka bootstrap servers để lưu trữ schema history
- **Lưu ý**: 
  - Debezium lưu schema history vào Kafka topic để track schema changes theo thời gian
  - Trong Docker Compose, thường dùng tên service `kafka` với port `9092`

---

### 19. `schema.history.internal.kafka.topic`
- **Giá trị**: `"schema-history.kafka_hqh"`
- **Mô tả**: Tên Kafka topic để lưu trữ schema history
- **Lưu ý**: 
  - Topic này chứa lịch sử thay đổi schema của database
  - Tên nên unique cho mỗi connector/database
  - Format: `schema-history.{database.server.name}`

---

### 20. `heartbeat.interval.ms`
- **Giá trị**: `"10000"` (10 giây)
- **Mô tả**: Khoảng thời gian (milliseconds) giữa các heartbeat messages
- **Lưu ý**: 
  - Heartbeat messages giúp đảm bảo connector vẫn hoạt động và có thể detect lag
  - Giá trị nhỏ hơn → detect lag nhanh hơn nhưng tốn bandwidth hơn
  - Giá trị lớn hơn → tiết kiệm bandwidth nhưng detect lag chậm hơn

---

### 21. `max.batch.size`
- **Giá trị**: `"2048"`
- **Mô tả**: Số lượng records tối đa trong mỗi batch được gửi lên Kafka
- **Lưu ý**: 
  - Batch lớn hơn → throughput cao hơn nhưng latency cao hơn
  - Batch nhỏ hơn → latency thấp hơn nhưng throughput thấp hơn
  - Cần cân bằng dựa trên workload và requirements

---

### 22. `max.queue.size`
- **Giá trị**: `"8192"`
- **Mô tả**: Số lượng records tối đa trong internal queue của connector
- **Lưu ý**: 
  - Queue lớn hơn → xử lý được nhiều changes cùng lúc, tránh backpressure
  - Queue nhỏ hơn → tiết kiệm memory nhưng dễ bị backpressure khi có nhiều changes
  - Nên set lớn hơn `max.batch.size` để đảm bảo có đủ data cho batching

---

## Tóm tắt

Cấu hình này được thiết kế cho **Outbox Pattern**:
- Chỉ capture table `outbox_event` 
- Không chạy snapshot (chỉ capture changes mới)
- Sử dụng `pgoutput` plugin (không cần cài đặt thêm)
- Tự động tạo publication cho tất cả tables (có thể tối ưu thành `filtered`)

## Tham khảo

- [Debezium PostgreSQL Connector Documentation](https://debezium.io/documentation/reference/connectors/postgresql.html)
- [Kafka Connect Configuration](https://kafka.apache.org/documentation/#connect)

