# Starkies Design System (ds)

## Purpose

The admin and public catalog share foundational design tokens and iconography, but **they do not share a visual theme**. Keep product-specific palettes and distinctive brand typography at the app level; reuse scales, interaction states, accessibility conventions, and primitive styles from `libs/shared/src/lib/ds`.

## Shared foundation

- `tokens.ts`: typed constants for semantic colors, spacing, control sizes, shape, typography, and elevation.
- `ds.css`: CSS custom properties and opt-in primitive classes (`.ds-button`, `.ds-icon-button`, `.ds-field`, `.ds-surface`) plus Google Material Symbols Rounded via `.ds-icon`.
- `public-api.ts`: exports the token constants for Angular consumers.
- Both apps import the shared CSS from their global stylesheet and override semantic color tokens independently.

## Quick UI inventory and Material mapping

### Admin app (`apps/admin`)

- **Sidebar navigation**: currently uses Lucide Angular icons and custom anchors. Move to Material Symbols Rounded ligatures and preserve Angular Router active-state behavior, accessible labels, and the current admin-specific palette.
- **Buttons and icon buttons**: many bespoke button classes. Standardize height, shape, focus ring, disabled state, and spacing using shared button primitives; keep destructive actions semantically distinct.
- **Recipe/product cards and menus**: custom cards, three-dot menu/popover, and action rows. Reuse shared shape/elevation/spacing; use Material menu patterns for action menus, including a clear destructive action.
- **Forms and editors**: native inputs/selects/textareas can use shared field sizing, outline, focus, and error tokens. Keep native semantics and existing validation.
- **Dialogs/overlays and status badges**: normalize overlay elevation, shape, and status colors. Avoid changing route-based editors into dialogs; preserve current navigation behavior.
- **Tables/lists and page structure**: standardize spacing, dividers, row heights, and typography, without changing data workflows.
- **Top bar/breadcrumb**: use shared typography, muted text, and spacing; preserve route-derived breadcrumb labels.

### Public catalog (`apps/catalog`)

- **Product cards and product imagery**: standardize shared radius, border, and spacing only where compatible; retain catalog's warmer lilac/cream theme and brand-specific presentation.
- **Order sheet / modal**: custom animated bottom sheet with sticky heading/footer. Reuse shared shape, elevation, motion, and focus tokens, but keep the established responsive layout and open/close animations.
- **Buttons and quantity/choice controls**: use the same interaction dimensions and focus conventions as admin while retaining the catalog palette and touch-friendly sizing.
- **Inputs and form fields**: use shared field foundations while preserving order form behavior, mobile layout, and validation feedback.
- **Icons**: migrate decorative/action iconography to Material Symbols Rounded consistently; keep meaningful accessible names and hide purely decorative icons from assistive technology.
- **Typography**: use shared size/line-height tokens for utility text, but preserve the catalog's existing DM Sans and Playfair Display brand treatment where intentional.

## Migration guardrails

1. Share tokens and low-level primitives; do not force a single palette or typography theme on both apps.
2. Prefer Google Material Symbols Rounded for icons. The `.ds-icon` element uses the icon's ligature text (for example, `<span class="ds-icon" aria-hidden="true">inventory_2</span>`).
3. Adopt primitive classes incrementally component-by-component. Avoid a blanket class replacement that could alter layout, interaction, routing, or responsive behavior.
4. Preserve semantic HTML, keyboard navigation, visible focus, accessible names, disabled states, and error/destructive states.
5. This audit is based on the shared/global styles, root layouts, admin sidebar/topbar, and public order-sheet styles inspected for this change. It is an initial migration inventory, not a claim that every individual page/component has already been migrated.
