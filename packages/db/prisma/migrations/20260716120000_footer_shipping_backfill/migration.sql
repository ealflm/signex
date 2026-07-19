-- Backfill footer.shipping into existing theme DRAFTS.
--
-- WHY. `footerBlock.shipping` (the Lalamove/Grab courier badges) has been declared and documented
-- as editable content since it was added, but nothing ever wrote it: the importer's buildFooter
-- omitted it, so no snapshot in this database carried the key. The badges rendered anyway, from a
-- fallback literal in the web's content.ts — which left the field a PHANTOM: the admin's string-list
-- editor reported "shipping (0 items)" while the page showed two badges, and per-item inline editing
-- (footer.shipping.<i>) could not work at all, because the admin resolves an inline text edit by
-- inspecting the value already at the path. An index into an absent array is not recognisable as a
-- string-array item, so the edit would have been written as a LocalizedText {en,vi} object, and the
-- API's snapshot backstop would then have rejected EVERY subsequent save of that draft (422
-- INVALID_SNAPSHOT) with no UI able to remove the offending edit. buildFooter now seeds the field for
-- new sites; this backfills the drafts that already exist.
--
-- RENDER IMPACT: none. ["Lalamove","Grab"] is byte-identical to the fallback content.ts already
-- substitutes when the key is absent, so the site renders exactly the same before and after. This
-- migration makes the DATA honest, not the pixels different.
--
-- IDEMPOTENT + NON-DESTRUCTIVE: the WHERE clause skips any theme that already has the key (so a
-- courier list edited by hand is never clobbered) and any theme with no footer block at all.
-- Forward-only and safe under `prisma migrate deploy`.
UPDATE "Theme"
SET "draftSnapshot" = jsonb_set(
      "draftSnapshot",
      '{blocks,footer,shipping}',
      '["Lalamove", "Grab"]'::jsonb,
      true
    )
WHERE "draftSnapshot" -> 'blocks' -> 'footer' IS NOT NULL
  AND NOT ("draftSnapshot" -> 'blocks' -> 'footer' ? 'shipping');

-- DELIBERATELY NOT TOUCHED:
--   • "Release".snapshot — a published release is an immutable, CHECKSUMMED artifact; rewriting one
--     would invalidate its checksum to change nothing a visitor can see (the web falls back). The
--     next publish carries the backfilled draft forward on its own.
--   • "Theme".draftRevision — not bumped. It is an optimistic lock for concurrent editors, and a
--     deploy-time backfill is not a user edit. The narrow cost is a session left OPEN across this
--     deploy: its in-memory base still lacks `shipping`, so a courier badge clicked before a reload
--     resolves against stale data. Reloading the editor clears it.
