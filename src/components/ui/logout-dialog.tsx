'use client'

import { useEffect, useId, useRef } from 'react'

export function LogoutDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  const finish = (action: () => void) => {
    dialogRef.current?.close()
    action()
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="fixed inset-0 m-auto h-fit max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-xl border border-panel-border bg-panel p-5 text-foreground shadow-xl backdrop:bg-black/45"
      onKeyDown={(event) => event.stopPropagation()}
      onCancel={(event) => {
        event.preventDefault()
        finish(onCancel)
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        const bounds = event.currentTarget.getBoundingClientRect()
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          finish(onCancel)
      }}
    >
      <h2 id={titleId} className="text-base-compact">
        log out?
      </h2>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          autoFocus
          onClick={() => finish(onCancel)}
          className="min-h-11 rounded-lg border border-panel-border px-4 text-xs-compact focus-ring hover:bg-control-hover"
        >
          cancel
        </button>
        <button
          type="button"
          onClick={() => finish(onConfirm)}
          className="min-h-11 rounded-lg border border-panel-border bg-foreground px-4 text-xs-compact text-background focus-ring hover:opacity-85"
        >
          log out
        </button>
      </div>
    </dialog>
  )
}
