# Idempotency Key Flow Diagram

## Sequence Diagram

```mermaid
sequenceDiagram
    participant Client
    participant Server
    participant Store as Cache Store

    Note over Client,Store: Scenario 1: Initial Request, Failure, and Idempotent Retry

    Client->>Server: POST /data<br/>(Idempotency-Key=1)
    Server->>Store: Check Idempotency-Key=1
    Store-->>Server: (Not Found)
    Server->>Server: Process Request
    Server->>Store: Store Response<br/>(Idempotency-Key=1,<br/>Status: PROCESSING)

    alt [Timed Out/Server Crash/Connection Lost]
        Server-->>Client: No Response (timeout/crash)
    else [Client Crash]
        Note over Client: Client crashes<br/>before receiving response
    end

    Server->>Store: Update Status<br/>(Idempotency-Key=1,<br/>Status: COMPLETED)
    Server-->>Client: 201 Created<br/>(may not be received)

    Note over Client,Store: Client retries with same idempotency key

    Client->>Server: POST /data<br/>(Retry, Idempotency-Key=1)
    Server->>Store: Check Idempotency-Key=1
    Store-->>Server: (Exists, Status: COMPLETED)
    Server-->>Client: 201 OK<br/>(Duplicate Request,<br/>Return Cached Response)

    Note over Client,Store: Scenario 2: New Request, Concurrent Request, and Idempotent Retry

    Client->>Server: POST /data<br/>(Idempotency-Key=2)
    Server->>Store: Check Idempotency-Key=2
    Store-->>Server: (Not Exists)
    Server->>Store: Acquire Lock<br/>(idempotency-lock:2)
    Store-->>Server: Lock Acquired
    Server->>Store: Store Status<br/>(Idempotency-Key=2,<br/>Status: PROCESSING)
    Server->>Server: Process Request

    Note over Client,Store: Concurrent request arrives while processing

    Client->>Server: POST /data<br/>(Concurrent Req,<br/>Idempotency-Key=2)
    Server->>Store: Check Idempotency-Key=2
    Store-->>Server: (Exists, Status: PROCESSING)
    Server-->>Client: 409 Conflict<br/>Retry-After=1

    Note over Client,Store: First request completes

    Server->>Store: Update Status<br/>(Idempotency-Key=2,<br/>Status: COMPLETED)
    Server->>Store: Release Lock<br/>(idempotency-lock:2)
    Server-->>Client: 201 Created

    Note over Client,Store: Client retries after conflict

    Client->>Server: POST /data<br/>(Retried After,<br/>Idempotency-Key=2)
    Server->>Store: Check Idempotency-Key=2
    Store-->>Server: (Exists, Status: COMPLETED)
    Server-->>Client: 201 Created<br/>(Return Cached Response)
```

## Key Concepts

### Idempotency Key

- Unique identifier sent by client in `Idempotency-Key` header
- Ensures that duplicate requests result in the same state change
- Allows safe retries after network failures or client crashes

### Server-Side State Management

- **Cache Store (Redis)**: Stores idempotency key statuses and responses
- **Statuses**:
  - `Not Found`: Key doesn't exist (first request)
  - `PROCESSING`: Request is currently being processed
  - `COMPLETED`: Request completed successfully, response cached

### Lock Mechanism

- Uses distributed lock (`idempotency-lock:{key}`) to prevent concurrent processing
- Lock expires after 60 seconds (longer than max processing time)
- Ensures only one request processes at a time for the same key

### Response Handling

1. **First Request (Not Found)**:
   - Acquire lock
   - Mark as PROCESSING
   - Process request
   - Store result as COMPLETED
   - Return 201 Created

2. **Retry Request (COMPLETED)**:
   - Check cache, find COMPLETED status
   - Return cached response with 201 Created
   - No re-processing

3. **Concurrent Request (PROCESSING)**:
   - Check cache, find PROCESSING status
   - Return 409 Conflict with Retry-After header
   - Client should retry after delay

4. **Retry After Conflict**:
   - Check cache again
   - If COMPLETED, return cached response
   - If still PROCESSING, return 409 again

### Error Handling

- Network timeouts: Client can safely retry with same key
- Client crashes: Client can retry without duplicate operations
- Server crashes: Lock expires, allowing retry (may need idempotent operations)
- Processing errors: Cache is cleaned up, allowing retry
