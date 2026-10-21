# C reference fixtures

`upstream/` is an unmodified subset of the GNU Ballistics C source, originally
created by Derek Yates and made available under the GNU GPL. The repository's
GPL-2.0 license applies to this derivative project. Source:
https://github.com/kwantam/BC/tree/dd4815186198e686c944e856702b13e39cbee118

The exact version used by the original JavaScript port is unknown. These fixtures
record a reproducible historical reference, not a certification of its accuracy.
The driver defines gravity as −32.174 ft/s² to match this port, rather than the
mirror header's −32.194. Original algorithms and coefficient tables are unchanged.
Inputs: BC 0.465; speed 2650 ft/s; sight height 1.6 inches; zero 200 yards;
level shot and calm wind. All six models and ten drag-law speeds are covered.

From the repository root, regenerate with:

```sh
cc -O2 tests/fixtures/generate.c -lm -o /private/tmp/ballistics-fixtures
/private/tmp/ballistics-fixtures > tests/fixtures/reference.json
```

Drag values are compared tightly. Historical trajectory records overshoot yard
marks, use first-order velocity updates and inconsistent timestamps, and the
zero search has a loose angular tolerance. Tests compare at their recorded
distance using separately documented, deliberately wider historical tolerances.
Independent analytic and step-refinement tests set the corrected solver's actual
accuracy expectations. Do not change the new implementation to reproduce known
historical defects.
