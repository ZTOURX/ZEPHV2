/**
 * Unified Header Design Tokens
 *
 * Single source of truth for every sizing, spacing, and typography value
 * shared across all four header regions:
 *
 *   1. Landing Page Header          (Layout.tsx)
 *   2. Main Dashboard Header        (DashboardLayout.tsx)
 *   3. Admin Dashboard Header       (AdminSidebarLayout.tsx — content strip)
 *   4. Admin Sidebar Header         (AdminSidebarLayout.tsx — sidebar strip)
 *
 * A single change here propagates atomically to every header surface.
 */

// ─── Structural ────────────────────────────────────────────────────────────

/** Vertical footprint: 64 px — standard header height. */
export const H_HEIGHT = 'h-16' as const

/** Horizontal padding on all nav / header containers. */
export const H_PX = 'px-6' as const

/** Desktop sidebar width (admin). */
export const H_SIDEBAR_WIDTH = 'w-64' as const

// ─── Logo & Brand ──────────────────────────────────────────────────────────

/** Cat logo icon dimensions. */
export const H_LOGO_ICON = 'h-5 w-5' as const

/** Brand / page-title typography. */
export const H_BRAND_TEXT = 'text-label-lg font-semibold' as const

// ─── Desktop Navigation Items ──────────────────────────────────────────────

/** Base classes for desktop horizontal nav links (colours applied per-component). */
export const H_NAV_ITEM =
  'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-label-lg font-medium transition-colors duration-fast' as const

// ─── Mobile Navigation Items ───────────────────────────────────────────────

/** Base classes for mobile drawer nav links (full-width touch targets). */
// Mobile nav — text-label-lg matches the unified header text scale
export const H_NAV_ITEM_MOBILE =
  'flex items-center gap-3 w-full px-4 py-3 rounded-xl text-label-lg font-medium transition-colors duration-fast' as const

// ─── User / Admin Avatar ───────────────────────────────────────────────────

/** Circular avatar dimensions. */
export const H_AVATAR = 'h-9 w-9' as const

/** Typography inside avatar circle and dropdown header. */
export const H_AVATAR_TEXT = 'text-label-lg font-semibold' as const

// ─── Dropdown Menu Trigger ─────────────────────────────────────────────────

/** User menu trigger button classes (layout + spacing only). */
export const H_MENU_TRIGGER =
  'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-label-lg font-medium' as const

/** Chevron icon in menu triggers. */
export const H_CHEVRON = 'h-4 w-4' as const

// ─── Sidebar Navigation (Admin) ────────────────────────────────────────────

/** Admin sidebar nav item classes. */
export const H_SIDEBAR_NAV =
  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-label-lg font-medium transition-colors duration-fast' as const

/** Icon size inside sidebar nav items. */
export const H_SIDEBAR_ICON = 'h-4 w-4 shrink-0' as const

// ─── Dropdown Panel ────────────────────────────────────────────────────────

/** Dropdown menu item row classes. */
export const H_DROPDOWN_ITEM =
  'w-full flex items-center gap-3 px-4 py-2.5 text-label-lg text-left transition-colors duration-fast' as const

/** Icon size inside dropdown rows. */
export const H_DROPDOWN_ICON = 'h-4 w-4 shrink-0' as const
