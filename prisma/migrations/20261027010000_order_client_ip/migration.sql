-- Additive only: remember which client address placed each order (per-address order limit).

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "client_ip" TEXT;

-- CreateIndex
CREATE INDEX "orders_client_ip_idx" ON "orders"("client_ip", "created_at" DESC);
