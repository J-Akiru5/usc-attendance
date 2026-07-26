-- CreateTable
CREATE TABLE "photos" (
    "id" TEXT NOT NULL,
    "eventSlug" TEXT NOT NULL,
    "storageKeyFull" TEXT NOT NULL,
    "storageKeyThumb" TEXT NOT NULL,
    "batchTag" TEXT,
    "studentTag" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "photos_eventSlug_idx" ON "photos"("eventSlug");
