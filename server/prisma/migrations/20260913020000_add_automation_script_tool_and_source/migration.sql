-- Two additive, nullable-safe columns on AutomationScript.
-- `tool` is nullable: historical rows never recorded which tool (cypress/
-- playwright/selenium) generated them, and there is no sensible default to
-- backfill.
ALTER TABLE "AutomationScript" ADD COLUMN "tool" TEXT;

-- `generationSource` defaults to 'ai' because every existing row was in fact
-- produced by the AI path (the fallback path was, until now, silently
-- indistinguishable from a successful AI run) — 'ai' is the safe, non-
-- misleading default for backfill, and the more common case going forward.
ALTER TABLE "AutomationScript" ADD COLUMN "generationSource" TEXT NOT NULL DEFAULT 'ai';
