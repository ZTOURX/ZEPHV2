/**
 * 500 Internal Server Error
 *
 * Fault-tolerant fallback. Used as the React Router errorElement on top-level
 * routes so it catches uncaught loader/action throws and render-phase errors.
 *
 * Isolation guarantees:
 *   - No useContext / useRouteError calls that could re-throw
 *   - No API calls or dynamic data fetching
 *   - No complex state management
 *   - Inline SVG icon — zero icon-library dependency
 *   - Native <a> / window.location for navigation — no React Router required
 *
 * Safe to render even when the broader application state has crashed.
 */
export default function InternalServerError() {
  return (
    <div
      role="main"
      className="min-h-screen flex flex-col items-center justify-center bg-surface text-on-surface px-6 py-16"
    >
      {/* Icon */}
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-error-container text-on-error-container">
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
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>

      {/* Status code */}
      <p className="text-label-md font-semibold text-error uppercase tracking-widest mb-2">
        500
      </p>

      {/* Headline */}
      <h1 className="text-headline-sm font-medium text-on-surface text-center mb-3">
        Something went wrong
      </h1>

      {/* Description */}
      <p className="text-body-md text-on-surface-variant text-center max-w-sm mb-8">
        An unexpected error occurred on our end. The team has been notified.
        Try refreshing, or come back in a moment.
      </p>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-label-lg font-medium bg-primary text-on-primary hover:opacity-90 transition-opacity duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          Refresh page
        </button>
        <a
          href="/"
          className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-label-lg font-medium border border-outline text-on-surface hover:bg-on-surface/[var(--state-hover-opacity)] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          Back to home
        </a>
      </div>
    </div>
  )
}
