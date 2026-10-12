import { parseNumber } from "../shared/dom.js";

export function normalizeAttendanceRow(raw) {
  const present = firstNumber(raw, ["present", "Present", "PresentCount", "TotalPresent"]);
  const total = firstNumber(raw, ["total", "Total", "TotalClass", "TotalClasses", "Conducted"]);
  const absent = firstNumber(raw, ["absent", "Absent", "AbsentCount"]);
  const percent = firstNumber(raw, ["percent", "Percentage", "AttendancePercentage"]);
  const theoryPresent = firstNumber(raw, ["theoryPresent", "TheoryPresent"]);
  const theoryTotal = firstNumber(raw, ["theoryTotal", "TheoryTotal"]);
  const practicalPresent = firstNumber(raw, ["practicalPresent", "PracticalPresent"]);
  const practicalTotal = firstNumber(raw, ["practicalTotal", "PracticalTotal"]);
  return {
    id: String(raw.id ?? raw.CourseCode ?? raw.SubjectCode ?? raw.courseCode ?? raw.subject ?? cryptoRandom()),
    courseCode: raw.courseCode ?? raw.CourseCode ?? raw.SubjectCode ?? "",
    subject: raw.subject ?? raw.CourseName ?? raw.SubjectName ?? raw.name ?? "Untitled course",
    present: present ?? (total !== null && absent !== null ? total - absent : null),
    absent: absent ?? (total !== null && present !== null ? total - present : null),
    total,
    percent,
    theoryPresent,
    theoryTotal,
    practicalPresent,
    practicalTotal,
    source: raw.source || "unknown",
  };
}

export function normalizeMarkRow(raw) {
  return {
    id: String(raw.id ?? raw.AssessmentId ?? raw.Component ?? cryptoRandom()),
    courseCode: raw.courseCode ?? raw.CourseCode ?? "",
    subject: raw.subject ?? raw.CourseName ?? raw.SubjectName ?? "",
    component: raw.component ?? raw.AssessmentName ?? raw.ExamType ?? raw.name ?? "Assessment",
    obtained: firstNumber(raw, ["obtained", "MarksObtained", "ObtainedMarks", "Marks"]),
    maximum: firstNumber(raw, ["maximum", "MaxMarks", "TotalMarks"]),
    weight: firstNumber(raw, ["weight", "Weightage", "Weight"]),
    credits: firstNumber(raw, ["credits", "Credits", "Credit"]),
    letter: raw.letter ?? raw.Grade ?? raw.OfficialGrade ?? null,
    source: raw.source || "unknown",
  };
}

export function normalizeGradeRow(raw) {
  const sessionVal = raw.session ?? raw.AcademicSession ?? raw.academicSession ?? raw.semester ?? raw.Semester ?? raw.SemesterName ?? null;
  return {
    id: String(raw.id ?? raw.CourseCode ?? cryptoRandom()),
    courseCode: raw.courseCode ?? raw.CourseCode ?? "",
    subject: raw.subject ?? raw.CourseName ?? "",
    credits: firstNumber(raw, ["credits", "Credits", "Credit"]),
    letter: raw.letter ?? raw.Grade ?? raw.GradeLetter ?? null,
    gradePoints: firstNumber(raw, ["gradePoints", "GradePoint", "GP"]),
    semester: sessionVal,
    session: sessionVal,
    excludeFromGpa: Boolean(raw.excludeFromGpa),
    source: raw.source || "unknown",
  };
}

export function normalizeEvent(raw) {
  return {
    id: String(raw.id ?? raw.EventId ?? cryptoRandom()),
    title: raw.title ?? raw.EventName ?? raw.SubjectName ?? raw.CourseName ?? "Event",
    courseCode: raw.courseCode ?? raw.CourseCode ?? "",
    start: raw.start ?? raw.StartDate ?? raw.StartTime ?? raw.FromTime ?? null,
    end: raw.end ?? raw.EndDate ?? raw.EndTime ?? raw.ToTime ?? null,
    room: raw.room ?? raw.RoomNo ?? raw.Venue ?? raw.Location ?? "",
    type: raw.type ?? raw.EventType ?? raw.SlotType ?? "",
    cancelled: Boolean(raw.cancelled ?? raw.IsCancelled),
    source: raw.source || "unknown",
  };
}

export function fingerprint(value) {
  const json = JSON.stringify(value);
  let hash = 0;
  for (let i = 0; i < json.length; i += 1) {
    hash = (hash * 31 + json.charCodeAt(i)) | 0;
  }
  return String(hash);
}

function firstNumber(raw, keys) {
  for (const key of keys) {
    if (raw[key] !== undefined && raw[key] !== null && raw[key] !== "") {
      const n = parseNumber(raw[key]);
      if (n !== null) return n;
    }
  }
  return null;
}

function cryptoRandom() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `row-${Math.random().toString(16).slice(2)}`;
}
