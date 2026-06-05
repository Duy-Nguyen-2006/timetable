'use client'

import { AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning'
  onConfirm: () => void
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  variant = 'danger',
  onConfirm,
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="border-white/10 bg-[#1a1a1a] sm:max-w-md"
        showCloseButton={false}
      >
        <DialogHeader className="gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-full ${
              variant === 'danger'
                ? 'bg-red-500/15 text-red-400'
                : 'bg-amber-500/15 text-amber-400'
            }`}
          >
            <AlertTriangle size={20} strokeWidth={1.5} />
          </div>
          <DialogTitle className="text-left text-white">{title}</DialogTitle>
          <DialogDescription className="text-left text-sm text-white/50">
            {description}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-white/10 bg-transparent px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/[0.04] hover:text-white"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={`rounded-md px-4 py-2.5 text-sm font-medium transition ${
              variant === 'danger'
                ? 'bg-red-500/90 text-white hover:bg-red-500'
                : 'bg-amber-500/90 text-black hover:bg-amber-500'
            }`}
          >
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
