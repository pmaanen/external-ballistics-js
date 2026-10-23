# Implementation notes

Implemented 2026-10-21, following the [original plan](implementation-plan.md).
The frontend and solver remain independent; the application is a static build
with calculation workers and local workspace persistence.

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
- `vite.config.ts`: embeds the application chunk and stylesheet into production
  HTML. The worker uses Vite's inline-worker import, preserving cancellable
  background calculation while allowing offline `file://` startup. Source HTML
  includes a visible fallback for failed script loading.

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

Initial 0.2.0 verification: `npm test` passed all 29 tests; `npm run build` passed with
TypeScript checking; Playwright passed all 27 workflows across Chromium,
Firefox and WebKit. JavaScript syntax and documentation link checks also passed.
The historical legacy
Vue rendering is not covered by the new app's browser suite; its calculation
handling is covered in an isolated VM regression and its Vuetify version is pinned.

The 2026-10-22 startup fix was reproduced against the original build through
`file://`, where external module loading prevented the interface from rendering.
The build now embeds its code, styles and worker. Verification passed all 29
numerical/domain tests, the production build, and all 33 browser cases across
Chromium, Firefox and WebKit. New cases open a copied HTML file offline in an
isolated directory, exercise both calculators and saved comparisons, and check
that opening unbuilt source HTML shows instructions. CI runs this browser suite
before uploading the production bundle.

## Deliberate scope boundaries

Saved libraries and previews persist locally in IndexedDB (localStorage fallback); refreshing restores them.
The WilsonKinetics projectile database is bundled locally. There is no export/import or backend. Changing physical distance-window values recalculates saved trajectories and previews as a worker batch, preserving resolved angles and card metadata. Energy searches may independently calculate further with the same saved
bore angle. Optimized point-blank results are saved as a new solution.

The model retains approximate crosswind deflection and has no atmosphere,
spin drift or Coriolis correction. The UI describes these limits and the
line-of-sight distance/sign conventions. Numerical tests do not certify agreement
with a particular firearm, ammunition lot or real-world trajectory.

## Maximum-range study

The dedicated mode uses calm wind and first impact on flat ground, as confirmed
by the user, with configurable muzzle height (0–1,000 m). It takes only projectile
name, mass, muzzle speed, drag model and BC; copying a trajectory load does not
copy its sight, zero, inclination or wind into this calculation. Its coordinate
system is horizontal distance and height above ground.

`src/ballistics/flight.ts` uses adaptive time-based RK4 with step doubling and the
existing GNU drag tables. SI drag acceleration is converted at the table boundary.
It integrates upward and downward flight, independently of the legacy solver's
forward-slope cutoff. Cubic Hermite interpolation refines first ground impact,
apex and threshold events. A shallow launch from ground that rises and lands
inside one step brackets impact after the apex, avoiding a false muzzle impact.
Default integration limits are 600 s, 100,000 attempted steps and a 0.2 s maximum
step. Errors and the existing worker watchdog reject incomplete calculations.

`src/calculators/maximum-range.ts` scans 0–90° at 5° increments and applies a bounded
golden-section refinement around the best scan point (0.0001° bracket tolerance).
This assumes the best calm, flat-ground branch lies in that bracket; it is not
a general global optimizer for arbitrary drag functions. The selected complete
flight supplies every energy event and impact metric. Energy extrema split event
brackets to catch descent re-entry as well as downward crossings. Angular and
event search tolerances describe numerical refinement, not physical accuracy.

New range comparisons own frozen snapshots independently of trajectory solutions
and the editable form. Plot sampling leaves calculator and table data untouched.
Shared unit preferences plus independent m/ft height controls preserve SI values.
The interface explicitly distinguishes theoretical first-impact reach from a
certified danger area: terrain, ricochets, atmosphere and uncertainty are outside
this model, and an energy crossing is not a safe-distance boundary.

Verification for this addition includes vacuum flight/optimum analytic identities,
all six drag models and nearby-angle checks, integration-step refinement, steep
and shallow ground flights, mass/energy separation, invalid and incomplete runs,
energy rebound, saved comparison independence, mixed units, cancellation/restart,
keyboard/mobile layout, and offline-file startup in the production worker bundle.

Final verification: all 39 numerical/domain tests passed, the production build
passed TypeScript checking, and all 45 browser workflows passed across Chromium,
Firefox and WebKit. Desktop screenshots of the new comparison mode were inspected.
Offline cases execute maximum-range calculations from an isolated copied HTML.

## Aiming modes, calculator sources and PBR zero height

Calculator selection is an explicit saved-solution ID. Saving a new trajectory
keeps that ID and its current calculator results; selecting or deleting the source
clears stale results. Both calculators share the visibly labelled source selector.

Scenarios now contain `aimMode`, `zeroHeightM`, `boreAngleDeg` and `launchHeightM`.
The SI adapter maps signed zero height to the classic `yIntercept` in inches;
its existing ±100 in bound becomes ±2.54 m. Zero-height sign is relative to the
sight line at the specified range. Manual mode uses explicit −45°…45° bore
elevation relative to the sight line and bypasses disabled zero-input validation.
`configuredTrajectory` orchestrates maximum-ground-range angle selection in the
worker using the complete time-based engine. This mode requires calm wind and a
level reference, enforced in validation; the UI sets wind/inclination to zero
and disables them. Muzzle height for this reference search is configurable.

The workbench's subsequent distance-based trajectory retains its existing model
limits. It does not claim to cover ground impact; the separate Maximum range
mode remains the full-impact comparison. Energy tasks retain the resolved angle
from the selected solution, including PBR and optimum-range angle solutions.

PBR has a separate reference zero-range input. Its result samples unrounded path
at that distance, or reports missing coverage, without replacing the range with
the far zero. Saved PBR inputs use manual mode and the optimized bore angle, with
the chosen reference range and sampled height. This fixes their prior inability
to reproduce the optimized angle reliably after loading into the editor. The
reported zero height is under the chosen shot conditions; inclined/windy shots
can differ from a level/calm sight-in at that same range and height.

Verification for these changes: all 44 numerical/domain tests passed; the
production build passed TypeScript checking; all 54 browser workflows passed in
Chromium, Firefox and WebKit. Added cases verify source selection survives new
saves, different selected loads produce different threshold distances, signed
zero-height conversion, disabled-zero validation, optimum-angle worker execution,
PBR reference height, saved-angle reproduction, and unavailable reference coverage.
Offline standalone-HTML checks also exercise manual angle and PBR height output.
The updated desktop PBR screenshot was inspected.

## Maximum-range CI refinement fix (0.3.1)

The failed GitHub Actions run 39853531594 used runner 2.338.0, Ubuntu 24.04.5,
image 20261012.334.1 and Node 24.21.0. Dependency installation succeeded; the
refinement test failed because default and 0.025 s capped integrations differed
by 0.0241 m against a 0.02 m bound. The runner was not the cause.

Adaptive RK4 step choices near the piecewise drag boundaries are sensitive to
floating-point differences. Tightening the absolute/relative local error scales
from 1e-5/1e-8 to 1e-7/1e-10 reduces that sensitivity without changing the drag
model or loosening the existing acceptance tests. Added regressions cover all
six models at three launch angles and 0.5/0.2/0.025 s caps, compared with 0.002 s
flights (5 mm range, 50 microsecond time and 0.001 J impact-energy bounds). These
are tested numerical convergence bounds, not real-world accuracy claims. The
new matrix fails against the previous integration settings on Node 24 locally.
The workflow keeps its existing supported hosted runner and action versions.

Local verification used Node 24.22.1: all 45 numerical/domain tests, TypeScript
checking and the production build passed. All 54 production browser workflows
passed across Chromium, Firefox and WebKit, including offline file startup.

## WilsonKinetics projectile catalog

User-requested integration uses the WilsonKinetics CSV at commit
`c3d69d364bafb2664507ffc41b4bac7b3e1a1d81`. The source snapshot, MIT notice and
provenance are under `src/data/wilson/`. Attribution names Reese Wilson / Wilson
Armament Bureau and retains Copyright (c) 2026 Wilson Kinetics. The picker and
model notes link the source; the full MIT text is embedded in the HTML and
included in `public/THIRD_PARTY_NOTICES.txt` for distribution.

The raw source matches the upstream Git blob byte for byte. Five empty records
are omitted from the 5,686 selectable bullets; duplicate records retain separate
row IDs. The CSV reader is independent of the browser and supports UTF-8 BOM,
CRLF, quoted fields, doubled quotes and quoted newlines. Tests pin both SHA-256
and upstream Git blob SHA.

Both editors share one native dialog with text search, manufacturer and diameter
filters, a bounded native result list, explicit G1/G7 selection, and a preview of
mass, diameter and both source coefficients. Mass/diameter are converted to SI
at ingestion. Applying copies primitives into the draft, clears a stale preview
and preserves velocity, sight/zero settings and saved results. Missing or invalid
BCs (including the source G1 `443` record) clear the previous coefficient and
require manual entry. No BC-model conversion, guessed decimal correction or
muzzle-velocity estimate is performed.

The pinned CSV is bundled through Vite's raw import. No runtime fetch, CDN,
backend or automatic upstream update is introduced; the isolated copied HTML
also contains the catalog and its full license notice.

Verification under Node 24.22.1: all 50 numerical/domain/data tests passed;
TypeScript checking and the production build passed; all 63 browser workflows
passed across Chromium, Firefox and WebKit. The suite covers both editors,
explicit G7 selection, mixed-unit mass conversion, preserved velocity and saved
results, missing/invalid source BCs, search/filtering, keyboard dismissal, mobile
layout and copied standalone HTML running offline. The desktop picker screenshot
was inspected. The browser keyboard-order test accounts for WebKit's default
button-skipping behavior; Escape consistently dismisses the picker even when
its search field has text.

## Persistent workspace, editing and distance updates

`workspace-state.ts` defines and validates schema-1 snapshots of trajectory and
maximum-range libraries, calculated previews, unit preferences, distance window,
active calculator source and edit targets. `workspace-storage.ts` stores one
atomic IndexedDB record, with a localStorage fallback where IndexedDB is
unavailable. Writes are serialized/coalesced so the latest snapshot wins. Full,
unrounded numerical results are retained; localStorage's codec preserves inactive
NaN fields. A fallback snapshot can migrate to IndexedDB when it becomes available.

Restore validates active scenario values, units, IDs, finite/coherent point
sequences and bounded record sizes. Restored solution data is cloned and frozen.
Unknown/corrupt data is left untouched and autosave pauses until the user chooses
to replace it. Storage/quota failures report an error and leave the current tab
usable; “saved” is shown only after transaction completion. Local storage scope is
browser/profile/origin dependent, including browser-specific `file://` behavior.
This is not cross-device sync; concurrent tabs use last-completed workspace writes.

Both libraries expose explicit edit/calculate/overwrite actions. Overwrites keep
the card ID, color, line style, visibility and order. The shared `card-order.ts`
handles native grip drag/drop, touch pointer drops and keyboard moves; tables,
overlays and source lists follow the same array order. Deletion and visibility
changes are persisted, including deliberately empty libraries.

Changing From/To/Table step sends a bounded worker batch for every saved solution
and any trajectory preview. It uses saved input snapshots and resolved angles,
not the current draft or a new zero/angle search. Results and the new view commit
together; cancellation/errors keep the old view and data. Request IDs reject
superseded worker replies. Rename/reorder changes during the batch retain their
live metadata, deleted cards are not resurrected, and additions/overwrites are
disabled while the batch runs. Calculator outputs are invalidated. Unit changes
only reformat physical values and do not launch a batch.

Maximum-range search was removed from the trajectory editor at the user's request.
Old maximum-angle snapshots remain readable; loading one into that editor selects
manual angle with its resolved bore elevation. The dedicated maximum-range mode
adds a “Safe distance · modelled” summary/table field and triangle plot markers:
first impact or first threshold event, whichever occurs earlier, or zero for
energy already at/below threshold at the muzzle. Ground-impact and subsequent
upward energy crossings remain visible. This display boundary is not a certified
real-world safety perimeter.

Verification for persistence/reordering/overwrite/distance/safe-distance changes:
all 55 numerical/domain/data/state tests passed; TypeScript and the production
build passed; all 81 browser workflows passed in Chromium, Firefox and WebKit.
New browser cases cover native drag/drop, keyboard moves, metadata-preserving
overwrites in both libraries, restored previews/units/order/selection, deliberate
empty libraries, latest-distance-edit wins, cancellation and injected batch
failure, localStorage fallback, preservation/replacement of unreadable data,
quota-write failure, and safe-distance impact/threshold/muzzle cases. Copied
standalone HTML restores its locally saved workspace while offline. Existing
mixed-unit, keyboard and responsive-layout checks passed; mobile workbench and
maximum-range safe-distance screenshots were inspected. Touch pointer handling is
implemented, but physical touchscreen dragging was not separately exercised.

## CI browser provisioning

The [timed-out build run](https://github.com/pmaanen/external-ballistics-js/actions/runs/39864163554)
completed regression tests and the production build, then exhausted its ten-minute
job limit downloading Ubuntu packages from `azure.archive.ubuntu.com` during
`playwright install --with-deps`. The browser suite never started. Another run of
the same commit succeeded, consistent with an intermittent mirror slowdown.

The build job now uses `mcr.microsoft.com/playwright:v1.64.1-noble`, with browsers
and operating-system libraries already installed, and no per-run apt install.
Keep this image tag aligned with the exact `@playwright/test` package version.
Shared host IPC follows Playwright's Chromium container guidance. The existing
ten-minute bound, all three browser projects and offline-file checks remain.
The published image manifest was verified for Linux amd64 and arm64; workflow
YAML parsing and package/image version alignment were checked locally. The local
Docker daemon is unavailable, so container execution needs a hosted CI run.
Local verification passed: 55 tests, TypeScript/production build and all 81
browser checks across Chromium, Firefox and WebKit, including offline startup.

The first hosted container run reached the browser suite, but Firefox rejected
running as root with GitHub's `/github/home` owned by `pwuser`. Container options
now include `--user 1001`, as recommended by Playwright's GitHub Actions example,
so the executing user matches that home directory. No home override or browser
sandbox bypass is needed. The same run timed out in one WebKit cancellation test.
The test now holds recalculation worker messages until explicitly released,
skipping terminated workers, instead of racing a 350 ms delay. Cancellation is
asserted while the job is held. CI uses one browser worker to avoid CPU contention;
local runs retain three. Failed jobs upload `test-results/`, including traces and
error contexts, for seven days to support diagnosis of any subsequent failures.
