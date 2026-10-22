# Changelog

Versions follow Semantic Versioning. The `0.x` series is initial development;
minor releases may include breaking changes, which are listed explicitly.

## 0.4.0 — 2026-10-23

### Added

- Automatic local persistence of both solution libraries, calculated previews,
  unit preferences, card order/visibility and calculator selection.
- Drag, touch and keyboard card reordering; explicit editing and overwriting
  while preserving card identity and display style.
- Automatic batch recalculation when the trajectory distance window changes,
  preserving saved angles and retaining previous results on cancellation/failure.
- Modelled safe distance in the maximum-range view: earlier ground impact or
  threshold event, with a zero-distance muzzle outcome when already below.
- Searchable WilsonKinetics bullet catalog in trajectory and maximum-range
  editors, with 5,686 records, manufacturer/diameter filters and explicit listed
  G1/G7 coefficient selection. The catalog and full MIT notice work offline.
- Source credit to Reese Wilson / Wilson Armament Bureau and Wilson Kinetics,
  a pinned unmodified CSV snapshot, license notice, provenance and data checks.

### Changed

- Maximum-range angle optimization is now exclusive to the maximum-range screen.

## 0.3.1 — 2026-10-22

### Fixed

- Tightened adaptive time-integration accuracy for maximum-range flights across
  piecewise drag-table boundaries. This fixes a refinement test failure in Linux
  CI without relaxing its tolerance or changing the hosted runner.
- Added all-model convergence checks against 0.002 s time-step flights at shallow,
  near-optimum and steep launch angles.

## 0.3.0 — 2026-10-22

### Compatibility

- The TypeScript SI scenario contract now requires aiming mode, zero height,
  manual bore angle and launch height; initialize from `defaultScenario` when
  constructing scenarios. Unit preferences add zero-height and ground-height
  units. The classic browser-global API remains compatible.

### Fixed

- Saving another trajectory preserves the chosen calculator source and results.
- Saved PBR trajectories retain their optimized angle when recalculated.

### Added

- Zero-height offsets at a specified zero range, manual bore-angle mode and
  optimum ground-range angle mode in the trajectory editor.
- PBR reference zero range and the corresponding optimum zero-height result.
- Maximum-range mode for calm wind over flat ground, with configurable muzzle
  height, automatic launch-angle search and complete first-impact flights.
- Independent bullet comparisons, ground-height and energy plots, impact times
  and energies, and upward/downward energy threshold crossings on each bullet's
  maximum-range flight. Metric, imperial and mixed units are supported.
- Analytic vacuum and step-refinement checks for the time-based flight engine,
  plus hosted and offline browser coverage for the new mode.

## 0.2.1 — 2026-10-22

### Fixed

- Opening the downloaded production HTML directly no longer leaves a blank page:
  application code, styles and the calculation worker are embedded in the HTML.
- Source HTML shows startup instructions if opened without a development server.
- Browser regressions now cover offline-file startup and calculations, and run
  in CI before the production artifact is uploaded.

## 0.2.0 — 2026-10-21

### Added

- Vector browser workbench with metric, imperial and per-field mixed units.
- Independent in-memory solutions, comparison overlays, and exact-distance
  tables including cumulative time of flight.
- Trajectory, velocity and energy charts, optimum point-blank range, and
  distance-to-energy-threshold calculators.
- Cancellable calculation workers, numerical/domain/browser regression tests,
  and pinned, attributed historical C fixtures.
- Reproducible Node/TypeScript/Vite tooling and GitHub Actions builds with a
  downloadable production artifact.
- Solver review, implementation plan, repository guidance and usage documentation.

### Fixed

- Reversed wind arguments and inconsistent longitudinal wind units.
- Invalid-input hangs, invalid drag acceleration, unbounded integrations and
  zero-search results for unreachable distances.
- Fractional-distance lookups reading other columns, mixed sample timestamps,
  nonzero intercept units and incorrect gravity-axis decomposition.
- Numerical global leaks, undefined muzzle corrections, ambiguous range capacity,
  and stale legacy-example results after valid zero-valued edits.

### Breaking changes

- Library inputs must be finite numbers; numeric strings and invalid parameters
  now throw explicit errors.
- Legacy column getters require nonnegative integer yard indices. Missing
  coverage returns `null` instead of `0`; use `sampleAt()` for fractional ranges.
- Muzzle angular corrections return `null` because they are undefined.
- `solveAll()` defaults to a bounded 2,000-yard request. `BCOMP_MAXRANGE` is the
  one-yard record capacity including the muzzle, rather than a distance in feet.
- Corrected numerical results intentionally differ from historical behavior.
