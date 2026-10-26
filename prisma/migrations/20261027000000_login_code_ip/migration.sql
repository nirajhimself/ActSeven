-- Additive only: remember which client address requested each sign-in code (per-address rate limit).

-- AlterTable
ALTER TABLE "login_codes" ADD COLUMN "ip" TEXT;

-- CreateIndex
CREATE INDEX "login_codes_ip_idx" ON "login_codes"("ip", "created_at" DESC);
