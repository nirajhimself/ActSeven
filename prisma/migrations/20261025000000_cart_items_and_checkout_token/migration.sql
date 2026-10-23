-- Additive only: a new table for signed-in carts and a nullable idempotency column on orders.

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "checkout_token" TEXT;

-- CreateTable
CREATE TABLE "cart_items" (
    "customer_id" UUID NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("customer_id","variant_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_checkout_token_key" ON "orders"("checkout_token");

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: quantities are always positive.
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_quantity_check" CHECK ("quantity" > 0);
