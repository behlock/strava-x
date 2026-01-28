'use client'

import { useCallback, useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface UploadZoneProps {
  onFilesSelected: (files: File[]) => void
  isLoading?: boolean
  progress?: { processed: number; total: number } | null
  hasActivities?: boolean
  className?: string
  defaultExpanded?: boolean
  error?: string | null
  onErrorDismiss?: () => void
}

export function UploadZone({
  onFilesSelected,
  isLoading = false,
  progress,
  hasActivities = false,
  className,
  defaultExpanded = true,
  error,
  onErrorDismiss,
}: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [expanded, setExpanded] = useState(defaultExpanded)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.setAttribute('webkitdirectory', '')
      inputRef.current.setAttribute('directory', '')
    }
  }, [])

  useEffect(() => {
    if (!defaultExpanded) {
      setExpanded(false)
    }
  }, [defaultExpanded])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)

      const items = e.dataTransfer.items
      const files: File[] = []

      const readAllEntries = async (reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> => {
        const allEntries: FileSystemEntry[] = []
        let entries: FileSystemEntry[]
        do {
          entries = await new Promise<FileSystemEntry[]>((resolve) => {
            reader.readEntries(resolve)
          })
          allEntries.push(...entries)
        } while (entries.length > 0)
        return allEntries
      }

      const collectFilesFromDirectory = async (dirEntry: FileSystemDirectoryEntry): Promise<void> => {
        const reader = dirEntry.createReader()
        const entries = await readAllEntries(reader)
        for (const entry of entries) {
          if (entry.isFile) {
            const file = await new Promise<File>((resolve) => {
              ;(entry as FileSystemFileEntry).file(resolve)
            })
            const name = file.name.toLowerCase()
            if (name.endsWith('.gpx') || name.endsWith('.fit') || name.endsWith('.fit.gz')) {
              files.push(file)
            }
          }
        }
      }

      const processEntry = async (entry: FileSystemEntry): Promise<void> => {
        if (entry.isFile) {
          const file = await new Promise<File>((resolve) => {
            ;(entry as FileSystemFileEntry).file(resolve)
          })
          const name = file.name.toLowerCase()
          if (name.endsWith('.gpx') || name.endsWith('.fit') || name.endsWith('.fit.gz')) {
            files.push(file)
          }
        } else if (entry.isDirectory) {
          const dirEntry = entry as FileSystemDirectoryEntry
          const reader = dirEntry.createReader()
          const entries = await readAllEntries(reader)

          // Check if this is a Strava export root folder (has an 'activities' subfolder)
          const activitiesFolder = entries.find(
            (e) => e.isDirectory && e.name.toLowerCase() === 'activities'
          ) as FileSystemDirectoryEntry | undefined

          if (activitiesFolder) {
            // Only process files directly inside the activities folder
            await collectFilesFromDirectory(activitiesFolder)
          } else {
            // Not a Strava export root - collect files from this directory only (no recursion)
            await collectFilesFromDirectory(dirEntry)
          }
        }
      }

      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry()
        if (entry) {
          await processEntry(entry)
        }
      }

      if (files.length > 0) {
        onFilesSelected(files)
      }
    },
    [onFilesSelected]
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const allFiles = Array.from(e.target.files || [])

      // Check if any file has a path indicating an 'activities' subfolder exists
      const hasActivitiesFolder = allFiles.some((f) => {
        const relativePath = f.webkitRelativePath.toLowerCase()
        const parts = relativePath.split('/')
        return parts.length >= 2 && parts[1] === 'activities'
      })

      const files = allFiles.filter((f) => {
        const name = f.name.toLowerCase()
        if (!name.endsWith('.gpx') && !name.endsWith('.fit') && !name.endsWith('.fit.gz')) {
          return false
        }

        // If there's an activities folder, only include files from it
        if (hasActivitiesFolder) {
          const relativePath = f.webkitRelativePath.toLowerCase()
          const parts = relativePath.split('/')
          // File should be directly in the activities folder (e.g., "export/activities/file.gpx")
          return parts.length === 3 && parts[1] === 'activities'
        }

        return true
      })

      if (files.length > 0) {
        onFilesSelected(files)
      }
    },
    [onFilesSelected]
  )

  const progressPercent = progress
    ? Math.round((progress.processed / progress.total) * 100)
    : 0

  return (
    <div
      className={cn(
        'bg-panel/90 panel-blur border border-panel-border rounded-sm',
        className
      )}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 border-b border-panel-border hover:bg-foreground/5 transition-colors"
      >
        <span className="text-xs-compact tracking-wider">
          [02]—upload
        </span>
        <span className="text-panel-muted text-xs-compact">
          {expanded ? '[-]' : '[+]'}
        </span>
      </button>

      {expanded && <div
        className={cn(
          'p-3 transition-colors cursor-pointer',
          isDragging && 'bg-foreground/5'
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <label className="cursor-pointer block">
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            multiple
            onChange={handleFileInput}
            disabled={isLoading}
          />

          {error ? (
            <div className="space-y-2 py-2">
              <div className="text-sm-compact text-red-500 dark:text-red-400">
                [!] {error}
              </div>
              {onErrorDismiss && (
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    onErrorDismiss()
                  }}
                  className="text-xs-compact text-panel-muted hover:text-foreground transition-colors"
                >
                  [dismiss]
                </button>
              )}
            </div>
          ) : isLoading ? (
            <div className="space-y-2">
              <div className="text-sm-compact text-panel-muted">
                processing {progress?.processed || 0}/{progress?.total || 0}
              </div>
              <div className="h-1 bg-panel-border rounded-sm overflow-hidden">
                <div
                  className="h-full bg-foreground transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="text-center py-4 md:py-2 min-h-[100px] md:min-h-0 flex flex-col justify-center">
              <div className="text-sm-compact mb-1">
                {hasActivities ? '[_] drop more files' : '[_] drop files here'}
              </div>
              <div className="text-xs-compact text-panel-muted">
                strava export folder or .gpx/.fit files
              </div>
            </div>
          )}
        </label>
      </div>}
    </div>
  )
}
