export const NS = "mujx";
export const BOOT_FLAG = "__MUJX_BOOTED";
export const HOST_ROOT_ATTR = "data-mujx-root";
export const INJECT_ATTR = "data-mujx";

export const HOSTS = [
  "mujslcm.jaipur.manipal.edu",
  "muj.slcm.jaipur.manipal.edu",
];

export const DEFAULT_PREFERENCES = Object.freeze({
  features: {
    attendance: true,
    marks: true,
    sgpa: true,
    cgpaPredictor: true,
    targetCgpa: true,
    timetable: true,
    notifications: true,
    homePanel: true,
    feedbackAssistant: true,
  },
  attendanceThreshold: 75,
  borderlineBand: 5,
  theme: "auto",
  autoRefreshMinutes: 0,
  showTheoryPracticalSplit: true,
  gradeCap: 10,
  assumedInternalWeights: {
    source: "muj-exam-handbook-2023-24",
    note: "MTE 30 / CWS 30 / ETE 40 except Faculty of Design. Used only when the portal does not expose weights.",
    mte: 30,
    cws: 30,
    ete: 40,
  },
  absoluteGradeBoundaries: [],
});

export const DEFAULT_FEEDBACK_PREFERENCES = Object.freeze({
  defaultYesNo: "YES", // "YES" or "NO"
  defaultDropdownStrategy: "highest_positive", // "highest_positive" (Strongly Agree / Agree / 5-star) or exact text
  defaultComment: "The course was well structured and classes were conducted regularly with clear explanations.",
  fillComments: true,
  preserveExistingComments: true,
  preserveExistingAnswers: false,
  overrides: {}, // normalized question text -> answer ("YES", "NO", "Strongly Agree", etc.)
});

export const MUJ_GRADE_POINTS = Object.freeze({
  "A+": 10,
  A: 9,
  B: 8,
  C: 7,
  D: 6,
  E: 5,
  AP: 0,
  F: 0,
  I: 0,
  DT: 0,
  S: 0,
  U: 0,
});

export const MUJ_NON_EVALUATIVE_GRADES = Object.freeze(["S", "U", "AP"]);

export const CANDIDATE_ENDPOINTS = Object.freeze({
  attendanceSummary: "/Student/Academic/GetAttendanceSummaryList",
  gradesForFaculty: "/Student/Academic/GetGradesForFaculty",
  eventDetail: "/Student/Academic/GetEventDetailStudent",
  calendarEvents: "/Student/Academic/GetStudentCalenderEventList",
});

export const PAGE_KINDS = Object.freeze({
  login: "login",
  home: "home",
  attendance: "attendance",
  marks: "marks",
  grades: "grades",
  timetable: "timetable",
  feedback: "feedback",
  other: "other",
});

export const STORAGE_KEYS = Object.freeze({
  preferences: "mujx.preferences",
  cache: "mujx.cache",
  notifications: "mujx.notifications",
  dismissed: "mujx.dismissed",
  timetableSnapshot: "mujx.timetableSnapshot",
  hubState: "mujx.hubState",
  feedbackPreferences: "mujx.feedbackPreferences",
  feedbackDrafts: "mujx.feedbackDrafts",
  feedbackTracker: "mujx.feedbackTracker",
});
