# Implementation notes

Implemented 2026-10-21, following the [original plan](implementation-plan.md).
The frontend and solver remain independent; the application is a static build
with calculation workers and session-only saved results.

## Review findings addressed

| Finding | Resolution | Regression coverage |
| --- | --- | --- |
| R1 wind arguments | Helpers consistently accept speed then direction; cardinal wind behavior is correct. | Calm direction independence, cardinal components, opposite drift signs. |
| R2 invalid inputs/hangs | Strict numerical validation, explicit drag failures, bounded RK4 integration/search, physical termination metadata and a worker watchdog. | Invalid/empty/NaN/string inputs; step/time/model limits; unreachable zeros. |
| R3 fractional indices | Validated integer legacy accessors plus `sampleAt()` with exact-distance interpolation and explicit missing values. | Fractional meters/yards, exact endpoints, wrong-column lookup rejection. |
| R4 time/state alignment | Coherent distance-based RK4 state; time and all velocity components refer to the same position. | Analytic vacuum position/time/velocity and refinement checks. |
| R5 wind units | Headwind mph is converted to ft/s before drag evaluation; lateral lag calculation retains its explicit mph conversion. | Captured drag-evaluation airspeed and unit identities. |
| R6 zero convergence | Bracketed low-angle search at exact target distance with reachability and height-residual checks. | Reachable and unreachable zeros, exact-distance intercept. |
| R7 intercept units | Explicit optional intercept is converted from inches to feet once. | Positive, zero and negative offsets. |
| R8 globals/strict mode | Declared locals, intentional constructor-only classic global, module wrapper and production worker integration. | Isolated VM/global checks, Node entry, production browser tasks. |
| R9 muzzle angles | Angular corrections are missing at zero; muzzle time and drift are zero. | Numerical muzzle identities and browser table em dashes. |
| R10 zero/stale edits | Separate draft/result state, whole-snapshot validation; legacy example now parses its complete snapshot and marks stale results. | Zero sight height, invalid BC/empty mass, saved-snapshot independence. |
| R11 range semantics | Named range/sample metadata, bounded requested coverage and an explicit inclusive endpoint/record-capacity contract. | Capacity, fractional endpoints, missing coverage and table bounds. |

The gravity decomposition was also corrected to use the sight-axis inclination,
rather than adding bore elevation again. An inclined analytic no-drag test
checks this coordinate contract.

## Architecture

- `src/external-ballistics.js`: strict classic/CommonJS-compatible numerical port
  with unchanged GNU drag coefficients. The module entry is
  `src/ballistics/core.js`; TypeScript declarations describe its units/API.
- `src/ballistics/units.ts`: conversion definitions, independent preferences and
  presentation formatting. Canonical values are not repeatedly rounded.
- `src/ballistics/model.ts`: validated SI scenarios, the single legacy-unit
  boundary, coherent SI sampling, energy and bounded shared-distance grids.
- `src/calculators/`: refined crossing events, first downward energy crossing,
  and low-angle point-blank optimization with a complete corridor check.
- `src/workers/`: typed complete requests, results and structured failures.
  `src/app/worker-client.ts` owns worker termination/recreation, response IDs,
  cancellation and a 20-second watchdog.
- `src/app/store.ts`: independent immutable numerical snapshots, with editable
  comparison names, identities and visibility kept separately.
- `src/app/plots.ts` / `table.ts`: three numerical-axis charts and grouped
  exact-distance tables. Chart-only sampling is capped at 701 points per series;
  tables and calculators use the full result data.
- `src/app/main.ts` / `styles.css`: responsive plain TypeScript/HTML/CSS interface,
  field units, form validation, comparison controls, calculator results and notes.

## Numerical accuracy and work limits

The solver integrates height, time and velocity against downrange distance using
RK4 with a default 1.5-foot internal step. It stores coherent states every yard,
plus the actual final endpoint. Cubic Hermite interpolation uses the matching
velocities/accelerations to evaluate arbitrary distances without relabeling yard
indices or extrapolating. Magnitude and energy are derived from the sampled
velocity components.

Zeroing uses a level/calm reference, with a residual tolerance of 10⁻⁷ feet.
Shot wind and inclination apply after that reference zero is established. The
point-blank calculator integrates explicit angles with the chosen shot conditions,
refines extrema/crossings, and records the optimized angle in its saved result.
Energy and path events refine distance brackets to 10⁻⁶ m, subject to trajectory
interpolation accuracy; this is a numerical search tolerance, not a claim of
micrometer-level physical accuracy.

For the tested 2,650 ft/s / BC 0.465 cases at 1,000 yards, reducing the internal
step from 1.5 to 0.375 feet agrees within 0.06 ft/s, 0.015 inches and 0.00003 s
across all six models. Tests enforce those quantity-specific bounds. Analytic
vacuum tests use much tighter tolerances. C comparisons use broader 0.6 ft/s,
0.2-inch and 0.0006-second bounds to account for known historical integration,
sampling and zero-search differences; they do not define the new solver's error.

Core limits include 250,000 integration steps by default, 60 seconds of flight,
positive forward progress, supported relative airspeed, and a forward-slope
limit. The UI bounds requests to 10,000 m and output grids to 2,000 rows. Model
limits may shorten coverage. The classic API's default request is 2,000 yards;
its record capacity includes the muzzle. The worker watchdog is separate from
the modeled flight-time limit.

On this development machine, an illustrative warmed/basic reference solve was
tens of milliseconds, energy-event refinement took around 10 ms, and a 2,000 m
point-blank optimization completed in roughly 0.2–1.5 seconds depending on
concurrent test load. These are local observations, not performance guarantees.

## Verification

- Numerical/domain/legacy regression suite, including all reviewed findings.
- Pinned C source and regenerated fixtures for six models and 60 drag cases.
- Analytic no-drag straight/inclined trajectory and point-blank cases.
- Production typecheck/build with pinned dependencies and lockfile.
- Production browser workflows in Chromium, Firefox and WebKit, including mixed
  units, overlays, both calculators, malformed and zero input, coverage, worker
  cancellation/recovery, responsive layout, keyboard use and safe text handling.
- Desktop/mobile screenshots inspected during browser QA. The new frontend's
  asset requests stay on the local origin; no runtime CDN dependencies are used.

Final verification: `npm test` passed all 29 tests; `npm run build` passed with
TypeScript checking; Playwright passed all 27 workflows across Chromium,
Firefox and WebKit. JavaScript syntax and documentation link checks also passed.
The historical legacy
Vue rendering is not covered by the new app's browser suite; its calculation
handling is covered in an isolated VM regression and its Vuetify version is pinned.

## Deliberate scope boundaries

Session memory is the persistence mechanism. Refreshing clears saved solutions.
There is no projectile database, export/import or backend. Increasing the display
window reformats existing coverage; recalculating and saving makes a longer
solution. Energy searches may independently calculate further with the same saved
bore angle. Optimized point-blank results are saved as a new solution.

The model retains approximate crosswind deflection and has no atmosphere,
spin drift or Coriolis correction. The UI describes these limits and the
line-of-sight distance/sign conventions. Numerical tests do not certify agreement
with a particular firearm, ammunition lot or real-world trajectory.
