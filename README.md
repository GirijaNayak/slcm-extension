# MUJ SLCM Enhanced (MUJX)

[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-blue?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Node Version](https://img.shields.io/badge/Node-%3E%3D20.0.0-green?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/Tests-96%20Passing-success?logo=githubactions&logoColor=white)]()
[![Privacy](https://img.shields.io/badge/Security-Zero%20Telemetry-informational?logo=shield&logoColor=white)]()

A high-performance, non-destructive enterprise Chrome extension that enhances the **Manipal University Jaipur (MUJ) SLCM Portal** in place. It injects real-time attendance analytics, credit-weighted provisional grade prediction, target CGPA planning, and schedule tracking directly into the portal without modifying core SLCM backend states or destroying native DOM layouts.

---

## Key Capabilities

- **Attendance Intelligence**: Computes safe skips, classes needed for target attendance (75%), multi-scenario what-if simulations, and theory/lab splits via anchored popovers.
- **Marks & Provisional SGPA Forecasting**: Predicts provisional course grades and credit-weighted SGPA using live internal marks and configurable End Term Exam (ETE) targets.
- **Official Institutional Grading Support**: Automatically classifies Theory, Lab, Project-Based Learning (PBL), and Satisfactory/Unsatisfactory (S/U) courses. Correctly excludes non-graded subjects from the GPA divisor.
- **Target CGPA Planner**: Reverse-calculates required future SGPA and per-course milestones based on official university credit weightings and grade boundaries.
- **Timetable & Schedule Operations**: Highlights active classes, upcoming countdowns, room locations, and break intervals with conflict detection.
- **Persistent Preferences**: Remembers user-adjusted credits, target scores, and ETE estimates locally across page refreshes via `chrome.storage.local`.

---

## Architecture & Design Principles

```text
┌─────────────────────────────────────────────────────────────┐
│                      MUJ SLCM Portal                        │
│            (mujslcm.jaipur.manipal.edu)                     │
└──────────────┬───────────────────────────────┬──────────────┘
               ▼                               ▼
    ┌─────────────────────┐         ┌─────────────────────┐
    │ Native Portal DOM   │         │ Background Services │
    │ (Untouched Context) │         │ (Session & Storage) │
    └──────────┬──────────┘         └──────────┬──────────┘
               │                               │
               ▼                               ▼
    ┌─────────────────────────────────────────────────────────┐
    │              MUJX Content Script Bundles                │
    │  • dist/marks.bundle.js   • dist/grades.bundle.js       │
    │  • dist/content.bundle.js • src/content/timetable.js    │
    ├─────────────────────────────────────────────────────────┤
    │  • In-Place Non-Destructive DOM Hydration               │
    │  • Deterministic Calculation Engines (SGPA / Skips)     │
    │  • Local State Management (chrome.storage.local)        │
    └─────────────────────────────────────────────────────────┘
```

1. **Non-Destructive In-Place Hydration**: Extension elements use isolated attributes (`data-mujx`) and CSS namespaces. Disabling or uninstalling cleanly restores the stock SLCM interface.
2. **Zero Telemetry / Privacy First**: 100% client-side execution. Academic records, attendance figures, and calculations never leave the user's browser.
3. **Rigorous Verification**: Math models adhere to the official *MUJ Certificate of GPA and CGPA Calculation Process* and university grading handbooks.

---

## Directory Structure

```text
muj-sclm-enhanced/
├── dist/                     # Production bundles (esbuild)
│   ├── content.bundle.js     # Global portal lifecycle bundle
│   ├── grades.bundle.js      # Grade sheet intelligence bundle
│   └── marks.bundle.js       # Internal marks & prediction bundle
├── docs/                     # Technical specifications & calculation rules
├── src/
│   ├── background/           # Service worker & extension lifecycle
│   ├── calculations/         # Core deterministic math models (SGPA, skips, ETE)
│   ├── content/              # Content scripts & route bootstrap observers
│   ├── data/                 # Adapters & DOM parsers for SLCM tables
│   ├── shared/               # Shared constants, DOM utilities, and themes
│   └── ui/                   # Modular components, floating hub, and styles
├── tests/                    # Automated Node test runner suites (96 tests)
├── manifest.json             # Chromium Manifest V3 extension configuration
└── package.json              # Build scripts and project dependencies
```

---

## Getting Started

### Prerequisites
- Google Chrome, Brave, Edge, or any Chromium-based browser (v110+)
- [Node.js](https://nodejs.org/) `>= 20.0.0`
- `npm` `>= 9.0.0`

### 1. Build Production Bundles
```bash
# Clone the repository
git clone https://github.com/your-org/muj-sclm-enhanced.git
cd muj-sclm-enhanced

# Install development dependencies
npm install

# Compile content bundles via esbuild
npm run build
```

### 2. Load Extension in Chromium Browser
1. Open Chrome and navigate to `chrome://extensions`.
2. Toggle **Developer mode** on in the top-right corner.
3. Click **Load unpacked** in the top-left toolbar.
4. Select the `muj-sclm-enhanced` root folder.
5. Log into [MUJ SLCM](https://mujslcm.jaipur.manipal.edu) to verify features.

---

## Development & Testing

```bash
# Run the complete test suite (96 automated test cases)
npm test

# Run tests in continuous watch mode
npm run test:watch

# Compile content bundles in watch mode
npm run build:watch
```

---

## Security & Compliance

- **Least Privilege Access**: Host permissions are strictly restricted to `*://mujslcm.jaipur.manipal.edu/*` and `*://muj.slcm.jaipur.manipal.edu/*`.
- **Credential Safety**: Respects existing authenticated sessions (`credentials: "include"`). Passwords, tokens, and captcha responses are neither captured nor stored.
- **Auditable Math Engines**: All formulas (SGPA, attendance bounds, required ETE) are decoupled into unit-tested pure functions under `src/calculations/`.

---

## License

This project is proprietary and intended for student and academic use at Manipal University Jaipur.
