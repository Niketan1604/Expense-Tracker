'use client'

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

const DURATION = 10000; // 10 seconds

type ToastType = 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  createdAt: number;
  visible: boolean; // controls CSS transition in/out
}

interface ToastContextType {
  success: (message: string) => void; // no-op, kept for API compatibility
  error: (message: string) => void;
  info: (message: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const [progress, setProgress] = useState(100);
  const rafRef = useRef<number | null>(null);

  // Animate progress bar from 100 → 0 over DURATION ms
  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const remaining = Math.max(0, 100 - (elapsed / DURATION) * 100);
      setProgress(remaining);
      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  const isError = toast.type === 'error';

  return (
    <div
      style={{
        transform: toast.visible ? 'translateX(0)' : 'translateX(calc(100% + 16px))',
        opacity: toast.visible ? 1 : 0,
        transition: 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease',
        background: isError ? 'var(--red-dim, #2d1515)' : 'var(--surface)',
        border: `1px solid ${isError ? 'var(--red, #f43f5e)' : 'var(--border)'}`,
        color: isError ? 'var(--red, #f43f5e)' : 'var(--text)',
        borderRadius: '14px',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
        pointerEvents: 'all',
      }}
    >
      {/* Toast body */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '14px 14px 10px 14px' }}>
        {/* Icon */}
        <div style={{
          flexShrink: 0,
          width: 20,
          height: 20,
          marginTop: 1,
          borderRadius: '50%',
          background: isError ? 'var(--red, #f43f5e)' : 'var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            {isError ? (
              <>
                <path d="M6 2v4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/>
                <circle cx="6" cy="9.5" r="1" fill="#fff"/>
              </>
            ) : (
              <path d="M2 6h8M6 2l4 4-4 4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            )}
          </svg>
        </div>

        {/* Message */}
        <p style={{ flex: 1, fontSize: '13px', fontWeight: 600, lineHeight: 1.45, margin: 0 }}>
          {toast.message}
        </p>

        {/* Close button */}
        <button
          onClick={() => onRemove(toast.id)}
          style={{
            flexShrink: 0,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'inherit',
            opacity: 0.6,
            padding: '2px 4px',
            borderRadius: '6px',
            fontSize: '14px',
            lineHeight: 1,
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ height: '3px', background: 'rgba(0,0,0,0.1)', position: 'relative' }}>
        <div
          style={{
            height: '100%',
            width: `${progress}%`,
            background: isError ? 'var(--red, #f43f5e)' : 'var(--mint)',
            borderRadius: '0 0 0 14px',
            transition: 'width 0.1s linear',
          }}
        />
      </div>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType) => {
    const id = crypto.randomUUID();

    // Add with visible=false so we can trigger entrance transition
    setToasts(prev => [...prev, { id, message, type, createdAt: Date.now(), visible: false }]);

    // Trigger entrance transition on next frame
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setToasts(prev => prev.map(t => t.id === id ? { ...t, visible: true } : t));
      });
    });

    // Schedule exit: mark invisible first, then remove from DOM
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, visible: false } : t));
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 400); // wait for exit animation
    }, DURATION);
  }, []);

  const removeToast = useCallback((id: string) => {
    // Animate out then remove
    setToasts(prev => prev.map(t => t.id === id ? { ...t, visible: false } : t));
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 400);
  }, []);

  // success is a no-op — errors only
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const success = useCallback((_msg: string) => { /* success toasts are suppressed */ }, []);
  const error = useCallback((msg: string) => addToast(msg, 'error'), [addToast]);
  const info = useCallback((msg: string) => addToast(msg, 'info'), [addToast]);

  return (
    <ToastContext.Provider value={{ success, error, info, removeToast }}>
      {children}
      <div
        style={{
          position: 'fixed',
          top: '16px',
          right: '16px',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          width: '360px',
          maxWidth: 'calc(100vw - 32px)',
          pointerEvents: 'none',
        }}
      >
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
