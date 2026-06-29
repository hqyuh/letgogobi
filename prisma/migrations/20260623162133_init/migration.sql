-- CreateTable
CREATE TABLE "outbox_event_payment" (
    "id" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'NEW',
    "payload" JSONB NOT NULL,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_event_payment_pkey" PRIMARY KEY ("id")
);
