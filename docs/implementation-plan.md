# Frontend and solver implementation plan

This is the original plan. It has now been implemented; see
[implementation notes](implementation-notes.md). The review is in [code-review.md](code-review.md); repository
working guidance is in [AGENTS.md](../AGENTS.md). The numbered steps below record
the plan as written before implementation.

## Intended result

A browser application that accepts named ballistic scenarios, supports imperial,
metric, and mixed units, and keeps several independent solutions in memory for
comparison. It plots trajectory, speed, and energy and provides a detailed table
including time to each distance. It also calculates optimum point-blank range
and the first distance where energy falls to a chosen threshold.

Use `1.jpeg` as a reference for grouping load/sight/wind inputs, and `1-2.jpeg`
for the named-load summary and detailed result table. Adapt those ideas into a
responsive interface with explicit units and readable comparison controls. The
images are references, not pixel-accurate targets. Atmospheric correction is
outside this first implementation; the current solver does not support it.

## Proposed technical approach

- Retain JavaScript for the numerical port and add a tested module entry point.
  Use TypeScript for the unit adapter, derived calculations, application state,
  worker messages, and frontend.
- Use Vite with plain TypeScript and semantic HTML/CSS. No UI framework is needed
  for this scope; keep the old Vue example available as a legacy demonstration.
  Separate components/controllers by responsibility so a future framework choice
  does not require rewriting the physics or state.
- Use a locally installed, pinned Chart.js for three charts with numerical
  distance axes. Do not reuse or modify the old minified Chart.js wrapper.
- Run calculations in a Web Worker; keep the static application usable without
  a backend, account, or external runtime CDN.
- Use a small numerical/domain test runner and browser integration tests.
  Select supported dependency versions when implementation starts and commit a
  lockfile. Add an explicit TypeScript check: Vite transpilation alone does not
  typecheck, as described in its [TypeScript documentation](https://vite.dev/guide/features.html#typescript).

Proposed layout:

```text
src/external-ballistics.js       corrected core / legacy compatibility
src/ballistics/                 module entry, contracts, unit adapter, sampling
src/calculators/                energy threshold and point-blank calculations
src/app/                        form, solution store, plots, table, styles
src/workers/                    bounded solver/calculator tasks
tests/                         numerical, domain, and browser coverage
tests/fixtures/                attributed, pinned reference inputs/results
index.html                     new application entry
example_app/                   historical example
```

## Step-by-step implementation

### 1. Establish reproducible numerical checks and a baseline

1. Add the package/tooling setup, lockfile, and commands for unit tests, browser
   tests, typechecking, development, and production builds. Record the supported
   Node version. Keep solver tests runnable without mounting a UI.
2. Obtain and pin the historical C implementation used for reference, recording
   its revision/release, license, gravity constant, input units, and generation
   method. Generate attributed fixtures for all six supported drag models and
   representative speeds, zero distances, sight heights, and inclinations.
3. Add targeted regressions for review findings R1–R11. Use analytic motion,
   independent unit identities, and physical invariants alongside C fixtures.
   Label inherited errors rather than making them golden expected behavior.
4. Define tolerances per quantity and numerical resolution. Unit conversions
   should agree to floating-point precision; trajectory tolerances should come
   from step-refinement results and the intended displayed precision. Record
   approved tolerances in tests rather than using screenshot rounding as truth.

**Completion check:** the test harness exposes the reviewed failures, fixtures
have provenance, and syntax checks still pass. No UI work depends on unverified
numerical output.

### 2. Make the core isolated, validated, and bounded

1. Declare all numerical working variables locally and exercise strict mode.
   Add module exports through an explicit entry point, preserving the existing
   browser-global use where practical. Keep DOM and framework dependencies out.
2. Validate complete inputs: supported drag model, positive finite BC and muzzle
   velocity, nonnegative finite sight height/wind speed, finite angles, and a
   positive zero distance for a sight-in solve. Validate any public intercept or
   explicit-bore-angle input too. Document accepted speed/angle/model limits.
3. Replace `-1` drag fallbacks with structured failures. Validate the actual
   relative speed passed to the drag law, including wind effects.
4. Add step, elapsed-flight-time, distance, and search-iteration limits. Detect
   non-finite state, nonpositive forward velocity, and failure to make progress.
   Distinguish requested-range completion, physical/model termination, and error.
5. Correct range/velocity/gravity comments. Separate maximum distance, maximum
   records, and valid record count, and define endpoint inclusion explicitly.
   Stop at the requested coverage instead of always computing the full range.

**Fixes:** R2, R8, R11. **Completion check:** malformed inputs finish promptly
with useful errors, module loading works, no globals leak, and alternating
independent solver instances leaves previous results unchanged.

### 3. Correct wind components and document their meaning

1. Standardize speed/direction argument order and fix callers.
2. Convert the longitudinal wind component from mph to ft/s before drag
   evaluation. Preserve a consistent unit contract for lateral drift.
3. Document 0° headwind, 90° wind from the right, 180° tailwind, and 270° wind
   from the left. Define positive drift and the opposite signed aiming correction
   separately so a table cannot confuse displacement with correction.
4. Retain the existing approximate crosswind model with an accurate description.
   Do not introduce a full vector-wind model incidentally while fixing units.

**Fixes:** R1, R5. **Completion check:** calm results do not depend on wind
direction; opposite crosswinds reverse drift; cardinal components and mph/m/s
equivalents agree; head/tailwind influence relative speed with correct units.

### 4. Repair integration, zero solving, and distance sampling

1. Refactor integration into a reusable trajectory function with an explicit
   bore angle. Keep zero-angle solving separate; ordinary `solveAll()` can
   compose the two for legacy callers.
2. Represent each integration step with coherent start/end states. Advance
   position, velocity, and time using the same step and recompute speed from the
   emitted components. Ensure muzzle time and lateral drift are zero.
3. Add a bracketed low-angle zero search that evaluates height at the exact zero
   distance, checks residual and reachability, and reports failure explicitly.
   Convert any nonzero sight-in intercept from inches to feet once.
4. Emit samples at requested distance crossings using interpolation between
   coherent states. Keep integration resolution independent of chart/table step.
   Support arbitrary meter/yard distances and both range endpoints.
5. Validate legacy integer-index accessors; expose explicit missing/error results
   for invalid indices. Define a new distance-based API rather than allowing a
   fractional number to index the ten-column legacy layout.
6. Return unavailable angular corrections at zero distance, and expose precise
   coverage and termination metadata. Never extrapolate or fill missing speed,
   time, or energy with zero.

**Fixes:** R3, R4, R6, R7, R9. **Completion check:** analytic time/position/velocity
tests pass, reachable zeros satisfy the chosen height tolerance, unreachable
zeros fail, metric sampling is coherent, and results converge as the integration
step is reduced. Review expected C differences caused by intentional corrections.

### 5. Add the canonical data and mixed-unit layer

1. Define canonical application inputs in SI: meters, meters per second,
   kilograms, radians where appropriate, and seconds. Keep the legacy imperial
   core behind one conversion adapter. Preserve drag model and its BC together.
2. Centralize exact definitions: foot = 0.3048 m, yard = 0.9144 m,
   inch = 0.0254 m, grain = 0.00006479891 kg, mph = 0.44704 m/s,
   and ft·lbf = 1.3558179483314004 J. Derive related conversions from these.
3. Provide imperial and metric presets plus per-field overrides for mass
   (gr/g), muzzle speed (ft/s or m/s), zero/display range (yd/m), sight height
   (in/mm/cm), wind speed (mph/m/s/km/h), and calculator inputs.
4. Let output units be selected independently for range, path/drift, speed,
   energy (J/ft·lbf), and angular correction (MOA/mrad). Input angles can remain
   explicitly labeled in degrees. Time stays in seconds.
5. Keep editable text separate from canonical values, so empty/partial fields
   can be shown and validated. Switching units converts the physical value;
   it must not reinterpret the same digits or repeatedly round stored data.
6. Define immutable result records with explicit field units, input snapshot,
   derived energy `0.5 * massKg * speedMps ** 2`, coverage, solver version, and
   termination information. Round only in output formatting.

**Completion check:** physically identical imperial, metric, and mixed inputs
produce equivalent trajectories/energies. Repeated unit switching preserves
values. Chart, table, and calculators share the same samples and energy function.

### 6. Implement the energy-threshold calculation

1. Accept a scenario/solution and a positive threshold in J or ft·lbf. Define the
   result as the first downward crossing of that energy along forward distance.
2. Scan unrounded samples for a bracket; refine with the common trajectory/event
   evaluation to the chosen distance tolerance. Do not select the nearest table
   row or interpolate rounded displayed energies.
3. Return distance, time, speed, and energy at the crossing. Handle threshold
   equal to muzzle energy (distance zero), already below at the muzzle, and
   no crossing within verified coverage as distinct outcomes. Never extrapolate.
4. Do not assume energy is strictly monotonic in every supported inclined case;
   evaluate the first qualifying crossing. State the searched distance limit
   when the trajectory ends before a crossing is found.

**Completion check:** a no-drag level analytic case, a drag case with a known
bracket, unit-equivalent thresholds, equality, missing mass, and absent/multiple
crossing cases have explicit tested behavior.

### 7. Implement optimum point-blank range

1. Define the tolerance using a target-zone diameter, with an explicitly
   displayed radius of half that value. The vertical corridor is ±radius about
   the line of sight. Use the selected load, sight height, inclination, and wind
   conditions; label the result as a vertical point-blank calculation rather
   than implying that crosswind is optimized too.
2. Optimize the explicit bore angle to maximize the far exit from this corridor
   while the trajectory's upper excursion remains within +radius. Use bounded
   searches and exact apex/boundary events from the shared integrator; the
   optimum normally touches the upper limit. Verify feasibility rather than
   assuming a root always exists or maximizing an unverified coarse table.
3. Report optimized angle, associated near/far line-of-sight zeros when present,
   maximum ordinate and its distance, near corridor entry, far corridor exit
   (point-blank range), and time/energy at that exit.
4. If sight height exceeds the radius, the projectile starts below the corridor.
   Report its nonzero near entry explicitly; do not claim coverage from the
   muzzle. Where muzzle-connected coverage is required, identify this case as
   infeasible. Treat missing zeros and unreachable bounds as explicit outcomes.
5. Let the user create a new solution from the optimized setup. Do not change an
   existing saved scenario implicitly. Show upper/lower corridor lines and the
   relevant zero/entry/exit markers on its trajectory plot.

**Completion check:** verify the complete corridor and refined extrema, check
small angle perturbations around the optimum, compare an analytic no-drag case,
and test narrow/wide targets, tall sights, mixed units, absent crossings, and
search-limit/non-convergence outcomes.

### 8. Add worker execution and independent solution state

1. Send complete immutable calculation requests to a worker, returning results
   or structured errors with request IDs. Keep an editable draft separate from
   saved solutions and from the last valid result.
2. Provide busy/error states and prevent outdated responses from replacing newer
   results. Cancel synchronous long-running tasks by terminating/recreating the
   worker, or use deliberately chunked integration; a cancellation message alone
   cannot interrupt a worker blocked in a synchronous solver loop.
3. Add explicit Calculate/Save actions. Store each saved solution with a stable
   ID, name, color, line style, input snapshot, and independent numerical data.
   Support selecting, renaming, duplicating, hiding/showing, and removing it.
4. Keep storage in memory for this scope. Browser persistence and file
   import/export can be later additions; reloading the page may clear solutions.
5. Separate display preferences from the calculation snapshot. Unit/visibility
   changes should reformat/replot existing results without recalculating physics.

**Completion check:** save at least three different loads, edit/recalculate one,
and confirm the others do not change. Verify stale-request handling, cancellation,
failure recovery, and consistent solution identity throughout the app.

### 9. Build the input interface and comparison workspace

1. Create a responsive layout with load name, drag model/BC, mass, muzzle speed,
   sight/zero settings, shooting angle, and full 0–360° wind controls. Show unit
   selectors next to their fields and metric/imperial preset controls together.
2. Show a clear load summary and saved-solution comparison controls. Explain
   which solutions are visible in both charts and tables.
3. Add validated minimum/maximum display distance and table increment, with
   arbitrary positive increments in the chosen range unit. Enforce practical
   row limits without tying the integrator's resolution to the output step.
4. Accept physically valid zero values such as calm wind, level angle, and zero
   sight height. Mark invalid/incomplete drafts and stale results visibly.
5. Use labeled controls, keyboard navigation, focus/error associations, and
   touch-friendly sizing. Ensure names are rendered as text rather than HTML.

**Fixes:** R10 and legacy dependency risks. **Completion check:** reproduce the
reference load in imperial, metric, and mixed units; exercise zero-valued inputs,
validation, keyboard use, and narrow-screen layout.

### 10. Add trajectory, speed, and energy plots with overlays

1. Render three coordinated charts, each with its own quantity/unit and a common
   numerical distance axis. Add one series per visible solution, preserving its
   color and line style across charts and the table.
2. Use numeric `{x, y}` data and linear axes, rather than categorical labels;
   irregular sample spacing must still have correct distance geometry. See the
   [Chart.js linear-axis documentation](https://www.chartjs.org/docs/latest/axes/cartesian/linear.html).
3. Include labeled axes, legends/visibility controls, and tooltips with solution
   name, distance, value, and unit. Include a zero reference on the path chart;
   use suitable independent scales for speed and energy.
4. Add calculator threshold/corridor/crossing markers and stop each series at
   its actual coverage. Do not draw through missing values or extend shorter
   solutions to another solution's endpoint.
5. Downsample chart data only when needed for measured rendering performance,
   retaining full precision for table/calculator data and boundary markers.
   Chart.js documents [decimation and prepared data](https://www.chartjs.org/docs/latest/general/performance.html).
   Provide the result table as the accessible numerical counterpart to canvas.

**Completion check:** overlay three solutions with different coverage, switch
units and visibility, and verify numerical axis spacing, correct tooltips,
markers, colors, and agreement with the underlying samples.

### 11. Build the detailed comparison table and calculator panels

1. Use a shared requested-distance grid. Show range, path/drop, elevation
   correction, speed, energy, wind drift, wind correction, and cumulative flight
   time from muzzle to each distance. Put units in every applicable header.
2. Group columns by selected solution for side-by-side comparison. On narrow
   screens use horizontal scrolling and/or per-solution groups while retaining
   the shared distance reference. Keep headers and solution names visible.
3. Sample every solution at those exact distances. Show an em dash outside its
   coverage and for undefined muzzle corrections. Keep the muzzle row and time
   zero, support the requested final endpoint, and avoid premature rounding.
4. Add point-blank and energy-threshold panels using the same selected solution
   state, mixed-unit inputs, worker tasks, result formatting, and plot markers.
   Show the input snapshot and coverage used for each result.

**Completion check:** verify table/tooltip/calculator agreement, increasing
time-to-distance, fractional metric increments, differing solution endpoints,
and the complete result columns shown in the reference table.

### 12. Complete integration checks and documentation

1. Run numerical/domain regressions, typechecking, production build, and browser
   integration checks on the built app. Exercise Chromium, Firefox, and WebKit
   where supported; record which engines actually ran.
2. Cover complete workflows: solve/save/overlay, mixed-unit edits, changing only
   output units, modifying one of several solutions, table range changes, both
   calculators, failed calculations, worker cancellation, and responsive access.
3. Measure typical solves, several overlays, and bounded calculator searches.
   Set practical sample/row/work limits from those measurements and confirm the
   interface remains responsive while calculations run.
4. Update the README with installation/run/build/test commands, deployment of
   static output, API/unit contracts, model limitations, comparison behavior,
   calculator definitions, and the in-memory session lifetime. Preserve license
   notices and include upstream/dependency attribution.
5. Update `AGENTS.md` with the commands and conventions that now exist. Summarize
   numerical changes and known limits without claiming field accuracy merely
   because tests pass.

**Completion check:** all requested features are exercised end to end and every
review finding is either fixed with a regression or explicitly documented as a
remaining limitation. No unresolved numerical correctness bug is hidden by the UI.

## Delivery order and scope boundary

Steps 1–4 establish a trustworthy core; step 5 supplies the shared unit/data
contract. Steps 6–7 implement the calculators independently of rendering.
Step 8 supplies execution/state infrastructure, and steps 9–11 expose it in the
frontend. Step 12 completes integration and documentation. Implement in that
order, keeping each change reviewable.

The original planning task stopped here. The user subsequently authorized
implementation of the fixes and frontend; that authorization supersedes the
original planning-only boundary.
