/**
 * 404 Not Found
 *
 * Fault-tolerant fallback. Deliberately isolated from all app contexts,
 * providers, and API calls. Uses only:
 *   - React (no hooks that touch external state)
 *   - Native <a> tags (no React Router dependency)
 *   - Inline SVG icon (no lucide-react import)
 *   - Tailwind utility classes (compiled at build time, no runtime cost)
 *
 * Renders correctly even if the router, auth context, or API is entirely down.
 */
export default function NotFound() {
  return (
    <div
      role="main"
      className="min-h-screen flex flex-col items-center justify-center bg-surface text-on-surface px-6 py-16"
    >
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
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
          <line x1="11" y1="8" x2="11" y2="11" />
          <line x1="11" y1="14" x2="11.01" y2="14" />
        </svg>
      </div>

      {/* Status code */}
      <p className="text-label-md font-semibold text-primary uppercase tracking-widest mb-2">
        404
      </p>

      {/* Headline */}
      <h1 className="text-headline-sm font-medium text-on-surface text-center mb-3">
        Page not found
      </h1>

      {/* Description */}
      <p className="text-body-md text-on-surface-variant text-center max-w-sm mb-8">
        The page you&apos;re looking for doesn&apos;t exist or may have been
        moved.
      </p>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <a
          href="/"
          className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-label-lg font-medium bg-primary text-on-primary hover:opacity-90 transition-opacity duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          Back to home
        </a>
        <button
          type="button"
          onClick={() => window.history.back()}
          className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-label-lg font-medium border border-outline text-on-surface hover:bg-on-surface/[var(--state-hover-opacity)] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          Go back
        </button>
      </div>
    </div>
  )
}
