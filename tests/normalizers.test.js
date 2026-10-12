import assert from "node:assert/strict";
import test from "node:test";
import { fingerprint, normalizeAttendanceRow, normalizeEvent, normalizeGradeRow, normalizeMarkRow } from "../src/data/normalizers.js";

test("attendance normalizer maps alternate keys", () => {
  const row = normalizeAttendanceRow({
    CourseName: "Physics",
    PresentCount: "18",
    TotalClass: "24",
    AbsentCount: "6",
  });
  assert.equal(row.subject, "Physics");
  assert.equal(row.present, 18);
  assert.equal(row.total, 24);
});

test("malformed attendance stays numeric-null", () => {
  const row = normalizeAttendanceRow({ subject: "X", present: "n/a", total: "-" });
  assert.equal(row.present, null);
  assert.equal(row.total, null);
});

test("marks and grades ignore empty strings", () => {
  assert.equal(normalizeMarkRow({ MarksObtained: "", MaxMarks: "30" }).obtained, null);
  assert.equal(normalizeGradeRow({ Grade: "B", Credits: "4" }).credits, 4);
});

test("fingerprint is stable for identical payloads", () => {
  assert.equal(fingerprint({ a: 1 }), fingerprint({ a: 1 }));
});

test("events copy room and times when present", () => {
  const event = normalizeEvent({ EventName: "DAA", RoomNo: "AB-101", StartTime: "10:00" });
  assert.equal(event.room, "AB-101");
  assert.equal(event.title, "DAA");
});
