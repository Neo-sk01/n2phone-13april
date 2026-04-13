# Versature CDR Shape Verification

- Inspection date: PENDING — run Task 0 before implementing Tasks 4 and 5
- Sample day checked: (fill after running inspect-cdr-shape.mjs)
- Page wrapper keys: (copy the exact JSON array from `pageKeys`)
- Primary row array key: (copy `rowArrayKey` exactly; use `<array-root>` if the payload itself is the row array)
- Shared call identifier field: (choose the first `sharedIdCandidates` entry that shows repeated multi-segment groups across queue legs; otherwise write `none found`)
- Shared call identifier evidence: (record the chosen candidate's `sampleGroups` summary so later workers can see whether it spans AA, queue, and answered legs)
- Raw CDR row identifier field: (record whether top-level `id` is present on every sampled row; otherwise write `not reliably present`)
- Dedupe decision:
  - If a shared call identifier field was confirmed, use that exact field path in `getSharedCallId(...)` and keep caller number + Toronto-local minute bucket as the fallback.
  - If no shared identifier was confirmed, use caller number + Toronto-local minute bucket as the primary dedupe key.
- Raw CDR identity decision:
  - If top-level `id` is reliable on every sampled row, use `external_id` as the raw upsert conflict target and keep `source_hash` only as a derived fallback/debug field.
  - If top-level `id` is not reliable, keep `source_hash` as the primary key and add a schema comment warning that it is a derived fallback sensitive to payload changes.
- Follow-up edits required before Task 4 and Task 5 are implemented:
  - Update the `extractPagedItems(...)` test and implementation to match the verified wrapper shape from this document.
  - Update `VersatureCdr`, the logical-call fixtures, and `getSharedCallId(...)` to use the verified shared-id field path from this document.
  - Update the `cdr_segments` migration and raw CDR upsert conflict target to match the raw identity decision from this document.
