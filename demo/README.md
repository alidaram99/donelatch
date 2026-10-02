# See a green test miss a real persistence bug

`npm run demo` copies these files into a disposable directory. It never mutates
this shipped example or the current user's project.

The project has one promise: saving settings persists the requested theme.
`checks/weak.mjs` verifies only the return value. Removing the actual write still
passes that check. `checks/strong.mjs` starts a fresh reader process and checks
the saved bytes; the same fault produces `ASSERT_PERSISTENCE` and exit code 1.

The demonstration shows a passing weak run being refused, a detected fault plus
a fresh strong run being accepted, and a later source edit making that evidence
stale. One negative control demonstrates one outcome contract; it does not prove
that every possible defect is detected.
