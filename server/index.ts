import cors from "cors";
import express, { type Request, type Response } from "express";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mockData } from "../src/data/mockData.js";
import type {
  AiAssistantRequest,
  AiAssistantResponse,
  Assignment,
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
  Resource,
  SessionContentBlock,
  Role,
  Session,
  Submission,
  UpdateQuestionInput,
  UpdatePaperInput,
  UpdateSessionBlockInput,
  UpdateSessionInput,
  UpdateUnitInput,
  User,
  Question,
} from "../src/types.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const deepSeekApiUrl = process.env.DEEPSEEK_API_URL ?? "https://api.deepseek.com/chat/completions";
const deepSeekModel = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";
const deepSeekTimeoutMs = Number(process.env.DEEPSEEK_TIMEOUT_MS ?? 20000);

const db: PlatformData = structuredClone(mockData);

app.use(cors());
app.use(express.json({ limit: "80mb" }));

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readDeepSeekApiKey() {
  const envKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (envKey) return envKey;

  const keyPath = process.env.DEEPSEEK_API_KEY_FILE ?? resolve(process.cwd(), "apikey.txt");
  if (!existsSync(keyPath)) return "";

  const lines = readFileSync(keyPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  const keyLine = lines.find((line) => line.includes("=")) ?? lines[0] ?? "";
  const rawKey = keyLine.includes("=") ? keyLine.split("=").slice(1).join("=").trim() : keyLine;
  return rawKey.replace(/^["']|["']$/g, "").trim();
}

function currentUser(req: Request): User {
  const requestedId = req.header("x-user-id") ?? String(req.query.as ?? "");
  return db.users.find((user) => user.id === requestedId) ?? db.users[0];
}

function sendError(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

function requireRole(req: Request, res: Response, roles: Role[]): User | undefined {
  const user = currentUser(req);
  if (!roles.includes(user.role)) {
    sendError(res, 403, "FORBIDDEN", `当前角色 ${user.role} 无权访问该接口`);
    return undefined;
  }
  return user;
}

function isCourseTeacher(user: User, courseId: string) {
  const course = db.courses.find((item) => item.id === courseId);
  return user.role === "teacher" && course?.teacherId === user.id;
}

function canManageTeaching(user: User, courseId: string) {
  return user.role === "admin" || isCourseTeacher(user, courseId);
}

function visibleClassesFor(user: User) {
  if (user.role === "admin") return db.classes;
  if (user.role === "teacher") return db.classes.filter((item) => item.teacherId === user.id);
  return db.classes.filter((item) => item.studentIds.includes(user.id));
}

function visibleAssignmentsFor(user: User) {
  if (user.role === "admin") return db.assignments;
  if (user.role === "teacher") {
    const classIds = new Set(visibleClassesFor(user).map((item) => item.id));
    return db.assignments.filter((item) => classIds.has(item.classId));
  }
  const classIds = new Set(visibleClassesFor(user).map((item) => item.id));
  return db.assignments.filter((item) => item.status === "published" && classIds.has(item.classId));
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

function gradeSubmission(input: CreateSubmissionInput): Pick<Submission, "answers" | "score" | "status"> {
  const assignment = db.assignments.find((item) => item.id === input.assignmentId);
  const questionById = new Map(db.questions.map((question) => [question.id, question]));
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

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "chaoxing-lite-api", at: nowIso() });
});

app.get("/api/me", (req, res) => {
  res.json(currentUser(req));
});

app.get("/api/users", (req, res) => {
  const role = req.query.role as Role | undefined;
  const users = role ? db.users.filter((user) => user.role === role) : db.users;
  res.json(users);
});

app.post("/api/users", (req, res) => {
  const admin = requireRole(req, res, ["admin"]);
  if (!admin) return;

  const input = req.body as CreateUserInput;
  if (!input.name || !input.role) {
    return sendError(res, 400, "BAD_USER_INPUT", "name、role 为必填项");
  }

  const user: User = {
    id: makeId(`u-${input.role}`),
    name: input.name,
    role: input.role,
    account: input.account ?? `${input.role}${db.users.length + 1}`,
    classIds: input.role === "student" ? [] : undefined,
    createdAt: nowIso(),
  };
  db.users.push(user);
  return res.status(201).json(user);
});

app.get("/api/courses", (_req, res) => {
  res.json(db.courses);
});

app.get("/api/courses/:courseId", (req, res) => {
  const course = db.courses.find((item) => item.id === req.params.courseId);
  if (!course) return sendError(res, 404, "COURSE_NOT_FOUND", "课程不存在");
  return res.json(course);
});

app.get("/api/courses/:courseId/units", (req, res) => {
  res.json(db.units.filter((item) => item.courseId === req.params.courseId).sort((a, b) => a.order - b.order));
});

app.post("/api/units", (req, res) => {
  const user = requireRole(req, res, ["admin"]);
  if (!user) return;

  const input = req.body as CreateUnitInput;
  if (!input.courseId || !input.title?.trim()) {
    return sendError(res, 400, "BAD_UNIT_INPUT", "courseId、title 为必填项");
  }
  const course = db.courses.find((item) => item.id === input.courseId);
  if (!course) {
    return sendError(res, 404, "COURSE_NOT_FOUND", "课程不存在");
  }

  const current = db.units.filter((item) => item.courseId === input.courseId);
  const unit = {
    id: makeId("unit"),
    courseId: input.courseId,
    title: input.title.trim(),
    summary: input.summary ?? "管理员新建的课程单元，可继续补充章节。",
    order: current.length + 1,
  };
  db.units.push(unit);
  return res.status(201).json(unit);
});

app.patch("/api/units/:unitId", (req, res) => {
  const user = requireRole(req, res, ["admin"]);
  if (!user) return;

  const unit = db.units.find((item) => item.id === req.params.unitId);
  if (!unit) {
    return sendError(res, 404, "UNIT_NOT_FOUND", "Unit 不存在");
  }
  const input = req.body as UpdateUnitInput;
  if (input.title !== undefined && !input.title.trim()) {
    return sendError(res, 400, "BAD_UNIT_INPUT", "Unit 标题不能为空");
  }

  unit.title = input.title?.trim() ?? unit.title;
  unit.summary = input.summary ?? unit.summary;
  return res.json(unit);
});

app.delete("/api/units/:unitId", (req, res) => {
  const user = requireRole(req, res, ["admin"]);
  if (!user) return;

  const unit = db.units.find((item) => item.id === req.params.unitId);
  if (!unit) {
    return sendError(res, 404, "UNIT_NOT_FOUND", "Unit 不存在");
  }
  const sessionIds = new Set(db.sessions.filter((item) => item.unitId === unit.id).map((item) => item.id));
  db.units = db.units.filter((item) => item.id !== unit.id);
  db.sessions = db.sessions.filter((item) => item.unitId !== unit.id);
  db.resources = db.resources.filter((item) => item.unitId !== unit.id && !sessionIds.has(item.sessionId ?? ""));
  db.units
    .filter((item) => item.courseId === unit.courseId)
    .sort((a, b) => a.order - b.order)
    .forEach((item, index) => {
      item.order = index + 1;
    });
  return res.json({ deleted: unit.id });
});

app.get("/api/units/:unitId/sessions", (req, res) => {
  res.json(db.sessions.filter((item) => item.unitId === req.params.unitId).sort((a, b) => a.order - b.order));
});

app.post("/api/sessions", (req, res) => {
  const user = requireRole(req, res, ["admin"]);
  if (!user) return;

  const input = req.body as CreateSessionInput;
  const unit = db.units.find((item) => item.id === input.unitId);
  if (!unit || !input.title) {
    return sendError(res, 400, "BAD_SESSION_INPUT", "unitId、title 为必填项");
  }

  const current = db.sessions.filter((item) => item.unitId === input.unitId);
  const session: Session = {
    id: makeId("session"),
    unitId: input.unitId,
    title: input.title,
    summary: input.summary ?? "管理员新建的课程章节，可继续编辑文字、图片、音频和视频内容。",
    order: current.length + 1,
    durationMinutes: input.durationMinutes ?? 30,
    contentBlocks: [],
  };
  db.sessions.push(session);
  return res.status(201).json(session);
});

app.patch("/api/sessions/:sessionId", (req, res) => {
  const user = requireRole(req, res, ["admin"]);
  if (!user) return;

  const session = db.sessions.find((item) => item.id === req.params.sessionId);
  if (!session) {
    return sendError(res, 404, "SESSION_NOT_FOUND", "章节不存在");
  }

  const input = req.body as UpdateSessionInput;
  if (input.title !== undefined && !input.title.trim()) {
    return sendError(res, 400, "BAD_SESSION_INPUT", "章节标题不能为空");
  }

  session.title = input.title?.trim() ?? session.title;
  session.summary = input.summary ?? session.summary;
  session.durationMinutes = input.durationMinutes ?? session.durationMinutes;
  return res.json(session);
});

app.delete("/api/sessions/:sessionId", (req, res) => {
  const user = requireRole(req, res, ["admin"]);
  if (!user) return;

  const session = db.sessions.find((item) => item.id === req.params.sessionId);
  if (!session) {
    return sendError(res, 404, "SESSION_NOT_FOUND", "章节不存在");
  }

  db.sessions = db.sessions.filter((item) => item.id !== session.id);
  db.resources = db.resources.filter((item) => item.sessionId !== session.id);
  return res.json({ deleted: session.id });
});

app.post("/api/sessions/:sessionId/blocks", (req, res) => {
  const user = requireRole(req, res, ["admin"]);
  if (!user) return;

  const session = db.sessions.find((item) => item.id === req.params.sessionId);
  if (!session) {
    return sendError(res, 404, "SESSION_NOT_FOUND", "章节不存在");
  }

  const input = req.body as CreateSessionBlockInput;
  if (!input.type || !["text", "image", "audio", "video"].includes(input.type)) {
    return sendError(res, 400, "BAD_BLOCK_INPUT", "内容类型必须是 text、image、audio 或 video");
  }
  if (input.type === "text" && !input.content?.trim()) {
    return sendError(res, 400, "BAD_BLOCK_INPUT", "文字内容不能为空");
  }
  if ((input.type === "image" || input.type === "audio" || input.type === "video") && !input.url) {
    return sendError(res, 400, "BAD_BLOCK_INPUT", "图片、音频或视频必须包含文件地址");
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
  return res.status(201).json(block);
});

app.delete("/api/sessions/:sessionId/blocks/:blockId", (req, res) => {
  const user = requireRole(req, res, ["admin"]);
  if (!user) return;

  const session = db.sessions.find((item) => item.id === req.params.sessionId);
  if (!session) {
    return sendError(res, 404, "SESSION_NOT_FOUND", "章节不存在");
  }

  const before = session.contentBlocks.length;
  session.contentBlocks = session.contentBlocks.filter((item) => item.id !== req.params.blockId);
  if (session.contentBlocks.length === before) {
    return sendError(res, 404, "BLOCK_NOT_FOUND", "内容块不存在");
  }
  return res.json({ deleted: req.params.blockId });
});

app.patch("/api/sessions/:sessionId/blocks/:blockId", (req, res) => {
  const user = requireRole(req, res, ["admin"]);
  if (!user) return;

  const session = db.sessions.find((item) => item.id === req.params.sessionId);
  if (!session) {
    return sendError(res, 404, "SESSION_NOT_FOUND", "章节不存在");
  }
  const block = session.contentBlocks.find((item) => item.id === req.params.blockId);
  if (!block) {
    return sendError(res, 404, "BLOCK_NOT_FOUND", "内容块不存在");
  }

  const input = req.body as UpdateSessionBlockInput;
  const nextType = input.type ?? block.type;
  if (!["text", "image", "audio", "video"].includes(nextType)) {
    return sendError(res, 400, "BAD_BLOCK_INPUT", "内容类型必须是 text、image、audio 或 video");
  }
  if (nextType === "text" && input.content !== undefined && !input.content.trim()) {
    return sendError(res, 400, "BAD_BLOCK_INPUT", "文字内容不能为空");
  }
  if ((nextType === "image" || nextType === "audio" || nextType === "video") && input.url !== undefined && !input.url) {
    return sendError(res, 400, "BAD_BLOCK_INPUT", "图片、音频或视频必须包含文件地址");
  }

  block.type = nextType;
  block.content = input.content ?? block.content;
  block.format = input.format ?? block.format;
  block.url = input.url ?? block.url;
  block.fileName = input.fileName ?? block.fileName;
  block.caption = input.caption ?? block.caption;
  return res.json(block);
});

app.get("/api/sessions/:sessionId/resources", (req, res) => {
  res.json(db.resources.filter((item) => item.sessionId === req.params.sessionId));
});

app.get("/api/resources", (req, res) => {
  const { courseId, unitId, sessionId, type } = req.query;
  res.json(
    db.resources.filter((item) => {
      if (courseId && item.courseId !== courseId) return false;
      if (unitId && item.unitId !== unitId) return false;
      if (sessionId && item.sessionId !== sessionId) return false;
      if (type && item.type !== type) return false;
      return true;
    }),
  );
});

app.post("/api/resources", (req, res) => {
  const user = requireRole(req, res, ["admin"]);
  if (!user) return;

  const input = req.body as CreateResourceInput;
  if (!input.courseId || !input.title || !input.type || !input.fileName) {
    return sendError(res, 400, "BAD_RESOURCE_INPUT", "courseId、title、type、fileName 为必填项");
  }

  const resource: Resource = {
    id: makeId("res"),
    courseId: input.courseId,
    unitId: input.unitId,
    sessionId: input.sessionId,
    title: input.title,
    type: input.type,
    fileName: input.fileName,
    url: input.url ?? `/mock/resources/${encodeURIComponent(input.fileName)}`,
    sizeMb: input.sizeMb ?? 1,
    durationMinutes: input.durationMinutes,
    uploadedBy: user.id,
    createdAt: nowIso(),
    downloadable: input.downloadable ?? input.type !== "video",
  };
  db.resources.unshift(resource);
  return res.status(201).json(resource);
});

app.delete("/api/resources/:resourceId", (req, res) => {
  const user = requireRole(req, res, ["admin"]);
  if (!user) return;

  const resource = db.resources.find((item) => item.id === req.params.resourceId);
  if (!resource) {
    return sendError(res, 404, "RESOURCE_NOT_FOUND", "资源不存在");
  }

  db.resources = db.resources.filter((item) => item.id !== resource.id);
  return res.json({ deleted: resource.id });
});

function normalizeQuestionInput(input: CreateQuestionInput | UpdateQuestionInput, fallback?: Question) {
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
    options: options?.filter(Boolean),
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

app.get("/api/questions", (req, res) => {
  const user = requireRole(req, res, ["admin", "teacher"]);
  if (!user) return;

  const { courseId, difficulty, tag } = req.query;
  res.json(
    db.questions.filter((item) => {
      if (courseId && item.courseId !== courseId) return false;
      if (difficulty && item.difficulty !== difficulty) return false;
      if (tag && !item.tags.includes(String(tag))) return false;
      return user.role === "admin" || isCourseTeacher(user, item.courseId);
    }),
  );
});

app.post("/api/questions", (req, res) => {
  const user = requireRole(req, res, ["admin", "teacher"]);
  if (!user) return;

  const input = req.body as CreateQuestionInput;
  if (!input.courseId || !canManageTeaching(user, input.courseId)) {
    return sendError(res, 403, "NOT_COURSE_TEACHER", "只能维护自己可管理课程的题库");
  }

  const normalized = normalizeQuestionInput(input);
  if (!normalized) {
    return sendError(res, 400, "BAD_QUESTION_INPUT", "courseId、type、stem、answer 为必填项");
  }

  const question: Question = {
    id: makeId("q"),
    courseId: input.courseId,
    ...normalized,
    createdBy: user.id,
  };
  db.questions.unshift(question);
  return res.status(201).json(question);
});

app.patch("/api/questions/:questionId", (req, res) => {
  const user = requireRole(req, res, ["admin", "teacher"]);
  if (!user) return;

  const question = db.questions.find((item) => item.id === req.params.questionId);
  if (!question) {
    return sendError(res, 404, "QUESTION_NOT_FOUND", "题目不存在");
  }
  if (!canManageTeaching(user, question.courseId)) {
    return sendError(res, 403, "NOT_COURSE_TEACHER", "只能编辑自己可管理课程的题目");
  }

  const normalized = normalizeQuestionInput(req.body as UpdateQuestionInput, question);
  if (!normalized) {
    return sendError(res, 400, "BAD_QUESTION_INPUT", "题干和答案不能为空");
  }

  question.type = normalized.type;
  question.stem = normalized.stem;
  question.options = normalized.options;
  question.media = normalized.media;
  question.subQuestions = normalized.subQuestions;
  question.answer = normalized.answer;
  question.analysis = normalized.analysis;
  question.difficulty = normalized.difficulty;
  question.tags = normalized.tags;
  return res.json(question);
});

app.delete("/api/questions/:questionId", (req, res) => {
  const user = requireRole(req, res, ["admin", "teacher"]);
  if (!user) return;

  const question = db.questions.find((item) => item.id === req.params.questionId);
  if (!question) {
    return sendError(res, 404, "QUESTION_NOT_FOUND", "题目不存在");
  }
  if (!canManageTeaching(user, question.courseId)) {
    return sendError(res, 403, "NOT_COURSE_TEACHER", "只能删除自己可管理课程的题目");
  }

  db.questions = db.questions.filter((item) => item.id !== question.id);
  db.assignments = db.assignments.map((assignment) => ({
    ...assignment,
    questionIds: assignment.questionIds.filter((questionId) => questionId !== question.id),
  }));
  return res.json({ deleted: question.id });
});

function normalizePaperInput(input: CreatePaperInput | UpdatePaperInput, fallback?: ExamPaper) {
  const title = input.title ?? fallback?.title;
  const questionIds = input.questionIds ?? fallback?.questionIds ?? [];
  const totalScore = input.totalScore ?? fallback?.totalScore ?? 100;
  const difficulty = input.difficulty ?? fallback?.difficulty ?? "medium";
  const validQuestionIds = questionIds.filter((questionId) => db.questions.some((question) => question.id === questionId));
  if (!title?.trim() || validQuestionIds.length === 0) return undefined;
  return {
    title: title.trim(),
    questionIds: validQuestionIds,
    totalScore,
    difficulty,
  };
}

app.get("/api/papers", (req, res) => {
  const user = requireRole(req, res, ["admin", "teacher"]);
  if (!user) return;

  const { courseId } = req.query;
  res.json(
    db.papers.filter((paper) => {
      if (courseId && paper.courseId !== courseId) return false;
      return user.role === "admin" || isCourseTeacher(user, paper.courseId);
    }),
  );
});

app.post("/api/papers", (req, res) => {
  const user = requireRole(req, res, ["admin", "teacher"]);
  if (!user) return;

  const input = req.body as CreatePaperInput;
  if (!input.courseId || !canManageTeaching(user, input.courseId)) {
    return sendError(res, 403, "NOT_COURSE_TEACHER", "只能为自己可管理课程组卷");
  }
  const normalized = normalizePaperInput(input);
  if (!normalized) {
    return sendError(res, 400, "BAD_PAPER_INPUT", "试卷名称和题目不能为空");
  }

  const paper: ExamPaper = {
    id: makeId("paper"),
    courseId: input.courseId,
    ...normalized,
    createdBy: user.id,
    createdAt: nowIso(),
  };
  db.papers.unshift(paper);
  return res.status(201).json(paper);
});

app.patch("/api/papers/:paperId", (req, res) => {
  const user = requireRole(req, res, ["admin", "teacher"]);
  if (!user) return;

  const paper = db.papers.find((item) => item.id === req.params.paperId);
  if (!paper) {
    return sendError(res, 404, "PAPER_NOT_FOUND", "试卷不存在");
  }
  if (!canManageTeaching(user, paper.courseId)) {
    return sendError(res, 403, "NOT_COURSE_TEACHER", "只能修改自己可管理课程的试卷");
  }
  const normalized = normalizePaperInput(req.body as UpdatePaperInput, paper);
  if (!normalized) {
    return sendError(res, 400, "BAD_PAPER_INPUT", "试卷名称和题目不能为空");
  }

  paper.title = normalized.title;
  paper.questionIds = normalized.questionIds;
  paper.totalScore = normalized.totalScore;
  paper.difficulty = normalized.difficulty;
  paper.updatedAt = nowIso();
  return res.json(paper);
});

app.delete("/api/papers/:paperId", (req, res) => {
  const user = requireRole(req, res, ["admin", "teacher"]);
  if (!user) return;

  const paper = db.papers.find((item) => item.id === req.params.paperId);
  if (!paper) {
    return sendError(res, 404, "PAPER_NOT_FOUND", "试卷不存在");
  }
  if (!canManageTeaching(user, paper.courseId)) {
    return sendError(res, 403, "NOT_COURSE_TEACHER", "只能删除自己可管理课程的试卷");
  }
  db.papers = db.papers.filter((item) => item.id !== paper.id);
  return res.json({ deleted: paper.id });
});

app.post("/api/papers/:paperId/publish", (req, res) => {
  const user = requireRole(req, res, ["admin", "teacher"]);
  if (!user) return;

  const paper = db.papers.find((item) => item.id === req.params.paperId);
  if (!paper) {
    return sendError(res, 404, "PAPER_NOT_FOUND", "试卷不存在");
  }
  if (!canManageTeaching(user, paper.courseId)) {
    return sendError(res, 403, "NOT_COURSE_TEACHER", "只能发布自己可管理课程的试卷");
  }
  const input = req.body as PublishPaperInput;
  const targetClass = db.classes.find((item) => item.id === input.classId && item.courseId === paper.courseId);
  if (!targetClass) {
    return sendError(res, 400, "BAD_CLASS_INPUT", "请选择有效班级");
  }
  if (user.role === "teacher" && targetClass.teacherId !== user.id) {
    return sendError(res, 403, "NOT_CLASS_TEACHER", "教师只能发布到自己管理的班级");
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
  db.assignments.unshift(assignment);
  return res.status(201).json(assignment);
});

app.get("/api/classes", (req, res) => {
  const user = currentUser(req);
  const { courseId } = req.query;
  res.json(visibleClassesFor(user).filter((item) => !courseId || item.courseId === courseId));
});

app.post("/api/classes", (req, res) => {
  const user = requireRole(req, res, ["admin", "teacher"]);
  if (!user) return;

  const input = req.body as CreateClassInput;
  if (!input.courseId || !input.name) {
    return sendError(res, 400, "BAD_CLASS_INPUT", "courseId、name 为必填项");
  }
  if (!canManageTeaching(user, input.courseId)) {
    return sendError(res, 403, "NOT_COURSE_TEACHER", "教师只能为自己负责的课程建班");
  }

  const courseClass: CourseClass = {
    id: makeId("class"),
    courseId: input.courseId,
    name: input.name,
    teacherId: input.teacherId ?? (user.role === "teacher" ? user.id : db.courses.find((item) => item.id === input.courseId)?.teacherId ?? user.id),
    studentIds: input.studentIds ?? [],
    joinCode: Math.random().toString(36).slice(2, 8).toUpperCase(),
    createdAt: nowIso(),
  };
  db.classes.push(courseClass);
  return res.status(201).json(courseClass);
});

app.post("/api/classes/join", (req, res) => {
  const user = requireRole(req, res, ["student"]);
  if (!user) return;

  const input = req.body as JoinClassInput;
  const targetClass = db.classes.find((item) => item.joinCode.toUpperCase() === input.joinCode?.trim().toUpperCase());
  if (!targetClass) {
    return sendError(res, 404, "CLASS_NOT_FOUND", "邀请码无效");
  }

  const existingClass = db.classes.find((item) => item.studentIds.includes(user.id));
  if (existingClass) {
    return sendError(res, 409, "ALREADY_IN_CLASS", "学生已加入班级，不能再加入新班级");
  }

  targetClass.studentIds.push(user.id);
  user.classIds = [targetClass.id];
  return res.status(201).json(targetClass);
});

app.delete("/api/classes/:classId/students/:studentId", (req, res) => {
  const user = requireRole(req, res, ["admin", "teacher"]);
  if (!user) return;

  const courseClass = db.classes.find((item) => item.id === req.params.classId);
  if (!courseClass) {
    return sendError(res, 404, "CLASS_NOT_FOUND", "班级不存在");
  }
  if (user.role === "teacher" && courseClass.teacherId !== user.id) {
    return sendError(res, 403, "NOT_CLASS_TEACHER", "教师只能管理自己的班级");
  }

  courseClass.studentIds = courseClass.studentIds.filter((id) => id !== req.params.studentId);
  const student = db.users.find((item) => item.id === req.params.studentId);
  if (student) {
    student.classIds = (student.classIds ?? []).filter((id) => id !== courseClass.id);
  }
  return res.json(courseClass);
});

app.get("/api/assignments", (req, res) => {
  const user = currentUser(req);
  const { courseId, classId, status } = req.query;
  res.json(
    visibleAssignmentsFor(user).filter((item) => {
      if (courseId && item.courseId !== courseId) return false;
      if (classId && item.classId !== classId) return false;
      if (status && item.status !== status) return false;
      return true;
    }),
  );
});

app.get("/api/assignments/:assignmentId/questions", (req, res) => {
  const user = currentUser(req);
  const assignment = visibleAssignmentsFor(user).find((item) => item.id === req.params.assignmentId);
  if (!assignment) {
    return sendError(res, 404, "ASSIGNMENT_NOT_FOUND", "作业不存在或当前角色不可见");
  }

  const questionIds = new Set(assignment.questionIds);
  return res.json(db.questions.filter((item) => questionIds.has(item.id)));
});

app.post("/api/assignments", (req, res) => {
  const user = requireRole(req, res, ["admin", "teacher"]);
  if (!user) return;

  const input = req.body as CreateAssignmentInput;
  if (!input.courseId || !input.classId || !input.title || !input.dueAt) {
    return sendError(res, 400, "BAD_ASSIGNMENT_INPUT", "courseId、classId、title、dueAt 为必填项");
  }
  if (!canManageTeaching(user, input.courseId)) {
    return sendError(res, 403, "NOT_COURSE_TEACHER", "教师只能发布自己负责课程的作业");
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
  db.assignments.unshift(assignment);
  return res.status(201).json(assignment);
});

app.get("/api/submissions", (req, res) => {
  const user = currentUser(req);
  const { assignmentId, studentId } = req.query;
  let submissions = db.submissions;

  if (user.role === "student") {
    submissions = submissions.filter((item) => item.studentId === user.id);
  } else if (user.role === "teacher") {
    const assignmentIds = new Set(visibleAssignmentsFor(user).map((item) => item.id));
    submissions = submissions.filter((item) => assignmentIds.has(item.assignmentId));
  }

  res.json(
    submissions.filter((item) => {
      if (assignmentId && item.assignmentId !== assignmentId) return false;
      if (studentId && item.studentId !== studentId) return false;
      return true;
    }),
  );
});

app.post("/api/submissions", (req, res) => {
  const user = requireRole(req, res, ["student"]);
  if (!user) return;

  const input = req.body as CreateSubmissionInput;
  const assignment = db.assignments.find((item) => item.id === input.assignmentId);
  if (!assignment || assignment.status !== "published") {
    return sendError(res, 404, "ASSIGNMENT_NOT_FOUND", "可提交的作业不存在");
  }

  const studentId = input.studentId ?? user.id;
  if (studentId !== user.id) {
    return sendError(res, 403, "FORBIDDEN", "学生只能提交自己的作业");
  }

  const courseClass = db.classes.find((item) => item.id === assignment.classId);
  if (!courseClass?.studentIds.includes(user.id)) {
    return sendError(res, 403, "NOT_IN_CLASS", "学生不在该作业发布班级中");
  }

  const graded = gradeSubmission(input);
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
  db.submissions.unshift(submission);
  return res.status(201).json(submission);
});

app.patch("/api/submissions/:submissionId/grade", (req, res) => {
  const user = requireRole(req, res, ["admin", "teacher"]);
  if (!user) return;

  const submission = db.submissions.find((item) => item.id === req.params.submissionId);
  if (!submission) {
    return sendError(res, 404, "SUBMISSION_NOT_FOUND", "提交记录不存在");
  }
  const assignment = db.assignments.find((item) => item.id === submission.assignmentId);
  if (!assignment) {
    return sendError(res, 404, "ASSIGNMENT_NOT_FOUND", "提交记录对应的作业不存在");
  }
  const targetClass = db.classes.find((item) => item.id === assignment.classId);
  if (user.role === "teacher" && targetClass?.teacherId !== user.id) {
    return sendError(res, 403, "NOT_CLASS_TEACHER", "教师只能批改自己班级的提交");
  }

  const questionById = new Map(db.questions.map((question) => [question.id, question]));
  const manualQuestionIds = assignment.questionIds.filter((questionId) => requiresTeacherReview(questionById.get(questionId)));
  if (manualQuestionIds.length === 0) {
    return sendError(res, 400, "NO_MANUAL_QUESTIONS", "该提交不包含需要教师批改的题目");
  }

  const input = req.body as GradeSubmissionInput;
  const scoreByQuestion = new Map(input.answers?.map((answer) => [answer.questionId, answer]) ?? []);
  const missingQuestionId = manualQuestionIds.find((questionId) => {
    const score = scoreByQuestion.get(questionId)?.score;
    return typeof score !== "number" || Number.isNaN(score) || score < 0 || score > 100;
  });
  if (missingQuestionId) {
    return sendError(res, 400, "BAD_GRADE_INPUT", "请为每道主观题填写 0-100 分");
  }

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
  return res.json(submission);
});

app.get("/api/analytics/course/:courseId", (req, res) => {
  const user = requireRole(req, res, ["admin", "teacher"]);
  if (!user) return;
  if (!canManageTeaching(user, req.params.courseId)) {
    return sendError(res, 403, "NOT_COURSE_TEACHER", "教师只能查看自己负责课程的数据分析");
  }
  const analytics = db.analytics.find((item) => item.courseId === req.params.courseId);
  if (!analytics) return sendError(res, 404, "ANALYTICS_NOT_FOUND", "课程统计不存在");
  return res.json(analytics);
});

type DeepSeekChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxLength = 900) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function modeInstruction(mode: AiAssistantRequest["mode"]) {
  if (mode === "quiz") return "请优先生成适合大学英语课堂的练习题、答案和简短解析。";
  if (mode === "summary") return "请优先总结重点、难点和学生容易混淆的地方。";
  if (mode === "resource") return "请优先围绕课程资源给出教学活动、案例或课堂任务建议。";
  return "请优先解释概念、举例说明，并给出可操作的学习建议。";
}

function buildAiContext(input: AiAssistantRequest, user: User, course: PlatformData["courses"][number] | undefined, relatedResources: Resource[]) {
  const session = input.context?.sessionId ? db.sessions.find((item) => item.id === input.context?.sessionId) : undefined;
  const sessionBlocks = session?.contentBlocks
    .map((block) => {
      const content = block.content ? stripHtml(block.content) : block.caption ?? block.fileName ?? "";
      return `${block.type}: ${truncate(content, 260)}`;
    })
    .filter((item) => !item.endsWith(": "))
    .slice(0, 4)
    .join("\n");
  const resourceText = relatedResources
    .map((resource) => `${resource.type}：${resource.title}（${resource.fileName}）`)
    .join("\n");

  return [
    `当前用户：${user.name}（${user.role}）`,
    `课程：${course?.title ?? input.courseId}`,
    session ? `当前章节：${session.title}。${session.summary}` : "",
    resourceText ? `相关资源：\n${resourceText}` : "",
    sessionBlocks ? `章节正文摘录：\n${sessionBlocks}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function mockAiResponse(input: AiAssistantRequest, course: PlatformData["courses"][number] | undefined, relatedResources: Resource[], fallbackReason?: string): AiAssistantResponse {
  const modeText = input.mode === "quiz" ? "我可以基于题库生成练习思路" : input.mode === "summary" ? "我先给出本节概要" : "我会按课程资料解释";
  const fallbackText = fallbackReason ? `（DeepSeek 暂不可用，已切换本地回复：${fallbackReason}）` : "（本地 mock 回复）";
  return {
    id: makeId("ai"),
    role: "assistant",
    message: `${modeText}：${course?.title ?? "当前课程"}中，“${input.message}”可以先从概念、例子和课后练习三步理解。${fallbackText}`,
    suggestions: ["查看相关课件", "生成 3 道练习题", "总结本节重点", "定位易错点"],
    citedResourceIds: relatedResources.map((item) => item.id),
    createdAt: nowIso(),
  };
}

async function callDeepSeekAssistant(input: AiAssistantRequest, user: User, course: PlatformData["courses"][number] | undefined, relatedResources: Resource[]) {
  const apiKey = readDeepSeekApiKey();
  if (!apiKey) {
    return undefined;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), deepSeekTimeoutMs);
  try {
    const response = await fetch(deepSeekApiUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: deepSeekModel,
        messages: [
          {
            role: "system",
            content:
              "你是“大学英语智课通”的课程 AI 助教。必须用中文回答，面向大学英语课堂。回答要简洁、可执行，避免编造课程上下文中没有的信息。",
          },
          {
            role: "user",
            content: [
              buildAiContext(input, user, course, relatedResources),
              `任务类型：${input.mode ?? "explain"}`,
              modeInstruction(input.mode),
              `用户问题：${input.message}`,
            ].join("\n\n"),
          },
        ],
        thinking: { type: "disabled" },
        temperature: 0.3,
        max_tokens: 900,
        stream: false,
        user_id: input.userId?.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`DeepSeek API ${response.status}: ${truncate(errorText, 240)}`);
    }

    const payload = (await response.json()) as DeepSeekChatResponse;
    return payload.choices?.[0]?.message?.content?.trim();
  } finally {
    clearTimeout(timeout);
  }
}

app.post("/api/ai/assistant", async (req, res) => {
  const input = req.body as AiAssistantRequest;
  if (!input.courseId || !input.message) {
    return sendError(res, 400, "BAD_AI_INPUT", "courseId、message 为必填项");
  }

  const user = currentUser(req);
  const course = db.courses.find((item) => item.id === input.courseId);
  const relatedResources = db.resources
    .filter((item) => item.courseId === input.courseId)
    .filter((item) => !input.context?.resourceId || item.id === input.context.resourceId)
    .slice(0, 2);

  try {
    const deepSeekMessage = await callDeepSeekAssistant(input, user, course, relatedResources);
    if (deepSeekMessage) {
      return res.json({
        id: makeId("ai"),
        role: "assistant",
        message: deepSeekMessage,
        suggestions: ["查看相关课件", "生成 3 道练习题", "总结本节重点", "定位易错点"],
        citedResourceIds: relatedResources.map((item) => item.id),
        createdAt: nowIso(),
      } satisfies AiAssistantResponse);
    }
    return res.json(mockAiResponse(input, course, relatedResources, "未读取到 apikey.txt 或 DEEPSEEK_API_KEY"));
  } catch (error) {
    console.warn(error instanceof Error ? error.message : "DeepSeek API 调用失败");
    return res.json(mockAiResponse(input, course, relatedResources, "接口调用失败"));
  }
});

app.use((_req, res) => {
  sendError(res, 404, "NOT_FOUND", "接口不存在");
});

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Chaoxing lite API listening on http://localhost:${port}`);
  });
}

export default app;
