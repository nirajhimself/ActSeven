-- Additive only: product photos uploaded from the admin, served at /media/<id>.

-- CreateTable
CREATE TABLE "media" (
    "id" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "uploaded_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);
