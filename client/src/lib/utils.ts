import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const getQueryParamFromURL = (queryString: string, key: string) => {
  return new URLSearchParams(queryString).get(key)
}

export const config: { [key: string]: string | string[] | undefined } = {
  MAPBOX_ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN || '',
};

