/**
 * Message shape sau khi Debezium SMT xử lý:
 * - ExtractNewRecordState: unwrap envelope → flat record + __op, __table, __ts_ms
 * - ReplaceField: đổi payload → event_payload (tránh nhầm với Connect envelope)
 * - value.converter.schemas.enable=false: không bọc { schema, payload }
 *
 * Reference: https://debezium.io/documentation/reference/stable/transformations/event-flattening.html
 */

export type DebeziumOperation = 'c' | 'u' | 'd' | 'r';

export interface DebeziumUnwrappedOutboxEvent {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  status: string;
  event_payload: string;
  retry_count: number;
  created_at: number;
  __op: DebeziumOperation;
  __table: string;
  __ts_ms: number;
  __deleted?: boolean | string;
}
