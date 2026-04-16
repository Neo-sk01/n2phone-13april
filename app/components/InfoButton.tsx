'use client'
import { useState } from 'react'

export function InfoButton({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-block">
      <button
        type="button"
        aria-label={`About ${title}`}
        onClick={() => setOpen((v) => !v)}
        className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-lime-800/60 text-xs text-lime-300 hover:bg-lime-900/40"
      >
        i
      </button>
      {open ? (
        <span
          role="dialog"
          onMouseLeave={() => setOpen(false)}
          className="absolute left-0 top-7 z-20 w-72 rounded-xl border border-lime-800/60 bg-[#0a0a0a] p-3 text-xs text-lime-100 shadow-lg"
        >
          <span className="block font-semibold text-lime-300">{title}</span>
          <span className="mt-1 block text-lime-200/80">{children}</span>
        </span>
      ) : null}
    </span>
  )
}
