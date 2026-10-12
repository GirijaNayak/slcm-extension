# MUJX — MUJ SLCM Enhanced

A premium, non-destructive Manifest V3 Chrome Extension that **enhances the Manipal University Jaipur (MUJ) SLCM portal in place**.

The extension operates directly inside the existing SLCM interface without replacing, cloning, or damaging the original website. Disabling or uninstalling the extension cleanly removes all injected elements (`mujx-` / `data-mujx`) and leaves the portal completely untouched.

---

## Highlights & Features

| Feature | In-Place Enhancement | Contextual Overlay & Non-Destructive Guarantee |
| :--- | :--- | :--- |
| **A. Attendance Intelligence** | Injected `MUJX Intel` column with real-time safe skips, classes needed for recovery, status chips, multi-mode what-if simulation, and theory/lab split. | **Anchored Popovers**: Click any safe skips badge or recovery badge to inspect the exact formula breakdown, substituted parameters, and interactive future forecast without obscuring the table. |
| **B. Marks & SGPA Predictor** | Subject summaries, institutional MTE/CWS/ETE weighting, what-if marks, required ETE score calculator for target grades, credit-weighted SGPA estimation. | **Anchored Popovers**: Click to inspect evaluation scheme assumptions and required ETE scores. Kept strictly distinct from official marks. |
| **C. CGPA Predictor** | Independent multi-semester forward projection, dual scenario comparisons (Scenario A vs B), interactive SVG progression curves with tooltips. | Uses the official credit-weighted CGPA identity from the authoritative MUJ calculation certificate rather than simple GPA averaging. |
| **D. Target CGPA Planner** | Distinct goal-oriented planner calculating required average SGPA, feasibility badges (Feasible / High Effort / Impossible), max achievable CGPA, semester credit allocation. | Strictly accounts for remaining credits and institutional grade caps (10.0). |
| **E. Timetable Enhancements** | Live class indicator with pulsing marker, upcoming class countdown & room, break/gap analysis, schedule conflict detection, timetable snapshot change tracking. | **Anchored Popovers**: Click any calendar event to view class venue, start/end times, and linked course attendance. Calendar drag and navigation stay intact. |
| **F. Academic Notifications** | Low-attendance alerts, borderline notices, timetable change alerts, marks update alerts, dismissible list, local history. | 100% browser-local; deduplicated and persistent dismissal in `chrome.storage.local`. |
| **G. Home Glance Card** | Executive "Today at a Glance" card on the SLCM dashboard summarizing attendance health, upcoming classes, and quick portal links. | Preserves all official university notices and home dashboard widgets without pushing content down. |
| **H. Universal Floating Hub** | Floating MUJX button at bottom-right opening a tabbed intelligence drawer on any authenticated SLCM page. | Keyboard navigable (`Enter`/`Space` to toggle, `Escape` to close), accessible ARIA support, remembers minimized state. |

---

## Authoritative GPA / CGPA Calculation Verification

Verified against the official **MUJ Certificate of GPA and CGPA Calculation Process** (`Certificate-of-GPA-And-CGPA-Calculation-Process.pdf`):

- **Course-level GPA**:
  $$\text{GPA} = \frac{\sum_{i=1}^n (C_i \cdot G_i)}{\sum_{i=1}^n C_i}$$
  *Certificate Example*: 8 courses, 25 credits, total grade points 212 $\implies \text{GPA} = 8.48$.
- **Cumulative CGPA**:
  $$\text{CGPA} = \frac{\sum_{j=1}^N (\text{GPA}_j \cdot C_j)}{\sum_{j=1}^N C_j}$$
  *Certificate Example*: 4 semesters (GPAs 8.48, 8.62, 8.24, 8.42 over credits 25, 25, 26, 26) $\implies \text{Total Credits} = 102$, $\text{CGPA} = 8.44$.
- **Regression Tested**: Automated test suite explicitly validates both the course-level 8.48 GPA and the 8.44 cumulative CGPA regression cases.

---

## Installation Instructions (Load Unpacked)

1. **Clone or Download** this directory to your machine:
   ```bash
   cd C:\Users\girijanayak\muj-sclm-enhanced
   ```
2. **Build the Content Script Bundle**:
   ```bash
   npm run build
   ```
   *(A pre-built `dist/content.bundle.js` is included so the extension is ready to load immediately!)*
3. **Run Unit Tests**:
   ```bash
   npm test
   ```
4. **Open Chrome Extensions Page**:
   - Navigate to `chrome://extensions` in Google Chrome.
   - Enable **Developer mode** toggle in the top-right corner.
5. **Load the Extension**:
   - Click the **Load unpacked** button.
   - Select the `muj-sclm-enhanced` directory.
6. **Sign In to SLCM**:
   - Navigate to [https://mujslcm.jaipur.manipal.edu](https://mujslcm.jaipur.manipal.edu) and log in with your student credentials.
   - Open Attendance, Marks, Grades, Timetable, or Home to view the live enhancements!

---

## Development & Test Commands

- **Build content bundle**:
  ```bash
  npm run build
  ```
- **Build with auto-rebuild on change**:
  ```bash
  npm run build:watch
  ```
- **Run automated test suite (49 tests)**:
  ```bash
  npm test
  ```
- **Run tests in watch mode**:
  ```bash
  npm run test:watch
  ```

---

## Privacy, Security & Data Handling

- **Narrow Host Permissions**: Scoped strictly to `https://mujslcm.jaipur.manipal.edu/*` and `https://muj.slcm.jaipur.manipal.edu/*`.
- **Zero External Transmissions**: Academic data, attendance figures, and calculated grades remain 100% inside your browser session. No data is ever transmitted to an external server.
- **Session Respect**: Uses your existing browser cookies (`credentials: "include"`). Never requests, reads, or stores your password, session IDs, or anti-forgery tokens.
- **Local Cache**: Preferences and snapshot fingerprints are stored in `chrome.storage.local` and can be cleared at any time via the extension popup or hub settings.

---

## Documentation

- [docs/DATA_ACCESS.md](docs/DATA_ACCESS.md): Verified network endpoints, session handling, and candidate route documentation.
- [docs/GRADING_RULES.md](docs/GRADING_RULES.md): Official MUJ Examination Handbook 2023-24 grading rules, letter grade points, and formulas.
- [docs/TEST_REPORT.md](docs/TEST_REPORT.md): Complete automated test breakdown (49 tests), live endpoint results, and manual integration checklist.
