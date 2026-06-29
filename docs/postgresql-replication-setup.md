# PostgreSQL Replication — Hướng dẫn chạy thực tế

Bộ demo trong thư mục `replication/` dựng **1 primary + 2 replica** bằng Docker, tự động clone dữ liệu từ primary và cho phép chuyển qua lại giữa 3 chế độ: **async / semi-sync / sync** ngay lúc runtime.

## Kiến trúc

| Service | Vai trò | Port (host) | application_name | slot |
|---|---|---|---|---|
| `pg-primary` | Primary (đọc/ghi) | `5532` | — | — |
| `pg-replica1` | Standby (read-only) | `5533` | `replica1` | `replica1_slot` |
| `pg-replica2` | Standby (read-only) | `5534` | `replica2` | `replica2_slot` |

User app: `postgres/postgres`, DB `appdb`. User replication: `repluser/replpass`.

## 1. Khởi động

```bash
cd replication
docker compose up -d
```

Replica sẽ tự `pg_basebackup` từ primary trong lần chạy đầu. Mặc định cụm chạy ở chế độ **ASYNC**.

## 2. Kiểm tra replica đã kết nối

```bash
docker exec -it pg-primary \
  psql -U postgres -d appdb -c \
  "SELECT application_name, state, sync_state, write_lag, flush_lag, replay_lag FROM pg_stat_replication;"
```

- `sync_state`: `async` (mặc định), `sync`, `potential`, hoặc `quorum`.

## 3. Đổi chế độ replication (runtime, không cần rebuild)

Tất cả thay đổi chỉ áp trên **primary** rồi `pg_reload_conf()`.

### Async (mặc định)

```sql
ALTER SYSTEM SET synchronous_standby_names = '';
ALTER SYSTEM SET synchronous_commit = 'on';
SELECT pg_reload_conf();
```

### Semi-sync (chờ replica NHẬN WAL, không chờ replay)

```sql
ALTER SYSTEM SET synchronous_standby_names = 'FIRST 1 (replica1, replica2)';
ALTER SYSTEM SET synchronous_commit = 'remote_write';
SELECT pg_reload_conf();
```

### Sync (chờ replica replay xong → strong consistency)

```sql
ALTER SYSTEM SET synchronous_standby_names = 'FIRST 1 (replica1, replica2)';
ALTER SYSTEM SET synchronous_commit = 'remote_apply';
SELECT pg_reload_conf();
```

### Quorum sync (an toàn, không treo khi 1 replica chết)

```sql
ALTER SYSTEM SET synchronous_standby_names = 'ANY 1 (replica1, replica2)';
ALTER SYSTEM SET synchronous_commit = 'on';   -- chờ flush(fsync) trên replica
SELECT pg_reload_conf();
```

Chạy nhanh từ host, ví dụ chuyển sang sync. Lưu ý: `ALTER SYSTEM` không chạy được trong transaction block, nên phải tách mỗi lệnh thành một `-c` riêng (KHÔNG gộp nhiều lệnh trong cùng một `-c` bằng dấu `;`):

```bash
docker exec -it pg-primary psql -U postgres -d appdb \
  -c "ALTER SYSTEM SET synchronous_standby_names='FIRST 1 (replica1, replica2)'" \
  -c "ALTER SYSTEM SET synchronous_commit='remote_apply'" \
  -c "SELECT pg_reload_conf()"
```

> Bảng ý nghĩa `synchronous_commit`: `remote_write` = replica nhận+write OS (semi) · `on` = replica fsync · `remote_apply` = replica replay xong (sync thật).

## 4. Test replication hoạt động

Ghi trên primary:

```bash
docker exec -it pg-primary psql -U postgres -d appdb -c \
  "CREATE TABLE IF NOT EXISTS t(id serial primary key, v text); INSERT INTO t(v) VALUES ('hello');"
```

Đọc trên replica (read-only):

```bash
docker exec -it pg-replica1 psql -U postgres -d appdb -c "SELECT * FROM t;"
docker exec -it pg-replica2 psql -U postgres -d appdb -c "SELECT * FROM t;"
```

Thử ghi trên replica (sẽ bị từ chối vì standby):

```bash
docker exec -it pg-replica1 psql -U postgres -d appdb -c "INSERT INTO t(v) VALUES('x');"
# ERROR: cannot execute INSERT in a read-only transaction
```

### Test tự động bằng script

Mỗi mode một file riêng trong `replication/tests/` (dùng chung `common.sh`):

```bash
bash replication/test.sh             # chạy lần lượt cả 4 mode
bash replication/test.sh sync        # chạy 1 mode

# hoặc gọi thẳng từng file:
bash replication/tests/async.sh
bash replication/tests/semi.sh
bash replication/tests/sync.sh
bash replication/tests/quorum.sh
bash replication/tests/lag.sh        # test replication lag (pause replay)
```

Mỗi script (async/semi/sync/quorum) sẽ: set mode → in `sync_state` → ghi 1 token + đo thời gian INSERT → kiểm tra cả 2 replica nhận được → thử ghi trên replica (phải bị từ chối). `lag.sh` thì tạo + đo replication lag rồi khôi phục mode sync.

## 5. Thử nghiệm hành vi sync vs async

- **Failover sync standby:** ở chế độ sync, tắt replica đang `sync` (`docker stop pg-replica1`) → replica còn lại tự động lên `sync`, ghi vẫn chạy.

```bash
docker stop pg-replica1
docker exec pg-primary psql -U postgres -d appdb -c "SELECT application_name, sync_state FROM pg_stat_replication"
docker exec pg-primary psql -U postgres -d appdb -c "INSERT INTO demo(v) VALUES('still-works')"
docker start pg-replica1
```

- **Ghi bị treo khi hết replica (sync):** tắt **cả 2** replica rồi INSERT → lệnh treo chờ ACK; bật lại replica là commit được giải phóng.

```bash
docker stop pg-replica1 pg-replica2
docker exec pg-primary psql -U postgres -d appdb -c "INSERT INTO demo(v) VALUES('blocked')" &  # treo
sleep 5; echo "vẫn đang treo..."
docker start pg-replica1 pg-replica2   # commit chạy tiếp
```

- **Async không treo:** chuyển sang async (`synchronous_standby_names=''`), tắt replica → INSERT vẫn trả về ngay (đổi lại có rủi ro mất dữ liệu nếu primary chết trước khi replicate).

## 6. Quan sát replication lag

```bash
docker exec -it pg-replica1 psql -U postgres -d appdb -c \
  "SELECT now() - pg_last_xact_replay_timestamp() AS replica_lag;"
```

## 7. Dọn dẹp

```bash
docker compose down -v   # -v xoá luôn volume dữ liệu
```

---

### Mapping với tài liệu khái niệm

| Khái niệm (docs) | `synchronous_standby_names` | `synchronous_commit` |
|---|---|---|
| `async-replication.md` | `''` | `on` |
| `semi-replication.md` | `FIRST 1 (...)` | `remote_write` |
| `sync-replication.md` | `FIRST 1 (...)` | `remote_apply` |

---

## Cheat sheet (copy & chạy)

> Lưu ý:
> - Bỏ `-it` khi chạy qua script/CI (không có TTY). Chỉ dùng `-it` khi gõ trực tiếp trong terminal.
> - `ALTER SYSTEM` **không** chạy chung nhiều lệnh trong một `-c` (lỗi *cannot run inside a transaction block*) → tách mỗi lệnh một `-c`.
> - Đừng đặt `synchronous_*` trong `command:` của compose vì tham số dòng lệnh ghi đè `ALTER SYSTEM`, khiến đổi mode runtime vô hiệu.

### Đổi mode (chỉ cần reload, không restart)

```bash
# ASYNC
docker exec pg-primary psql -U postgres -d appdb \
  -c "ALTER SYSTEM SET synchronous_standby_names=''" \
  -c "ALTER SYSTEM SET synchronous_commit='on'" \
  -c "SELECT pg_reload_conf()"

# SEMI-SYNC (chờ replica nhận WAL)
docker exec pg-primary psql -U postgres -d appdb \
  -c "ALTER SYSTEM SET synchronous_standby_names='FIRST 1 (replica1, replica2)'" \
  -c "ALTER SYSTEM SET synchronous_commit='remote_write'" \
  -c "SELECT pg_reload_conf()"

# SYNC (chờ replica replay xong)
docker exec pg-primary psql -U postgres -d appdb \
  -c "ALTER SYSTEM SET synchronous_standby_names='FIRST 1 (replica1, replica2)'" \
  -c "ALTER SYSTEM SET synchronous_commit='remote_apply'" \
  -c "SELECT pg_reload_conf()"

# QUORUM SYNC (không treo khi 1 replica chết)
docker exec pg-primary psql -U postgres -d appdb \
  -c "ALTER SYSTEM SET synchronous_standby_names='ANY 1 (replica1, replica2)'" \
  -c "ALTER SYSTEM SET synchronous_commit='on'" \
  -c "SELECT pg_reload_conf()"
```

### Kiểm tra trạng thái

```bash
docker exec pg-primary psql -U postgres -d appdb \
  -c "SHOW synchronous_standby_names" \
  -c "SHOW synchronous_commit" \
  -c "SELECT application_name, state, sync_state, write_lag, flush_lag, replay_lag FROM pg_stat_replication"
```

### Lệnh vòng đời cụm

```bash
cd replication
docker compose up -d                 # khởi động
docker compose up -d pg-primary      # tạo lại riêng primary (sau khi sửa command:)
docker compose ps                    # xem trạng thái
docker compose logs -f pg-replica1   # xem log replica
docker compose down                  # dừng (giữ dữ liệu)
docker compose down -v               # dừng + xoá volume
```
