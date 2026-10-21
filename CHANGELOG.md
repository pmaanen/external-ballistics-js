# Changelog

Versions follow Semantic Versioning. The `0.x` series is initial development;
minor releases may include breaking changes, which are listed explicitly.

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
