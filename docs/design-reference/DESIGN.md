---
name: Trukindo Blue & White Corporate Design System
colors:
  corporate-blue: '#123B70'
  deep-blue: '#0B2D52'
  interactive-blue: '#1D5FA7'
  bright-blue: '#2F80D1'
  pale-blue: '#EAF3FF'
  main-white: '#FFFFFF'
  soft-white: '#F7FAFE'
  light-blue-gray: '#EEF3F9'
  border: '#D7E2EF'
  primary-text: '#172B45'
  secondary-text: '#60738A'
  success: '#15803D'
  warning: '#B45309'
  error: '#B91C1C'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.375rem
  md: 0.5rem
  lg: 0.75rem
  xl: 1rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-tablet: 1.5rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Visual Identity & Ethos

The **Trukindo Blue & White Design System** defines the modern corporate identity for PT Trukindo Logistik Prima. Tailored for enterprise B2B logistics, linehaul transport, and dedicated freight solutions, the aesthetic projects operational confidence, institutional reliability, and clarity.

Key Visual Characteristics:
- **Modern Corporate:** Clean alignments, crisp white surfaces, and deep corporate blue structural hierarchy.
- **Enterprise B2B Focus:** Professional and trustworthy, avoiding flashy consumer gradients or distracting decorative noise.
- **Controlled Restraint:** Depth is communicated strictly via hairline borders (`#D7E2EF`), pale blue tinting (`#EAF3FF`), and subtle micro-shadows.
- **Dominant Blue & White:** Primary actions, navigation, interactive states, and headers are grounded in blues and whites. Old amber/orange accents are eliminated from default brand chrome.

## Color System

The color system enforces strict semantic discipline across all public and operational views.

### Primary Blue
- **Corporate Blue (`#123B70`):** Core corporate brand identity, top-level navigation elements, section headings, and primary brand badges.
- **Deep Blue (`#0B2D52`):** Primary footer background, dark topbars, hero headlines, and structural anchors.
- **Interactive Blue (`#1D5FA7`):** Primary action buttons, active navigation indicators, key interactive triggers, and link hovers.
- **Bright Blue (`#2F80D1`):** Hover states, active highlights, and micro-accent indicators.
- **Pale Blue (`#EAF3FF`):** Selected cards, informational callouts, pill backgrounds, and soft accent containers.

### White & Neutrals
- **Main White (`#FFFFFF`):** Primary card surfaces, modal dialogs, and public navigation header.
- **Soft White (`#F7FAFE`):** Base canvas background for all public pages.
- **Light Blue Gray (`#EEF3F9`):** Secondary containers, summary sidebars, and spec table headers.
- **Border (`#D7E2EF`):** Hairline structural borders, input outlines, and section dividers.
- **Primary Text (`#172B45`):** High-contrast body typography, card titles, and data values.
- **Secondary Text (`#60738A`):** Supporting metadata, unit indicators (kg, CBM, FTL), timestamps, and helper descriptions.

### Semantic Colors
- **Success (`#15803D`):** Reserved exclusively for verified carrier compliance, Zero ODOL adherence, completed form steps, and confirmed submission states.
- **Warning (`#B45309`):** Reserved for operational alerts, manual review requirements, and non-blocking validation notices.
- **Error (`#B91C1C`):** Form validation errors, required field indicators, and transmission failures.

## Typography

Plus Jakarta Sans provides geometric rigor and high legibility across dense logistics specifications and quote generation workflows:

- **Tabular Alignment:** When rendering capacity, curb weights, cubic meters (CBM), currency figures (IDR), and license plates, standard monospace/tabular numeral open-type features (`font-variant-numeric: tabular-nums;`) are enforced.
- **Hierarchy Rules:** Hero headlines use `headline-xl` (`2.5rem` / `40px`), section headers use `headline-lg` (`1.75rem` - `2rem`), and cards use `headline-sm` (`1.125rem` - `1.25rem`).
- **Tracking & Weighting:** Small labels and pill badges (`label-sm`, `label-md`) feature semi-bold or bold weights with `0.05em` letter-spacing for instantaneous recognition.

## Layout & Responsive Cadence

The design system operates on an 8pt spatial cadence across a modular responsive grid:

- **Desktop (1200px+):** 12 columns, 24px gutters, max-width containers capped at 1280px (content views capped at 1080px).
- **Tablet (768px - 1199px):** 8 columns, 16px gutters, 24px margins. Forms and summaries stack gracefully.
- **Mobile (320px - 767px):** Single column fluid flow, 16px margins, sticky bottom bars for critical multi-step actions. No horizontal overflow.

## Components & Interactive States

### Buttons & CTAs
- **Primary CTA (`.btn-primary`):** Solid Interactive Blue (`#1D5FA7`) background, white text, 6px radius (`rounded-md`).
  - *Hover:* `#123B70` (Corporate Blue)
  - *Active:* `#0B2D52` (Deep Blue)
  - *Focus-Visible:* `0 0 0 3px rgba(29, 95, 167, 0.25)`
  - *Key Use Cases:* "Minta Penawaran", "Lanjut ke Spesifikasi", "Kirim Permintaan Penawaran".
- **Secondary CTA (`.btn-secondary`, `.btn-outline`):** White background, `#D7E2EF` border, `#172B45` text. Hover: `#EEF3F9` surface with `#1D5FA7` border and text.
- **Tertiary Links:** Interactive Blue (`#1D5FA7`) typography with hover to Bright Blue (`#2F80D1`) and underline.

### Service & Cargo Selection Cards (`.form-card-selectable`)
- **Default State:** Main White (`#FFFFFF`) surface, 1px solid `#D7E2EF` border, rounded 8px.
- **Hover State:** Soft `#F7FAFE` surface with `#2F80D1` border highlight.
- **Selected State:** Pale Blue (`#EAF3FF`) background, 2px solid `#1D5FA7` border, `#123B70` heading, and `#1D5FA7` check indicator.
- **Focus-Visible:** Outline `2px solid #1D5FA7` with `2px offset`.

### Form Inputs & Select Controls (`.form-input`)
- **Default State:** `#FFFFFF` background, 1px solid `#D7E2EF` border, `#172B45` text, `#60738A` placeholder.
- **Focus State:** Border `#1D5FA7`, box-shadow `0 0 0 3px rgba(29, 95, 167, 0.15)`.
- **Validation Error:** Border `#B91C1C`, box-shadow `0 0 0 3px rgba(185, 28, 28, 0.12)`.

### Multi-Step Progress Indicator
- **Completed Steps:** `#15803D` (Semantic Success) circle with white checkmark.
- **Active Step:** `#1D5FA7` (Interactive Blue) circle with white step number and subtle blue ring.
- **Upcoming Steps:** `#EEF3F9` surface with `#D7E2EF` border and `#60738A` number.
- **Progress Track:** `#EEF3F9` base rail with `#1D5FA7` filled progress bar matching actual completed ratio.

### Commercial Truck Gallery & Case Studies
- Vehicles displayed in authentic, unbranded commercial logistics photography without destructive color filters.
- Frames use Main White (`#FFFFFF`) cards with hairline `#D7E2EF` borders.
- Labels explicitly distinguish verified operational capabilities from illustrative logistics scenario planning.