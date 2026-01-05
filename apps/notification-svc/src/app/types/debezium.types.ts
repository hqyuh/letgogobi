/**
 * Debezium CDC Event Types
 *
 * Cấu trúc payload từ Debezium PostgreSQL Connector
 * Reference: https://debezium.io/documentation/reference/connectors/postgresql.html
 */

/**
 * Debezium operation types
 * - 'c' = create (INSERT)
 * - 'u' = update (UPDATE)
 * - 'd' = delete (DELETE)
 * - 'r' = read (snapshot)
 */
export type DebeziumOperation = 'c' | 'u' | 'd' | 'r';

/**
 * Source metadata từ Debezium
 * About the database, table, transaction, etc.
 */
export interface DebeziumSource {
  version: string;
  connector: string;
  name: string;
  ts_ms: number;
  snapshot: string;
  db: string;
  sequence?: string;
  schema: string;
  table: string;
  txId?: number;
  lsn?: number;
  xmin?: number;
}

/**
 * Debezium CDC Event payload
 * This is the main structure of the message from Debezium
 */
export interface DebeziumCdcEvent<T> {
  /**
   * The state of the record before the change
   * - null if INSERT (op = 'c')
   * - object nếu là UPDATE (op = 'u') hoặc DELETE (op = 'd')
   */
  before: T | null;

  /**
   * The state of the record after the change
   * - object if INSERT (op = 'c') or UPDATE (op = 'u')
   * - null if DELETE (op = 'd')
   */
  after: T | null;

  /**
   * Metadata about the source of the event (database, table, transaction, etc.)
   */
  source: DebeziumSource;

  /**
   * Operation type: 'c' (create), 'u' (update), 'd' (delete), 'r' (read)
   */
  op: DebeziumOperation;

  /**
   * Timestamp when Debezium processed the event (milliseconds)
   */
  ts_ms: number;

  /**
   * Transaction metadata (optional)
   */
  transaction?: {
    id: string;
    total_order: number;
    data_collection_order: number;
  };
}
