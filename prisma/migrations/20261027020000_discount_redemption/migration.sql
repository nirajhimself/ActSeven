-- Additive only: coupons can be limited to one use per customer, and usage is counted from orders.

-- AlterTable
ALTER TABLE "discounts" ADD COLUMN "once_per_customer" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "orders_discount_code_idx" ON "orders"("discount_code");
