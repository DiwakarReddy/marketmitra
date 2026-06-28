import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Money helpers - all amounts stored in paise (₹1 = 100 paise)
export function paiseToRupees(paise: number): number {
  return paise / 100
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100)
}

export function formatRupees(paise: number, compact = false): string {
  const rupees = paiseToRupees(paise)
  if (compact && rupees >= 100000) {
    return `₹${(rupees / 100000).toFixed(1)}L`
  }
  if (compact && rupees >= 1000) {
    return `₹${(rupees / 1000).toFixed(1)}K`
  }
  return `₹${rupees.toLocaleString('en-IN')}`
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export function relativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin} min ago`
  if (diffHr < 24) return `${diffHr} hr ago`
  if (diffDay < 7) return `${diffDay}d ago`
  return formatDate(d)
}

export function timeAgo(date: Date | string): string {
  return relativeTime(date)
}
// Generate 2-letter initials from a business name
// Handles Hindi/Devanagari + ASCII
export function getInitials(name: string): string {
  if (!name) return '??'
  const cleaned = name.trim()
  // Try first letters of first two words
  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length === 0) return '??'
  if (words.length === 1) {
    // Single word: take first 2 chars
    return words[0].slice(0, 2).toUpperCase()
  }
  // Two+ words: first letter of first 2
  return (words[0][0] + (words[1]?.[0] || '')).toUpperCase()
}

// Deterministic avatar color from name
const AVATAR_GRADIENTS = [
  'from-pink-400 to-pink-600',
  'from-blue-400 to-blue-600',
  'from-purple-400 to-purple-600',
  'from-amber-400 to-amber-600',
  'from-green-400 to-green-600',
  'from-rose-400 to-rose-600',
  'from-indigo-400 to-indigo-600',
  'from-teal-400 to-teal-600',
]

export function getAvatarColor(name: string): string {
  if (!name) return AVATAR_GRADIENTS[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length]
}
