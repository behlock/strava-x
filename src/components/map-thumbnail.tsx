'use client'

import { useTheme } from 'next-themes'
import { useMounted } from '@/hooks/use-mounted'

export function MapThumbnail({ slug }: { slug: string }) {
  const { resolvedTheme } = useTheme()
  const mounted = useMounted()
  // The server and first hydration pass must render the same placeholder.
  if (!mounted || !resolvedTheme) return <div className="h-full w-full" />
  return (
    <img
      src={`/api/maps/${encodeURIComponent(slug)}?view=thumbnail&theme=${resolvedTheme === 'dark' ? 'dark' : 'light'}`}
      alt={`Routes on /${slug}`}
      width={640}
      height={400}
      loading="lazy"
      decoding="async"
      className="h-full w-full object-cover transition-opacity group-hover:opacity-85"
    />
  )
}
