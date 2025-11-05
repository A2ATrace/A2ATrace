import React, { PropsWithChildren, useEffect, useRef } from 'react';
import './modal.scss';

type ModalProps = PropsWithChildren<{
  title?: string;
  onClose: () => void;
}>;

export default function Modal({ title, onClose, children }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // Close on ESC key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();

      // Focus trap for Tab/Shift+Tab
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey) {
          if (active === first || active === dialogRef.current) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (active === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Prevent background scroll while open
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Move focus into dialog on mount and restore on unmount
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    // Delay to ensure elements are mounted
    setTimeout(() => {
      (closeBtnRef.current || dialogRef.current)?.focus();
    }, 0);
    return () => {
      prev?.focus?.();
    };
  }, []);

  return (
    <div className='a2a-modal-overlay' onClick={onClose}>
      <div
        className='a2a-modal'
        role='dialog'
        aria-modal='true'
        aria-label={title}
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className='a2a-modal-header'>
          <h3 className='a2a-modal-title'>{title}</h3>
          <button
            className='a2a-modal-close'
            onClick={onClose}
            aria-label='Close'
            ref={closeBtnRef}
          >
            ×
          </button>
        </div>
        <div className='a2a-modal-body'>{children}</div>
      </div>
    </div>
  );
}
