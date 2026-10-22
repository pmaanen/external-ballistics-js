# WilsonKinetics bullet database

Source: [WilsonKinetics / bullet_database.csv](https://github.com/ReeseWilsonGD/WilsonKinetics/blob/c3d69d364bafb2664507ffc41b4bac7b3e1a1d81/src/WBS/Resources/bullet_database.csv)

Developed by **Reese Wilson / Wilson Armament Bureau**.
**Copyright (c) 2026 Wilson Kinetics.** Used under the **MIT License**; the full,
unmodified notice is in [LICENSE](LICENSE), the application picker, and the
production bundle's `THIRD_PARTY_NOTICES.txt`.

The original CSV is retained byte for byte, including its UTF-8 BOM and five
empty records. `source.json` records the exact upstream revision, retrieval date
and SHA-256. The upstream Git blob SHA is
`4c0b61b13b5e85345037bdb1a93523dd1240ebdf`. No network request is made during
building or using the application.

The database provides 5,686 real records from 122 manufacturers: diameter in
inches, manufacturer, bullet name, mass in grains, and separate G1/G7 BCs. Unit
meaning is documented in upstream
[BulletDatabase.cs](https://github.com/ReeseWilsonGD/WilsonKinetics/blob/c3d69d364bafb2664507ffc41b4bac7b3e1a1d81/src/WBS/Simulation/BulletDatabase.cs).
It does not provide muzzle velocities. Duplicate records are preserved under
separate stable row IDs.

The reader in `src/ballistics/bullet-database.ts` converts mass and diameter to SI,
omits empty or malformed identity/mass rows, and treats zero, missing and
out-of-range coefficients as unavailable. The source G1 value `443` for LEE
457-500-3R is retained, displayed as unsupported, and never silently changed to
an assumed decimal value. Selecting a bullet without a usable BC clears the
previous form coefficient and requires manual entry. G1 and G7 coefficients are
never converted between drag models.

To update: retrieve CSV and LICENSE from a specific upstream commit, retain the
copyright/permission notice, update `source.json` and these counts/hash references,
and review changed/invalid data. Run numerical, build and browser checks,
including the copied standalone HTML workflow. Updates are intentionally explicit,
not automatic downloads from a moving branch.
