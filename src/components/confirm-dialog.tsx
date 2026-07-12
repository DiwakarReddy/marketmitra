'use client'

/**
 * Global, Radix-based replacement for window.confirm / window.alert / window.prompt.
 *
 * Usage (one-liner, drop-in for the old browser dialogs):
 *
 *   const { confirm, prompt, alert } = useConfirm()
 *   if (!await confirm({ title: 'Delete?', message: 'Cannot undo.' })) return
 *   const name = await prompt({ title: 'Name this template', defaultValue: 'untitled' })
 *
 * The hook lives in a singleton provider (`<ConfirmProvider>`) so any component
 * anywhere in the tree can call it without prop-drilling.
 */

import * as React from 'react'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type ConfirmOptions = {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  destructive?: boolean
}

export type PromptOptions = {
  title: string
  message?: string
  defaultValue?: string
  placeholder?: string
  confirmText?: string
  cancelText?: string
  inputType?: 'text' | 'email' | 'number' | 'datetime-local'
  required?: boolean
  destructive?: boolean
}

export type AlertOptions = {
  title: string
  message?: string
  confirmText?: string
}

type ConfirmRequest = (options: ConfirmOptions) => Promise<boolean>
type PromptRequest = (options: PromptOptions) => Promise<string | null>
type AlertRequest = (options: AlertOptions) => Promise<void>

type ConfirmApi = {
  confirm: ConfirmRequest
  prompt: PromptRequest
  alert: AlertRequest
}

const ConfirmContext = createContext<ConfirmApi | null>(null)

export function useConfirm(): ConfirmApi {
  const ctx = useContext(ConfirmContext)
  if (!ctx) {
    throw new Error('useConfirm must be used inside <ConfirmProvider>')
  }
  return ctx
}

// Internal dialog state machine: at most one dialog visible at a time.
type Pending =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (v: string | null) => void }
  | { kind: 'alert'; options: AlertOptions; resolve: () => void }
  | null

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending>(null)
  const [value, setValue] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const request = useCallback(<T extends Pending>(p: Exclude<T, null>) => {
    setPending(p as Pending)
    setOpen(true)
    if (p.kind === 'prompt' && p.options.defaultValue) {
      setValue(p.options.defaultValue)
    } else {
      setValue('')
    }
    return new Promise<any>((resolve) => {
      p.resolve = resolve as any
    }) as any
  }, [])

  const confirm: ConfirmRequest = useCallback(
    (options) => {
      return new Promise<boolean>((resolve) => {
        setPending({ kind: 'confirm', options, resolve })
        setOpen(true)
      })
    },
    []
  )

  const prompt: PromptRequest = useCallback((options) => {
    return new Promise<string | null>((resolve) => {
      setPending({ kind: 'prompt', options, resolve })
      setValue(options.defaultValue ?? '')
      setOpen(true)
    })
  }, [])

  const alert: AlertRequest = useCallback((options) => {
    return new Promise<void>((resolve) => {
      setPending({ kind: 'alert', options, resolve })
      setOpen(true)
    })
  }, [])

  // Close handler — fires the resolve with a "cancel/no" sentinel.
  const handleOpenChange = (next: boolean) => {
    if (!next && pending) {
      if (pending.kind === 'confirm') pending.resolve(false)
      else if (pending.kind === 'prompt') pending.resolve(null)
      else pending.resolve()
    }
    setOpen(next)
    if (!next) {
      // Defer clearing pending until after the close animation to avoid flicker.
      setTimeout(() => setPending(null), 150)
    }
  }

  const onConfirmClick = () => {
    if (!pending) return
    if (pending.kind === 'confirm') {
      pending.resolve(true)
    } else if (pending.kind === 'prompt') {
      if (pending.options.required && !value.trim()) return
      pending.resolve(value)
    } else {
      pending.resolve()
    }
    setOpen(false)
    setTimeout(() => setPending(null), 150)
  }

  const onCancelClick = () => {
    if (!pending) return
    if (pending.kind === 'confirm') pending.resolve(false)
    else if (pending.kind === 'prompt') pending.resolve(null)
    else pending.resolve()
    setOpen(false)
    setTimeout(() => setPending(null), 150)
  }

  // Auto-focus the input when a prompt opens, and submit on Enter.
  useEffect(() => {
    if (open && pending?.kind === 'prompt') {
      const t = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [open, pending?.kind])

  const isPrompt = pending?.kind === 'prompt'
  const isAlert = pending?.kind === 'alert'
  const options = pending?.options as
    | ConfirmOptions
    | PromptOptions
    | AlertOptions
    | undefined

  return (
    <ConfirmContext.Provider value={{ confirm, prompt, alert }}>
      {children}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pending?.kind === 'confirm' && pending.options.title}
              {pending?.kind === 'prompt' && pending.options.title}
              {pending?.kind === 'alert' && pending.options.title}
            </DialogTitle>
            {options && 'message' in options && options.message && (
              <DialogDescription>{options.message}</DialogDescription>
            )}
          </DialogHeader>

          {isPrompt && (
            <div className="py-2">
              <Input
                ref={inputRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={(pending as any).options.placeholder}
                type={(pending as any).options.inputType ?? 'text'}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    onConfirmClick()
                  }
                }}
              />
            </div>
          )}

          <DialogFooter>
            {!isAlert && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancelClick}
              >
                {(pending as any)?.options?.cancelText ?? 'Cancel'}
              </Button>
            )}
            <Button
              type="button"
              variant={
                isAlert
                  ? 'brand'
                  : (pending as any)?.options?.destructive
                    ? 'destructive'
                    : 'brand'
              }
              onClick={onConfirmClick}
            >
              {(pending as any)?.options?.confirmText ?? (isAlert ? 'OK' : 'Confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  )
}
