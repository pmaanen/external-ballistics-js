# Repository guidance

## Project and current scope

The original GNU Ballistics C library was authored by Derek Yates. Harri Rissanen
created the JavaScript port; this repository is Paul Maanen's fork of that port.
Preserve this distinction in source, documentation and distributed credits.
The numerical library is in `src/external-ballistics.js`; `example_app/` contains
a historical Vue demonstration and vendored dependencies. `LICENSE` contains GPL version 2.
Preserve existing license and attribution notices.

The user has authorized implementation of the fixes and frontend. The historical
review and plan are in `docs/code-review.md` and `docs/implementation-plan.md`.
Read `docs/implementation-notes.md` for implemented contracts and verification.

The root images `1.jpeg` and `1-2.jpeg` are user-supplied design references. Preserve
them, including if they are untracked. Do not edit vendored/minified dependencies
to implement application features.

## Working practices

- Keep solver, units, application state, and rendering separate. Numerical code
  must run without a browser or UI framework.
- Prefer small, reviewable changes, with numerical fixes before UI work. Include
  a meaningful regression test with each solver fix. Do not preserve a known
  numerical defect merely to match a historical implementation.
- Preserve the existing browser-global API where practical; document intentional
  compatibility changes. Declare all variables and exercise strict/module mode.
- The frontend uses TypeScript/Vite and Chart.js with plain HTML/CSS. Pin
  dependencies and update `package-lock.json` together. Preserve the legacy Vue
  demonstration without extending its vendored dependencies.
- Do not expand the physics model silently. Atmospheric correction, spin drift,
  Coriolis, and a full three-dimensional wind integrator require separate scope.

## Numerical and unit contracts

- The existing solver uses feet internally for positions, feet per second for
  speed, yards for zero distance and legacy accessors, inches for sight height
  and reported path/drift, degrees for input angles, and seconds for time.
  Wind input is mph. Gravity is in ft/s².
- Application inputs and solution records use explicit canonical
  SI quantities, converted at the legacy solver boundary. Keep this conversion
  in one place; do not scatter constants through UI handlers.
- Support metric/imperial presets and individual field/output unit overrides.
  Changing a unit must preserve the physical value. Keep unrounded numbers in
  state and round only for presentation.
- BC belongs to a specific drag model. Do not automatically convert a G1 BC to
  a G7 BC. Bullet mass is needed for energy, not as an extra multiplier in the
  existing BC-based drag equation.
- Define path relative to the line of sight. Document wind, drift, and correction
  sign conventions. Treat distance as distance along the solver's reference
  axis; do not silently mix it with horizontal ground distance on inclined shots.
- Validate all numerical inputs for finiteness, supported models, and physical
  limits. Bound integrations and searches. Return explicit failure/termination
  information; never turn invalid drag into acceleration or missing samples
  into plausible zero-valued results.
- Every sample's distance, position, time, and velocity must describe the same
  instant. Interpolate to requested distances rather than rounding metric
  distances to legacy array indices. Do not extrapolate past a solution's end.
- Angular corrections at distance zero are undefined: represent them as missing
  and display an em dash. Muzzle time and drift are zero.
- Keep each saved solution's input snapshot and numerical result independent of
  the editable form and other solutions. Plotting/downsampling must not modify
  the data used for tables or calculators.

## Verification

Use Node 22.12 or newer (Node 24 LTS recommended) and npm. Install with `npm ci`.
The application lives in `src/app/`; the SI adapter in `src/ballistics/`; derived
calculators in `src/calculators/`; worker execution in `src/workers/`.

Required checks for changes are:

```sh
npm test
npm run build
npm run test:browser
```

`npm run build` includes TypeScript checking. Browser tests run against built
`dist/` using a temporary preview server. Install browsers first with
`npx playwright install chromium firefox webkit`. `npm run dev` starts the app;
`npm run preview` serves the production build. No external runtime assets are
needed for the new frontend. The legacy demo has pinned external Vuetify assets.
The production HTML is self-contained and must also work when opened directly
through `file://`. Preserve the inline-worker import and portable-HTML build
plugin; test offline file startup as well as the HTTP preview.

The classic file intentionally publishes only `globalThis.ExternalBallistics`;
`src/ballistics/core.js` is the module entry point. Test both direct classic-script
loading and the production worker bundle when changing this adapter. Bundlers may
recognize its CommonJS compatibility branch, so Node-only tests are insufficient.

Test wind cardinal directions, invalid inputs, solver termination, zero convergence, coherent time
and velocity samples, fractional/metric distances, conversion round trips,
independent saved solutions, and calculator boundary conditions. Use analytic
cases and attributed C fixtures with explicit tolerances; historical output is
not sufficient evidence when it contains an inherited bug.

For UI work, verify keyboard access, field labels/errors, responsive charts and
tables, mixed units, overlays, and time-to-distance. Keep runtime assets local;
avoid unversioned CDN scripts. Record what was actually tested and any limits.

## Maximum-range mode

The user authorized first impact on flat ground with configurable muzzle height
and calm wind. `src/ballistics/flight.ts` integrates in SI time to ground impact;
`src/calculators/maximum-range.ts` searches launch angle and refines energy events.
This mode uses horizontal ground distance and height above ground, separately
from the trajectory workbench's sight-line coordinates and forward-slope limit.
Report descent energy re-entry and impact energy; an energy crossing does not
establish a safe radius. Preserve explicit errors on incomplete integrations.

## Aiming and calculator source contracts

`Scenario.aimMode` retains zero-at-range/height, manual bore elevation and the
legacy maximum-ground-range tag. The trajectory UI offers only zeroing and manual
angle; maximum-range optimization belongs exclusively to its dedicated mode.
Zero height is signed path relative to the sight line at zero range; convert it to classic `yIntercept` at the SI boundary.
Disabled zero inputs are ignored in explicit-angle modes. Optimum-angle selection
uses calm wind, flat ground and a level reference with configured muzzle height.
Older saved maximum-angle records load their resolved angle into the trajectory
editor in manual mode; do not restore the removed maximum-angle UI option.
Do not hide the workbench's subsequent coverage limits.

Preserve the user's calculator source when new loads are saved. PBR reports path
at a separate chosen reference zero range, with explicit missing coverage, and
saves the resolved angle in manual mode. Do not replace that range with the far
zero or silently re-zero a saved optimized result.

## WilsonKinetics bullet database

`src/data/wilson/` contains a pinned, unmodified MIT-licensed CSV from WilsonKinetics
and its license/provenance. Credit Reese Wilson / Wilson Armament Bureau and
Copyright (c) 2026 Wilson Kinetics in the UI and distributed notices. Keep the
full MIT text embedded for standalone HTML, not only in a separate file.

The shared bullet picker copies name, SI mass and an explicitly listed G1/G7 BC
pair into either draft. Never guess muzzle velocity or convert G1/G7 BCs. Missing,
zero or invalid source BCs clear the old coefficient and require manual entry;
do not silently repair the source G1 value 443. Preserve the raw CSV and duplicate
rows; update checksums/provenance deliberately when refreshing the snapshot.

## Persistent workspace and card operations

Save both solution libraries and calculated previews locally, including units,
card identity/order/visibility/style, calculator source and distance window.
`workspace-state.ts` validates versioned snapshots; `workspace-storage.ts` stores
an atomic IndexedDB record with a localStorage fallback. Do not silently erase
unreadable data or claim a save succeeded after a quota/permission error.

Card grips support native drag/drop, touch pointers and keyboard reordering.
Explicit overwrites preserve ID, position, style and visibility. Recalculate all
saved trajectories (including hidden cards) and previews when physical distance
window values change. Use each solution's resolved angle; apply worker results
as a batch and reject superseded work. Cancel/failure preserves the previous
view and data. Unit-only changes must not cause a solve.

In maximum-range mode, “Safe distance · modelled” is the earlier impact or first
threshold event; it is zero if at/below the threshold at the muzzle. Keep impact
and upward descent crossings visible and do not imply this label certifies an
actual safe perimeter.
