'use client'

import styles from './maps.module.css'

import { useState, useEffect, useRef, useSyncExternalStore, type PointerEvent, type FocusEvent } from 'react'
import { getPublishedOwnerSlug, subscribePublishedOwner } from '@/lib/published-owner'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { useStravaAuth } from '@/hooks/use-strava-auth'
import { usePublish } from '@/hooks/use-publish'
import { Eye, X } from 'lucide-react'
import { MapThumbnail } from '@/components/map-thumbnail'
import { mapsPageHref, type MapsSort, type MapsOrder } from '@/lib/maps-sort'
import type { PublishedMapSummary } from '@/lib/sharing-db'

export function MapsList({ maps, sort, order }: { maps: PublishedMapSummary[]; sort: MapsSort; order: MapsOrder }) {
  const { isConnected, getAccessToken } = useStravaAuth()
  const { refreshCurrentSlug } = usePublish({ getAccessToken })
  const currentSlug = useSyncExternalStore(subscribePublishedOwner, getPublishedOwnerSlug, () => null)
  useEffect(() => {
    if (!isConnected) return
    const controller = new AbortController()
    void refreshCurrentSlug(controller.signal).catch(() => {})
    return () => controller.abort()
  }, [isConnected, refreshCurrentSlug])
  const [preview, setPreview] = useState<{ slug: string; x: number; y: number } | null>(null)
  const previewElement = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  function position(x: number, y: number) {
    const width = Math.min(320, window.innerWidth - 32)
    const height = (width * 5) / 8
    return {
      x: Math.max(16, Math.min(x + 20, window.innerWidth - width - 16)),
      y: Math.max(16, Math.min(y + 20, window.innerHeight - height - 16)),
    }
  }
  function hover(event: PointerEvent<HTMLAnchorElement>, slug: string) {
    if (event.pointerType === 'mouse') setPreview({ slug, ...position(event.clientX, event.clientY) })
  }
  function focus(event: FocusEvent<HTMLAnchorElement>, slug: string) {
    if (event.currentTarget.matches(':focus-visible')) {
      const rect = event.currentTarget.getBoundingClientRect()
      setPreview({ slug, ...position(rect.left, rect.bottom) })
    }
  }
  return (
    <div
      onKeyDown={(event) => {
        if (event.key === 'Escape' && (preview || expanded)) {
          event.preventDefault()
          event.stopPropagation()
          setPreview(null)
          setExpanded(null)
        }
      }}
    >
      <div className="min-w-0">
        <div className={`${styles.columns} mb-3 text-xs-compact text-panel-muted`}>
          {(['map', 'activities', 'city'] as const).map((column) => {
            const active = sort === column
            const next = active ? (order === 'asc' ? 'desc' : 'asc') : column === 'activities' ? 'desc' : 'asc'
            return (
              <Link
                key={column}
                replace
                href={mapsPageHref(column, next)}
                scroll={false}
                className={`w-fit hover:text-foreground focus-visible:underline focus-visible:underline-offset-4 focus-visible:outline-hidden ${column === 'map' ? 'text-left' : column === 'activities' ? 'justify-self-center text-center' : 'justify-self-end text-right'} ${column === 'city' ? 'hidden sm:block' : ''}`}
                aria-label={`Sort by ${column}, ${next === 'asc' ? 'ascending' : 'descending'}${active ? `; currently ${order === 'asc' ? 'ascending' : 'descending'}` : ''}`}
              >
                {column}
                {active && <span aria-hidden="true"> {order === 'asc' ? '↑' : '↓'}</span>}
              </Link>
            )
          })}
        </div>
        <ul>
          {maps.map((map) => (
            <li key={map.slug} className="relative">
              <div className="flex items-center">
                <Link
                  href={`/${map.slug}`}
                  prefetch={false}
                  className={`${styles.columns} min-w-0 flex-1 py-2.5 text-sm-compact focus-ring-inset transition-colors hover:text-panel-muted`}
                  onPointerEnter={(event) => hover(event, map.slug)}
                  onPointerMove={(event) => {
                    if (event.pointerType !== 'mouse' || !previewElement.current) return
                    const point = position(event.clientX, event.clientY)
                    previewElement.current.style.transform = `translate(${point.x}px, ${point.y}px)`
                  }}
                  onPointerLeave={() => setPreview(null)}
                  onFocus={(event) => focus(event, map.slug)}
                  onBlur={() => setPreview(null)}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">/{map.slug}</span>
                    {isConnected && currentSlug === map.slug && (
                      <span className="shrink-0 rounded-lg border border-panel-border px-1.5 text-xs-compact text-panel-muted">
                        you
                      </span>
                    )}
                  </span>
                  <span className="text-right tabular-nums sm:text-center">
                    <span className="sr-only">activities: </span>
                    {map.activity_count.toLocaleString('en-GB')}
                  </span>
                  <span className="hidden truncate text-right sm:block" title={map.city ?? undefined}>
                    <span className="sr-only">city with most runs: </span>
                    {map.city ?? '—'}
                  </span>
                  <span className="col-span-2 -mt-1 truncate text-xs-compact text-panel-muted sm:hidden">
                    {map.city ?? 'no running city available'}
                  </span>
                </Link>
                <button
                  type="button"
                  className={`${styles.touchPreview} ml-3 size-11 shrink-0 items-center justify-center rounded-lg focus-ring`}
                  aria-label={`${expanded === map.slug ? 'Hide' : 'Preview'} /${map.slug} map`}
                  aria-expanded={expanded === map.slug}
                  aria-controls={`preview-${map.slug}`}
                  onClick={() => setExpanded(expanded === map.slug ? null : map.slug)}
                >
                  {expanded === map.slug ? <X className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <div
                id={`preview-${map.slug}`}
                hidden={expanded !== map.slug}
                className="mb-5 aspect-[8/5] overflow-hidden border border-panel-border"
              >
                {expanded === map.slug && <MapThumbnail slug={map.slug} />}
              </div>
            </li>
          ))}
        </ul>
      </div>
      {preview &&
        createPortal(
          <div
            ref={previewElement}
            aria-hidden="true"
            className={styles.hoverPreview}
            style={{ transform: `translate(${preview.x}px, ${preview.y}px)` }}
          >
            <MapThumbnail slug={preview.slug} />
          </div>,
          document.body,
        )}
    </div>
  )
}
