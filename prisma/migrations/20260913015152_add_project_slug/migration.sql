-- AlterTable: add slug as nullable first so we can backfill existing rows
ALTER TABLE "Project" ADD COLUMN "slug" TEXT;

-- Backfill: derive a slug from the existing name (lowercase, non-alphanumeric
-- runs collapsed to a single hyphen, leading/trailing hyphens trimmed).
UPDATE "Project"
SET "slug" = COALESCE(
  NULLIF(lower(regexp_replace(regexp_replace(trim("name"), '[^a-zA-Z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g')), ''),
  'project'
);

-- Disambiguate any names that collapsed to the same slug by suffixing the
-- row's own id — every row's id is unique, so this guarantees uniqueness
-- regardless of how many rows collided.
UPDATE "Project" p1
SET "slug" = p1."slug" || '-' || substr(p1."id", 1, 6)
WHERE EXISTS (
  SELECT 1 FROM "Project" p2 WHERE p2."slug" = p1."slug" AND p2."id" <> p1."id"
);

-- Now that every row has a value, enforce NOT NULL + uniqueness going forward
ALTER TABLE "Project" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");
