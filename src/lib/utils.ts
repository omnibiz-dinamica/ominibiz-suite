import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const modalContentFrame = "max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain bg-background";

export const modalSafePadding = "px-6 pb-6 pt-[max(1.25rem,env(safe-area-inset-top))]";

export const modalHeaderChrome =
  "sticky top-0 z-40 flex min-h-14 flex-col justify-center bg-background/95 backdrop-blur";

export const modalHeaderPadding = "pb-4 pr-20 pt-[max(1.25rem,env(safe-area-inset-top))]";

export const modalTitleChrome = "min-w-0 pr-12 text-lg font-semibold leading-tight tracking-tight";

export const modalCloseChrome =
  "absolute right-4 top-[max(0.75rem,env(safe-area-inset-top))] z-50 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/95 text-foreground opacity-90 shadow-sm ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-background";
