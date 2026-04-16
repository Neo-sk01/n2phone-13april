import Link from 'next/link'

export function PeriodToggle({
  current,
  includeWeekends,
}: {
  current: 'today' | 'this-week' | 'this-month'
  includeWeekends: boolean
}) {
  const items = [
    { key: 'today', label: 'Today' },
    { key: 'this-week', label: 'This Week' },
    { key: 'this-month', label: 'This Month' },
  ] as const

  return (
    <div className="inline-flex rounded-full border border-lime-800 p-1">
      {items.map((item) => (
        <Link
          key={item.key}
          href={`/?period=${item.key}${includeWeekends ? '&includeWeekends=true' : ''}`}
          className={`rounded-full px-4 py-2 text-sm ${
            item.key === current ? 'bg-lime-500 font-medium text-black' : 'text-lime-300/70 hover:text-lime-200'
          }`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  )
}
