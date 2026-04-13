# CSH Dashboard

## Setup

1. Copy `.env.local.example` to `.env.local`.
2. Fill in the Versature client credentials and queue IDs.
3. Make sure PostgreSQL is running and `DATABASE_URL` points to it.
4. Run `npm install`.
5. Run `npm run db:migrate`.

## Net2Phone / Versature App Setup

1. In the Net2Phone developer portal, create a new application for this internal dashboard.
2. Enable the Client Credentials grant for that app.
3. Copy the client ID and client secret into `.env.local`.
4. Confirm the tenant's documented media type before overriding `VERSATURE_API_VERSION`.

## Environment Variables

- `VERSATURE_BASE_URL`: Versature API base URL for your tenant.
- `VERSATURE_CLIENT_ID`: OAuth client ID for the dashboard integration.
- `VERSATURE_CLIENT_SECRET`: OAuth client secret for the dashboard integration.
- `VERSATURE_API_VERSION`: Accept header media type. Leave the default unless your tenant documents a newer one.
- `DATABASE_URL`: PostgreSQL connection string for the local dashboard database.
- `QUEUE_ENGLISH`: English queue ID.
- `QUEUE_FRENCH`: French queue ID.
- `QUEUE_AI_OVERFLOW_EN`: English AI overflow queue ID.
- `QUEUE_AI_OVERFLOW_FR`: French AI overflow queue ID.
- `DNIS_PRIMARY`: Primary tracked CSH DNIS.
- `DNIS_SECONDARY`: Secondary tracked CSH DNIS.

## Run

- `npm run dev` starts the local dashboard.
- `npm run discover:queues` prints the available queue IDs from Versature.
- `npm run audit:day -- 2026-04-01` prints the manual-validation audit for a day.

## Refresh

`POST /api/refresh` syncs a day of data from Versature into PostgreSQL.

## Metric Notes

- Short Calls is a caller-engagement metric. It counts quick DNIS-touching answered segments, including auto-attendant-answered edges, and must not be reinterpreted as a human-answered-only metric.

## Troubleshooting

If numbers look wrong, check these first:

1. Are you counting raw CDRs instead of logical calls? Re-run the audit script and compare the logical-call total to the raw segment total before trusting KPI #1.
2. Are you filtering by `call_type === 'Incoming'` instead of DNIS or queue stats? Use DNIS-filtered logical calls for KPI #1 and queue stats for queue-offered totals.
3. Are you treating `answer_time` as proof that a human answered? Use queue stats `abandoned_calls` for dropped-call reporting, and treat `answer_time` only as an input for duration-oriented metrics.
