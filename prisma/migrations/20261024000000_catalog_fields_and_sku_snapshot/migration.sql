-- Additive only: new nullable/defaulted columns and an index. No data is removed.

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "sku" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "variants" ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "products_status_sort_order_idx" ON "products"("status", "sort_order");

-- Backfill the SKU snapshot for existing order lines from their linked variant.
UPDATE "order_items" oi SET "sku" = v."sku" FROM "variants" v WHERE oi."variant_id" = v."id" AND oi."sku" IS NULL;
