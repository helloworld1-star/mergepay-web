"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  FOCUSABLE_SELECTOR,
  dialogStack,
  nextFocusIndex,
  pickInitialFocusIndex,
  shouldCloseOnEscape,
} from "@/lib/dialog";

/** Number of open modals, so nested dialogs restore page scroll only once. */
let openModalCount = 0;
let previousBodyOverflow = "";

/**
 * Hide the rest of the page from assistive tech while a modal is open, so a
 * screen reader's virtual cursor cannot wander into background content that
 * the Tab trap already blocks.
 */
function hideBackgroundFromAssistiveTech(dialogRoot: Element | null): () => void {
  const hidden = (Array.from(document.body.children) as HTMLElement[]).filter(
    (el) =>
      el !== dialogRoot &&
      !el.hasAttribute("aria-hidden") &&
      !el.hasAttribute("aria-live") &&
      !el.hasAttribute("data-sonner-toaster")
  );

  for (const el of hidden) el.setAttribute("aria-hidden", "true");

  return () => {
    for (const el of hidden) el.removeAttribute("aria-hidden");
  };
}

/** Rendered and able to take focus — excludes `display: none` controls. */
function isVisible(el: HTMLElement): boolean {
  return (
    el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0
  );
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
  description,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
  /** Extra context announced with the dialog's accessible name. */
  description?: string;
  /**
   * When false, Escape, the backdrop, and the close button are all inert.
   * Use for dialogs that must not be abandoned mid-flight (e.g. a settlement
   * awaiting a wallet signature).
   */
  dismissible?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const titleId = useId();
  const descId = useId();

  // Handle Escape key globally for any active modal or dropdown
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape" && dismissible) {
        if (shouldCloseOnEscape(panelRef.current)) {
          e.stopPropagation();
          onClose();
        }
        return;
      }

      if (e.key === "Tab" && panelRef.current) {
        const focusables = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter(isVisible);

        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const currentIndex = focusables.indexOf(
          document.activeElement as HTMLElement
        );

        if (e.shiftKey) {
          if (currentIndex <= 0) {
            e.preventDefault();
            focusables[focusables.length - 1].focus();
          }
        } else {
          if (currentIndex === -1 || currentIndex === focusables.length - 1) {
            e.preventDefault();
            focusables[0].focus();
          }
        }
      }
    },
    [open, dismissible, onClose]
  );

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement;

    // Manage body scroll
    if (openModalCount === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    openModalCount++;

    const unhide = hideBackgroundFromAssistiveTech(panelRef.current);

    dialogStack.push(panelRef);

    // Focus initial element
    const timer = setTimeout(() => {
      if (panelRef.current) {
        const explicit = panelRef.current.querySelector<HTMLElement>(
          "[data-autofocus]"
        );
        if (explicit && isVisible(explicit)) {
          explicit.focus();
        } else {
          const focusables = Array.from(
            panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
          ).filter(isVisible);
          if (focusables.length > 0) {
            focusables[0].focus();
          } else {
            panelRef.current.focus();
          }
        }
      }
    }, 50);

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown, true);
      dialogStack.pop();
      unhide();

      openModalCount = Math.max(0, openModalCount - 1);
      if (openModalCount === 0) {
        document.body.style.overflow = previousBodyOverflow;
      }

      if (previousFocusRef.current && typeof previousFocusRef.current.focus === "function") {
        previousFocusRef.current.focus();
      }
    };
  }, [open, handleKeyDown]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="presentation"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => {
              if (dismissible) onClose();
            }}
            className="fixed inset-0 bg-ink/60 backdrop-blur-sm"
            aria-hidden="true"
          />

          {/* Dialog Panel */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, type: "spring", damping: 25, stiffness: 300 }}
            className={cn(
              "relative z-50 w-full max-w-lg rounded-2xl border-4 border-ink bg-cream p-6 shadow-neobrutalism outline-none",
              className
            )}
          >
            <div className="flex items-start justify-between gap-4 pb-4 border-b-2 border-ink">
              <div>
                <h2 id={titleId} className="text-xl font-black text-ink">
                  {title}
                </h2>
                {description && (
                  <p id={descId} className="mt-1 text-sm text-ink/70">
                    {description}
                  </p>
                )}
              </div>
              {dismissible && (
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border-2 border-ink bg-white p-1.5 text-ink shadow-neobrutalism-sm transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none focus:outline-none focus:ring-2 focus:ring-ink"
                  aria-label="Close dialog"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            <div
              ref={bodyRef}
              className="mt-4 max-h-[75vh] overflow-y-auto pr-1 text-ink"
            >
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
