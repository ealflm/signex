-- Add a DOCUMENT asset kind so non-media uploads (e.g. PDF form attachments)
-- can be stored alongside images/videos/SVGs.
ALTER TYPE "AssetKind" ADD VALUE 'DOCUMENT';
