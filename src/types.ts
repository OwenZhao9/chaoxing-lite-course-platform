export type Role = "admin" | "teacher" | "student";

export interface User {
  id: string;
  name: string;
  role: Role;
  avatarUrl?: string;
  classIds?: string[];
  account?: string;
  createdAt?: string;
}

export interface Course {
  id: string;
  title: string;
  code: string;
  description: string;
  coverUrl: string;
  teacherId: string;
  term: string;
  creditHours: number;
}

export interface Unit {
  id: string;
  courseId: string;
  title: string;
  summary: string;
  order: number;
}

export interface Session {
  id: string;
  unitId: string;
  title: string;
  summary: string;
  order: number;
  durationMinutes: number;
  unlockAt?: string;
  contentBlocks: SessionContentBlock[];
}

export type ResourceType = "ppt" | "video" | "audio" | "pdf" | "download";

export type SessionContentBlockType = "text" | "image" | "audio" | "video";

export interface SessionContentBlock {
  id: string;
  type: SessionContentBlockType;
  content?: string;
  format?: "plain" | "html";
  url?: string;
  fileName?: string;
  caption?: string;
  createdAt: string;
}

export interface Resource {
  id: string;
  courseId: string;
  unitId?: string;
  sessionId?: string;
  title: string;
  type: ResourceType;
  fileName: string;
  url: string;
  sizeMb: number;
  durationMinutes?: number;
  uploadedBy: string;
  createdAt: string;
  downloadable: boolean;
}

export type QuestionType = "single" | "multiple" | "blank" | "reading" | "writing" | "true_false" | "short_answer" | "subjective";

export type QuestionMediaType = "image" | "audio" | "video";

export interface QuestionMedia {
  id: string;
  type: QuestionMediaType;
  url: string;
  fileName: string;
}

export interface ReadingSubQuestion {
  id: string;
  stem: string;
  options?: string[];
  answer: string;
  analysis?: string;
}

export interface Question {
  id: string;
  courseId: string;
  type: QuestionType;
  stem: string;
  options?: string[];
  media?: QuestionMedia[];
  subQuestions?: ReadingSubQuestion[];
  answer: string | string[];
  analysis: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  createdBy: string;
}

export interface CourseClass {
  id: string;
  courseId: string;
  name: string;
  teacherId: string;
  studentIds: string[];
  joinCode: string;
  createdAt: string;
}

export interface ExamPaper {
  id: string;
  courseId: string;
  title: string;
  questionIds: string[];
  totalScore: number;
  difficulty: "easy" | "medium" | "hard";
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

export type AssignmentStatus = "draft" | "published" | "closed";

export interface Assignment {
  id: string;
  courseId: string;
  classId: string;
  title: string;
  description: string;
  questionIds: string[];
  status: AssignmentStatus;
  publishedAt?: string;
  dueAt: string;
  createdBy: string;
}

export interface SubmissionAnswer {
  questionId: string;
  answer: string | string[];
  score?: number;
  reviewRequired?: boolean;
  teacherComment?: string;
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  answers: SubmissionAnswer[];
  submittedAt: string;
  score: number;
  autoScore?: number;
  status: "submitted" | "graded";
  teacherComment?: string;
  gradedAt?: string;
}

export interface CourseAnalytics {
  courseId: string;
  activeStudents: number;
  averageProgress: number;
  averageAssignmentScore: number;
  resourceViews: Array<{
    resourceId: string;
    views: number;
    completions: number;
  }>;
  classPerformance: Array<{
    classId: string;
    submittedAssignments: number;
    averageScore: number;
  }>;
  riskStudents: Array<{
    studentId: string;
    reason: string;
  }>;
}

export interface AiAssistantRequest {
  userId?: string;
  courseId: string;
  message: string;
  mode?: "explain" | "quiz" | "summary" | "resource";
  context?: {
    unitId?: string;
    sessionId?: string;
    resourceId?: string;
  };
}

export interface AiAssistantResponse {
  id: string;
  role: "assistant";
  message: string;
  suggestions: string[];
  citedResourceIds: string[];
  createdAt: string;
}

export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
  };
}

export interface CreateResourceInput {
  courseId: string;
  unitId?: string;
  sessionId?: string;
  title: string;
  type: ResourceType;
  fileName: string;
  url?: string;
  sizeMb?: number;
  durationMinutes?: number;
  downloadable?: boolean;
}

export interface CreateSessionInput {
  unitId: string;
  title: string;
  summary?: string;
  durationMinutes?: number;
}

export interface UpdateSessionInput {
  title?: string;
  summary?: string;
  durationMinutes?: number;
}

export interface CreateSessionBlockInput {
  type: SessionContentBlockType;
  content?: string;
  format?: "plain" | "html";
  url?: string;
  fileName?: string;
  caption?: string;
}

export type UpdateSessionBlockInput = Partial<CreateSessionBlockInput>;

export interface CreateUnitInput {
  courseId: string;
  title: string;
  summary?: string;
}

export interface UpdateUnitInput {
  title?: string;
  summary?: string;
}

export interface CreateQuestionInput {
  courseId: string;
  type: QuestionType;
  stem: string;
  options?: string[];
  media?: QuestionMedia[];
  subQuestions?: ReadingSubQuestion[];
  answer: string | string[];
  analysis: string;
  difficulty: Question["difficulty"];
  tags: string[];
}

export type UpdateQuestionInput = Partial<Omit<CreateQuestionInput, "courseId">>;

export interface CreatePaperInput {
  courseId: string;
  title: string;
  questionIds: string[];
  totalScore?: number;
  difficulty?: ExamPaper["difficulty"];
}

export interface UpdatePaperInput {
  title?: string;
  questionIds?: string[];
  totalScore?: number;
  difficulty?: ExamPaper["difficulty"];
}

export interface PublishPaperInput {
  classId: string;
  dueAt?: string;
}

export interface CreateUserInput {
  name: string;
  role: Role;
  account?: string;
}

export interface CreateClassInput {
  courseId: string;
  name: string;
  teacherId?: string;
  studentIds?: string[];
}

export interface CreateAssignmentInput {
  courseId: string;
  classId: string;
  title: string;
  description: string;
  questionIds: string[];
  dueAt: string;
  status?: AssignmentStatus;
}

export interface CreateSubmissionInput {
  assignmentId: string;
  studentId?: string;
  answers: SubmissionAnswer[];
}

export interface GradeSubmissionInput {
  answers: Array<{
    questionId: string;
    score: number;
    teacherComment?: string;
  }>;
  teacherComment?: string;
}

export interface JoinClassInput {
  joinCode: string;
}

export interface PlatformData {
  users: User[];
  courses: Course[];
  units: Unit[];
  sessions: Session[];
  resources: Resource[];
  questions: Question[];
  papers: ExamPaper[];
  classes: CourseClass[];
  assignments: Assignment[];
  submissions: Submission[];
  analytics: CourseAnalytics[];
}
