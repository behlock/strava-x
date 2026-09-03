import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Teach tailwind-merge that every `text-*-compact` utility (the custom font
// sizes in global.css) is a font size. Without this it reads them as text
// colours and drops them whenever a real colour like `text-foreground` follows.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [(value: string) => value.endsWith('-compact')] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
