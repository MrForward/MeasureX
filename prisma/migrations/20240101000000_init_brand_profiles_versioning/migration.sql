-- MeasureX: Brand Profile Versioning
-- Brand profiles use immutable versioning: each change creates a new record
-- with an incremented version number. Existing records are NEVER updated.
-- This preserves the link between historical metrics and the brand profile
-- version that was active at collection time.
-- 
-- Requirement 12.2: Data Versioning Integrity
-- Property 5: FOR ALL brand profile changes, historical metrics SHALL remain
-- linked to the brand profile version active at collection time.

-- The version column is NOT unique per workspace — multiple versions exist
-- The latest version is always the one with the highest version number
-- Query pattern: SELECT * FROM brand_profiles WHERE workspace_id = ? ORDER BY version DESC LIMIT 1

-- CreateTable
CREATE TABLE "brand_profiles" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "brand_name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "aliases" TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "brand_profiles_workspace_id_idx" ON "brand_profiles"("workspace_id");

-- AddForeignKey
ALTER TABLE "brand_profiles" ADD CONSTRAINT "brand_profiles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- NOTE: No unique constraint on (workspace_id, version) is intentional.
-- Multiple brand profile versions per workspace are expected and required.
-- The immutable versioning pattern means:
--   1. On first brand profile creation: INSERT with version = 1
--   2. On every subsequent update: INSERT with version = (current_max + 1)
--   3. Historical records are NEVER modified or deleted (except workspace cascade delete)
-- This ensures metrics collected under version N always reference the exact
-- brand configuration that was active when those metrics were collected.
