# Vector · external-ballistics.js

A browser workbench built around a corrected JavaScript port of the
[GNU Ballistics Library](https://sourceforge.net/projects/ballisticslib/).
Compare named loads with trajectory, speed and energy charts, detailed tables,
mixed units, optimum point-blank range, and distance-to-energy calculations.
All calculations run on your device. No backend or account is required.

## Run

Use Node **22.12 or newer**; Node 24 LTS is recommended (`.nvmrc` is included).

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite, normally `http://127.0.0.1:5173`.

```sh
npm run build
npm run preview
```

The build creates `dist/index.html`. **Open that file directly in Safari or
Chrome**, or serve `dist/` with any static HTTP host. The production HTML embeds
the application, styles, Chart.js and calculation worker, so it also works
offline without a server. Keep the accompanying license/notice files when
redistributing it. Relative paths support hosting under a subdirectory.

Opening the repository's source `index.html` directly does not run TypeScript;
use `npm run dev` or open the built `dist/index.html`. The source page now shows
startup instructions instead of remaining blank when its scripts cannot load.

## Using the workbench

1. A reference .308 load is calculated and saved on startup. Change the load
   name, drag model/BC, projectile mass, velocity, sight/aiming settings or wind.
2. **Calculate trajectory** creates an unsaved preview. **Save to comparison**
   keeps its inputs and numerical result independently of the editor.
3. Save more loads to overlay them across all three charts and the shared-distance
   table. Use checkboxes to show/hide them, edit a name directly, or use the
   load-into-editor, duplicate and remove buttons.
4. Choose **Metric** or **Imperial**, then override individual field or output
   units as needed. Unit changes preserve physical values. A G1 BC is not
   automatically converted when choosing G7 or another drag model.
5. Adjust the distance window and table increment, including fractional meters.
   All visible loads are sampled at those exact distances. The table includes
   cumulative flight time in seconds. A dash means undefined or unavailable.

Changing **From**, **To**, or **Table step** recalculates all saved trajectories,
including hidden cards and the current preview, out to the new maximum distance.
Their saved bore angles, inputs, names, order, visibility and colors are preserved.
Updates are applied together when the worker finishes. Cancelling or a failed run
keeps the previous window and calculations. Solver limits can still shorten a
trajectory; values beyond its actual coverage remain missing. Changing only a
display unit preserves the physical window without recalculating.

## Saved workspace and editing

Both solution libraries and calculated previews are **saved locally on this
device**, along with card order, visibility, units, distance window and calculator
source selection. The page reports **Workspace saved on this device** after the
write completes. Reloading restores that workspace; deleting every card keeps an
empty library instead of recreating the startup reference.

Storage uses IndexedDB with a localStorage fallback where necessary. Data belongs
to this browser/profile and site origin; `file://` storage availability and scope
can depend on the browser and file location. It is not a cloud sync or export.
Storage failures are shown explicitly while calculations remain usable in memory.
Unreadable or newer-format data is preserved: saving pauses until you explicitly
choose **Save this workspace instead**.

- **Reorder:** drag the card grip, including by touch, or focus it and use arrow
  keys / Home / End. Plots, table columns and source lists follow card order.
- **Overwrite:** use a card's **Edit** action, change inputs and calculate. Choose
  **Overwrite [name]** to replace that card while keeping its identity, color,
  visibility and position, or **Save to comparison** to add a separate solution.
  Maximum-range cards have the same edit/calculate/overwrite workflow.
- Calculator outputs are cleared when their source is overwritten or trajectories
  are recalculated. Saved PBR solutions retain their resolved angle.

## WilsonKinetics bullet database

Choose **Choose from bullet database** in either the trajectory or maximum-range
editor. Search 5,686 records by bullet name, manufacturer, diameter or grain
weight, with separate manufacturer and diameter filters. Diameter is shown in
inches and millimeters; mass is copied in your chosen form units.

Select a bullet and its listed **G1 or G7 BC**, then choose **Use bullet**. This
fills the name, mass and matching drag-model/BC pair. Muzzle velocity and sight
settings remain yours to enter. No model conversion or muzzle-velocity estimate
is made. Missing or unsupported BCs require manual entry and clear the previous
coefficient. Existing saved solutions remain independent.

The database is from [WilsonKinetics](https://github.com/ReeseWilsonGD/WilsonKinetics),
developed by **Reese Wilson / Wilson Armament Bureau**. **Copyright (c) 2026 Wilson
Kinetics**, used under the [MIT License](src/data/wilson/LICENSE). The picker,
model notes and bundled third-party notices credit the source. The full MIT
notice is embedded in the standalone HTML as well as retained with the source.
The pinned [snapshot and provenance](src/data/wilson/README.md) are included locally;
search and selection work offline without contacting GitHub.

## Aiming modes and zero height

Choose **Aiming mode** in the trajectory editor:

- **Zero at range and height:** calculates a bore angle for level, calm sight-in.
  **Zero height** is the vertical impact offset at **Zero range**, measured from
  the sight line: positive above, negative below, zero directly on the line.
  Inches, centimeters and millimeters are supported, from −2.54 to +2.54 m.
  Shot wind and shooting angle apply after this sight-in reference is found.
- **Disable zeroing · manual angle:** enter bore elevation relative to the sight
  line (−45° to +45°). Shooting angle tilts that sight line. The disabled zero
  range and height fields are not used or validated.

Maximum-range angle search is available exclusively in **Maximum range** mode.
Trajectory provides zero-at-range/height and manual bore elevation. Older saved
maximum-angle trajectories can be viewed; editing loads their resolved angle as
a manual angle, without running a maximum-range search on this screen.

Saved trajectories retain the mode and resolved angle. Energy searches extend
that same angle rather than re-zeroing the solution.

## Calculators

Use **Calculator source · energy & PBR** to choose any saved solution. Saving a
new trajectory preserves that selection and its calculator results; choosing a
different source clears results from the previous source. Select a search-distance limit. Calculators use its input
snapshot, not the current editor. Search distance may exceed the saved chart's
coverage; energy search recomputes the same bore angle over the requested range.

- **Optimum point-blank range:** enter the target-zone **diameter**. The vertical
  corridor is ±half that value about the line of sight. The calculator optimizes
  the low bore angle and verifies the apex and near/far boundary crossings. It
  reports the near entry, far exit, near/far zeros, peak height/distance, angle,
  and time/energy at the exit. Set **PBR reference zero range** to report the
  optimized trajectory's **zero height at that range**, independently of its
  near/far zero crossings. Positive height means above the sight line; negative
  means below. This height uses the selected shot's wind and inclination. Beyond
  verified coverage it is explicitly unavailable. Saved PBR loads retain the
  reference range/height and use their optimized explicit angle, so loading and
  recalculating them preserves the trajectory. If sight height exceeds the radius, coverage
  starts at a nonzero near entry. Add the optimized load as a new comparison
  without modifying its source. This optimizes vertical path, not crosswind aim.
- **Distance to energy threshold:** enter J or ft·lbf. The result is the first
  downward energy crossing, refined from unrounded trajectory data, with its
  distance, time and speed. Muzzle equality, energy already below at the muzzle,
  and no crossing within verified coverage are separate outcomes.

Both calculators mark their results on the charts. Searches and integrations
are bounded and run in a worker. **Cancel** terminates work; later calculations
start with a fresh worker. A 20-second work limit also prevents a stalled task
from leaving the interface busy indefinitely.

## Maximum-range mode

Choose **Maximum range** above the workbench to compare complete flights to first
impact on **flat ground in calm wind**. Enter bullet mass, muzzle velocity, drag
model and its BC, muzzle height above ground, and an energy threshold. Optionally
copy projectile data from a saved trajectory load. Sight settings and wind from
that load are not used.

**Calculate maximum range** searches launch angles from 0° to 90° and refines the
best angle. It reports horizontal ground range, launch angle, impact energy and
time, and the first downward energy crossing on that same maximum-range flight.
**Safe distance · modelled** is the earlier of first ground impact and the
energy-threshold event on that maximum-range flight. It is zero if energy is
already at or below the threshold at the muzzle. Tables name the limiting event;
triangle markers show it on both plots. The charts show height above ground and
kinetic energy through impact. A separate
table includes every upward and downward crossing: falling bullets can gain
energy again during descent. Already below the threshold at the muzzle and no
crossing before impact are explicit outcomes.

**Save range comparison** keeps an independent snapshot. Repeat for different
bullets and use checkboxes to overlay their flights or remove comparisons. Metric,
imperial and individual unit overrides preserve physical values. These comparisons
are separate from the trajectory library and are restored locally on reload.

This is modelled first-impact reach, **not a certified danger radius**. It excludes
terrain, ricochets, atmospheric variability and uncertainty. Crossing an energy
threshold does not establish a safe-distance boundary.

## Numerical model and conventions

- Supports G1, G2, G5, G6, G7 and G8 drag laws with their original coefficient
  tables. Mass is used for energy; BC-based drag is not multiplied by mass.
- The trajectory workbench uses distance-based RK4 integration, with a default internal step of 1.5 feet
  and stored one-yard states. Cubic Hermite interpolation gives arbitrary
  exact-distance samples. Speed, position and time describe the same state.
- The core uses feet/ft·s⁻¹, with an explicit SI adapter for application state.
  Energy is `0.5 * massKg * speedMps²`. Display rounding never feeds calculations.
- In the trajectory workbench, zero is referenced to a **level, calm sight-in**. Shot inclination and wind
  then apply to the trajectory. Gravity is −32.174 ft/s², resolved against the
  line-of-sight axis. Range follows that axis, not horizontal ground distance.
- Wind direction describes its origin: 0° headwind, 90° from the right, 180°
  tailwind, 270° from the left. Positive path is above the sight line; positive
  drift is leftward. Displayed aiming corrections oppose displacement.
- Maximum-range flights use adaptive time-based RK4 integration with the same
  drag laws and gravity, independently of the legacy forward-slope cutoff. Ground
  impact and energy events are interpolated in time. A coarse 5° scan brackets
  a golden-section angle search; the angular stopping tolerance is 0.0001°.
  Default limits are 600 seconds and 100,000 attempted steps per flight, plus
  the worker watchdog. Incomplete flights fail rather than producing a maximum.
- Crosswind drift retains GNU Ballistics' flight-time-lag approximation. This
  is not a full vector-wind model. Atmospheric corrections, spin drift and
  Coriolis are outside this version's scope.
- The UI bounds distance/search to 10,000 m and tables to 2,000 rows. A model,
  forward-motion, flight-time or step limit may end a solution sooner. The UI
  reports that coverage and never extrapolates beyond it.

See [the review](docs/code-review.md), [original plan](docs/implementation-plan.md),
and [implementation notes](docs/implementation-notes.md) for the fixes and limits.

## Library API

The module entry point runs in Node and browsers:

```js
import ExternalBallistics from './src/ballistics/core.js';

const ballistics = new ExternalBallistics();
ballistics.setVariables({
  dragFunction: 'G1', dragCoefficient: 0.465,
  muzzleVelocity: 2650,  // ft/s
  sightHeight: 1.6,     // inches
  shootingAngle: 0,     // degrees
  windSpeed: 10,        // mph
  windAngle: 90,        // degrees, from the right
  zeroRange: 200,       // yards
  yIntercept: 0,        // optional zero offset, inches
});
const result = ballistics.solveAll({ maxRange: 1000 }); // inclusive yards
const at100Meters = ballistics.sampleAt(100 / 0.9144);
console.log(result.termination, at100Meters?.time);
```

The classic `<script src="src/external-ballistics.js"></script>` entry still
provides `ExternalBallistics`. Its CommonJS compatibility branch also remains.
The constructor is the one intentional global; numerical working variables are
local. The core can also integrate an explicit bore angle with
`ballistics.integrate(angleDegrees, options)` without re-solving a zero.

Compatibility changes:

- Invalid inputs throw a `BallisticsError` with a `code`; invalid drag never
  silently becomes acceleration. Inputs must be numbers, not numeric strings.
- Legacy `getRange`, `getPath`, `getTime`, `getVelocity` and other column getters
  accept nonnegative **integer yard indices**. Invalid indices throw; missing
  coverage returns `null` instead of the old misleading `0`.
- Use `sampleAt(yards)` for fractional distances. It returns `null` outside
  coverage and never extrapolates. Muzzle angular corrections are `null`.
- `solveAll()` defaults to a bounded 2,000-yard request. `BCOMP_MAXRANGE` is a
  record capacity, including the muzzle, not a distance in feet. The default
  capacity is 50,001 records. Explicit requests can use up to 50,000 yards,
  subject to the integrator's physical and work limits.
- The zero finder verifies reachability and intercept residual. A nonzero
  `yIntercept` is interpreted in inches, as documented.

The legacy Vue example remains in `example_app/` and is accessible from the dev
server at `/example_app/`. It now handles zero values and numeric form strings,
identifies stale results, and pins Vuetify 0.14.11. Its external historical
styles/scripts still require network access. It is not copied into `dist/`.

## Checks

```sh
npm test
npm run typecheck
npm run build
npx playwright install chromium firefox webkit
npm run test:browser
```

Unit/domain tests cover the reviewed defects, physical identities, independent
states, unit conversions, calculators and failure boundaries. Pinned C fixtures
cover all six models. Analytic vacuum cases and step-refinement checks validate
the corrected integration separately from historical C bugs. Fixture provenance,
regeneration and tolerances are documented in [tests/fixtures](tests/fixtures/README.md).

Playwright runs the production build in Chromium, Firefox and WebKit. Browser
tests cover mixed units, comparisons, arbitrary table steps, both calculators,
coverage, invalid/zero input, cancellation/recovery, mobile layout, keyboard use,
safe names and local asset loading. Startup regressions also exercise the built
HTML directly through `file://`, offline in an isolated directory, including
both calculators and saved comparisons. Build before running browser tests.

The [GitHub Actions build workflow](.github/workflows/build.yml) runs on pushes,
pull requests, and manual dispatch. It uses the Node version from `.nvmrc`, caches
npm downloads, installs with `npm ci`, runs regression tests, and typechecks/builds
the app. Jobs use the official Playwright container with preinstalled browsers
and system libraries, avoiding per-run Ubuntu package downloads. Keep the image
version aligned with the pinned `@playwright/test` dependency. It also runs the
production browser suite, including offline-file startup, before uploading
`dist/` as the downloadable `vector-app-dist`
artifact, retained for 14 days.

## License and attribution

GNU GPL version 2; see [LICENSE](LICENSE). Derek Yates authored the original GNU
Ballistics C library. [Harri Rissanen](https://github.com/harriris/external-ballistics-js)
created the JavaScript port; this repository is
[Paul Maanen's fork](https://github.com/pmaanen/external-ballistics-js) of that port.
The pinned historical C mirror is attributed in the fixtures. The legacy Vue and
Chart.js files retain their original notices.
Bundled Chart.js and its color utility are MIT-licensed; notices are included in
`public/THIRD_PARTY_NOTICES.txt` and distributed with the built app.
