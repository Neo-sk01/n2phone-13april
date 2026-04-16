-- Enforce one correlation per (cdr_id, month) so a rerun can't accumulate
-- stale matches against a single call. Previous PK was (cdr_id, month, ticket_id)
-- which allowed multiple rows per call.
--
-- Idempotent: runs only when the existing PK has 3 columns.

do $$
declare
  pk_cols int;
begin
  select array_length(conkey, 1) into pk_cols
    from pg_constraint
   where conname = 'connectwise_correlations_pkey'
     and conrelid = 'connectwise_correlations'::regclass;

  if pk_cols = 3 then
    -- Keep the highest-priority match per (cdr_id, month) before narrowing the PK.
    -- Priority: exact > fuzzy, then most recently written.
    delete from connectwise_correlations cc
     using (
       select cdr_id, month, ticket_id,
              row_number() over (
                partition by cdr_id, month
                order by (confidence = 'exact') desc,
                         (confidence = 'fuzzy') desc,
                         created_at desc
              ) as rn
         from connectwise_correlations
     ) ranked
     where cc.cdr_id = ranked.cdr_id
       and cc.month = ranked.month
       and cc.ticket_id = ranked.ticket_id
       and ranked.rn > 1;

    alter table connectwise_correlations
      drop constraint connectwise_correlations_pkey;

    alter table connectwise_correlations
      add primary key (cdr_id, month);
  end if;
end $$;
