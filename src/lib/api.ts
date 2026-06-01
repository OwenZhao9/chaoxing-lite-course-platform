import type {
  AiAssistantRequest,
  AiAssistantResponse,
  Assignment,
  Course,
  CourseAnalytics,
  CourseClass,
  CreateAssignmentInput,
  CreateClassInput,
  CreatePaperInput,
  CreateQuestionInput,
  CreateResourceInput,
  CreateSessionInput,
  CreateSessionBlockInput,
  CreateSubmissionInput,
  CreateUnitInput,
  CreateUserInput,
  GradeSubmissionInput,
  JoinClassInput,
  ExamPaper,
  PlatformData,
  PublishPaperInput,
  Question,
  Resource,
  ResourceType,
  Role,
  Session,
  SessionContentBlock,
  Submission,
  Unit,
  UpdateQuestionInput,
  UpdatePaperInput,
  UpdateSessionInput,
  UpdateSessionBlockInput,
  UpdateUnitInput,
  User,
} from "../types";
import { mockData } from "../data/mockData";

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const API_BASE_URL = env?.VITE_API_BASE_URL ?? "/api";
const BASE_URL = env?.BASE_URL ?? "/";
const STATIC_DEMO = env?.VITE_STATIC_DEMO === "true" || env?.MODE === "github-pages";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export interface RequestOptions {
  userId?: string;
  signal?: AbortSignal;
}

type QueryValue = string | number | boolean | undefined | null;
type QueryParams = Record<string, QueryValue>;

function withQuery(path: string, query?: QueryParams) {
  const origin =
    API_BASE_URL.startsWith("http") ? API_BASE_URL : `${globalThis.location?.origin ?? "http://localhost:5173"}${API_BASE_URL}`;
  const url = new URL(`${origin}${path}`);
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

async function request<T>(path: string, options: RequestOptions & {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: QueryParams;
  body?: unknown;
} = {}): Promise<T> {
  const response = await fetch(withQuery(path, options.query), {
    method: options.method ?? "GET",
    signal: options.signal,
    headers: {
      "Content-Type": "application/json",
      ...(options.userId ? { "x-user-id": options.userId } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => undefined);
    throw new ApiError(
      response.status,
      payload?.error?.code ?? "REQUEST_FAILED",
      payload?.error?.message ?? `请求失败：${response.status}`,
    );
  }

  return response.json() as Promise<T>;
}

const liveApi = {
  health: () => request<{ ok: boolean; service: string; at: string }>("/health"),

  me: (options?: RequestOptions) => request<User>("/me", options),

  users: (query?: { role?: Role }, options?: RequestOptions) =>
    request<User[]>("/users", { ...options, query }),

  createUser: (input: CreateUserInput, options?: RequestOptions) =>
    request<User>("/users", { ...options, method: "POST", body: input }),

  courses: () => request<Course[]>("/courses"),

  course: (courseId: string) => request<Course>(`/courses/${courseId}`),

  units: (courseId: string) => request<Unit[]>(`/courses/${courseId}/units`),

  createUnit: (input: CreateUnitInput, options?: RequestOptions) =>
    request<Unit>("/units", { ...options, method: "POST", body: input }),

  updateUnit: (unitId: string, input: UpdateUnitInput, options?: RequestOptions) =>
    request<Unit>(`/units/${unitId}`, { ...options, method: "PATCH", body: input }),

  deleteUnit: (unitId: string, options?: RequestOptions) =>
    request<{ deleted: string }>(`/units/${unitId}`, { ...options, method: "DELETE" }),

  sessions: (unitId: string) => request<Session[]>(`/units/${unitId}/sessions`),

  createSession: (input: CreateSessionInput, options?: RequestOptions) =>
    request<Session>("/sessions", { ...options, method: "POST", body: input }),

  updateSession: (sessionId: string, input: UpdateSessionInput, options?: RequestOptions) =>
    request<Session>(`/sessions/${sessionId}`, { ...options, method: "PATCH", body: input }),

  deleteSession: (sessionId: string, options?: RequestOptions) =>
    request<{ deleted: string }>(`/sessions/${sessionId}`, { ...options, method: "DELETE" }),

  addSessionBlock: (sessionId: string, input: CreateSessionBlockInput, options?: RequestOptions) =>
    request<SessionContentBlock>(`/sessions/${sessionId}/blocks`, { ...options, method: "POST", body: input }),

  deleteSessionBlock: (sessionId: string, blockId: string, options?: RequestOptions) =>
    request<{ deleted: string }>(`/sessions/${sessionId}/blocks/${blockId}`, { ...options, method: "DELETE" }),

  updateSessionBlock: (sessionId: string, blockId: string, input: UpdateSessionBlockInput, options?: RequestOptions) =>
    request<SessionContentBlock>(`/sessions/${sessionId}/blocks/${blockId}`, { ...options, method: "PATCH", body: input }),

  sessionResources: (sessionId: string, options?: RequestOptions) =>
    request<Resource[]>(`/sessions/${sessionId}/resources`, options),

  resources: (
    query?: { courseId?: string; unitId?: string; sessionId?: string; type?: ResourceType },
    options?: RequestOptions,
  ) => request<Resource[]>("/resources", { ...options, query }),

  createResource: (input: CreateResourceInput, options?: RequestOptions) =>
    request<Resource>("/resources", { ...options, method: "POST", body: input }),

  deleteResource: (resourceId: string, options?: RequestOptions) =>
    request<{ deleted: string }>(`/resources/${resourceId}`, { ...options, method: "DELETE" }),

  questions: (
    query?: { courseId?: string; difficulty?: Question["difficulty"]; tag?: string },
    options?: RequestOptions,
  ) => request<Question[]>("/questions", { ...options, query }),

  createQuestion: (input: CreateQuestionInput, options?: RequestOptions) =>
    request<Question>("/questions", { ...options, method: "POST", body: input }),

  updateQuestion: (questionId: string, input: UpdateQuestionInput, options?: RequestOptions) =>
    request<Question>(`/questions/${questionId}`, { ...options, method: "PATCH", body: input }),

  deleteQuestion: (questionId: string, options?: RequestOptions) =>
    request<{ deleted: string }>(`/questions/${questionId}`, { ...options, method: "DELETE" }),

  papers: (query?: { courseId?: string }, options?: RequestOptions) =>
    request<ExamPaper[]>("/papers", { ...options, query }),

  createPaper: (input: CreatePaperInput, options?: RequestOptions) =>
    request<ExamPaper>("/papers", { ...options, method: "POST", body: input }),

  updatePaper: (paperId: string, input: UpdatePaperInput, options?: RequestOptions) =>
    request<ExamPaper>(`/papers/${paperId}`, { ...options, method: "PATCH", body: input }),

  deletePaper: (paperId: string, options?: RequestOptions) =>
    request<{ deleted: string }>(`/papers/${paperId}`, { ...options, method: "DELETE" }),

  publishPaper: (paperId: string, input: PublishPaperInput, options?: RequestOptions) =>
    request<Assignment>(`/papers/${paperId}/publish`, { ...options, method: "POST", body: input }),

  classes: (query?: { courseId?: string }, options?: RequestOptions) =>
    request<CourseClass[]>("/classes", { ...options, query }),

  createClass: (input: CreateClassInput, options?: RequestOptions) =>
    request<CourseClass>("/classes", { ...options, method: "POST", body: input }),

  joinClass: (input: JoinClassInput, options?: RequestOptions) =>
    request<CourseClass>("/classes/join", { ...options, method: "POST", body: input }),

  removeStudentFromClass: (classId: string, studentId: string, options?: RequestOptions) =>
    request<CourseClass>(`/classes/${classId}/students/${studentId}`, { ...options, method: "DELETE" }),

  assignments: (
    query?: { courseId?: string; classId?: string; status?: Assignment["status"] },
    options?: RequestOptions,
  ) => request<Assignment[]>("/assignments", { ...options, query }),

  assignmentQuestions: (assignmentId: string, options?: RequestOptions) =>
    request<Question[]>(`/assignments/${assignmentId}/questions`, options),

  createAssignment: (input: CreateAssignmentInput, options?: RequestOptions) =>
    request<Assignment>("/assignments", { ...options, method: "POST", body: input }),

  submissions: (
    query?: { assignmentId?: string; studentId?: string },
    options?: RequestOptions,
  ) => request<Submission[]>("/submissions", { ...options, query }),

  createSubmission: (input: CreateSubmissionInput, options?: RequestOptions) =>
    request<Submission>("/submissions", { ...options, method: "POST", body: input }),

  gradeSubmission: (submissionId: string, input: GradeSubmissionInput, options?: RequestOptions) =>
    request<Submission>(`/submissions/${submissionId}/grade`, { ...options, method: "PATCH", body: input }),

  courseAnalytics: (courseId: string, options?: RequestOptions) =>
    request<CourseAnalytics>(`/analytics/course/${courseId}`, options),

  askAiAssistant: (input: AiAssistantRequest, options?: RequestOptions) =>
    request<AiAssistantResponse>("/ai/assistant", { ...options, method: "POST", body: input }),
};

const staticDb: PlatformData = applyStaticAssetBase(structuredClone(mockData));

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function staticPublicUrl(url?: string) {
  if (!url?.startsWith("/mock/")) return url;
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  return `${base}${url.slice(1)}`;
}

function applyStaticAssetBase(data: PlatformData) {
  data.courses.forEach((course) => {
    course.coverUrl = staticPublicUrl(course.coverUrl) ?? course.coverUrl;
  });
  data.sessions.forEach((session) => {
    session.contentBlocks.forEach((block) => {
      block.url = staticPublicUrl(block.url);
    });
  });
  data.resources.forEach((resource) => {
    resource.url = staticPublicUrl(resource.url) ?? resource.url;
  });
  data.questions.forEach((question) => {
    question.media = question.media?.map((item) => ({
      ...item,
      url: staticPublicUrl(item.url) ?? item.url,
    }));
  });
  return data;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function staticOk<T>(value: T): Promise<T> {
  return Promise.resolve(clone(value));
}

function staticFail<T>(status: number, code: string, message: string): Promise<T> {
  return Promise.reject(new ApiError(status, code, message));
}

function staticCurrentUser(options?: RequestOptions): User {
  return staticDb.users.find((user) => user.id === options?.userId) ?? staticDb.users[0];
}

function staticRequireRole(options: RequestOptions | undefined, roles: Role[]) {
  const user = staticCurrentUser(options);
  if (!roles.includes(user.role)) {
    throw new ApiError(403, "FORBIDDEN", `当前角色 ${user.role} 无权访问该接口`);
  }
  return user;
}

function staticIsCourseTeacher(user: User, courseId: string) {
  const course = staticDb.courses.find((item) => item.id === courseId);
  return user.role === "teacher" && course?.teacherId === user.id;
}

function staticCanManageTeaching(user: User, courseId: string) {
  return user.role === "admin" || staticIsCourseTeacher(user, courseId);
}

function staticVisibleClassesFor(user: User) {
  if (user.role === "admin") return staticDb.classes;
  if (user.role === "teacher") return staticDb.classes.filter((item) => item.teacherId === user.id);
  return staticDb.classes.filter((item) => item.studentIds.includes(user.id));
}

function staticVisibleAssignmentsFor(user: User) {
  if (user.role === "admin") return staticDb.assignments;
  if (user.role === "teacher") {
    const classIds = new Set(staticVisibleClassesFor(user).map((item) => item.id));
    return staticDb.assignments.filter((item) => classIds.has(item.classId));
  }
  const classIds = new Set(staticVisibleClassesFor(user).map((item) => item.id));
  return staticDb.assignments.filter((item) => item.status === "published" && classIds.has(item.classId));
}

function sameText(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

const teacherReviewedQuestionTypes = new Set<Question["type"]>(["short_answer", "writing", "subjective"]);

function requiresTeacherReview(question?: Question) {
  return Boolean(question && teacherReviewedQuestionTypes.has(question.type));
}

function averageAnswerScore(answers: Submission["answers"]) {
  return answers.length
    ? Math.round(answers.reduce((total, answer) => total + (answer.score ?? 0), 0) / answers.length)
    : 0;
}

function gradeStaticSubmission(input: CreateSubmissionInput): Pick<Submission, "answers" | "score" | "status"> {
  const assignment = staticDb.assignments.find((item) => item.id === input.assignmentId);
  const questionById = new Map(staticDb.questions.map((question) => [question.id, question]));
  let needsTeacherReview = false;
  const answers = input.answers.map((answer) => {
    const question = questionById.get(answer.questionId);
    if (!assignment || !assignment.questionIds.includes(answer.questionId) || !question) {
      return { ...answer, score: 0 };
    }
    if (requiresTeacherReview(question)) {
      needsTeacherReview = true;
      return { ...answer, score: undefined, reviewRequired: true };
    }
    if (question.type === "reading" && question.subQuestions?.length) {
      const actualAnswers = Array.isArray(answer.answer) ? answer.answer : [answer.answer];
      const subScores: number[] = question.subQuestions.map((item, index) => (sameText(String(actualAnswers[index] ?? ""), item.answer) ? 100 : 0));
      const score = subScores.length ? Math.round(subScores.reduce((total, item) => total + item, 0) / subScores.length) : 0;
      return { ...answer, score };
    }
    if (question.type === "multiple") {
      const expected = Array.isArray(question.answer) ? [...question.answer].map(String).sort() : [String(question.answer)];
      const actual = Array.isArray(answer.answer) ? [...answer.answer].map(String).sort() : [String(answer.answer)];
      return { ...answer, score: JSON.stringify(actual) === JSON.stringify(expected) ? 100 : 0 };
    }
    return { ...answer, score: sameText(String(answer.answer), String(question.answer)) ? 100 : 0 };
  });
  const assignmentQuestions = assignment?.questionIds.map((questionId) => questionById.get(questionId)).filter(Boolean) ?? [];
  needsTeacherReview ||= assignmentQuestions.some((question) => requiresTeacherReview(question));
  const score = averageAnswerScore(answers);
  return { answers, score, status: needsTeacherReview ? "submitted" : "graded" };
}

function normalizeStaticQuestionInput(
  input: CreateQuestionInput | UpdateQuestionInput,
  fallback?: Question,
): Omit<Question, "id" | "courseId" | "createdBy"> | undefined {
  const type = input.type ?? fallback?.type;
  const stem = input.stem ?? fallback?.stem;
  const answer = input.answer ?? fallback?.answer;
  const difficulty = input.difficulty ?? fallback?.difficulty ?? "medium";
  const analysis = input.analysis ?? fallback?.analysis ?? "";
  const tags = input.tags ?? fallback?.tags ?? [];
  const options = input.options ?? fallback?.options;
  const media = input.media ?? fallback?.media ?? [];
  const subQuestions = input.subQuestions ?? fallback?.subQuestions;

  if (!type || !stem?.trim() || answer === undefined) {
    return undefined;
  }

  return {
    type,
    stem: stem.trim(),
    options: options?.map((option) => option.trim()).filter(Boolean),
    media: media.filter((item) => item.url && item.type && item.fileName),
    subQuestions: subQuestions
      ?.map((item) => ({
        ...item,
        stem: item.stem.trim(),
        options: item.options?.map((option) => option.trim()).filter(Boolean),
        answer: item.answer.trim(),
        analysis: item.analysis?.trim(),
      }))
      .filter((item) => item.stem || item.answer),
    answer,
    analysis,
    difficulty,
    tags: tags.map((tag) => tag.trim()).filter(Boolean),
  };
}

function normalizeStaticPaperInput(input: CreatePaperInput | UpdatePaperInput, fallback?: ExamPaper) {
  const title = input.title ?? fallback?.title;
  const questionIds = input.questionIds ?? fallback?.questionIds ?? [];
  const totalScore = input.totalScore ?? fallback?.totalScore ?? 100;
  const difficulty = input.difficulty ?? fallback?.difficulty ?? "medium";
  const validQuestionIds = questionIds.filter((questionId) => staticDb.questions.some((question) => question.id === questionId));
  if (!title?.trim() || validQuestionIds.length === 0) return undefined;
  return {
    title: title.trim(),
    questionIds: validQuestionIds,
    totalScore,
    difficulty,
  };
}

function staticAiResponse(input: AiAssistantRequest): AiAssistantResponse {
  const course = staticDb.courses.find((item) => item.id === input.courseId);
  const relatedResources = staticDb.resources
    .filter((item) => item.courseId === input.courseId)
    .filter((item) => !input.context?.resourceId || item.id === input.context.resourceId)
    .slice(0, 2);
  const modeText = input.mode === "quiz" ? "我可以基于题库生成练习思路" : input.mode === "summary" ? "我先给出本节概要" : "我会按课程资料解释";
  return {
    id: makeId("ai"),
    role: "assistant",
    message: `${modeText}：${course?.title ?? "当前课程"}中，“${input.message}”可以先从概念、例子和课后练习三步理解。（GitHub Pages 静态演示版不连接后端；本地运行 npm run dev 时会走 DeepSeek 真接口。）`,
    suggestions: ["查看相关课件", "生成 3 道练习题", "总结本节重点", "定位易错点"],
    citedResourceIds: relatedResources.map((item) => item.id),
    createdAt: nowIso(),
  };
}

const staticApi: typeof liveApi = {
  health: () => staticOk({ ok: true, service: "chaoxing-lite-static", at: nowIso() }),

  me: (options?: RequestOptions) => staticOk(staticCurrentUser(options)),

  users: (query?: { role?: Role }) =>
    staticOk(query?.role ? staticDb.users.filter((user) => user.role === query.role) : staticDb.users),

  createUser: (input: CreateUserInput, options?: RequestOptions) => {
    staticRequireRole(options, ["admin"]);
    if (!input.name || !input.role) return staticFail(400, "BAD_USER_INPUT", "name、role 为必填项");
    const user: User = {
      id: makeId(`u-${input.role}`),
      name: input.name,
      role: input.role,
      account: input.account ?? `${input.role}${staticDb.users.length + 1}`,
      classIds: input.role === "student" ? [] : undefined,
      createdAt: nowIso(),
    };
    staticDb.users.push(user);
    return staticOk(user);
  },

  courses: () => staticOk(staticDb.courses),

  course: (courseId: string) => {
    const course = staticDb.courses.find((item) => item.id === courseId);
    return course ? staticOk(course) : staticFail(404, "COURSE_NOT_FOUND", "课程不存在");
  },

  units: (courseId: string) =>
    staticOk(staticDb.units.filter((item) => item.courseId === courseId).sort((a, b) => a.order - b.order)),

  createUnit: (input: CreateUnitInput, options?: RequestOptions) => {
    staticRequireRole(options, ["admin"]);
    if (!input.courseId || !input.title?.trim()) return staticFail(400, "BAD_UNIT_INPUT", "courseId、title 为必填项");
    if (!staticDb.courses.some((item) => item.id === input.courseId)) return staticFail(404, "COURSE_NOT_FOUND", "课程不存在");
    const current = staticDb.units.filter((item) => item.courseId === input.courseId);
    const unit: Unit = {
      id: makeId("unit"),
      courseId: input.courseId,
      title: input.title.trim(),
      summary: input.summary ?? "管理员新建的课程单元，可继续补充章节。",
      order: current.length + 1,
    };
    staticDb.units.push(unit);
    return staticOk(unit);
  },

  updateUnit: (unitId: string, input: UpdateUnitInput, options?: RequestOptions) => {
    staticRequireRole(options, ["admin"]);
    const unit = staticDb.units.find((item) => item.id === unitId);
    if (!unit) return staticFail(404, "UNIT_NOT_FOUND", "Unit 不存在");
    if (input.title !== undefined && !input.title.trim()) return staticFail(400, "BAD_UNIT_INPUT", "Unit 标题不能为空");
    unit.title = input.title?.trim() ?? unit.title;
    unit.summary = input.summary ?? unit.summary;
    return staticOk(unit);
  },

  deleteUnit: (unitId: string, options?: RequestOptions) => {
    staticRequireRole(options, ["admin"]);
    const unit = staticDb.units.find((item) => item.id === unitId);
    if (!unit) return staticFail(404, "UNIT_NOT_FOUND", "Unit 不存在");
    const sessionIds = new Set(staticDb.sessions.filter((item) => item.unitId === unit.id).map((item) => item.id));
    staticDb.units = staticDb.units.filter((item) => item.id !== unit.id);
    staticDb.sessions = staticDb.sessions.filter((item) => item.unitId !== unit.id);
    staticDb.resources = staticDb.resources.filter((item) => item.unitId !== unit.id && !sessionIds.has(item.sessionId ?? ""));
    staticDb.units
      .filter((item) => item.courseId === unit.courseId)
      .sort((a, b) => a.order - b.order)
      .forEach((item, index) => {
        item.order = index + 1;
      });
    return staticOk({ deleted: unit.id });
  },

  sessions: (unitId: string) =>
    staticOk(staticDb.sessions.filter((item) => item.unitId === unitId).sort((a, b) => a.order - b.order)),

  createSession: (input: CreateSessionInput, options?: RequestOptions) => {
    staticRequireRole(options, ["admin"]);
    const unit = staticDb.units.find((item) => item.id === input.unitId);
    if (!unit || !input.title) return staticFail(400, "BAD_SESSION_INPUT", "unitId、title 为必填项");
    const current = staticDb.sessions.filter((item) => item.unitId === input.unitId);
    const session: Session = {
      id: makeId("session"),
      unitId: input.unitId,
      title: input.title,
      summary: input.summary ?? "管理员新建的课程章节，可继续编辑文字、图片、音频和视频内容。",
      order: current.length + 1,
      durationMinutes: input.durationMinutes ?? 30,
      contentBlocks: [],
    };
    staticDb.sessions.push(session);
    return staticOk(session);
  },

  updateSession: (sessionId: string, input: UpdateSessionInput, options?: RequestOptions) => {
    staticRequireRole(options, ["admin"]);
    const session = staticDb.sessions.find((item) => item.id === sessionId);
    if (!session) return staticFail(404, "SESSION_NOT_FOUND", "章节不存在");
    if (input.title !== undefined && !input.title.trim()) return staticFail(400, "BAD_SESSION_INPUT", "章节标题不能为空");
    session.title = input.title?.trim() ?? session.title;
    session.summary = input.summary ?? session.summary;
    session.durationMinutes = input.durationMinutes ?? session.durationMinutes;
    return staticOk(session);
  },

  deleteSession: (sessionId: string, options?: RequestOptions) => {
    staticRequireRole(options, ["admin"]);
    const session = staticDb.sessions.find((item) => item.id === sessionId);
    if (!session) return staticFail(404, "SESSION_NOT_FOUND", "章节不存在");
    staticDb.sessions = staticDb.sessions.filter((item) => item.id !== session.id);
    staticDb.resources = staticDb.resources.filter((item) => item.sessionId !== session.id);
    return staticOk({ deleted: session.id });
  },

  addSessionBlock: (sessionId: string, input: CreateSessionBlockInput, options?: RequestOptions) => {
    staticRequireRole(options, ["admin"]);
    const session = staticDb.sessions.find((item) => item.id === sessionId);
    if (!session) return staticFail(404, "SESSION_NOT_FOUND", "章节不存在");
    if (!input.type || !["text", "image", "audio", "video"].includes(input.type)) {
      return staticFail(400, "BAD_BLOCK_INPUT", "内容类型必须是 text、image、audio 或 video");
    }
    if (input.type === "text" && !input.content?.trim()) return staticFail(400, "BAD_BLOCK_INPUT", "文字内容不能为空");
    if ((input.type === "image" || input.type === "audio" || input.type === "video") && !input.url) {
      return staticFail(400, "BAD_BLOCK_INPUT", "图片、音频或视频必须包含文件地址");
    }
    const block: SessionContentBlock = {
      id: makeId("block"),
      type: input.type,
      content: input.content,
      format: input.format,
      url: input.url,
      fileName: input.fileName,
      caption: input.caption,
      createdAt: nowIso(),
    };
    session.contentBlocks.push(block);
    return staticOk(block);
  },

  deleteSessionBlock: (sessionId: string, blockId: string, options?: RequestOptions) => {
    staticRequireRole(options, ["admin"]);
    const session = staticDb.sessions.find((item) => item.id === sessionId);
    if (!session) return staticFail(404, "SESSION_NOT_FOUND", "章节不存在");
    const before = session.contentBlocks.length;
    session.contentBlocks = session.contentBlocks.filter((item) => item.id !== blockId);
    return session.contentBlocks.length === before
      ? staticFail(404, "BLOCK_NOT_FOUND", "内容块不存在")
      : staticOk({ deleted: blockId });
  },

  updateSessionBlock: (sessionId: string, blockId: string, input: UpdateSessionBlockInput, options?: RequestOptions) => {
    staticRequireRole(options, ["admin"]);
    const session = staticDb.sessions.find((item) => item.id === sessionId);
    if (!session) return staticFail(404, "SESSION_NOT_FOUND", "章节不存在");
    const block = session.contentBlocks.find((item) => item.id === blockId);
    if (!block) return staticFail(404, "BLOCK_NOT_FOUND", "内容块不存在");
    const nextType = input.type ?? block.type;
    if (!["text", "image", "audio", "video"].includes(nextType)) {
      return staticFail(400, "BAD_BLOCK_INPUT", "内容类型必须是 text、image、audio 或 video");
    }
    if (nextType === "text" && input.content !== undefined && !input.content.trim()) {
      return staticFail(400, "BAD_BLOCK_INPUT", "文字内容不能为空");
    }
    if ((nextType === "image" || nextType === "audio" || nextType === "video") && input.url !== undefined && !input.url) {
      return staticFail(400, "BAD_BLOCK_INPUT", "图片、音频或视频必须包含文件地址");
    }
    block.type = nextType;
    block.content = input.content ?? block.content;
    block.format = input.format ?? block.format;
    block.url = input.url ?? block.url;
    block.fileName = input.fileName ?? block.fileName;
    block.caption = input.caption ?? block.caption;
    return staticOk(block);
  },

  sessionResources: (sessionId: string) =>
    staticOk(staticDb.resources.filter((item) => item.sessionId === sessionId)),

  resources: (query?: { courseId?: string; unitId?: string; sessionId?: string; type?: ResourceType }) =>
    staticOk(
      staticDb.resources.filter((item) => {
        if (query?.courseId && item.courseId !== query.courseId) return false;
        if (query?.unitId && item.unitId !== query.unitId) return false;
        if (query?.sessionId && item.sessionId !== query.sessionId) return false;
        if (query?.type && item.type !== query.type) return false;
        return true;
      }),
    ),

  createResource: (input: CreateResourceInput, options?: RequestOptions) => {
    const user = staticRequireRole(options, ["admin"]);
    if (!input.courseId || !input.title || !input.type || !input.fileName) {
      return staticFail(400, "BAD_RESOURCE_INPUT", "courseId、title、type、fileName 为必填项");
    }
    const resource: Resource = {
      id: makeId("res"),
      courseId: input.courseId,
      unitId: input.unitId,
      sessionId: input.sessionId,
      title: input.title,
      type: input.type,
      fileName: input.fileName,
      url: input.url ?? (staticPublicUrl(`/mock/resources/${encodeURIComponent(input.fileName)}`) ?? `/mock/resources/${encodeURIComponent(input.fileName)}`),
      sizeMb: input.sizeMb ?? 1,
      durationMinutes: input.durationMinutes,
      uploadedBy: user.id,
      createdAt: nowIso(),
      downloadable: input.downloadable ?? input.type !== "video",
    };
    staticDb.resources.unshift(resource);
    return staticOk(resource);
  },

  deleteResource: (resourceId: string, options?: RequestOptions) => {
    staticRequireRole(options, ["admin"]);
    const resource = staticDb.resources.find((item) => item.id === resourceId);
    if (!resource) return staticFail(404, "RESOURCE_NOT_FOUND", "资源不存在");
    staticDb.resources = staticDb.resources.filter((item) => item.id !== resource.id);
    return staticOk({ deleted: resource.id });
  },

  questions: (query?: { courseId?: string; difficulty?: Question["difficulty"]; tag?: string }, options?: RequestOptions) => {
    const user = staticRequireRole(options, ["admin", "teacher"]);
    return staticOk(
      staticDb.questions.filter((item) => {
        if (query?.courseId && item.courseId !== query.courseId) return false;
        if (query?.difficulty && item.difficulty !== query.difficulty) return false;
        if (query?.tag && !item.tags.includes(String(query.tag))) return false;
        return user.role === "admin" || staticIsCourseTeacher(user, item.courseId);
      }),
    );
  },

  createQuestion: (input: CreateQuestionInput, options?: RequestOptions) => {
    const user = staticRequireRole(options, ["admin", "teacher"]);
    if (!input.courseId || !staticCanManageTeaching(user, input.courseId)) {
      return staticFail(403, "NOT_COURSE_TEACHER", "只能维护自己可管理课程的题库");
    }
    const normalized = normalizeStaticQuestionInput(input);
    if (!normalized) return staticFail(400, "BAD_QUESTION_INPUT", "courseId、type、stem、answer 为必填项");
    const question: Question = {
      id: makeId("q"),
      courseId: input.courseId,
      ...normalized,
      createdBy: user.id,
    };
    staticDb.questions.unshift(question);
    return staticOk(question);
  },

  updateQuestion: (questionId: string, input: UpdateQuestionInput, options?: RequestOptions) => {
    const user = staticRequireRole(options, ["admin", "teacher"]);
    const question = staticDb.questions.find((item) => item.id === questionId);
    if (!question) return staticFail(404, "QUESTION_NOT_FOUND", "题目不存在");
    if (!staticCanManageTeaching(user, question.courseId)) return staticFail(403, "NOT_COURSE_TEACHER", "只能编辑自己可管理课程的题目");
    const normalized = normalizeStaticQuestionInput(input, question);
    if (!normalized) return staticFail(400, "BAD_QUESTION_INPUT", "题干和答案不能为空");
    question.type = normalized.type;
    question.stem = normalized.stem;
    question.options = normalized.options;
    question.media = normalized.media;
    question.subQuestions = normalized.subQuestions;
    question.answer = normalized.answer;
    question.analysis = normalized.analysis;
    question.difficulty = normalized.difficulty;
    question.tags = normalized.tags;
    return staticOk(question);
  },

  deleteQuestion: (questionId: string, options?: RequestOptions) => {
    const user = staticRequireRole(options, ["admin", "teacher"]);
    const question = staticDb.questions.find((item) => item.id === questionId);
    if (!question) return staticFail(404, "QUESTION_NOT_FOUND", "题目不存在");
    if (!staticCanManageTeaching(user, question.courseId)) return staticFail(403, "NOT_COURSE_TEACHER", "只能删除自己可管理课程的题目");
    staticDb.questions = staticDb.questions.filter((item) => item.id !== question.id);
    staticDb.assignments = staticDb.assignments.map((assignment) => ({
      ...assignment,
      questionIds: assignment.questionIds.filter((item) => item !== question.id),
    }));
    return staticOk({ deleted: question.id });
  },

  papers: (query?: { courseId?: string }, options?: RequestOptions) => {
    const user = staticRequireRole(options, ["admin", "teacher"]);
    return staticOk(
      staticDb.papers.filter((paper) => {
        if (query?.courseId && paper.courseId !== query.courseId) return false;
        return user.role === "admin" || staticIsCourseTeacher(user, paper.courseId);
      }),
    );
  },

  createPaper: (input: CreatePaperInput, options?: RequestOptions) => {
    const user = staticRequireRole(options, ["admin", "teacher"]);
    if (!input.courseId || !staticCanManageTeaching(user, input.courseId)) {
      return staticFail(403, "NOT_COURSE_TEACHER", "只能为自己可管理课程组卷");
    }
    const normalized = normalizeStaticPaperInput(input);
    if (!normalized) return staticFail(400, "BAD_PAPER_INPUT", "试卷名称和题目不能为空");
    const paper: ExamPaper = {
      id: makeId("paper"),
      courseId: input.courseId,
      ...normalized,
      createdBy: user.id,
      createdAt: nowIso(),
    };
    staticDb.papers.unshift(paper);
    return staticOk(paper);
  },

  updatePaper: (paperId: string, input: UpdatePaperInput, options?: RequestOptions) => {
    const user = staticRequireRole(options, ["admin", "teacher"]);
    const paper = staticDb.papers.find((item) => item.id === paperId);
    if (!paper) return staticFail(404, "PAPER_NOT_FOUND", "试卷不存在");
    if (!staticCanManageTeaching(user, paper.courseId)) return staticFail(403, "NOT_COURSE_TEACHER", "只能修改自己可管理课程的试卷");
    const normalized = normalizeStaticPaperInput(input, paper);
    if (!normalized) return staticFail(400, "BAD_PAPER_INPUT", "试卷名称和题目不能为空");
    paper.title = normalized.title;
    paper.questionIds = normalized.questionIds;
    paper.totalScore = normalized.totalScore;
    paper.difficulty = normalized.difficulty;
    paper.updatedAt = nowIso();
    return staticOk(paper);
  },

  deletePaper: (paperId: string, options?: RequestOptions) => {
    const user = staticRequireRole(options, ["admin", "teacher"]);
    const paper = staticDb.papers.find((item) => item.id === paperId);
    if (!paper) return staticFail(404, "PAPER_NOT_FOUND", "试卷不存在");
    if (!staticCanManageTeaching(user, paper.courseId)) return staticFail(403, "NOT_COURSE_TEACHER", "只能删除自己可管理课程的试卷");
    staticDb.papers = staticDb.papers.filter((item) => item.id !== paper.id);
    return staticOk({ deleted: paper.id });
  },

  publishPaper: (paperId: string, input: PublishPaperInput, options?: RequestOptions) => {
    const user = staticRequireRole(options, ["admin", "teacher"]);
    const paper = staticDb.papers.find((item) => item.id === paperId);
    if (!paper) return staticFail(404, "PAPER_NOT_FOUND", "试卷不存在");
    if (!staticCanManageTeaching(user, paper.courseId)) return staticFail(403, "NOT_COURSE_TEACHER", "只能发布自己可管理课程的试卷");
    const targetClass = staticDb.classes.find((item) => item.id === input.classId && item.courseId === paper.courseId);
    if (!targetClass) return staticFail(400, "BAD_CLASS_INPUT", "请选择有效班级");
    if (user.role === "teacher" && targetClass.teacherId !== user.id) {
      return staticFail(403, "NOT_CLASS_TEACHER", "教师只能发布到自己管理的班级");
    }
    const assignment: Assignment = {
      id: makeId("assign"),
      courseId: paper.courseId,
      classId: targetClass.id,
      title: `试卷：${paper.title}`,
      description: `来自试卷库，题量 ${paper.questionIds.length}，总分 ${paper.totalScore}。`,
      questionIds: paper.questionIds,
      status: "published",
      publishedAt: nowIso(),
      dueAt: input.dueAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      createdBy: user.id,
    };
    staticDb.assignments.unshift(assignment);
    return staticOk(assignment);
  },

  classes: (query?: { courseId?: string }, options?: RequestOptions) => {
    const user = staticCurrentUser(options);
    return staticOk(staticVisibleClassesFor(user).filter((item) => !query?.courseId || item.courseId === query.courseId));
  },

  createClass: (input: CreateClassInput, options?: RequestOptions) => {
    const user = staticRequireRole(options, ["admin", "teacher"]);
    if (!input.courseId || !input.name) return staticFail(400, "BAD_CLASS_INPUT", "courseId、name 为必填项");
    if (!staticCanManageTeaching(user, input.courseId)) return staticFail(403, "NOT_COURSE_TEACHER", "教师只能为自己负责的课程建班");
    const courseClass: CourseClass = {
      id: makeId("class"),
      courseId: input.courseId,
      name: input.name,
      teacherId: input.teacherId ?? (user.role === "teacher" ? user.id : staticDb.courses.find((item) => item.id === input.courseId)?.teacherId ?? user.id),
      studentIds: input.studentIds ?? [],
      joinCode: Math.random().toString(36).slice(2, 8).toUpperCase(),
      createdAt: nowIso(),
    };
    staticDb.classes.push(courseClass);
    return staticOk(courseClass);
  },

  joinClass: (input: JoinClassInput, options?: RequestOptions) => {
    const user = staticRequireRole(options, ["student"]);
    const targetClass = staticDb.classes.find((item) => item.joinCode.toUpperCase() === input.joinCode?.trim().toUpperCase());
    if (!targetClass) return staticFail(404, "CLASS_NOT_FOUND", "邀请码无效");
    const existingClass = staticDb.classes.find((item) => item.studentIds.includes(user.id));
    if (existingClass) return staticFail(409, "ALREADY_IN_CLASS", "学生已加入班级，不能再加入新班级");
    targetClass.studentIds.push(user.id);
    user.classIds = [targetClass.id];
    return staticOk(targetClass);
  },

  removeStudentFromClass: (classId: string, studentId: string, options?: RequestOptions) => {
    const user = staticRequireRole(options, ["admin", "teacher"]);
    const courseClass = staticDb.classes.find((item) => item.id === classId);
    if (!courseClass) return staticFail(404, "CLASS_NOT_FOUND", "班级不存在");
    if (user.role === "teacher" && courseClass.teacherId !== user.id) {
      return staticFail(403, "NOT_CLASS_TEACHER", "教师只能管理自己的班级");
    }
    courseClass.studentIds = courseClass.studentIds.filter((id) => id !== studentId);
    const student = staticDb.users.find((item) => item.id === studentId);
    if (student) student.classIds = (student.classIds ?? []).filter((id) => id !== courseClass.id);
    return staticOk(courseClass);
  },

  assignments: (query?: { courseId?: string; classId?: string; status?: Assignment["status"] }, options?: RequestOptions) => {
    const user = staticCurrentUser(options);
    return staticOk(
      staticVisibleAssignmentsFor(user).filter((item) => {
        if (query?.courseId && item.courseId !== query.courseId) return false;
        if (query?.classId && item.classId !== query.classId) return false;
        if (query?.status && item.status !== query.status) return false;
        return true;
      }),
    );
  },

  assignmentQuestions: (assignmentId: string, options?: RequestOptions) => {
    const user = staticCurrentUser(options);
    const assignment = staticVisibleAssignmentsFor(user).find((item) => item.id === assignmentId);
    if (!assignment) return staticFail(404, "ASSIGNMENT_NOT_FOUND", "作业不存在或当前角色不可见");
    const questionIds = new Set(assignment.questionIds);
    return staticOk(staticDb.questions.filter((item) => questionIds.has(item.id)));
  },

  createAssignment: (input: CreateAssignmentInput, options?: RequestOptions) => {
    const user = staticRequireRole(options, ["admin", "teacher"]);
    if (!input.courseId || !input.classId || !input.title || !input.dueAt) {
      return staticFail(400, "BAD_ASSIGNMENT_INPUT", "courseId、classId、title、dueAt 为必填项");
    }
    if (!staticCanManageTeaching(user, input.courseId)) {
      return staticFail(403, "NOT_COURSE_TEACHER", "教师只能发布自己负责课程的作业");
    }
    const assignment: Assignment = {
      id: makeId("assign"),
      courseId: input.courseId,
      classId: input.classId,
      title: input.title,
      description: input.description,
      questionIds: input.questionIds,
      status: input.status ?? "published",
      publishedAt: (input.status ?? "published") === "published" ? nowIso() : undefined,
      dueAt: input.dueAt,
      createdBy: user.id,
    };
    staticDb.assignments.unshift(assignment);
    return staticOk(assignment);
  },

  submissions: (query?: { assignmentId?: string; studentId?: string }, options?: RequestOptions) => {
    const user = staticCurrentUser(options);
    let submissions = staticDb.submissions;
    if (user.role === "student") {
      submissions = submissions.filter((item) => item.studentId === user.id);
    } else if (user.role === "teacher") {
      const assignmentIds = new Set(staticVisibleAssignmentsFor(user).map((item) => item.id));
      submissions = submissions.filter((item) => assignmentIds.has(item.assignmentId));
    }
    return staticOk(
      submissions.filter((item) => {
        if (query?.assignmentId && item.assignmentId !== query.assignmentId) return false;
        if (query?.studentId && item.studentId !== query.studentId) return false;
        return true;
      }),
    );
  },

  createSubmission: (input: CreateSubmissionInput, options?: RequestOptions) => {
    const user = staticRequireRole(options, ["student"]);
    const assignment = staticDb.assignments.find((item) => item.id === input.assignmentId);
    if (!assignment || assignment.status !== "published") return staticFail(404, "ASSIGNMENT_NOT_FOUND", "可提交的作业不存在");
    const studentId = input.studentId ?? user.id;
    if (studentId !== user.id) return staticFail(403, "FORBIDDEN", "学生只能提交自己的作业");
    const courseClass = staticDb.classes.find((item) => item.id === assignment.classId);
    if (!courseClass?.studentIds.includes(user.id)) return staticFail(403, "NOT_IN_CLASS", "学生不在该作业发布班级中");
    const graded = gradeStaticSubmission(input);
    const submission: Submission = {
      id: makeId("sub"),
      assignmentId: input.assignmentId,
      studentId: user.id,
      answers: graded.answers,
      submittedAt: nowIso(),
      score: graded.score,
      autoScore: graded.score,
      status: graded.status,
    };
    staticDb.submissions.unshift(submission);
    return staticOk(submission);
  },

  gradeSubmission: (submissionId: string, input: GradeSubmissionInput, options?: RequestOptions) => {
    const user = staticRequireRole(options, ["admin", "teacher"]);
    const submission = staticDb.submissions.find((item) => item.id === submissionId);
    if (!submission) return staticFail(404, "SUBMISSION_NOT_FOUND", "提交记录不存在");
    const assignment = staticDb.assignments.find((item) => item.id === submission.assignmentId);
    if (!assignment) return staticFail(404, "ASSIGNMENT_NOT_FOUND", "提交记录对应的作业不存在");
    const targetClass = staticDb.classes.find((item) => item.id === assignment.classId);
    if (user.role === "teacher" && targetClass?.teacherId !== user.id) return staticFail(403, "NOT_CLASS_TEACHER", "教师只能批改自己班级的提交");
    const questionById = new Map(staticDb.questions.map((question) => [question.id, question]));
    const manualQuestionIds = assignment.questionIds.filter((questionId) => requiresTeacherReview(questionById.get(questionId)));
    if (manualQuestionIds.length === 0) return staticFail(400, "NO_MANUAL_QUESTIONS", "该提交不包含需要教师批改的题目");
    const scoreByQuestion = new Map(input.answers?.map((answer) => [answer.questionId, answer]) ?? []);
    const missingQuestionId = manualQuestionIds.find((questionId) => {
      const score = scoreByQuestion.get(questionId)?.score;
      return typeof score !== "number" || Number.isNaN(score) || score < 0 || score > 100;
    });
    if (missingQuestionId) return staticFail(400, "BAD_GRADE_INPUT", "请为每道主观题填写 0-100 分");
    const existingAnswers = new Map(submission.answers.map((answer) => [answer.questionId, answer]));
    const nextAnswers = assignment.questionIds.map((questionId) => {
      const current = existingAnswers.get(questionId) ?? { questionId, answer: "" };
      const manualScore = scoreByQuestion.get(questionId);
      if (manualScore) {
        return {
          ...current,
          score: Math.round(manualScore.score),
          reviewRequired: false,
          teacherComment: manualScore.teacherComment,
        };
      }
      return current;
    });
    submission.answers = nextAnswers;
    submission.score = averageAnswerScore(nextAnswers);
    submission.status = "graded";
    submission.teacherComment = input.teacherComment;
    submission.gradedAt = nowIso();
    return staticOk(submission);
  },

  courseAnalytics: (courseId: string, options?: RequestOptions) => {
    const user = staticRequireRole(options, ["admin", "teacher"]);
    if (!staticCanManageTeaching(user, courseId)) return staticFail(403, "NOT_COURSE_TEACHER", "教师只能查看自己负责课程的数据分析");
    const analytics = staticDb.analytics.find((item) => item.courseId === courseId);
    return analytics ? staticOk(analytics) : staticFail(404, "ANALYTICS_NOT_FOUND", "课程统计不存在");
  },

  askAiAssistant: (input: AiAssistantRequest) => {
    if (!input.courseId || !input.message) return staticFail(400, "BAD_AI_INPUT", "courseId、message 为必填项");
    return staticOk(staticAiResponse(input));
  },
};

export const api = STATIC_DEMO ? staticApi : liveApi;
export type ApiClient = typeof api;
