/**
 * Network / Offline Error
 *
 * Displayed when the REST API is entirely unreachable or the user's device
 * has lost internet connectivity. Can be rendered as a full-page fallback
 * or mounted inline where API-dependent content would normally appear.
 *
 * Isolation guarantees — identical to InternalServerError:
 *   - No context providers required
 *   - No API calls (by definition — the network is down)
 *   - Inline SVG, native <a> / window.* only
 *   - Retries via window.location.reload() — no framework dependency
 *
 * Usage (router errorElement or inline conditional):
 *   errorElement: <NetworkError />
 *   {isOffline && <NetworkError />}
 */

interface NetworkErrorProps {
  /**
   * When true, renders in a compact card format rather than a full viewport
   * layout. Useful for inlining inside a dashboard widget or data table area.
   * @default false
   */
  inline?: boolean
}

export default function NetworkError({ inline = false }: NetworkErrorProps) {
  const wrapperClass = inline
    ? 'flex flex-col items-center justify-center py-16 px-6 text-center'
    : 'min-h-screen flex flex-col items-center justify-center bg-surface text-on-surface px-6 py-16'

  return (
    <div role="main" className={wrapperClass}>
      {/* Icon */}
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-container text-on-surface-variant">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
      </div>

      {/* Label */}
      <p className="text-label-md font-semibold text-on-surface-variant uppercase tracking-widest mb-2">
        No Connection
      </p>

      {/* Headline */}
      <h1 className="text-headline-sm font-medium text-on-surface text-center mb-3">
        You&apos;re offline
      </h1>

      {/* Description */}
      <p className="text-body-md text-on-surface-variant text-center max-w-sm mb-8">
        Check your internet connection and try again. Your data is safe and
        will sync automatically when you&apos;re back online.
      </p>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-label-lg font-medium bg-primary text-on-primary hover:opacity-90 transition-opacity duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          Try again
        </button>
        {!inline && (
          <a
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-label-lg font-medium border border-outline text-on-surface hover:bg-on-surface/[var(--state-hover-opacity)] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Back to home
          </a>
        )}
      </div>
    </div>
  )
}
