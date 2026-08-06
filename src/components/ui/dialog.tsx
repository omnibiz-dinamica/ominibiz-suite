"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/** Canonical modal widths. `xl` = wide workspace modal (min(1200px, 94vw)). */
export type ModalSize = "sm" | "md" | "lg" | "xl";

const MODAL_SIZE: Record<ModalSize, string> = {
  sm: "sm:max-w-md",
  md: "sm:max-w-2xl",
  lg: "sm:max-w-4xl",
  xl: "sm:max-w-[min(1200px,94vw)]",
};

/** Shared shell: full-screen on mobile, centered card from `sm` upwards. */
export const modalShell = cn(
  "fixed z-50 flex flex-col overflow-hidden bg-background text-foreground shadow-2xl outline-none",
  // mobile: full screen
  "inset-0 h-[100dvh] max-h-[100dvh] w-screen max-w-none rounded-none border-0",
  // >= sm: centered, bounded card
  "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:w-[96vw] sm:max-h-[94vh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border",
  "md:max-h-[92vh] lg:max-h-[90vh]",
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95",
);

/** Close button chrome — 44x44 hit area, always above header/tabs/content. */
export const modalCloseButton = cn(
  "absolute right-3 top-3 z-50 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
  "border border-border bg-background/95 text-muted-foreground shadow-sm backdrop-blur",
  "transition-colors hover:bg-muted hover:text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  "disabled:pointer-events-none",
);

interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /** Canonical width. Defaults to `md`. */
  size?: ModalSize;
  /** Hide the built-in close button (only when the modal renders its own). */
  hideClose?: boolean;
}

const DialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  ({ className, children, size = "md", hideClose = false, ...props }, ref) => (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content ref={ref} className={cn(modalShell, MODAL_SIZE[size], className)} {...props}>
        {children}
        {!hideClose && (
          <DialogPrimitive.Close className={modalCloseButton} aria-label="Fechar">
            <X className="h-5 w-5" />
            <span className="sr-only">Fechar</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  ),
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("min-w-0 truncate font-display text-base font-semibold leading-tight sm:text-lg", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("mt-0.5 line-clamp-2 text-xs text-muted-foreground sm:text-sm", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

/* ------------------------------------------------------------------ *
 * Canonical modal layout primitives (shared by Dialog/Sheet/Drawer).
 * ------------------------------------------------------------------ */

export const modalHeaderChrome = cn(
  "shrink-0 border-b border-border bg-background/95 backdrop-blur",
  "flex items-start gap-3 px-4 py-3.5 pr-16 sm:px-5 sm:py-4",
  "pt-[max(0.875rem,env(safe-area-inset-top))] sm:pt-4",
);

export const modalBodyChrome =
  "min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-4 sm:px-5 sm:py-5";

export const modalFooterChrome = cn(
  "shrink-0 border-t border-border bg-background px-4 py-3 sm:px-5",
  "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
  "flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end",
);

/** Fixed modal header: module icon + title + short subtitle. Never overlaps the close button. */
function ModalHeader({
  icon: Icon,
  title,
  description,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  icon?: LucideIcon;
  title?: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <div className={cn(modalHeaderChrome, className)} {...props}>
      {Icon && (
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-[18px] w-[18px]" />
        </span>
      )}
      <div className="min-w-0 flex-1 text-left">
        {title != null && <DialogTitle>{title}</DialogTitle>}
        {description != null && <DialogDescription>{description}</DialogDescription>}
        {children}
      </div>
    </div>
  );
}
ModalHeader.displayName = "ModalHeader";

/** The single scrollable region of a modal. */
function ModalBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(modalBodyChrome, className)} {...props} />;
}
ModalBody.displayName = "ModalBody";

/** Fixed action bar. Use `form="<id>"` on submit buttons when the form lives in the body. */
function ModalFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(modalFooterChrome, className)} {...props} />;
}
ModalFooter.displayName = "ModalFooter";

/** Grouped card inside the modal body. */
function ModalSection({
  title,
  description,
  icon: Icon,
  actions,
  className,
  contentClassName,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  contentClassName?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card/60 p-3.5 sm:p-4", className)} {...props}>
      {(title != null || actions != null) && (
        <header className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
          <div className="flex min-w-0 items-start gap-2">
            {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
              {description != null && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
            </div>
          </div>
          {actions != null && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("space-y-3", contentClassName)}>{children}</div>
    </section>
  );
}
ModalSection.displayName = "ModalSection";

/** Tab bar slot: sits directly under the header, scrolls horizontally on mobile. */
function ModalTabsBar({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "shrink-0 border-b border-border bg-background px-4 py-2 sm:px-5 [&>*]:w-full",
        "overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      {...props}
    />
  );
}
ModalTabsBar.displayName = "ModalTabsBar";

/** Back-compat aliases — same chrome as the canonical primitives. */
const DialogHeader = ModalHeader;
const DialogFooter = ModalFooter;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalSection,
  ModalTabsBar,
};
