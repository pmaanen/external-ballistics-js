# JavaScript port review

Reviewed 2026-10-21 at commit `2b41191fc334d49d96fc03082fc8765c6681abaf`.
This review precedes implementation; no solver or example-app files were changed.

Update: R1–R11 have since been addressed. See
[implementation notes](implementation-notes.md) for fixes, compatibility changes,
tests, and limits. The findings and reproduction below describe the reviewed
historical commit, rather than the corrected code.

## Scope and assessment

Reviewed the entire 381-line solver, the example application's JavaScript and
HTML, dependency headers/loading, README/license, and both root reference images.
The library is small enough to retain and repair. It currently needs numerical
and API fixes before a frontend can safely use arbitrary units or compare
solutions. There are no automated tests, package manifest, module exports, or
documented numerical error tolerances.

The six implemented drag models are G1, G2, G5, G6, G7, and G8. All tables have
strictly descending thresholds and matching coefficient counts. A reading against
the historical C drag listing found no obvious coefficient transcription error;
this is not a full numerical parity certification. The example's kinetic-energy
formula is dimensionally correct; its grain conversion is slightly rounded.

Time of flight already exists in the library as `getTime()`. Energy is calculated
only in the example. There is no output table, unit abstraction, saved-comparison
workflow, point-blank calculator, or energy-threshold calculator. The example
plots path and energy; velocity appears only in its tooltips. These are missing
features, rather than porting bugs.

## Findings

### R1 — High: wind speed and direction are reversed at the call boundary

**Location:** `src/external-ballistics.js:142–143,203–208`.

`solveAll()` passes `(windSpeed, windAngle)`; both helpers declare
`(windAngle, windSpeed)`. Thus zero wind with a direction of 90° introduces a
90-unit headwind, and 10 mph at 0° produces no headwind. A 10 mph wind at 90°
produces head/cross components of 88.6327/15.6283 rather than 0/10 mph. At 270°
the crosswind still has the same sign, rather than reversing.

For the baseline below, changing only the direction of a zero-speed wind from
0° to 90° changes 300-yard velocity from 2107.0522 to 2076.4442 ft/s.

**Required fix:** establish one helper signature, correct its callers, and test
calm wind plus 0°, 90°, 180°, 270°, negative angles, and equivalent full rotations.

### R2 — High: invalid inputs can hang or produce plausible, invalid solutions

**Location:** `src/external-ballistics.js:118–131,153–200,242–290,295–316`.

Inputs are copied without validation. `retard()` returns `-1` for an unknown drag
model or unsupported speed, and the integrator uses that value as acceleration.
Negative BC similarly accelerates the projectile. With model `BAD`, the baseline
speed grows from 2650 to 2650.0206 ft/s by approximately 20 yards. With BC −0.465
it grows to 2688.6672 ft/s.

`NaN` muzzle velocity and zero BC contaminate state and leave the trajectory loop
running: both range and velocity exit comparisons can remain false forever.
Both probes hit a 2-second VM execution timeout even with the record cap reduced
to 20. Missing sight height yields `NaN` path values without an error.

Numeric strings are also unsafe: with shooting angle `"10"`, addition to the zero
angle concatenates strings before trigonometric conversion. The 300-yard path is
+21.9222 inches versus −8.3341 inches for numeric `10`.

**Required fix:** parse form values at the boundary, validate again in the public
library, reject invalid drag/BC/speed, and bound both integrations and root
searches by iteration/time/distance limits. Detect non-finite state and loss of
forward progress. Return errors and termination reasons.

### R3 — High: fractional distance lookups can return another column

**Location:** `src/external-ballistics.js:319–380`.

Accessors assume an integer yard index but only check the upper bound.
`getVelocity(0.1)` reads the muzzle X-velocity and `getVelocity(0.2)` reads the
muzzle Y-velocity. Other fractional indices return `undefined`. A natural metric
lookup, `getVelocity(100 / 0.9144)`, returns `undefined`; negative indices do too.
Out-of-range requests return `0`, making unavailable speed/path/time look valid.

Recorded ranges are also the first integration step beyond an integer yard, not
exact yard marks: the baseline row indexed 100 is at 100.148148 yards. Rounding a
metric distance to an integer index would introduce another error.

**Required fix:** validate legacy integer indices and introduce a distance-based
sampling API that interpolates all values coherently between bracketing samples.
Represent unavailable distances explicitly and never extrapolate.

### R4 — Medium: sample time and velocity components refer to different instants

**Location:** `src/external-ballistics.js:134,153–191`.

The first iteration has `deltaTime = 0`. Later iterations record position before
advancing it, velocity magnitude before its update, components after their
update, and time as `time + deltaTime`. The loop also recomputes the step before
incrementing its clock, rather than advancing time with the step just integrated.

An isolated analytic probe disables drag and sets the bore angle to zero, with
3000 ft/s horizontal velocity and normal gravity. At the sample at
100.166647545 yards, position implies 0.100166647545 seconds, but `getTime()`
reports 0.100499980686 seconds, an offset of about 0.333333 ms. Path agrees with
the analytic position, while Y-velocity is −3.22812405 rather than −3.22276172
ft/s. This confirms mixed sample times, independently of C output.

**Required fix:** define each step's start/end state, advance time with the exact
step used, and emit a coherent state or interpolated crossing. Derive magnitude
from that same state's components. Use analytic regression tests, including
`t(0) = 0`.

### R5 — Medium: headwind units do not match the drag function's velocity units

**Location:** `src/external-ballistics.js:124,142,161,203–214`.

The example and historical API specify wind in mph; the drift conversion of
17.60 correctly converts mph to inches per second. Headwind, however, is added
directly to projectile speed in ft/s. After fixing R1, a 10 mph headwind would
still be treated as 10 ft/s instead of 14.6666667 ft/s.

**Required fix:** explicitly convert headwind to ft/s before drag evaluation and
keep the lateral drift formula's mph contract separate, or convert the wind
helpers consistently at a documented boundary. This issue also appears in the
consulted historical C solver; matching that output would preserve the error.

### R6 — Medium: zero finding can report success without reaching the requested range

**Location:** `src/external-ballistics.js:232–292`.

The search changes angle according to final height even when integration stopped
early. It tests angular step size, but never verifies that it reached the target
or that height residual is acceptable. It returns a bare angle when exiting at
the angular limit as well. An instrumented baseline requesting a 100,000-yard
zero returns 33.90005493°. Its last trial had only reached 9926.695 feet, with
negative forward velocity. This is an invalid zero presented as a solution.

The example permits a zero range of 0. With normal sight height, there is no
line-of-sight zero at the muzzle; the function nevertheless returns 7.66351318°.
For an ordinary 200-yard zero it integrates past the requested range, contributing
to a residual of roughly +0.036 inches in the output table.

**Required fix:** bracket the supported low-angle root, evaluate height at the
exact requested distance, verify reachability and residuals, and report
non-convergence. Reject zero distance for a sight-in solve; keep a separate
explicit bore-angle integration mode for derived calculators.

### R7 — Medium: nonzero zero-intercept is off by a factor of twelve

**Location:** `src/external-ballistics.js:4,128,249,268,276–280`.

The intercept constant is documented in inches, but the zero search compares it
to `currentHeight` in feet. Setting `yIntercept = 1` yields approximately +12.016
inches at the baseline zero distance. The default of zero conceals the defect.
`setVariables()` also always resets it to the default rather than accepting an
explicit parameter.

**Required fix:** make the boundary unit explicit, convert it once, and exercise
positive, negative, and zero intercepts. Expose a supported parameter if retained.

### R8 — Medium: undeclared variables break strict mode and leak shared state

**Location:** `src/external-ballistics.js:155–156,212,244–259,296–313`.

Working variables including `velocityX`, `velocityY`, `A`, `M`, `dragFunction`,
and `windVelocity` become globals in classic scripts. Under strict mode the first
solve throws `ReferenceError: velocityY is not defined`. ES modules are strict,
so wrapping the current file in a modern module does not make it usable.

Sequential independent instances can hold solutions today, but the numerical
functions pollute their shared environment and are not reentrant.

**Required fix:** declare all working variables locally and provide a deliberate
module entry point while preserving or documenting the legacy global entry point.
Test module loading, absence of global leaks, and independent instances.

### R9 — Medium: muzzle angular values are nonphysical or non-finite

**Location:** `src/external-ballistics.js:172–179`.

At distance zero, elevation correction is approximately 5400 MOA for the baseline
because path is divided by zero. Windage MOA is `NaN` from `0/0`. With zero sight
height, elevation correction is also undefined. The screenshot's 5400-MOA muzzle
row illustrates the historical behavior, but should not be copied into a new UI.

**Required fix:** represent both angular fields at zero distance as unavailable,
display an em dash, and keep muzzle path, speed, time, and drift well-defined.

### R10 — Medium: valid zero-valued form edits leave stale results

**Location:** `example_app/js/example_app.js:85–89`;
`example_app/index.html:72–80,102–110`.

`if (!floatValue || isNaN(floatValue)) return` skips valid zero values. Setting
sight height to 0 leaves the plotted muzzle path at the previous −1.60 inches.
Clearing a required field also leaves old results without identifying them as
stale. The app validates only the triggering field, rather than the entire input
snapshot. Wind sliders bypass this guard, so behavior differs by field.

**Required fix:** use field-specific validation of the whole snapshot, accepting
zero where physically valid, and expose dirty/invalid/result states explicitly.
Keep incomplete input text separate from canonical numerical values.

### R11 — Low: range limits and unit comments are misleading

**Location:** `src/external-ballistics.js:2–4,121–129,180–182,196`.

`BCOMP_MAXRANGE` and `maximumValidRange` are described as feet, but are compared
to a count of approximately one-yard records. Velocity/gravity comments also omit
time dimensions. The cap check uses `>` after incrementing the record count:
setting the cap to 10 produces 11 records, ending at approximately 10.164823 yards.

**Required fix:** distinguish record capacity, inclusive maximum distance, and
sample count; correct documentation and test endpoints. Add a requested-distance
limit instead of always integrating to the model's final range.

## Integration and maintenance risks

- `example_app/index.html:8,124` fetches unversioned Vuetify assets, while its
  vendored Vue is 2.4.0 and Chart.js is 2.6.0. The HTML/CSS depends on historical
  framework APIs. Compatibility is not reproducible, and loading needs network
  access. This review did not run a browser/CDN compatibility test or a dependency
  vulnerability audit. A new app should use pinned local dependencies.
- The example computes a full trajectory on every accepted input event, although
  it displays only a small range. Derived calculators would multiply that work.
  Bound work and move it to a worker before adding repeated optimization loops.
- The reference input image includes atmospheric corrections. The port contains
  none, and the requested feature list does not explicitly add them. Do not show
  atmospheric fields that appear to affect results without implementing them.
- The model uses a two-component trajectory plus an approximate lateral-wind
  deflection formula. The README's description does not establish a full vector
  wind or advanced atmosphere model. Preserve/document its scope rather than
  promising more physics through UI labels.

## Verification and reproduction

Both application JavaScript files passed `node --check` under Node v23.11.0.
Isolated Node `vm` probes reproduced the findings above; malformed cases had
execution timeouts. No production files were changed to run the probes. Drag
band sizes were checked for all six models. Full C parity, browser behavior,
and real-world accuracy remain unverified.

Baseline inputs, matching the reference load except for the app's defaults:

```js
const baseline = {
  dragFunction: 'G1', dragCoefficient: 0.465, muzzleVelocity: 2650,
  sightHeight: 1.6, shootingAngle: 0, windSpeed: 0, windAngle: 0,
  zeroRange: 200
};
```

The current library has no module export. This self-contained probe can be run
from the repository root; it keeps the solver's accidental globals isolated:

```sh
node <<'NODE'
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync('src/external-ballistics.js', 'utf8');
const inputs = {
  dragFunction: 'G1', dragCoefficient: 0.465, muzzleVelocity: 2650,
  sightHeight: 1.6, shootingAngle: 0, windSpeed: 0, windAngle: 0,
  zeroRange: 200
};
const context = vm.createContext({ inputs });
vm.runInContext(code, context);
vm.runInContext(`
  var b = new ExternalBallistics();
  b.setVariables(inputs);
  b.BCOMP_MAXRANGE = 300;
  b.solveAll();
`, context, { timeout: 5000 });
const b = context.b;
console.log('Actual row-100 distance:', b.getRange(100));
console.log('Fractional velocity lookup:', b.getVelocity(0.2));
console.log('Metric velocity lookup:', b.getVelocity(100 / 0.9144));
console.log('Muzzle angular fields:', b.getMinuteOfAngle(0), b.getWindageMOA(0));
console.log('Wind helper as called:', b.getHeadWind(10, 0));
console.log('Out-of-range velocity:', b.getVelocity(999999));
NODE
```

## Reference sources and limits

The README identifies the [GNU Ballistics project on SourceForge](https://sourceforge.net/projects/ballisticslib/).
The exact release used for this port is not recorded. The historical C copy
consulted for signatures, coefficients, and inherited behavior was
[kwantam/BC](https://github.com/kwantam/BC): its
[wind helpers](https://github.com/kwantam/BC/blob/master/_windage.c),
[solver](https://github.com/kwantam/BC/blob/master/_solve.c),
[zero search](https://github.com/kwantam/BC/blob/master/_zero.c), and
[drag tables](https://github.com/kwantam/BC/blob/master/_retard.c).
These are source comparisons, not an assertion that this mirror is the exact
upstream version. A pinned and attributed C baseline belongs in implementation
step 1. Sampling and non-convergence issues also occur in historical code; a
faithful port can still need corrections.
