---
name: Habits native
description: Native habit tracking with close-set rounded surfaces and clear system typography.
colors:
  canvas: "#0c1011"
  surface: "#f8f8f8"
  chip: "#ffffff"
  text: "#101213"
  secondary: "#606466"
  selected: "#e7e7e7"
  pink-start: "#ffe7ed"
  pink-end: "#f9c4d6"
  green-start: "#eefadc"
  green-end: "#e0f2c9"
  blue-start: "#deefff"
  blue-end: "#cce7ff"
  on-pastel: "#121612"
  pink-text: "#795460"
  green-text: "#576c47"
  blue-text: "#315e7b"
  accent: "#458d0c"
  error: "#a6292e"
  surface-dark: "#242627"
  chip-dark: "#303334"
  text-dark: "#f7f8f8"
  secondary-dark: "#bdc4c6"
  selected-dark: "#464a4b"
  pink-start-dark: "#593846"
  pink-end-dark: "#714050"
  green-start-dark: "#354630"
  green-end-dark: "#415a32"
  blue-start-dark: "#25475d"
  blue-end-dark: "#295572"
  on-pastel-dark: "#f9faf7"
  pink-text-dark: "#f4dbe4"
  green-text-dark: "#d3e7c5"
  blue-text-dark: "#d3eafa"
  accent-dark: "#a3d55c"
  error-dark: "#ffb4ab"
typography:
  display:
    fontSize: "34px"
    fontWeight: 700
    letterSpacing: "-1px"
  page-title:
    fontSize: "36px"
    fontWeight: 700
    letterSpacing: "-0.7px"
  title:
    fontSize: "20px"
    fontWeight: 600
    letterSpacing: "-0.4px"
  heading:
    fontSize: "21px"
    fontWeight: 600
    letterSpacing: "-0.3px"
  body:
    fontSize: "17px"
  caption:
    fontSize: "14px"
rounded:
  field: "14px"
  button: "16px"
  chip: "22px"
  card: "26px"
  dock: "28px"
spacing:
  gutter: "6px"
  row-gap: "12px"
  button-padding: "14px"
  card-padding: "16px"
  water-padding: "17px"
  page-padding: "22px"
  dock-padding: "16px"
components:
  button:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.text}"
    rounded: "{rounded.button}"
    padding: "{spacing.button-padding}"
    height: "48px"
  field:
    textColor: "{colors.text}"
    rounded: "{rounded.field}"
    padding: "12px"
    height: "48px"
  card:
    rounded: "{rounded.card}"
    padding: "{spacing.card-padding}"
  category-chip:
    backgroundColor: "{colors.chip}"
    textColor: "{colors.text}"
    rounded: "{rounded.chip}"
    padding: "9px 8px"
  dock:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.dock}"
    padding: "0 16px"
---
# Design System: Habits native

The profile integration menu uses the approved C proposal: a native form sheet
above the profile, with a grabber, a close control and two detents (50% and 85%).
Strava and Home Assistant retain their original service icons and colors;
the surrounding surface, labels and connection states follow the app theme.
Service settings replace the list inside the same sheet and provide a back control.

## Overview

Habits uses a flat, close-set family of rounded surfaces, native symbols and standard system type. This documents the implemented Expo / React Native system, with the user-approved V4 home as its current expression. The visual direction is the approved card composition; no additional creative metaphor has been confirmed.

The black canvas gives pale surfaces their boundaries. Meaning comes from labels, quantities and accessible states as well as color. French text and server-supplied progress retain their real meaning, including rest days and missing data.

Key characteristics:

- Narrow dark gutters, generous corners and compact actions.
- Native, non-rounded system typography and platform symbols.
- Light and dark palettes selected by the system or the saved local appearance preference.

## Colors

### Primary

Blue identifies hydration through its gradient, chart marks and period selection. Green marks completion and the compact add action. These are contextual accents, not a single universal brand-button color.

### Secondary

Pink is the progression-card surface; green is regularity. Each uses the start/end pair from the frontmatter and its matching text color. Category symbols use sport pink, mind purple, daily amber and nutrition green in the implementation; their labels remain visible.

### Neutral

Canvas stays anthracite in both schemes. Surface is off-white in light mode and charcoal in dark mode; chip, selected, text and secondary each have a dark counterpart. On-pastel and the three card-text roles also switch with the scheme. Error uses the error role. The amber streak badge is a small functional accent.

**The System Scheme Rule.** Use `useTheme()` rather than carrying a light surface or dark text into a dark screen. Gradient pairs are two-stop surfaces, not invented tonal scales.

## Typography

React Native supplies the default platform font: standard SF on iOS and the native Android default, normally Roboto. There is no explicit custom font family or rounded font face. Frontmatter sizes use portable `px` strings to represent native logical points; they are baseline sizes, not fixed physical pixels. Component height tokens encode the implemented minimum heights, not fixed clipping heights. Native text scaling remains enabled and no explicit line-height scale is imposed.

Display is the home title; page-title serves other page headings. Title serves metric-card headings. Heading serves secondary page headings; body is the shared Copy default; caption serves supporting labels. Local home overrides include habit names at 19/600, supporting habit quantities at 16, metric values at 20/600 with tabular numerals, and hydration quantity at 36/600. Percentages use a nonbreaking space and French quantities use locale formatting.

**The Native Type Rule.** Keep the standard non-rounded platform face and allow larger text to reshape the layout.

## Layout

Shared pages and home are centered with a maximum content width of 700 logical points. The canvas remains visible around the cards. The home ScrollView uses 6-point padding and gaps; card rows also use the gutter token. Shared pages use page-padding inside a rounded surface.

Home currently has one upper panel, a two-card metric row and a separate hydration card. This composition belongs to `.impeccable/surfaces/app-tsx.md`, not a requirement for every future screen. Card heights use the full measured viewport minus the dock height and 24 points for padding and gaps. The upper panel includes the top safe area and uses 53% of that space (360 points on tablets); metrics use max(154, 25%); hydration uses max(156, 22%). These minimums allow larger text to grow and scroll.

The compact layout activates below 380 points wide, above fontScale 1.2, or when the measured first home-title line exceeds 51 points high. It stacks categories, metrics and hydration subregions and moves the streak below the title. These are the actual current layout conditions, not generic device breakpoints.

The root Stack disables native scroll-edge effects. `ScrollViewport` uses a standard View without a status-bar overlay; the experimental ScrollViewMarker must not be mounted. `DeviceInsetsProvider`, above the root Stack and NativeTabs, captures physical window safe areas so tab-local insets cannot double-count the native tab bar or remove top spacing. Home uses the physical top inset plus 12 points. Status-bar appearance still requires verification on a physical device. The dock is a rounded backdrop, white in light mode and #0c1011 in dark mode, below the real iOS system tab bar supplied by Expo Router NativeTabs. Native tab glyphs follow the theme text color. Other platforms retain the React Native dock. Neither `@expo/ui` nor `expo-glass-effect` is used. The dock overlays full-height scrolling content; its height is `56 + max(physicalBottomInset, 8)` points (90 for a 34-point bottom inset), excluding tab-local bar height. Scroll content reserves that height plus a 6-point end gutter so final controls remain reachable. Home places a decorative sparkle and “Même les habitudes prennent une pause.” as a fixed sibling after ScrollViewport at physical top inset + 20 points, excluded from accessibility. It stays on the black background without translation; a native-driven opacity interpolation reveals it between overscroll distances of physical top inset + 96 and + 140 points, without React state updates on scroll. The ScrollView remains the first native descendant found by the Stack. Upper panels account for the native top inset. The system owns gesture/navigation indicators; the app does not draw an imitation home indicator.

## Elevation & Depth

No shadows are defined in the shared native components or home. Depth comes from the anthracite gaps, pale two-stop gradients, selected fills and typography. Do not add ambient elevation to reproduce the current system.

## Shapes

Card corners use card radius; dock and shared page surfaces use dock radius. The home panel’s two top corners and the dock’s two bottom corners use continuous curves. On iOS phones their radius approximates the inset display contour with `clamp(28, topInset - 6, 60)` logical points; iOS does not expose the physical display radius through React Native. Tablet columns and Android keep 28-point exterior corners. Buttons, fields and chips retain their distinct smaller radii. Metric surfaces clip chart overflow. Shared inputs use a one-point border in the implemented neutral stroke. Pills use rounded silhouettes without turning the typography into a rounded face.

## Components

### Buttons

Shared Button uses selected fill, centered semibold body text and a minimum height of 48 points. Danger changes text to the error role. Pressed opacity is 0.65 and disabled opacity is 0.45; native disabled state is exposed. Home has a compact add pill with a green plus circle, and a permission-dependent disabled state.

### Inputs / Fields

The shared input style uses field radius, a one-point neutral border, 12-point padding, body size and a minimum height of 48 points. Focus visuals are not centralized in this style; do not claim an implemented custom focus ring or validation animation.

### Chips

Category controls use chip fill and selected fill, with visible names and percentage values. They act as toggle filters, reset pagination on change and expose selected state. They become rows in compact layout.

### Cards / Containers

Progression, regularity and hydration use their own gradient pair and matching text roles. Charts reflect data availability: missing history is not drawn as zero. Home and Progression share a bounded monotone cubic curve: joins are smooth, values do not overshoot their samples, and missing dates split the line. Demo charts derive from simulated entries rather than decorative UI values. Habit rows have native category symbols, readable labels and quantities, no nested subcards or separators. Each home page shows at most three habits.

### Navigation

Expo Router owns routes, history and tab focus. On iOS, NativeTabs renders the real system tab bar with Accueil, Aujourd’hui, Progression and Profil above the theme-aware Dock backdrop. It does not minimize automatically and is hidden before authentication. Native tabPress events synchronously snapshot cached visible card geometry before system selection; native tab focus runs the restrained card morph described below. Other platforms use the shared React Native Dock with accessible tab labels/states, 29-point symbols and minimum 48-point targets. The dock has no pagination dots. Previous/next controls with 44-point-wide targets and a page count sit beside Ajouter in the upper panel when there are multiple pages. Native safe-area padding sits below destinations.

Native iOS tab selection snapshots cached card rectangles and the current scroll offset synchronously before focus changes; layout measurements populate that cache without delaying navigation or remounting after a late callback. The React Native dock and programmatic Home → Progression links retain their asynchronous source capture. White surfaces match by role; pastel cards match by their actual palette, so pink, green and blue stay associated across screens. Both the surface and its gradient animate their actual height over 300 ms with cubic ease-out and opacity from 0.98 to 1. Width and origin stay fixed, and captured starting heights remain within ±12% of the destination. A visible card without a matching source gets a local 108%-to-100% height entrance. Source and destination visibility excludes the dock and thin exposed edges (less than 48 pt per axis, or the full dimension for smaller cards); offscreen cards do not animate. No modal, snapshot image or shared tag is used in this tab transition. Focus remounts native surfaces, retaining owning-screen React state while child native scroll positions may reset. Reduced motion is observed reactively and defaults to enabled until the native preference is known; it disables both captured morphs and local entrances. Deep links and system back do not capture source geometry.

### Hydration

The native card combines an accessible history heatmap, week/month selection, a vector bottle/glass illustration and the current quantity. The period segments have minimum 44-point height. Quantity opens the real habit action flow; absence of a hydration habit offers creation. Values come from the connector and confirmed server state.

The sidecar previews translate native components into static HTML/CSS for inspection only; they are not replacement runtime components. Native pressed states are represented by CSS active states; no unimplemented hover, motion or focus styling is prescribed.

## Do's and Don'ts

- Do reuse `native-ui.tsx` theme and shared components and keep Expo Router navigation.
- Do preserve dynamic text, accessible labels/states and at least the existing touch-target dimensions.
- Do keep the approved home geometry and system-owned safe areas.
- Don't draw a custom iOS home indicator or ship a raster mockup as an interactive screen.
- Don't turn missing data into fabricated zeroes or demo numbers into real results.
- Don't implement the separate Today proposals until the user chooses one.

Evidence: source components in `src/presentation/native-ui.tsx`, `HomeScreen.tsx`, `home-model.ts` and native app layouts; approved `.impeccable/mocks/decision/dashboard-v4.png`; implementation captures in `.impeccable/review/phone-ios.png`, `tablet-ios.png`, `phone-ios-dark.png` and `phone-ios-large.png`. Captures are review evidence, not proof of pixel equality. The independent finish review returned ship for its focused verdict: all four requested fixes were resolved. The automated pixel gate remains unpassed (about 68% at differing native/comp aspect ratios); this is not a pixel-equality claim. The native home indicator was not visible in Expo Go; standalone system-chrome verification remains pending. Android has export evidence only, without emulator visual validation.

Habit-detail overlays keep their horizontal position and width fixed throughout the transition. Intentional horizontal day swipes remain unchanged.

### Launch splash — B “Les cartes”

The user selected B from `.impeccable/mocks/splash-v1`. `LaunchSplash` implements a full-screen, theme-aware native Modal above the app and system tab bar: three pastel bands become a small stack, then five surfaces expand into the home composition over 760 ms, followed by a 190 ms fade. `splash-model.ts` supplies the geometry, using physical window insets and the 700-point content limit. This is a decorative launch transition, not a claim that dashboard data is ready; the welcome or restored app renders underneath without waiting for authentication or network requests.

The animation runs once per root mount. Native `expo-splash-screen` holds a static black launch screen until the Modal is shown; only the animated splash hides the status bar. Reduced motion bypasses the sequence. The native preference query has a 200 ms fallback, the entire launch overlay a 2.5-second watchdog starting at mount, and teardown cancels its animations. No native rendering verification has been performed; release-build launch behavior remains to be checked on an actual device.


### Profile — A “L’essentiel”

The selected A proposal is implemented in `ProfileScreen`, re-exported by the `/profile` tab. Three close-set surfaces use the shared theme and motion: an identity panel, a green “Mon parcours” panel, and a compact settings list. Identity labels describe the session type rather than inventing a user name. Level and XP reuse the dashboard query and require both `statistics:read` and `habits:read`; loading, unavailable permission, error and retry remain explicit.

Appearance opens a native alert with System, Light and Dark choices. The preference is stored locally in SecureStore under `habits.appearance.v1` and applied through native Appearance; storage errors are shown. Connection reads the current session and origin without a health request. Advanced tools open `/console`. Fake mode offers a confirmed reset of its in-memory data; HTTP mode offers sign-out, with busy protection. Shared physical insets, scrolling under the dock, dynamic text and reduced-motion behavior remain in use. Source checks and bundle exports do not prove native layout or alert behavior.


## Progression links and proposals

The pink Home statistics card opens `/progress?section=overview`; the green regularity card and flame badge open `section=regularity`. These links reuse shared tab navigation and its vertical-only motion. Hydration still opens its habit detail. The selected Progression composition uses B’s rolling seven-/thirty-day selector, pink smooth chart and complete daily-value list. A’s green regularity card replaces B’s regularity block, and A’s category card is added without removing another section. Regularity distinguishes the 91-day record from complete days in the selected range; its heatmap, current streak and XP use dashboard values. Category percentages explicitly describe today and expand to the category’s habits, whose rows open the existing detail. Home anchors apply once per focus or section change, so changing the period does not reset scrolling. The source mockups in `.impeccable/mocks/progression-v1/` remain archived references for this implemented hybrid, not runtime images. Native rendering remains unverified.


## Habit creation — guided A, summary C

Creation follows three steps (definition, goal, rhythm), then a tappable summary.
It preserves the existing compact modal corners (18 points), 6-point canvas gap,
24-point title, native inputs and fixed action area above the keyboard. Goal and
schedule panels use existing blue/green theme roles. Personalization and advanced
settings are disclosures rather than an always-expanded form. Fields remain
editable after returning from the summary; no habit is created before confirmation.
Home Assistant reminders are visibly disabled until a successful integration read
confirms an active connection and current permission; loading and errors fail closed.
Review findings about stale permissions and name validation are resolved; native
rendering and keyboard behavior have not been verified on an actual device.


Habit creation refinement: weekday selection uses one row of seven circular initial
buttons with category tint and accessible full names. Personalization controls and
the corresponding review row are removed; defaults remain automatic. Only the
advanced disclosure remains. This supersedes the personalization disclosure above.


## Habit modification and archiving — A and C

The activity header opens a compact edit form through shared card morphing, with no
native horizontal push. It reuses creation's fields and circular weekday controls.
The effective date is inline, rather than an additional summary screen. The white
main card follows the physical upper corners and a separate green action card
contains Save. Archive is a discreet destructive row opening a dimmed confirmation
sheet with 18-point top corners, scrollable content and a red confirmation action.
Saved entries are retained; no restoration action is promised. Pending actions and
success feedback block dismissal. Native layout and gestures remain unverified.
