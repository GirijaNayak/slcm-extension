# Test Report

## 1. Automated Unit & Integration Tests

The test suite runs natively in Node.js (v20+) using Node's built-in test runner:

```bash
npm test
```

### Coverage Breakdown

- **Attendance Calculations (`tests/attendance.test.js`)**:
  - Actual counts to percentage conversion
  - Zero total classes handled safely (`ok: false`, zero-division avoided)
  - Safe skips at 75% boundary conditions: `max(0, floor(P/t - N))`
  - Classes needed calculation for recovery: `max(0, ceil((tN - P)/(1 - t)))`
  - Invalid and out-of-range thresholds (<0% or >100%)
  - 100% attendance requirement: detects inability to recover once a class is missed
  - Future missed-class simulation labeled hypothetical
  - Consecutive recovery streak calculation and advice string
  - Status classification (Safe / Borderline / Low)
  - `enhanceRecord` metadata injection

- **Official Certificate & Lifecycle Verification (`tests/certificate-and-lifecycle.test.js`)**:
  - **Authoritative Certificate Course-Level GPA**: Regresses against `Certificate-of-GPA-And-CGPA-Calculation-Process.pdf` (8 courses, 25 credits, total grade points 212 => exact GPA 8.48).
  - **Authoritative Certificate Cumulative CGPA**: Regresses against the certificate's multi-semester calculation (Semesters i, ii, iii, iv with GPAs 8.48, 8.62, 8.24, 8.42 over credits 25, 25, 26, 26 => exact CGPA 8.44 over 102 credits).
  - **Alert Deduplication & Dismissal Persistence**: Verifies that identical alerts are not duplicated, dismissed alerts are recorded in local storage and never re-added on subsequent scans.
  - **DOM Lifecycle Teardown**: Verifies that `teardownAll()` cleanly unbinds popovers, removes injected column headers/cells, and strips all extension nodes without throwing.

- **Marks & SGPA Calculations (`tests/marks.test.js`)**:
  - Assessment aggregation across multiple components
  - Missing and malformed row filtering
  - Weighted component calculation (MTE 30 / CWS 30 / ETE 40)
  - Required score in remaining evaluations for target goals
  - Impossible required marks detection (> 100% of remaining)
  - Separation of hypothetical simulated marks from official records

- **SGPA & MUJ Grading Scale (`tests/sgpa.test.js`)**:
  - Letter grade to grade point mapping according to MUJ Handbook 2023-24 (A+=10, A=9, B=8, C=7, D=6, E=5, F/I/DT=0)
  - Credit-weighted SGPA calculation matching handbook reference example (SGPA 8.48 across 25 credits)
  - Zero credits and missing grade handling
  - Absolute grade prediction marked unofficial/exploratory

- **CGPA Prediction (`tests/cgpa.test.js`)**:
  - Credit-weighted multi-semester projection matching handbook example (CGPA 8.44 across 102 credits)
  - Unequal semester credit weights verified (semesters with higher credits contribute proportionately more)
  - Invalid inputs and boundary handling
  - Multi-scenario comparisons (Scenario A vs Scenario B)

- **Target CGPA Planning (`tests/target-cgpa.test.js`)**:
  - Credit-weighted mathematical identity: `Required SGPA = [Target CGPA × (Completed + Remaining) − Current CGPA × Completed] / Remaining`
  - Detection of impossible targets exceeding the 10.0 grade cap
  - Zero remaining credits handling
  - Target already achieved condition
  - Two-decimal precision rounding
  - Malformed input sanitization

- **Normalizers & Data Adapters (`tests/normalizers.test.js`)**:
  - Attendance key aliases mapping (CourseName, PresentCount, TotalClass, etc.)
  - Numeric parsing fallback for null/empty/hyphen/NA cells
  - Fingerprint hashing stability for change detection
  - Event normalizer for timetable scheduling (rooms, times, slots)

- **Integration & Simulation Scenarios (`tests/integration-simulation.test.js`)**:
  - Live schedule analysis detecting current in-session class and upcoming class
  - Schedule conflict detection identifying overlapping time intervals
  - Gap and free period calculation between classes
  - Simultaneous attend and miss simulation
  - Maximum achievable CGPA theoretical limit calculation
  - Target planning when current CGPA exceeds target
  - SessionExpiredError standard diagnostic and session tracking

### Execution Results (Executed 13 Oct 2026)

```
> muj-sclm-enhanced@1.0.0 test
> node --test tests/*.test.js

TAP version 13
# Subtests: 49
# pass: 49
# fail: 0
# cancelled: 0
# skipped: 0
# duration_ms: ~150ms
```

All 49 tests executed and passed cleanly.

---

## 2. Live Network Endpoint Checks

Executes against the live production host `https://mujslcm.jaipur.manipal.edu` (unauthenticated baseline):

| Endpoint / Route | HTTP Method | Observed Status | Response Header / Content | Interpretation |
| :--- | :---: | :---: | :--- | :--- |
| `/` | GET | `302 Found` | `Location: /Home/Logout` | Unauthenticated requests redirect to Logout / Login. |
| `/Student/Academic/GetAttendanceSummaryList` | GET | `403 Forbidden` | `{"IsSuccessfull":false,"ErrorMessage":"Forbidden"}` | Route exists on server and is session-gated. |
| `/Student/Academic/GetGradesForFaculty` | GET | `403 Forbidden` | `{"IsSuccessfull":false,"ErrorMessage":"Forbidden"}` | Route exists on server and is session-gated. |
| `/Student/Academic/GetEventDetailStudent` | GET | `403 Forbidden` | `{"IsSuccessfull":false,"ErrorMessage":"Forbidden"}` | Route exists on server and is session-gated. |
| `/Student/Academic/GetStudentCalenderEventList` | GET | `403 Forbidden` | `{"IsSuccessfull":false,"ErrorMessage":"Forbidden"}` | Route exists on server and is session-gated. |
| `/Student/Academic/GetInternalMarks` | GET | `403 Forbidden` | `{"IsSuccessfull":false,"ErrorMessage":"Forbidden"}` | Route exists on server and is session-gated. |
| `/Student/Academic/Attendance` | GET | `302 Found` | `Location: /Home/Logout` | Page route confirmed; protected behind ASP.NET session. |
| `/Student/Academic/TimeTable` | GET | `302 Found` | `Location: /Home/Logout` | Page route confirmed; protected behind ASP.NET session. |

---

## 3. Manual Integration Verification Procedure (Signed-In Session)

When loading the extension into Chrome with an authenticated student account, verify the following 10 checkpoints:

1. **Idempotence & Duplicate Injections**:
   - Reload any SLCM page multiple times or navigate via internal links.
   - Verify that only exactly one MUJX overlay card and one floating FAB exists.

2. **Attendance Page (`/Student/Academic/Attendance`)**:
   - Confirm original table columns and pagination controls are completely intact.
   - Confirm extra `"MUJX Intel"` column appears with status chips, safe skips, and recovery streaks.
   - Click `+X skips` badge: anchored popover appears with exact formula breakdown and quick future forecast.
   - Click `Need Y` badge: anchored popover appears with consecutive recovery plan.
   - Click the inline "What-If Simulator ▾" button: reveals the multi-subject forecaster without obscuring the table.

3. **Internal Marks Page (`/Student/Academic/GetInternalMarks`)**:
   - Confirm original marks table is untouched.
   - Test what-if inputs for assessment components.
   - Click "Inspect Assumptions" or target badges: anchored popover appears explaining MTE/CWS/ETE weights and ETE score goals.
   - Verify simulated semester SGPA updates live.

4. **Grade Card Page (`/Student/Academic/GetGradesForFaculty`)**:
   - Confirm CGPA Predictor and Target CGPA Planner appear as distinct cards.
   - Test Scenario A vs Scenario B in the CGPA Predictor and inspect the dual-curve SVG chart.
   - In Target CGPA Planner, click a preset (e.g. 8.5) and verify feasibility badge and per-semester allocations.

5. **Timetable Page (`/Student/Academic/TimeTable`)**:
   - Check if current class shows a live indicator.
   - Verify next class and room display correctly.
   - Verify free period gaps are surfaced.
   - Click any timetable event in the calendar to open an anchored popover with full course info and linked attendance.
   - Click "Refresh Snapshot" to verify manual refresh.

6. **Home / Dashboard Page (`/Home/Index`)**:
   - Verify "Today at a Glance" card is injected at the top of content.
   - Verify all original notices, cards, and quick widgets remain completely functional.

7. **Universal Floating Intelligence Hub**:
   - Click the bottom-right floating "MUJX" button on any page.
   - Verify the tabbed drawer slides open smoothly without obscuring the main content.
   - Switch between Alerts, Attendance, Marks & SGPA, CGPA Predictor, Target Planner, Timetable, and Settings.
   - Verify keyboard support: Press `Escape` to close drawer; press `Enter` or `Space` on the pill to toggle.

8. **Extension Popup**:
   - Click the extension icon in Chrome toolbar.
   - Toggle off any feature and reload the page: verify extras disappear while page works.
   - Toggle it back on: verify extras re-appear.

9. **Settings Page**:
   - Open options page from popup or the Settings tab in the drawer.
   - Change threshold to 80% and save. Reload attendance page: verify safe skips recalculate based on 80%.

10. **Reversibility & Uninstallation**:
    - Open `chrome://extensions` and toggle the extension switch off.
    - Refresh SLCM: verify the page returns to 100% vanilla state with zero leftover DOM nodes or styling artifacts.
