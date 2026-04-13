const baseUrl = process.env.VERSATURE_BASE_URL
const clientId = process.env.VERSATURE_CLIENT_ID
const clientSecret = process.env.VERSATURE_CLIENT_SECRET
const apiVersion =
  process.env.VERSATURE_API_VERSION ?? 'application/vnd.integrate.v1.6.0+json'
const date = process.argv[2]

if (!date) {
  throw new Error('Usage: node --env-file=.env.local scripts/inspect-cdr-shape.mjs 2026-04-01')
}

function getValueAtPath(value, path) {
  return path.split('.').reduce((current, key) => {
    if (!current || typeof current !== 'object') {
      return null
    }

    return current[key] ?? null
  }, value)
}

function findPrimaryRowArray(payload) {
  if (Array.isArray(payload)) {
    return { rowArrayKey: '<array-root>', rows: payload }
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Expected the CDR payload to be an object or array')
  }

  const arrayEntries = Object.entries(payload).filter(([, value]) => Array.isArray(value))
  const objectArrayEntries = arrayEntries.filter(([, value]) =>
    value.every((item) => item && typeof item === 'object' && !Array.isArray(item)),
  )

  if (objectArrayEntries.length === 1) {
    return {
      rowArrayKey: objectArrayEntries[0][0],
      rows: objectArrayEntries[0][1],
    }
  }

  if (arrayEntries.length === 1) {
    return {
      rowArrayKey: arrayEntries[0][0],
      rows: arrayEntries[0][1],
    }
  }

  throw new Error(
    `Unable to identify the primary row array. Top-level keys: ${Object.keys(payload).join(', ')}`,
  )
}

function inspectSharedIdCandidates(rows) {
  const candidatePaths = [
    'call_id',
    'from.call_id',
    'callId',
    'from.callId',
    'session_id',
    'conversation_id',
  ]

  return candidatePaths
    .map((path) => {
      const groups = new Map()

      for (const row of rows) {
        const value = getValueAtPath(row, path)
        if (typeof value !== 'string' || value.length === 0) {
          continue
        }

        const bucket = groups.get(value) ?? {
          count: 0,
          toIds: new Set(),
          answeredRows: 0,
        }

        bucket.count += 1
        bucket.toIds.add(getValueAtPath(row, 'to.id') ?? '<missing>')
        if (getValueAtPath(row, 'answer_time')) {
          bucket.answeredRows += 1
        }

        groups.set(value, bucket)
      }

      const multiSegmentGroups = [...groups.entries()]
        .filter(([, group]) => group.count > 1)
        .slice(0, 5)
        .map(([value, group]) => ({
          value,
          count: group.count,
          uniqueToIds: [...group.toIds],
          answeredRows: group.answeredRows,
        }))

      return {
        path,
        populatedRows: [...groups.values()].reduce((sum, group) => sum + group.count, 0),
        multiSegmentGroups: multiSegmentGroups.length,
        sampleGroups: multiSegmentGroups,
      }
    })
    .filter((candidate) => candidate.populatedRows > 0)
}

const tokenResponse = await fetch(`${baseUrl}/oauth/token/`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  }),
})

const tokenPayload = await tokenResponse.json()
const accessToken = tokenPayload.access_token

const cdrResponse = await fetch(
  `${baseUrl}/cdrs/users/?start_date=${date}&end_date=${date}`,
  {
    headers: {
      Accept: apiVersion,
      Authorization: `Bearer ${accessToken}`,
    },
  },
)

const payload = await cdrResponse.json()
const pageKeys = Array.isArray(payload) ? ['<array-root>'] : Object.keys(payload)
const { rowArrayKey, rows } = findPrimaryRowArray(payload)
const firstRow = rows[0] ?? null
const sampleRows = rows.slice(0, 50)

console.log(JSON.stringify({
  pageKeys,
  rowArrayKey,
  rowCount: rows.length,
  firstRowKeys: firstRow ? Object.keys(firstRow) : [],
  firstRow,
  sharedIdCandidates: inspectSharedIdCandidates(sampleRows),
}, null, 2))
