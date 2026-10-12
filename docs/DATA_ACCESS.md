# Data access

## Hosts

Verified DNS/HTTP during this project:

- `https://mujslcm.jaipur.manipal.edu/` — public GET returned `302 Location: /Home/Logout` (IIS/ASP.NET).
- Alternate host `https://muj.slcm.jaipur.manipal.edu/` appears in public listings; it is included in `host_permissions` but was not separately probed in all tests.

No student login was used. Authenticated HTML, table markup, and JSON payloads remain **unverified**.

## Session and security

Content-script `fetch` uses `credentials: "include"` so Chrome sends the user’s existing SLCM cookies. The extension:

- does not bypass login
- does not hard-code student IDs
- reads `__RequestVerificationToken` from the **current page DOM only**, at request time
- never writes tokens, cookies, or passwords to `chrome.storage`
- treats login/logout HTML and redirects as session expiry
- times out at 12s, retries once on transient failure, and deduplicates in-flight requests

## Candidate JSON routes

These paths exist on the live host: unauthenticated GET returned **HTTP 403** with JSON `{"IsSuccessfull":false,"ErrorMessage":"Forbidden"}` for:

- `/Student/Academic/GetAttendanceSummaryList`
- `/Student/Academic/GetGradesForFaculty`
- `/Student/Academic/GetEventDetailStudent`
- `/Student/Academic/GetStudentCalenderEventList`
- `/Student/Academic/GetInternalMarks`

That confirms the routes are present and session-gated. It does **not** confirm authenticated schema, list property names, or POST bodies.

The client therefore accepts several common wrappers (`AttendanceSummaryList`, `Data`, `data`, `GradeList`, `EventList`, `CalenderEventList`) and reports `unexpected_shape` with top-level keys only (no record dump) if the payload differs.

Unauthenticated GET of HTML-looking academic pages:

- `/Student/Academic/Attendance` → `302 /Home/Logout`
- `/Student/Academic/TimeTable` → `302 /Home/Logout`
- `/Home/Index` → `302 /Home/Logout`

## Preferred source order

1. Parse tables and headings already rendered (no extra request).
2. Only then optionally POST to a candidate endpoint from a signed-in page if a feature still lacks data.
3. If both fail, show an honest empty/error state. Never substitute fake academic records.

## Unresolved until a signed-in check

- Exact attendance/marks/grades table IDs and column order on current SLCM.
- Authenticated JSON property names and whether anti-forgery is required on POST.
- Whether theory/practical attendance is split in the current UI.
- Whether calendar events expose reliable start/end timestamps vs. day-only labels.
- Home-page quick links (`/Student/Academic/Attendance`, `/Student/Academic/TimeTable`) — likely, not confirmed after login.
