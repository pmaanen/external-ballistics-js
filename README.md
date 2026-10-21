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

The build creates `dist/`. Serve that directory with any static HTTP host; relative
asset paths support deployment under a subdirectory. Use an HTTP server rather
than opening the HTML as a `file://` URL, because calculation workers are modules.
The new application's assets are bundled locally, including Chart.js; it does
not load CDN scripts, fonts, or external data at runtime.

## Using the workbench

1. A reference .308 load is calculated and saved on startup. Change the load
   name, drag model/BC, projectile mass, velocity, sight/zero settings or wind.
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

The distance window changes the display; it does not extend saved calculations.
To extend a load's coverage, load it into the editor and calculate/save it again
with a larger maximum distance. Shorter solutions remain missing beyond their
actual end. Editing a draft does not change saved results.

Solutions are held in **this tab's memory**. Refreshing clears them. The first
version intentionally does not include browser persistence, file import/export,
or a projectile database.

## Calculators

Select a saved solution and a search-distance limit. Calculators use its input
snapshot, not the current editor. Search distance may exceed the saved chart's
coverage; energy search recomputes the same bore angle over the requested range.

- **Optimum point-blank range:** enter the target-zone **diameter**. The vertical
  corridor is ±half that value about the line of sight. The calculator optimizes
  the low bore angle and verifies the apex and near/far boundary crossings. It
  reports the near entry, far exit, near/far zeros, peak height/distance, angle,
  and time/energy at the exit. If sight height exceeds the radius, coverage
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

## Numerical model and conventions

- Supports G1, G2, G5, G6, G7 and G8 drag laws with their original coefficient
  tables. Mass is used for energy; BC-based drag is not multiplied by mass.
- Uses distance-based RK4 integration, with a default internal step of 1.5 feet
  and stored one-yard states. Cubic Hermite interpolation gives arbitrary
  exact-distance samples. Speed, position and time describe the same state.
- The core uses feet/ft·s⁻¹, with an explicit SI adapter for application state.
  Energy is `0.5 * massKg * speedMps²`. Display rounding never feeds calculations.
- Zero is referenced to a **level, calm sight-in**. Shot inclination and wind
  then apply to the trajectory. Gravity is −32.174 ft/s², resolved against the
  line-of-sight axis. Range follows that axis, not horizontal ground distance.
- Wind direction describes its origin: 0° headwind, 90° from the right, 180°
  tailwind, 270° from the left. Positive path is above the sight line; positive
  drift is leftward. Displayed aiming corrections oppose displacement.
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
safe names and local asset loading. Build before running browser tests.

## License and attribution

GNU GPL version 2; see [LICENSE](LICENSE). Original GNU Ballistics routines are
attributed to Derek Yates. The pinned historical C mirror is attributed in the
fixtures. The legacy Vue and Chart.js files retain their original notices.
Bundled Chart.js and its color utility are MIT-licensed; notices are included in
`public/THIRD_PARTY_NOTICES.txt` and distributed with the built app.
