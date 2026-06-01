import {
  Activity,
  AlignCenter,
  AlignLeft,
  AlertTriangle,
  Archive,
  BarChart3,
  Bold,
  BookOpen,
  Bot,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  CloudUpload,
  Download,
  Edit3,
  FileText,
  GraduationCap,
  Headphones,
  Image as ImageIcon,
  Italic,
  LayoutDashboard,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Lock,
  LogOut,
  Maximize2,
  MonitorPlay,
  Music,
  PencilLine,
  Play,
  Plus,
  Redo2,
  Save,
  School,
  Send,
  ShieldCheck,
  Sparkles,
  Strikethrough,
  Trash2,
  Type,
  Underline,
  Undo2,
  Upload,
  UserPlus,
  Users,
  Video,
  Wand2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "./lib/api";
import type {
  Assignment,
  Course,
  CourseAnalytics,
  CourseClass,
  CreateAssignmentInput,
  CreatePaperInput,
  CreateQuestionInput,
  CreateSessionBlockInput,
  CreateUserInput,
  ExamPaper,
  GradeSubmissionInput,
  Question,
  QuestionMedia,
  ReadingSubQuestion,
  Resource,
  ResourceType,
  Role,
  Session,
  SessionContentBlock,
  Submission,
  UpdatePaperInput,
  UpdateQuestionInput,
  UpdateSessionBlockInput,
  UpdateSessionInput,
  UpdateUnitInput,
  Unit,
  User,
} from "./types";

type Page = "dashboard" | "resources" | "admin" | "questionBank" | "teacher" | "student" | "analytics" | "assistant";

interface PlatformSnapshot {
  user: User;
  users: User[];
  course: Course;
  units: Unit[];
  sessions: Session[];
  resources: Resource[];
  papers: ExamPaper[];
  classes: CourseClass[];
  assignments: Assignment[];
  submissions: Submission[];
  questions: Question[];
  analytics?: CourseAnalytics;
}

interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

interface ResourceFormState {
  title: string;
  type: ResourceType;
  fileName: string;
  url?: string;
  sizeMb?: number;
}

interface QuestionFormState {
  type: Question["type"];
  stem: string;
  optionsText: string;
  media: QuestionMedia[];
  subQuestions: ReadingSubQuestion[];
  answerText: string;
  analysis: string;
  difficulty: Question["difficulty"];
  tagsText: string;
}

const roleUsers: Record<Role, string> = {
  admin: "u-admin",
  teacher: "u-teacher-lin",
  student: "u-student-zhou",
};

const loginAccounts = [
  { id: "u-admin", role: "admin" as Role, label: "管理员账号", account: "admin", password: "admin123" },
  { id: "u-teacher-lin", role: "teacher" as Role, label: "教师账号", account: "teacher01", password: "teacher123" },
  { id: "u-student-zhou", role: "student" as Role, label: "学生账号", account: "student04", password: "student123" },
];

const roleLabels: Record<Role, string> = {
  admin: "管理员",
  teacher: "教师",
  student: "学生",
};

const pageLabels: Record<Page, string> = {
  dashboard: "仪表盘",
  resources: "课程资源",
  admin: "课程管理",
  questionBank: "题库管理",
  teacher: "班级作业",
  student: "我的任务",
  analytics: "学情分析",
  assistant: "AI 助教",
};

const resourceMeta: Record<
  ResourceType,
  {
    label: string;
    icon: typeof MonitorPlay;
  }
> = {
  ppt: { label: "PPT", icon: MonitorPlay },
  video: { label: "视频", icon: Video },
  audio: { label: "音频", icon: Headphones },
  pdf: { label: "PDF", icon: FileText },
  download: { label: "资料包", icon: Archive },
};

const questionTypeLabels: Record<Question["type"], string> = {
  single: "单选题",
  multiple: "多选题",
  blank: "填空题",
  reading: "阅读理解",
  writing: "写作题",
  true_false: "判断题",
  short_answer: "简答题",
  subjective: "主观题",
};

const questionTypeOrder: Question["type"][] = [
  "single",
  "multiple",
  "blank",
  "true_false",
  "short_answer",
  "reading",
  "writing",
  "subjective",
];

const teacherReviewedQuestionTypes = new Set<Question["type"]>(["short_answer", "writing", "subjective"]);

function requiresTeacherReview(question?: Question) {
  return Boolean(question && teacherReviewedQuestionTypes.has(question.type));
}

const questionTypeAliases: Record<string, Question["type"]> = {
  single: "single",
  单选: "single",
  单选题: "single",
  multiple: "multiple",
  多选: "multiple",
  多选题: "multiple",
  blank: "blank",
  填空: "blank",
  填空题: "blank",
  reading: "reading",
  阅读: "reading",
  阅读理解: "reading",
  writing: "writing",
  写作: "writing",
  写作题: "writing",
  true_false: "true_false",
  truefalse: "true_false",
  判断: "true_false",
  判断题: "true_false",
  short_answer: "short_answer",
  shortanswer: "short_answer",
  简答: "short_answer",
  简答题: "short_answer",
  subjective: "subjective",
  主观: "subjective",
  主观题: "subjective",
};

const difficultyLabels: Record<Question["difficulty"], string> = {
  easy: "易",
  medium: "中",
  hard: "难",
};

const difficultyOrder: Record<Question["difficulty"], number> = {
  easy: 1,
  medium: 2,
  hard: 3,
};

const navByRole: Record<Role, Page[]> = {
  admin: ["dashboard", "resources", "admin", "questionBank", "analytics", "assistant"],
  teacher: ["dashboard", "resources", "questionBank", "teacher", "analytics", "assistant"],
  student: ["dashboard", "resources", "student", "assistant"],
};

const navIcons: Record<Page, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  resources: BookOpen,
  admin: ShieldCheck,
  questionBank: ListChecks,
  teacher: School,
  student: ClipboardCheck,
  analytics: BarChart3,
  assistant: Bot,
};

const roleCopy: Record<Role, { headline: string; summary: string }> = {
  admin: {
    headline: "大学英语课程资源建设中枢",
    summary: "管理员负责课程目录、章节、资源上传和账号治理，教师和学生不具备上传课程资料权限。",
  },
  teacher: {
    headline: "大学英语教学组织与数据分析",
    summary: "教师创建班级、从题库选择题目发布作业，并查看自动批改与 AI 学情分析。",
  },
  student: {
    headline: "大学英语碎片化学习与即时答疑",
    summary: "学生输入邀请码加入一个班级后浏览公开资源，完成作业，并通过右侧 AI 助教理解当前资料。",
  },
};

const quickQuestions: Record<Role, string[]> = {
  admin: ["检查课程完整度", "优化课程简介", "列出未绑定资源"],
  teacher: ["生成思政案例", "分析本班薄弱点", "生成 3 道词汇题"],
  student: ["总结本节内容", "解释 perspective", "生成自测题"],
};

const editorTextColors = [
  { label: "黑色文字", value: "#111827" },
  { label: "蓝色文字", value: "#2563eb" },
  { label: "红色文字", value: "#dc2626" },
  { label: "绿色文字", value: "#047857" },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function pct(value: number) {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function className(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function getUserName(users: User[], id: string) {
  return users.find((user) => user.id === id)?.name ?? id;
}

function getClassName(classes: CourseClass[], id: string) {
  return classes.find((item) => item.id === id)?.name ?? "未知班级";
}

function getUserClassNames(classes: CourseClass[], userId: string) {
  return (
    classes
      .filter((item) => item.studentIds.includes(userId) || item.teacherId === userId)
      .map((item) => item.name)
      .join("、") || "暂未加入"
  );
}

function inferResourceType(fileName: string): ResourceType {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "ppt" || ext === "pptx") return "ppt";
  if (ext === "mp4" || ext === "mov" || ext === "webm") return "video";
  if (ext === "mp3" || ext === "wav" || ext === "m4a" || ext === "aac") return "audio";
  if (ext === "pdf") return "pdf";
  return "download";
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("读取本地文件失败"));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("读取题库文件失败"));
    reader.readAsText(file);
  });
}

function makeClientId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function plainTextToEditorHtml(value: string) {
  const paragraphs = value
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!paragraphs.length) return "<p></p>";
  return paragraphs.map((item) => `<p>${escapeHtml(item).replace(/\n/g, "<br />")}</p>`).join("");
}

function sessionBlockToEditorHtml(block?: SessionContentBlock) {
  if (!block?.content) return "<p></p>";
  if (block.format === "html") return block.content;
  return plainTextToEditorHtml(block.content);
}

function inferQuestionMediaType(file: File): QuestionMedia["type"] {
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("video/")) return "video";
  return "image";
}

function questionTypeAllowsOptions(type: Question["type"]) {
  return type === "single" || type === "multiple" || type === "reading";
}

function splitAnswerText(value: string) {
  return value
    .split(/,|，|\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeQuestionTypeLabel(value: string): Question["type"] | undefined {
  return questionTypeAliases[value.trim().replace(/\s+/g, "").toLowerCase()];
}

function normalizeTrueFalseAnswer(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["true", "t", "正确", "对", "是", "yes", "y"].includes(normalized)) return "true";
  if (["false", "f", "错误", "错", "否", "no", "n"].includes(normalized)) return "false";
  return value.trim();
}

function hasQuestionAnswer(form: QuestionFormState) {
  const readingItems = form.subQuestions.filter((item) => item.stem.trim() || item.answer.trim());
  if (form.type === "reading" && readingItems.length > 0) return readingItems.every((item) => item.stem.trim() && item.answer.trim());
  if (form.type === "multiple") return splitAnswerText(form.answerText).length > 0;
  return form.answerText.trim().length > 0;
}

function emptyQuestionForm(type: Question["type"] = "single"): QuestionFormState {
  return {
    type,
    stem: "",
    optionsText: "",
    media: [],
    subQuestions: type === "reading" ? [emptyReadingSubQuestion()] : [],
    answerText: "",
    analysis: "",
    difficulty: "medium",
    tagsText: "",
  };
}

function emptyReadingSubQuestion(): ReadingSubQuestion {
  return {
    id: makeClientId("subq"),
    stem: "",
    options: ["", "", "", ""],
    answer: "",
    analysis: "",
  };
}

function questionToForm(question: Question): QuestionFormState {
  return {
    type: question.type,
    stem: question.stem,
    optionsText: question.options?.join("\n") ?? "",
    media: question.media ?? [],
    subQuestions: question.subQuestions?.length ? question.subQuestions : question.type === "reading" ? [emptyReadingSubQuestion()] : [],
    answerText: Array.isArray(question.answer) ? question.answer.join(",") : question.answer,
    analysis: question.analysis,
    difficulty: question.difficulty,
    tagsText: question.tags.join(","),
  };
}

function questionFormToInput(courseId: string, form: QuestionFormState): CreateQuestionInput {
  const options = form.optionsText
    .split(/\n|;/)
    .map((option) => option.trim())
    .filter(Boolean);
  const tags = form.tagsText
    .split(/,|，/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  const activeReadingSubQuestions = form.subQuestions.filter((item) => item.stem.trim() || item.answer.trim());
  const answer =
    form.type === "reading" && activeReadingSubQuestions.length > 0
      ? activeReadingSubQuestions.map((item) => item.answer.trim()).filter(Boolean)
      : form.type === "multiple"
      ? splitAnswerText(form.answerText)
      : form.type === "true_false"
        ? normalizeTrueFalseAnswer(form.answerText)
        : form.answerText.trim();

  return {
    courseId,
    type: form.type,
    stem: form.stem.trim(),
    options: questionTypeAllowsOptions(form.type) ? options : undefined,
    media: form.media,
    subQuestions:
      form.type === "reading"
        ? activeReadingSubQuestions
            .map((item) => ({
              ...item,
              stem: item.stem.trim(),
              options: item.options?.map((option) => option.trim()).filter(Boolean),
              answer: item.answer.trim(),
              analysis: item.analysis?.trim(),
            }))
            .filter((item) => item.stem || item.answer)
        : undefined,
    answer,
    analysis: form.analysis.trim(),
    difficulty: form.difficulty,
    tags,
  };
}

function parseQuestionRows(courseId: string, text: string): CreateQuestionInput[] {
  return text
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => {
      const cells = row.split("|").map((cell) => cell.trim());
      const explicitType = normalizeQuestionTypeLabel(cells[0] ?? "");
      const [stem = "", optionsText = "", answerText = "", analysis = "", tagsText = ""] = explicitType
        ? cells.slice(1)
        : cells;
      return questionFormToInput(courseId, {
        type: explicitType ?? (optionsText.trim() ? "single" : "short_answer"),
        stem,
        optionsText: optionsText.replace(/;/g, "\n"),
        media: [],
        subQuestions: [],
        answerText,
        analysis,
        difficulty: "medium",
        tagsText,
      });
    })
    .filter((item) => item.stem && (Array.isArray(item.answer) ? item.answer.length > 0 : item.answer));
}

async function loadPlatform(userId: string): Promise<PlatformSnapshot> {
  const [user, courses, users] = await Promise.all([api.me({ userId }), api.courses(), api.users(undefined, { userId })]);
  const course = courses[0];
  if (!course) {
    throw new Error("未找到课程数据");
  }

  const units = await api.units(course.id);
  const sessionGroups = await Promise.all(units.map((unit) => api.sessions(unit.id)));
  const sessions = sessionGroups.flat();
  const [resources, papers, classes, assignments, submissions] = await Promise.all([
    api.resources({ courseId: course.id }, { userId }),
    user.role === "student" ? Promise.resolve([]) : api.papers({ courseId: course.id }, { userId }),
    api.classes({ courseId: course.id }, { userId }),
    api.assignments({ courseId: course.id }, { userId }),
    api.submissions({}, { userId }),
  ]);

  let questions: Question[] = [];
  if (user.role !== "student") {
    try {
      questions = await api.questions({ courseId: course.id }, { userId });
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 403)) {
        throw error;
      }
    }
  }

  let analytics: CourseAnalytics | undefined;
  if (user.role !== "student") {
    try {
      analytics = await api.courseAnalytics(course.id, { userId });
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 403)) {
        throw error;
      }
    }
  }

  return {
    user,
    users,
    course,
    units,
    sessions,
    resources,
    papers,
    classes,
    assignments,
    submissions,
    questions,
    analytics,
  };
}

export default function App() {
  const [role, setRole] = useState<Role>("admin");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginUserId, setLoginUserId] = useState("u-teacher-lin");
  const [currentUserId, setCurrentUserId] = useState("u-admin");
  const [page, setPage] = useState<Page>("dashboard");
  const [data, setData] = useState<PlatformSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [selectedResourceId, setSelectedResourceId] = useState("");
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [taskQuestions, setTaskQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [submissionNotice, setSubmissionNotice] = useState("");
  const [operationNotice, setOperationNotice] = useState("");
  const [aiInput, setAiInput] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([
    { role: "assistant", content: "你好，我可以基于当前课程资源进行总结、答疑、出题和学情建议。" },
  ]);
  const [resourceForm, setResourceForm] = useState<ResourceFormState>({
    title: "课堂讲义补充 PDF",
    type: "pdf" as ResourceType,
    fileName: "lesson-extra.pdf",
  });

  const userId = currentUserId;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const snapshot = await loadPlatform(userId);
      setData(snapshot);
      const firstSession = snapshot.sessions[0]?.id ?? "";
      setSelectedSessionId((current) => current || firstSession);
      const firstAssignment = snapshot.assignments[0]?.id ?? "";
      setSelectedAssignmentId((current) =>
        snapshot.assignments.some((assignment) => assignment.id === current) ? current : firstAssignment,
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!isLoggedIn) return;
    setPage("dashboard");
    setData(null);
    setSelectedSessionId("");
    setSelectedResourceId("");
    setSelectedAssignmentId("");
    setTaskQuestions([]);
    setAnswers({});
    setSubmissionNotice("");
    setOperationNotice("");
    setAiMessages([{ role: "assistant", content: "已切换角色。我会按当前身份提供课程相关帮助。" }]);
    void refresh();
  }, [role, isLoggedIn, refresh]);

  const sessionResources = useMemo(() => {
    if (!data) return [];
    return data.resources.filter((resource) => !selectedSessionId || resource.sessionId === selectedSessionId);
  }, [data, selectedSessionId]);

  useEffect(() => {
    if (!data) return;
    const firstForSession = sessionResources[0]?.id ?? "";
    if (!selectedResourceId || !sessionResources.some((resource) => resource.id === selectedResourceId)) {
      setSelectedResourceId(firstForSession);
    }
  }, [data, sessionResources, selectedResourceId]);

  const selectedSession = data?.sessions.find((session) => session.id === selectedSessionId);
  const selectedResource = sessionResources.find((resource) => resource.id === selectedResourceId) ?? sessionResources[0];
  const selectedAssignment = data?.assignments.find((assignment) => assignment.id === selectedAssignmentId);

  useEffect(() => {
    if (!selectedAssignmentId || !data || !data.assignments.some((assignment) => assignment.id === selectedAssignmentId)) return;
    let cancelled = false;
    setTaskQuestions([]);
    setAnswers({});
    api
      .assignmentQuestions(selectedAssignmentId, { userId })
      .then((items) => {
        if (!cancelled) setTaskQuestions(items);
      })
      .catch(() => {
        if (!cancelled) setTaskQuestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [data, selectedAssignmentId, userId]);

  const askAi = async (message: string, mode: "explain" | "quiz" | "summary" | "resource" = "explain") => {
    if (!data || !message.trim()) return;
    setAiBusy(true);
    setAiMessages((current) => [...current, { role: "user", content: message }]);
    try {
      const response = await api.askAiAssistant(
        {
          userId,
          courseId: data.course.id,
          message,
          mode,
          context: {
            sessionId: selectedSessionId,
            resourceId: selectedResourceId,
          },
        },
        { userId },
      );
      setAiMessages((current) => [...current, { role: "assistant", content: response.message }]);
    } catch (aiError) {
      setAiMessages((current) => [
        ...current,
        { role: "assistant", content: aiError instanceof Error ? aiError.message : "AI 助教暂时不可用" },
      ]);
    } finally {
      setAiBusy(false);
      setAiInput("");
    }
  };

  const createResource = async () => {
    if (!data) return;
    const targetSession = data.sessions.find((session) => session.id === selectedSessionId);
    if (!targetSession) {
      setOperationNotice("请先选择要绑定的章节");
      return;
    }
    try {
      const created = await api.createResource(
        {
          courseId: data.course.id,
          sessionId: targetSession.id,
          unitId: targetSession.unitId,
          title: resourceForm.title,
          type: resourceForm.type,
          fileName: resourceForm.fileName,
          url: resourceForm.url,
          sizeMb: resourceForm.sizeMb ?? (resourceForm.type === "video" ? 120 : 6),
          durationMinutes: resourceForm.type === "audio" ? 18 : resourceForm.type === "video" ? 8 : undefined,
          downloadable: resourceForm.type !== "video",
        },
        { userId },
      );
      setSelectedResourceId(created.id);
      setOperationNotice(`已上传并绑定到 ${targetSession.title}：${created.fileName}`);
      await refresh();
    } catch (actionError) {
      setOperationNotice(actionError instanceof Error ? actionError.message : "上传失败");
    }
  };

  const deleteResource = async (resourceId: string) => {
    if (!data) return;
    const resource = data.resources.find((item) => item.id === resourceId);
    try {
      await api.deleteResource(resourceId, { userId });
      const remainingInSession = data.resources.filter(
        (item) => item.id !== resourceId && item.sessionId === resource?.sessionId,
      );
      if (selectedResourceId === resourceId) {
        setSelectedResourceId(remainingInSession[0]?.id ?? "");
      }
      setOperationNotice(`已删除资源：${resource?.title ?? resourceId}`);
      await refresh();
    } catch (actionError) {
      setOperationNotice(actionError instanceof Error ? actionError.message : "删除资源失败");
    }
  };

  const createSession = async (unitId: string) => {
    if (!data) return;
    const count = data.sessions.filter((session) => session.unitId === unitId).length + 1;
    try {
      const session = await api.createSession(
        {
          unitId,
          title: `新建课程目录 ${count}`,
          summary: "管理员新建的课程目录，可继续编辑文字、图片、音频和视频内容。",
          durationMinutes: 30,
        },
        { userId },
      );
      setSelectedSessionId(session.id);
      setOperationNotice(`已创建章节：${session.title}`);
      await refresh();
    } catch (actionError) {
      setOperationNotice(actionError instanceof Error ? actionError.message : "创建章节失败");
    }
  };

  const createUnit = async () => {
    if (!data) return;
    const count = data.units.length + 1;
    try {
      const unit = await api.createUnit(
        {
          courseId: data.course.id,
          title: `Unit ${count} New Unit`,
          summary: "管理员新建的课程单元，可继续添加章节。",
        },
        { userId },
      );
      setOperationNotice(`已创建 Unit：${unit.title}`);
      await refresh();
    } catch (actionError) {
      setOperationNotice(actionError instanceof Error ? actionError.message : "创建 Unit 失败");
    }
  };

  const updateUnit = async (unitId: string, input: UpdateUnitInput) => {
    try {
      const unit = await api.updateUnit(unitId, input, { userId });
      setOperationNotice(`已保存 Unit：${unit.title}`);
      await refresh();
    } catch (actionError) {
      setOperationNotice(actionError instanceof Error ? actionError.message : "保存 Unit 失败");
    }
  };

  const deleteUnit = async (unitId: string) => {
    try {
      await api.deleteUnit(unitId, { userId });
      const remainingSessions = data?.sessions.filter((session) => session.unitId !== unitId) ?? [];
      setSelectedSessionId(remainingSessions[0]?.id ?? "");
      setSelectedResourceId("");
      setOperationNotice("已删除 Unit 及其下属章节和资源");
      await refresh();
    } catch (actionError) {
      setOperationNotice(actionError instanceof Error ? actionError.message : "删除 Unit 失败");
    }
  };

  const updateSession = async (sessionId: string, input: UpdateSessionInput) => {
    try {
      const session = await api.updateSession(sessionId, input, { userId });
      setOperationNotice(`已保存章节：${session.title}`);
      await refresh();
    } catch (actionError) {
      setOperationNotice(actionError instanceof Error ? actionError.message : "保存章节失败");
    }
  };

  const deleteSession = async (sessionId: string) => {
    try {
      await api.deleteSession(sessionId, { userId });
      const remaining = data?.sessions.filter((session) => session.id !== sessionId) ?? [];
      setSelectedSessionId(remaining[0]?.id ?? "");
      setSelectedResourceId("");
      setOperationNotice("已删除章节及其绑定资源");
      await refresh();
    } catch (actionError) {
      setOperationNotice(actionError instanceof Error ? actionError.message : "删除章节失败");
    }
  };

  const addSessionBlock = async (sessionId: string, input: CreateSessionBlockInput) => {
    try {
      const block = await api.addSessionBlock(sessionId, input, { userId });
      setOperationNotice(`已插入${block.type === "text" ? "文字" : block.type === "image" ? "图片" : "音频"}内容`);
      await refresh();
    } catch (actionError) {
      setOperationNotice(actionError instanceof Error ? actionError.message : "插入内容失败");
    }
  };

  const updateSessionBlock = async (sessionId: string, blockId: string, input: UpdateSessionBlockInput) => {
    try {
      await api.updateSessionBlock(sessionId, blockId, input, { userId });
      setOperationNotice("已保存章节正文修改");
      await refresh();
    } catch (actionError) {
      setOperationNotice(actionError instanceof Error ? actionError.message : "保存正文失败");
    }
  };

  const deleteSessionBlock = async (sessionId: string, blockId: string) => {
    try {
      await api.deleteSessionBlock(sessionId, blockId, { userId });
      setOperationNotice("已删除内容块");
      await refresh();
    } catch (actionError) {
      setOperationNotice(actionError instanceof Error ? actionError.message : "删除内容失败");
    }
  };

  const createUser = async (input: CreateUserInput) => {
    try {
      const user = await api.createUser(input, { userId });
      setOperationNotice(`已创建${roleLabels[user.role]}账号：${user.name}`);
      await refresh();
    } catch (actionError) {
      setOperationNotice(actionError instanceof Error ? actionError.message : "创建账号失败");
    }
  };

  const createQuestion = async (input: CreateQuestionInput) => {
    try {
      const question = await api.createQuestion(input, { userId });
      setOperationNotice(`已保存题目：${question.stem.slice(0, 24)}`);
      await refresh();
    } catch (actionError) {
      setOperationNotice(actionError instanceof Error ? actionError.message : "保存题目失败");
    }
  };

  const updateQuestion = async (questionId: string, input: UpdateQuestionInput) => {
    try {
      const question = await api.updateQuestion(questionId, input, { userId });
      setOperationNotice(`已更新题目：${question.stem.slice(0, 24)}`);
      await refresh();
    } catch (actionError) {
      setOperationNotice(actionError instanceof Error ? actionError.message : "更新题目失败");
    }
  };

  const deleteQuestion = async (questionId: string) => {
    try {
      await api.deleteQuestion(questionId, { userId });
      setOperationNotice("已删除题目");
      await refresh();
    } catch (actionError) {
      setOperationNotice(actionError instanceof Error ? actionError.message : "删除题目失败");
    }
  };

  const importQuestions = async (inputs: CreateQuestionInput[]) => {
    if (inputs.length === 0) {
      setOperationNotice("未识别到可导入的题目");
      return;
    }
    try {
      await Promise.all(inputs.map((input) => api.createQuestion(input, { userId })));
      setOperationNotice(`已导入 ${inputs.length} 道题`);
      await refresh();
    } catch (actionError) {
      setOperationNotice(actionError instanceof Error ? actionError.message : "导入题库失败");
    }
  };

  const createPaper = async (input: CreatePaperInput) => {
    try {
      const paper = await api.createPaper(input, { userId });
      setOperationNotice(`已保存试卷：${paper.title}`);
      await refresh();
    } catch (actionError) {
      setOperationNotice(actionError instanceof Error ? actionError.message : "保存试卷失败");
    }
  };

  const updatePaper = async (paperId: string, input: UpdatePaperInput) => {
    try {
      const paper = await api.updatePaper(paperId, input, { userId });
      setOperationNotice(`已更新试卷：${paper.title}`);
      await refresh();
    } catch (actionError) {
      setOperationNotice(actionError instanceof Error ? actionError.message : "更新试卷失败");
    }
  };

  const deletePaper = async (paperId: string) => {
    try {
      await api.deletePaper(paperId, { userId });
      setOperationNotice("已删除试卷");
      await refresh();
    } catch (actionError) {
      setOperationNotice(actionError instanceof Error ? actionError.message : "删除试卷失败");
    }
  };

  const publishPaper = async (paperId: string, classId: string) => {
    try {
      const assignment = await api.publishPaper(
        paperId,
        {
          classId,
          dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
        { userId },
      );
      setOperationNotice(`已发放试卷：${assignment.title}`);
      await refresh();
    } catch (actionError) {
      setOperationNotice(actionError instanceof Error ? actionError.message : "发放试卷失败");
    }
  };

  const createClass = async () => {
    if (!data) return;
    try {
      const created = await api.createClass(
        {
          courseId: data.course.id,
          name: `大学英语 ${data.classes.length + 1} 班`,
        },
        { userId },
      );
      setOperationNotice(`已创建班级：${created.name}，邀请码 ${created.joinCode}`);
      await refresh();
    } catch (actionError) {
      setOperationNotice(actionError instanceof Error ? actionError.message : "创建班级失败");
    }
  };

  const publishAssignment = async (input: CreateAssignmentInput) => {
    try {
      const assignment = await api.createAssignment(input, { userId });
      setOperationNotice(`已发布作业：${assignment.title}`);
      await refresh();
    } catch (actionError) {
      setOperationNotice(actionError instanceof Error ? actionError.message : "发布作业失败");
    }
  };

  const gradeSubmission = async (submissionId: string, input: GradeSubmissionInput) => {
    try {
      const submission = await api.gradeSubmission(submissionId, input, { userId });
      setOperationNotice(`已完成教师批改，成绩 ${submission.score} 分已回返学生端`);
      await refresh();
    } catch (actionError) {
      setOperationNotice(actionError instanceof Error ? actionError.message : "提交批改失败");
    }
  };

  const joinClass = async (joinCode: string) => {
    try {
      const courseClass = await api.joinClass({ joinCode }, { userId });
      setOperationNotice(`已加入班级：${courseClass.name}`);
      await refresh();
    } catch (actionError) {
      setOperationNotice(actionError instanceof Error ? actionError.message : "加入班级失败");
    }
  };

  const removeStudent = async (classId: string, studentId: string) => {
    try {
      await api.removeStudentFromClass(classId, studentId, { userId });
      setOperationNotice(`已将 ${getUserName(data?.users ?? [], studentId)} 移出班级`);
      await refresh();
    } catch (actionError) {
      setOperationNotice(actionError instanceof Error ? actionError.message : "移出学生失败");
    }
  };

  const submitAssignment = async () => {
    if (!selectedAssignment || taskQuestions.length === 0) return;
    const payload = taskQuestions.map((question) => ({
      questionId: question.id,
      answer: answers[question.id] ?? "",
    }));
    const submission = await api.createSubmission({ assignmentId: selectedAssignment.id, answers: payload }, { userId });
    setSubmissionNotice(
      submission.status === "submitted"
        ? "已提交，等待教师批改试卷"
        : `已提交，系统自动评分 ${submission.score} 分`,
    );
    await refresh();
  };

  if (!isLoggedIn) {
    return (
      <LandingPage
        loginUserId={loginUserId}
        onLoginUserChange={setLoginUserId}
        onLogin={() => {
          const account = loginAccounts.find((item) => item.id === loginUserId) ?? loginAccounts[0];
          setRole(account.role);
          setCurrentUserId(account.id);
          setIsLoggedIn(true);
        }}
      />
    );
  }

  if (loading && !data) {
    return (
      <main className="boot-screen">
        <Sparkles size={28} />
        <h1>大学英语智课通</h1>
        <p>正在连接本地课程 API...</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="boot-screen">
        <AlertTriangle size={30} />
        <h1>加载失败</h1>
        <p>{error || "缺少平台数据"}</p>
        <button className="primary-button" onClick={() => void refresh()}>
          重试
        </button>
      </main>
    );
  }

  const resourceCounts = data.resources.reduce<Record<ResourceType, number>>(
    (counts, resource) => ({ ...counts, [resource.type]: counts[resource.type] + 1 }),
    { ppt: 0, video: 0, audio: 0, pdf: 0, download: 0 },
  );
  const submittedCount = data.submissions.length;
  const gradedSubmissions = data.submissions.filter((submission) => submission.status === "graded");
  const averageScore = gradedSubmissions.length
    ? Math.round(gradedSubmissions.reduce((total, item) => total + item.score, 0) / gradedSubmissions.length)
    : 0;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-mark">
          <div className="brand-icon">
            <GraduationCap size={24} />
          </div>
          <div>
            <strong>大学英语智课通</strong>
            <span>{data.course.title}</span>
          </div>
        </div>

        <div className="role-switch" aria-label="演示角色切换">
          {(["admin", "teacher", "student"] as Role[]).map((item) => (
            <button
              key={item}
              className={className("role-pill", role === item && "active")}
              onClick={() => {
                setData(null);
                setSelectedAssignmentId("");
                setTaskQuestions([]);
                setAnswers({});
                setRole(item);
                setCurrentUserId(roleUsers[item]);
              }}
              title={`切换到${roleLabels[item]}`}
            >
              {roleLabels[item]}
            </button>
          ))}
        </div>

        <div className="topbar-actions">
          <button className="ghost-button" onClick={() => setPage("assistant")}>
            <Bot size={18} />
            AI 助教
          </button>
          <button
            className="ghost-button"
            onClick={() => {
              setIsLoggedIn(false);
              setData(null);
              setPage("dashboard");
            }}
          >
            <LogOut size={18} />
            退出
          </button>
        </div>
      </header>

      <aside className="sidebar">
        <div className="user-card">
          <div className="avatar">{data.user.name.slice(0, 1)}</div>
          <div>
            <strong>{data.user.name}</strong>
            <span>{roleLabels[data.user.role]}</span>
          </div>
        </div>

        <nav>
          {navByRole[role].map((item) => {
            const Icon = navIcons[item];
            return (
              <button key={item} className={className("nav-item", page === item && "active")} onClick={() => setPage(item)}>
                <Icon size={18} />
                {pageLabels[item]}
              </button>
            );
          })}
        </nav>

        <div className="permission-note">
          <ShieldCheck size={18} />
          <span>{role === "admin" ? "可管理课程资源与账号" : role === "teacher" ? "可建班、组卷、看学情" : "只可学习公开资料和作答"}</span>
        </div>
      </aside>

      <main className="main-content">
        {operationNotice && (
          <div className="global-notice">
            <CheckCircle2 size={17} />
            <span>{operationNotice}</span>
            <button onClick={() => setOperationNotice("")}>知道了</button>
          </div>
        )}
        {page === "dashboard" && (
          <Dashboard
            role={role}
            data={data}
            resourceCounts={resourceCounts}
            submittedCount={submittedCount}
            averageScore={averageScore}
            onGoResources={() => setPage("resources")}
            onGoAction={() => setPage(role === "admin" ? "admin" : role === "teacher" ? "teacher" : "student")}
          />
        )}

        {page === "resources" && (
          <ResourcesPage
            role={role}
            data={data}
            selectedSessionId={selectedSessionId}
            selectedResourceId={selectedResourceId}
            selectedSession={selectedSession}
            selectedResource={selectedResource}
            sessionResources={sessionResources}
            aiMessages={aiMessages}
            aiInput={aiInput}
            aiBusy={aiBusy}
            onSelectSession={(sessionId) => {
              setSelectedSessionId(sessionId);
              const firstResource = data.resources.find((resource) => resource.sessionId === sessionId);
              setSelectedResourceId(firstResource?.id ?? "");
            }}
            onSelectResource={setSelectedResourceId}
            onDeleteResource={(resourceId) => void deleteResource(resourceId)}
            onAiInput={setAiInput}
            onAskAi={(message, mode) => void askAi(message, mode)}
          />
        )}

        {page === "admin" && (
          <AdminPage
            data={data}
            resourceCounts={resourceCounts}
            selectedSessionId={selectedSessionId}
            resourceForm={resourceForm}
            onResourceForm={setResourceForm}
            onSelectSession={setSelectedSessionId}
            onCreateUnit={() => void createUnit()}
            onUpdateUnit={(unitId, input) => void updateUnit(unitId, input)}
            onDeleteUnit={(unitId) => void deleteUnit(unitId)}
            onCreateSession={(unitId) => void createSession(unitId)}
            onUpdateSession={(sessionId, input) => void updateSession(sessionId, input)}
            onDeleteSession={(sessionId) => void deleteSession(sessionId)}
            onAddSessionBlock={(sessionId, input) => void addSessionBlock(sessionId, input)}
            onUpdateSessionBlock={(sessionId, blockId, input) => void updateSessionBlock(sessionId, blockId, input)}
            onDeleteSessionBlock={(sessionId, blockId) => void deleteSessionBlock(sessionId, blockId)}
            onCreateResource={() => void createResource()}
            onDeleteResource={(resourceId) => void deleteResource(resourceId)}
            onCreateUser={(input) => void createUser(input)}
            onCreateQuestion={(input) => void createQuestion(input)}
            onUpdateQuestion={(questionId, input) => void updateQuestion(questionId, input)}
            onDeleteQuestion={(questionId) => void deleteQuestion(questionId)}
            onImportQuestions={(inputs) => void importQuestions(inputs)}
          />
        )}

        {page === "questionBank" && (
          <QuestionBankPage
            role={role}
            data={data}
            onCreateQuestion={(input) => void createQuestion(input)}
            onUpdateQuestion={(questionId, input) => void updateQuestion(questionId, input)}
            onDeleteQuestion={(questionId) => void deleteQuestion(questionId)}
            onImportQuestions={(inputs) => void importQuestions(inputs)}
            onCreatePaper={(input) => void createPaper(input)}
            onUpdatePaper={(paperId, input) => void updatePaper(paperId, input)}
            onDeletePaper={(paperId) => void deletePaper(paperId)}
            onPublishPaper={(paperId, classId) => void publishPaper(paperId, classId)}
          />
        )}

        {page === "teacher" && (
          <TeacherPage
            data={data}
            onCreateClass={() => void createClass()}
            onPublishAssignment={(input) => void publishAssignment(input)}
            onRemoveStudent={(classId, studentId) => void removeStudent(classId, studentId)}
            onGradeSubmission={(submissionId, input) => void gradeSubmission(submissionId, input)}
            onAskAi={(message, mode) => void askAi(message, mode)}
          />
        )}

        {page === "student" && (
          <StudentPage
            data={data}
            selectedAssignmentId={selectedAssignmentId}
            selectedAssignment={selectedAssignment}
            taskQuestions={taskQuestions}
            answers={answers}
            notice={submissionNotice}
            onSelectAssignment={setSelectedAssignmentId}
            onAnswer={(questionId, value) => setAnswers((current) => ({ ...current, [questionId]: value }))}
            onSubmit={() => void submitAssignment()}
            onJoinClass={(joinCode) => void joinClass(joinCode)}
            onGoResources={() => setPage("resources")}
          />
        )}

        {page === "analytics" && <AnalyticsPage data={data} role={role} averageScore={averageScore} />}

        {page === "assistant" && (
          <AssistantPage
            role={role}
            data={data}
            aiMessages={aiMessages}
            aiInput={aiInput}
            aiBusy={aiBusy}
            onAiInput={setAiInput}
            onAskAi={(message, mode) => void askAi(message, mode)}
          />
        )}
      </main>
    </div>
  );
}

function LandingPage({
  loginUserId,
  onLoginUserChange,
  onLogin,
}: {
  loginUserId: string;
  onLoginUserChange: (userId: string) => void;
  onLogin: () => void;
}) {
  const account = loginAccounts.find((item) => item.id === loginUserId) ?? loginAccounts[0];

  return (
    <main className="landing-page">
      <section className="landing-copy">
        <div className="landing-brand">
          <div className="brand-icon">
            <GraduationCap size={26} />
          </div>
          <span>大学英语智课通</span>
        </div>
        <h1>大学英语</h1>
        <p>
          面向大学英语课堂的轻量化学习平台，覆盖课程资料、班级管理、作业考试、学生学习和 AI 助教。
          管理员统一建设课程资源，教师组织教学，学生通过邀请码进入班级完成学习任务。
        </p>
        <div className="landing-points">
          <article>
            <ShieldCheck size={20} />
            <strong>权限清晰</strong>
            <span>管理员上传资源，教师发布作业，学生学习作答。</span>
          </article>
          <article>
            <BookOpen size={20} />
            <strong>资源可用</strong>
            <span>PPT 可翻页，音频可播放，资料包可下载。</span>
          </article>
          <article>
            <Sparkles size={20} />
            <strong>AI 助教</strong>
            <span>围绕当前课程内容总结、答疑、出题和学情建议。</span>
          </article>
        </div>
      </section>

      <section className="login-panel">
        <span className="eyebrow">账号登录</span>
        <h2>选择演示账号进入系统</h2>
        <label>
          登录身份
          <select value={loginUserId} onChange={(event) => onLoginUserChange(event.target.value)}>
            {loginAccounts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} · {item.account}
              </option>
            ))}
          </select>
        </label>
        <label>
          账号
          <input value={account.account} readOnly />
        </label>
        <label>
          密码
          <input value={account.password} readOnly />
        </label>
        <button className="primary-button full" onClick={onLogin}>
          <ChevronRight size={18} />
          登录{roleLabels[account.role]}端
        </button>
        <p>演示环境默认填充账号密码，不连接真实身份系统。</p>
      </section>
    </main>
  );
}

function Dashboard({
  role,
  data,
  resourceCounts,
  submittedCount,
  averageScore,
  onGoResources,
  onGoAction,
}: {
  role: Role;
  data: PlatformSnapshot;
  resourceCounts: Record<ResourceType, number>;
  submittedCount: number;
  averageScore: number;
  onGoResources: () => void;
  onGoAction: () => void;
}) {
  const statCards =
    role === "admin"
      ? [
          ["课程完整度", "86%", "目录、资源、题库和班级已形成闭环"],
          ["课程资源", `${data.resources.length}`, "均由管理员上传维护"],
          ["账号总数", `${data.users.length}`, "管理员 / 教师 / 学生"],
        ]
      : role === "teacher"
        ? [
            ["管理班级", `${data.classes.length}`, "邀请码已生成"],
            ["已发布任务", `${data.assignments.length}`, "作业与测验"],
            ["平均成绩", `${averageScore}`, "自动批改结果"],
          ]
        : [
            ["学习进度", "62%", "已完成 7 个学习片段"],
            ["待完成任务", `${data.assignments.length}`, "来自所在班级"],
            ["最近得分", `${averageScore || 100}`, "可查看错题解析"],
          ];

  return (
    <section className="page-stack">
      <div className="hero-panel">
        <div>
          <span className="eyebrow">{data.course.code} · {data.course.term}</span>
          <h1>{roleCopy[role].headline}</h1>
          <p>{roleCopy[role].summary}</p>
          <div className="hero-actions">
            <button className="primary-button" onClick={onGoAction}>
              <ChevronRight size={18} />
              进入{role === "admin" ? "课程管理" : role === "teacher" ? "班级作业" : "我的任务"}
            </button>
            <button className="secondary-button" onClick={onGoResources}>
              <BookOpen size={18} />
              查看课程资源
            </button>
          </div>
        </div>
        <div className="course-snapshot">
          <strong>{data.course.title}</strong>
          <span>{data.course.description}</span>
          <div className="progress-line">
            <i style={{ width: role === "admin" ? "86%" : role === "teacher" ? "74%" : "62%" }} />
          </div>
          <small>{role === "admin" ? "发布准备度" : role === "teacher" ? "班级完成率" : "个人学习进度"}</small>
        </div>
      </div>

      <div className="stat-grid">
        {statCards.map(([label, value, hint]) => (
          <article className="stat-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{hint}</small>
          </article>
        ))}
      </div>

      <div className="two-column">
        <section className="panel">
          <PanelTitle icon={Activity} title="教学闭环" action="演示路径" />
          <ol className="timeline">
            <li><span>管理员</span>创建 Unit / Session，上传 PPT、视频、音频、PDF 和资料包。</li>
            <li><span>教师</span>创建班级，从题库组卷，发布作业并查看自动批改结果。</li>
            <li><span>学生</span>进入班级，学习公开资料，向 AI 提问，在线作答。</li>
            <li><span>AI</span>连接资源内容、作答数据和学情分析，输出讲评建议。</li>
          </ol>
        </section>

        <section className="panel">
          <PanelTitle icon={BarChart3} title="资源构成" action={`${submittedCount} 条提交`} />
          <div className="resource-bars">
            {(Object.keys(resourceCounts) as ResourceType[]).map((type) => {
              const Icon = resourceMeta[type].icon;
              return (
                <div className="resource-bar" key={type}>
                  <span><Icon size={16} />{resourceMeta[type].label}</span>
                  <div><i style={{ width: pct(resourceCounts[type] * 18 + 18) }} /></div>
                  <strong>{resourceCounts[type]}</strong>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}

function ResourcesPage({
  role,
  data,
  selectedSessionId,
  selectedResourceId,
  selectedSession,
  selectedResource,
  sessionResources,
  aiMessages,
  aiInput,
  aiBusy,
  onSelectSession,
  onSelectResource,
  onDeleteResource,
  onAiInput,
  onAskAi,
}: {
  role: Role;
  data: PlatformSnapshot;
  selectedSessionId: string;
  selectedResourceId: string;
  selectedSession?: Session;
  selectedResource?: Resource;
  sessionResources: Resource[];
  aiMessages: AiMessage[];
  aiInput: string;
  aiBusy: boolean;
  onSelectSession: (sessionId: string) => void;
  onSelectResource: (resourceId: string) => void;
  onDeleteResource: (resourceId: string) => void;
  onAiInput: (value: string) => void;
  onAskAi: (message: string, mode?: "explain" | "quiz" | "summary" | "resource") => void;
}) {
  return (
    <section className="resource-layout">
      <aside className="course-tree">
        <PanelTitle icon={BookOpen} title="课程目录" action={`${data.units.length} Unit`} />
        {data.units.map((unit) => (
          <div className="unit-block" key={unit.id}>
            <strong>{unit.title}</strong>
            <p>{unit.summary}</p>
            {data.sessions
              .filter((session) => session.unitId === unit.id)
              .map((session) => (
                <button
                  key={session.id}
                  className={className("session-row", selectedSessionId === session.id && "active")}
                  onClick={() => onSelectSession(session.id)}
                >
                  <CheckCircle2 size={15} />
                  <span>{session.title}</span>
                  <small>{session.durationMinutes} 分钟</small>
                </button>
              ))}
          </div>
        ))}
        {role === "student" && (
          <div className="locked-note">
            <Lock size={16} />
            题库仅教师可见，学生通过作业入口作答。
          </div>
        )}
      </aside>

      <section className="resource-stage">
        <div className="stage-head">
          <div>
            <span className="eyebrow">{selectedSession?.title ?? "课程资料"}</span>
            <h2>{selectedResource?.title ?? "选择资源开始学习"}</h2>
          </div>
          <div className="stage-actions">
            <button className="secondary-button" onClick={() => onAskAi("总结本节内容", "summary")}>
              <Sparkles size={17} />
              总结本节
            </button>
            <button className="secondary-button" onClick={() => onAskAi("生成 3 道自测题", "quiz")}>
              <ListChecks size={17} />
              自测题
            </button>
          </div>
        </div>

        <SessionContentView session={selectedSession} />

        <div className="resource-section-title">
          <PanelTitle icon={Archive} title="章节附件与资源" action={`${sessionResources.length} 个`} />
        </div>

        <div className="resource-tabs">
          {sessionResources.length === 0 ? (
            <div className="empty-state">该章节暂无资源。</div>
          ) : (
            sessionResources.map((resource) => {
              const Icon = resourceMeta[resource.type].icon;
              return (
                <div className="resource-tab-item" key={resource.id}>
                  <button
                    className={className("resource-tab", selectedResourceId === resource.id && "active")}
                    onClick={() => onSelectResource(resource.id)}
                  >
                    <Icon size={17} />
                    <span>{resource.title}</span>
                    <small>{resourceMeta[resource.type].label}</small>
                  </button>
                  {role === "admin" && (
                    <button
                      className="resource-delete-button"
                      onClick={() => onDeleteResource(resource.id)}
                      title={`删除 ${resource.title}`}
                    >
                      <Trash2 size={15} />
                      删除
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        <ResourcePreview resource={selectedResource} session={selectedSession} />
      </section>

      <AiDock
        messages={aiMessages}
        input={aiInput}
        busy={aiBusy}
        role={role}
        onInput={onAiInput}
        onAsk={onAskAi}
      />
    </section>
  );
}

function ResourcePreview({ resource, session }: { resource?: Resource; session?: Session }) {
  const [slideIndex, setSlideIndex] = useState(0);
  if (!resource) {
    return <div className="preview empty-state">请选择一个资源。</div>;
  }
  const Icon = resourceMeta[resource.type].icon;
  const pptSlides = [
    {
      title: "Lead in",
      body: "What does intercultural awareness mean in daily communication?",
      points: ["observe cultural differences", "respect different perspectives", "use polite expressions"],
    },
    {
      title: "Key Vocabulary",
      body: "Focus on words and phrases from Unit 1 Text A.",
      points: ["perspective", "awareness", "responsibility"],
    },
    {
      title: "Class Task",
      body: "Work in pairs and discuss one cultural misunderstanding you have seen.",
      points: ["describe the situation", "explain the cause", "give a better response"],
    },
  ];

  if (resource.type === "video") {
    return (
      <div className="preview media-preview">
        <div className="video-frame">
          <button className="play-button" title="播放视频">
            <Play size={32} />
          </button>
          <span>{resource.title}</span>
        </div>
        <div className="media-controls">
          <span>00:00</span>
          <div><i style={{ width: "38%" }} /></div>
          <span>{resource.durationMinutes ?? 31}:00</span>
        </div>
        <p>AI 助教可基于本视频生成内容摘要、知识点清单和随堂测验。</p>
      </div>
    );
  }

  if (resource.type === "audio") {
    return (
      <div className="preview audio-preview">
        <div className="audio-card">
          <Headphones size={36} />
          <div>
            <strong>{resource.title}</strong>
            <span>{resource.fileName} · {resource.durationMinutes ?? 18} 分钟</span>
          </div>
        </div>
        <audio className="native-player" src={resource.url} controls preload="metadata">
          当前浏览器不支持音频播放。
        </audio>
        <div className="media-controls">
          <span>02:18</span>
          <div><i style={{ width: "44%" }} /></div>
          <span>{resource.durationMinutes ?? 18}:00</span>
        </div>
      </div>
    );
  }

  if (resource.type === "download") {
    return (
      <div className="preview download-preview">
        <Archive size={42} />
        <h3>{resource.title}</h3>
        <p>{resource.fileName} · {resource.sizeMb} MB。压缩包不在线预览，学生可按权限下载。</p>
        <a className="primary-button" href={resource.url} download={resource.fileName}>
          <Download size={18} />
          下载资料包
        </a>
      </div>
    );
  }

  if (resource.type === "ppt") {
    const slide = pptSlides[slideIndex];
    const isUploadedFile = resource.url.startsWith("data:");
    if (isUploadedFile) {
      return (
        <div className="preview document-preview">
          <div className="document-toolbar">
            <span><MonitorPlay size={17} />PPT 原文件</span>
            <span>{resource.fileName}</span>
          </div>
          <div className="uploaded-file-preview">
            <MonitorPlay size={48} />
            <h3>{resource.title}</h3>
            <p>{resource.fileName} · {resource.sizeMb} MB。已保存所选本地文件，不再替换为默认 PPT 内容。</p>
            <a className="primary-button" href={resource.url} download={resource.fileName}>
              <Download size={18} />
              下载原 PPT
            </a>
          </div>
        </div>
      );
    }

    return (
      <div className="preview document-preview">
        <div className="document-toolbar">
          <span><MonitorPlay size={17} />PPT 在线预览</span>
          <span>{slideIndex + 1} / {pptSlides.length}</span>
        </div>
        <div className="ppt-player">
          <span className="chapter-label">{session?.title ?? "课程资料"}</span>
          <h3>{slide.title}</h3>
          <p>{slide.body}</p>
          <ul>
            {slide.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
        <div className="ppt-controls">
          <button className="secondary-button" onClick={() => setSlideIndex((current) => Math.max(0, current - 1))}>
            上一页
          </button>
          <button className="primary-button" onClick={() => setSlideIndex((current) => (current + 1) % pptSlides.length)}>
            <Play size={17} />
            播放/下一页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="preview document-preview">
      <div className="document-toolbar">
        <span><Icon size={17} />{resourceMeta[resource.type].label} 在线预览</span>
        <span>{resource.fileName}</span>
      </div>
      <div className="document-paper">
        <span className="chapter-label">{session?.title ?? "课程资料"}</span>
        <h3>{resource.title}</h3>
        <p>本节围绕核心概念、典型案例和练习任务展开，支持碎片化学习。</p>
        <ul>
          <li>核心概念：智能体、状态、策略与评价。</li>
          <li>案例材料：课堂视频、讲义、PDF 和拓展数据包。</li>
          <li>学习任务：完成章节资源后进入作业测验。</li>
        </ul>
      </div>
    </div>
  );
}

function SessionContentView({ session }: { session?: Session }) {
  const [zoomedImage, setZoomedImage] = useState<SessionContentBlock | null>(null);
  const blocks = session?.contentBlocks ?? [];

  if (!session || blocks.length === 0) {
    return (
      <section className="content-reader empty-content">
        <PanelTitle icon={BookOpen} title="章节正文" action="暂无排版内容" />
        <div className="empty-state">管理员可在课程管理中为本章节插入文字、图片和音频。</div>
      </section>
    );
  }

  return (
    <section className="content-reader">
      <PanelTitle icon={BookOpen} title="章节正文" action={`${blocks.length} 个内容块`} />
      <div className="reader-paper">
        {blocks.map((block, index) => {
          if (block.type === "text") {
            return (
              <article className="reader-block reader-text" key={block.id}>
                <span className="block-index">{index + 1}</span>
                {block.format === "html" ? (
                  <div className="rich-content" dangerouslySetInnerHTML={{ __html: block.content ?? "" }} />
                ) : (
                  (block.content ?? "").split("\n").map((line, lineIndex) =>
                    line.trim() ? <p key={`${block.id}-${lineIndex}`}>{line}</p> : <br key={`${block.id}-${lineIndex}`} />,
                  )
                )}
              </article>
            );
          }

          if (block.type === "image") {
            return (
              <figure className="reader-block reader-image" key={block.id}>
                <button className="image-open-button" onClick={() => setZoomedImage(block)} title="放大查看图片">
                  <img src={block.url} alt={block.caption ?? block.fileName ?? "章节图片"} />
                  <span><Maximize2 size={16} />放大查看</span>
                </button>
                <figcaption>{block.caption ?? block.fileName}</figcaption>
              </figure>
            );
          }

          return (
            <article className={className("reader-block", block.type === "video" ? "reader-video" : "reader-audio")} key={block.id}>
              <div>
                {block.type === "video" ? <Video size={22} /> : <Music size={22} />}
                <strong>{block.caption ?? block.fileName ?? (block.type === "video" ? "章节视频" : "章节音频")}</strong>
              </div>
              {block.type === "video" ? (
                <video className="native-player" src={block.url} controls preload="metadata">
                  当前浏览器不支持视频播放。
                </video>
              ) : (
                <audio className="native-player" src={block.url} controls preload="metadata">
                  当前浏览器不支持音频播放。
                </audio>
              )}
            </article>
          );
        })}
      </div>

      {zoomedImage && (
        <div className="image-lightbox" role="dialog" aria-modal="true">
          <button className="lightbox-close" onClick={() => setZoomedImage(null)} title="关闭">
            <X size={20} />
          </button>
          <img src={zoomedImage.url} alt={zoomedImage.caption ?? zoomedImage.fileName ?? "章节图片"} />
          <span>{zoomedImage.caption ?? zoomedImage.fileName}</span>
        </div>
      )}
    </section>
  );
}

function SessionEditor({
  session,
  unitTitle,
  onSave,
  onDelete,
  onAddBlock,
  onUpdateBlock,
  onDeleteBlock,
}: {
  session: Session;
  unitTitle: string;
  onSave: (input: UpdateSessionInput) => void;
  onDelete: () => void;
  onAddBlock: (input: CreateSessionBlockInput) => void;
  onUpdateBlock: (blockId: string, input: UpdateSessionBlockInput) => void;
  onDeleteBlock: (blockId: string) => void;
}) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const savedSelectionRef = useRef<Range | null>(null);
  const [title, setTitle] = useState(session.title);
  const [summary, setSummary] = useState(session.summary);
  const [durationMinutes, setDurationMinutes] = useState(String(session.durationMinutes));
  const editableTextBlock = useMemo(
    () => session.contentBlocks.find((block) => block.type === "text" && (block.format === "html" || block.content)),
    [session.contentBlocks],
  );

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = sessionBlockToEditorHtml(editableTextBlock);
    }
  }, [editableTextBlock]);

  const rememberEditorSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !editorRef.current) return;
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const parentNode = container.nodeType === Node.ELEMENT_NODE ? container : container.parentNode;
    if (parentNode && editorRef.current.contains(parentNode)) {
      savedSelectionRef.current = range.cloneRange();
    }
  };

  const restoreEditorSelection = () => {
    const selection = window.getSelection();
    const range = savedSelectionRef.current;
    if (!selection || !range) return;
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const runEditorCommand = (command: string, value?: string) => {
    restoreEditorSelection();
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    rememberEditorSelection();
  };

  const moveCaretToInsertedParagraph = (markerId: string) => {
    const marker = editorRef.current?.querySelector<HTMLParagraphElement>(`p[data-editor-caret="${markerId}"]`);
    const selection = window.getSelection();
    if (!marker || !selection) return;
    marker.removeAttribute("data-editor-caret");
    const range = document.createRange();
    range.setStart(marker, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    savedSelectionRef.current = range.cloneRange();
  };

  const insertMediaIntoEditor = (type: "image" | "audio" | "video", file?: File) => {
    if (!file) return;
    void readFileAsDataUrl(file).then((url) => {
      restoreEditorSelection();
      editorRef.current?.focus();
      const label = escapeHtml(file.name.replace(/\.[^.]+$/, ""));
      const markerId = makeClientId("caret");
      const html =
        type === "image"
          ? `<figure><img src="${url}" alt="${label}" /><figcaption>${label}</figcaption></figure><p data-editor-caret="${markerId}"><br></p>`
          : type === "video"
            ? `<figure><video src="${url}" controls></video><figcaption>${label}</figcaption></figure><p data-editor-caret="${markerId}"><br></p>`
          : `<figure><audio src="${url}" controls></audio><figcaption>${label}</figcaption></figure><p data-editor-caret="${markerId}"><br></p>`;
      document.execCommand("insertHTML", false, html);
      moveCaretToInsertedParagraph(markerId);
    });
  };

  const saveEditorContent = () => {
    const html = editorRef.current?.innerHTML ?? "";
    if (!html.replace(/<[^>]+>/g, "").trim() && !html.includes("<img") && !html.includes("<audio") && !html.includes("<video")) {
      return;
    }
    const payload: CreateSessionBlockInput = { type: "text", content: html, format: "html", caption: "富文本正文" };
    if (editableTextBlock) {
      onUpdateBlock(editableTextBlock.id, payload);
      return;
    }
    onAddBlock(payload);
  };

  return (
    <section className="panel session-editor">
      <PanelTitle icon={PencilLine} title="章节独立编辑页" action={unitTitle} />
      <div className="session-editor-grid">
        <div className="form-grid single">
          <label>
            章节标题
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            章节简介
            <textarea value={summary} onChange={(event) => setSummary(event.target.value)} />
          </label>
          <label>
            预计时长（分钟）
            <input value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} />
          </label>
        </div>

        <div className="editor-actions">
          <button
            className="primary-button"
            onClick={() =>
              onSave({
                title,
                summary,
                durationMinutes: Number(durationMinutes) || session.durationMinutes,
              })
            }
          >
            <Save size={18} />
            保存章节
          </button>
          <button className="danger-button" onClick={onDelete}>
            <Trash2 size={16} />
            删除章节
          </button>
        </div>
      </div>

      <div className="rich-editor-shell">
        <div
          className="rich-toolbar"
          aria-label="正文格式工具栏"
          onMouseDown={(event) => {
            if ((event.target as HTMLElement).closest("button")) {
              event.preventDefault();
            }
          }}
        >
          <button onClick={() => runEditorCommand("undo")} title="撤销"><Undo2 size={17} /></button>
          <button onClick={() => runEditorCommand("redo")} title="重做"><Redo2 size={17} /></button>
          <select onChange={(event) => runEditorCommand("formatBlock", event.target.value)} defaultValue="P" title="段落">
            <option value="P">段落</option>
            <option value="H2">标题</option>
            <option value="H3">小标题</option>
          </select>
          <select onChange={(event) => runEditorCommand("fontSize", event.target.value)} defaultValue="3" title="字号">
            <option value="2">小</option>
            <option value="3">正文</option>
            <option value="5">大</option>
          </select>
          <button onClick={() => runEditorCommand("bold")} title="加粗"><Bold size={17} /></button>
          <button onClick={() => runEditorCommand("italic")} title="斜体"><Italic size={17} /></button>
          <button onClick={() => runEditorCommand("underline")} title="下划线"><Underline size={17} /></button>
          <button onClick={() => runEditorCommand("strikeThrough")} title="删除线"><Strikethrough size={17} /></button>
          <div className="color-palette" aria-label="文字颜色">
            {editorTextColors.map((color) => (
              <button
                key={color.value}
                className="color-swatch"
                onClick={() => runEditorCommand("foreColor", color.value)}
                title={color.label}
                style={{ background: color.value }}
              />
            ))}
          </div>
          <button onClick={() => runEditorCommand("justifyLeft")} title="左对齐"><AlignLeft size={17} /></button>
          <button onClick={() => runEditorCommand("justifyCenter")} title="居中"><AlignCenter size={17} /></button>
          <button onClick={() => runEditorCommand("insertOrderedList")} title="编号列表"><ListOrdered size={17} /></button>
          <button onClick={() => runEditorCommand("insertUnorderedList")} title="项目列表"><List size={17} /></button>
          <button
            onClick={() => {
              const url = window.prompt("输入链接地址");
              if (url) runEditorCommand("createLink", url);
            }}
            title="插入链接"
          >
            <Link size={17} />
          </button>
          <button onClick={() => imageInputRef.current?.click()} title="插入图片"><ImageIcon size={17} /></button>
          <button onClick={() => audioInputRef.current?.click()} title="插入音频"><Music size={17} /></button>
          <button onClick={() => videoInputRef.current?.click()} title="插入视频"><Video size={17} /></button>
        </div>

        <div
          ref={editorRef}
          className="rich-editor"
          contentEditable
          suppressContentEditableWarning
          onInput={rememberEditorSelection}
          onKeyUp={rememberEditorSelection}
          onMouseUp={rememberEditorSelection}
        />

        <div className="rich-editor-actions">
          <button
            className="primary-button"
            onClick={saveEditorContent}
          >
            <Save size={18} />
            {editableTextBlock ? "保存正文修改" : "保存到章节正文"}
          </button>
          <button
            className="secondary-button"
            onClick={() => {
              if (editorRef.current) editorRef.current.innerHTML = "<p></p>";
            }}
          >
            清空编辑区
          </button>
        </div>

        <div className="media-insert-grid hidden-media-inputs">
          <input
            ref={imageInputRef}
            className="visually-hidden"
            type="file"
            accept="image/*"
            onChange={(event) => {
              insertMediaIntoEditor("image", event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <input
            ref={audioInputRef}
            className="visually-hidden"
            type="file"
            accept=".mp3,.wav,.m4a,.aac,audio/*"
            onChange={(event) => {
              insertMediaIntoEditor("audio", event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <input
            ref={videoInputRef}
            className="visually-hidden"
            type="file"
            accept=".mp4,.mov,.webm,video/*"
            onChange={(event) => {
              insertMediaIntoEditor("video", event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="block-list">
        {session.contentBlocks.length === 0 ? (
          <div className="empty-state">当前章节还没有正文内容。</div>
        ) : (
          session.contentBlocks.map((block, index) => (
            <article className="block-row" key={block.id}>
              <span>{index + 1}</span>
              {block.type === "text" ? <Type size={18} /> : block.type === "image" ? <ImageIcon size={18} /> : block.type === "video" ? <Video size={18} /> : <Music size={18} />}
              <strong>
                {block.type === "text"
                  ? (block.format === "html" ? "富文本正文" : (block.content ?? "").slice(0, 36)) || "文字内容"
                  : block.caption ?? block.fileName ?? (block.type === "image" ? "图片内容" : block.type === "video" ? "视频内容" : "音频内容")}
              </strong>
              <button className="danger-button" onClick={() => onDeleteBlock(block.id)}>
                <Trash2 size={15} />
                删除
              </button>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function AdminPage({
  data,
  resourceCounts,
  selectedSessionId,
  resourceForm,
  onResourceForm,
  onSelectSession,
  onCreateUnit,
  onUpdateUnit,
  onDeleteUnit,
  onCreateSession,
  onUpdateSession,
  onDeleteSession,
  onAddSessionBlock,
  onUpdateSessionBlock,
  onDeleteSessionBlock,
  onCreateResource,
  onDeleteResource,
  onCreateUser,
  onCreateQuestion,
  onUpdateQuestion,
  onDeleteQuestion,
  onImportQuestions,
}: {
  data: PlatformSnapshot;
  resourceCounts: Record<ResourceType, number>;
  selectedSessionId: string;
  resourceForm: ResourceFormState;
  onResourceForm: (value: ResourceFormState) => void;
  onSelectSession: (sessionId: string) => void;
  onCreateUnit: () => void;
  onUpdateUnit: (unitId: string, input: UpdateUnitInput) => void;
  onDeleteUnit: (unitId: string) => void;
  onCreateSession: (unitId: string) => void;
  onUpdateSession: (sessionId: string, input: UpdateSessionInput) => void;
  onDeleteSession: (sessionId: string) => void;
  onAddSessionBlock: (sessionId: string, input: CreateSessionBlockInput) => void;
  onUpdateSessionBlock: (sessionId: string, blockId: string, input: UpdateSessionBlockInput) => void;
  onDeleteSessionBlock: (sessionId: string, blockId: string) => void;
  onCreateResource: () => void;
  onDeleteResource: (resourceId: string) => void;
  onCreateUser: (input: CreateUserInput) => void;
  onCreateQuestion: (input: CreateQuestionInput) => void;
  onUpdateQuestion: (questionId: string, input: UpdateQuestionInput) => void;
  onDeleteQuestion: (questionId: string) => void;
  onImportQuestions: (inputs: CreateQuestionInput[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [adminTab, setAdminTab] = useState<"course" | "questions" | "accounts">("course");
  const [memberTab, setMemberTab] = useState<"classes" | "teachers">("classes");
  const [memberSort, setMemberSort] = useState<"account" | "name" | "class" | "createdAt">("account");
  const [selectedUserId, setSelectedUserId] = useState(data.users[0]?.id ?? "");
  const [newUser, setNewUser] = useState<CreateUserInput>({ name: "新学生", role: "student", account: "student-new" });
  const [unitDrafts, setUnitDrafts] = useState<Record<string, string>>({});
  const [unitActionNotice, setUnitActionNotice] = useState("");
  const session = data.sessions.find((item) => item.id === selectedSessionId) ?? data.sessions[0];
  const editingSession = session;
  const selectedSessionResources = data.resources.filter((resource) => resource.sessionId === session?.id);
  const teachers = data.users.filter((user) => user.role === "teacher");
  const students = data.users.filter((user) => user.role === "student");
  const collator = useMemo(() => new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" }), []);
  const visibleUsers = useMemo(() => {
    const source = memberTab === "teachers" ? teachers : students;
    return [...source].sort((a, b) => {
      if (memberSort === "name") return collator.compare(a.name, b.name);
      if (memberSort === "class") return collator.compare(getUserClassNames(data.classes, a.id), getUserClassNames(data.classes, b.id));
      if (memberSort === "createdAt") return collator.compare(a.createdAt ?? "", b.createdAt ?? "");
      return collator.compare(a.account ?? a.id, b.account ?? b.id);
    });
  }, [collator, data.classes, memberSort, memberTab, students, teachers]);
  const selectedUser = visibleUsers.find((user) => user.id === selectedUserId) ?? visibleUsers[0] ?? data.users[0];

  const handleResourceFile = (file?: File) => {
    if (!file) return;
    void readFileAsDataUrl(file).then((url) => {
      const fileName = file.name;
      onResourceForm({
        title: fileName.replace(/\.[^.]+$/, ""),
        fileName,
        type: inferResourceType(fileName),
        url,
        sizeMb: Number((file.size / 1024 / 1024).toFixed(1)) || 0.1,
      });
    });
  };

  const saveUnitTitle = (unit: Unit) => {
    const title = (unitDrafts[unit.id] ?? unit.title).trim();
    if (!title) {
      setUnitActionNotice("Unit 标题不能为空。");
      return;
    }
    setUnitActionNotice(`正在保存 Unit：${title}`);
    onUpdateUnit(unit.id, { title });
  };

  const removeUnit = (unit: Unit) => {
    setUnitActionNotice(`正在删除 Unit：${unit.title}`);
    onDeleteUnit(unit.id);
  };

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow="管理员端"
        title="课程管理 / 编辑"
        description="课程资料仅由管理员上传；章节内容支持文字、图片、音频、视频和文件资源。"
      />

      <div className="tab-strip">
        <button className={className(adminTab === "course" && "active")} onClick={() => setAdminTab("course")}>
          课程章节与资源
        </button>
        <button className={className(adminTab === "questions" && "active")} onClick={() => setAdminTab("questions")}>
          题库编辑/上传
        </button>
        <button className={className(adminTab === "accounts" && "active")} onClick={() => setAdminTab("accounts")}>
          账号与班级管理
        </button>
      </div>

      {adminTab === "course" ? (
        <div className="admin-grid">
          <section className="panel">
            <PanelTitle icon={School} title="章节结构" action="Unit / Session" />
            <button className="secondary-button full" onClick={onCreateUnit}>
              <Plus size={18} />
              新建 Unit
            </button>
            {unitActionNotice && <div className="inline-notice unit-action-notice">{unitActionNotice}</div>}
            <div className="editor-tree">
              {data.units.map((unit) => (
                <div key={unit.id}>
                  <label className="unit-title-editor">
                    Unit 名称
                    <input
                      value={unitDrafts[unit.id] ?? unit.title}
                      onChange={(event) => setUnitDrafts((current) => ({ ...current, [unit.id]: event.target.value }))}
                    />
                  </label>
                  <div className="unit-actions">
                    <button type="button" className="secondary-button" onClick={() => saveUnitTitle(unit)}>
                      <Save size={15} />
                      保存 Unit
                    </button>
                    <button type="button" className="danger-button" disabled={data.units.length <= 1} onClick={() => removeUnit(unit)}>
                      <Trash2 size={15} />
                      删除 Unit
                    </button>
                  </div>
                  {data.sessions
                    .filter((item) => item.unitId === unit.id)
                    .map((item) => (
                      <button
                        key={item.id}
                        className={className("chapter-title-button", editingSession?.id === item.id && "active")}
                        onClick={() => {
                          onSelectSession(item.id);
                        }}
                      >
                        <Edit3 size={14} />
                        {item.title}
                      </button>
                    ))}
                  <button className="text-button" onClick={() => onCreateSession(unit.id)}>
                    <Plus size={15} />
                    在本 Unit 下新建章节
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <PanelTitle icon={CloudUpload} title="上传课程资源" action="仅管理员" />
            <div className="form-grid">
              <label>
                资源标题
                <input value={resourceForm.title} onChange={(event) => onResourceForm({ ...resourceForm, title: event.target.value })} />
              </label>
              <label>
                资源类型
                <select
                  value={resourceForm.type}
                  onChange={(event) => onResourceForm({ ...resourceForm, type: event.target.value as ResourceType })}
                >
                  <option value="ppt">PPT</option>
                  <option value="video">视频</option>
                  <option value="audio">音频</option>
                  <option value="pdf">PDF</option>
                  <option value="download">压缩包/下载</option>
                </select>
              </label>
              <label>
                绑定章节
                <select value={selectedSessionId} onChange={(event) => onSelectSession(event.target.value)}>
                  {data.units.map((unit) => (
                    <optgroup label={unit.title} key={unit.id}>
                      {data.sessions
                        .filter((item) => item.unitId === unit.id)
                        .map((item) => (
                          <option value={item.id} key={item.id}>
                            {item.title}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label>
                文件名
                <input value={resourceForm.fileName} onChange={(event) => onResourceForm({ ...resourceForm, fileName: event.target.value })} />
              </label>
            </div>
            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              accept=".ppt,.pptx,.mp4,.mp3,.wav,.pdf,.zip,.rar"
              onChange={(event) => {
                handleResourceFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <div className="upload-row">
              <button className="secondary-button" onClick={() => fileInputRef.current?.click()}>
                <Upload size={18} />
                选择本地文件
              </button>
              <span>{resourceForm.fileName}</span>
            </div>
            <div className="target-session">
              <CheckCircle2 size={17} />
              当前章节：{session?.title ?? "当前章节"} · 已绑定 {selectedSessionResources.length} 个资源
            </div>
            <div className="bound-resource-list">
              {selectedSessionResources.length === 0 ? (
                <div className="empty-state">该章节暂无绑定资源，上传后会显示在这里。</div>
              ) : (
                selectedSessionResources.map((resource) => {
                  const Icon = resourceMeta[resource.type].icon;
                  return (
                    <article key={resource.id}>
                      <Icon size={17} />
                      <div>
                        <strong>{resource.title}</strong>
                        <span>{resourceMeta[resource.type].label} · {resource.fileName}</span>
                      </div>
                      <button className="danger-button" onClick={() => onDeleteResource(resource.id)}>
                        <Trash2 size={15} />
                        删除
                      </button>
                    </article>
                  );
                })
              )}
            </div>
            <button className="primary-button" onClick={onCreateResource}>
              <CloudUpload size={18} />
              上传并绑定章节
            </button>
          </section>

          {editingSession && (
            <SessionEditor
              key={editingSession.id}
              session={editingSession}
              unitTitle={data.units.find((unit) => unit.id === editingSession.unitId)?.title ?? "当前 Unit"}
              onSave={(input) => onUpdateSession(editingSession.id, input)}
              onDelete={() => onDeleteSession(editingSession.id)}
              onAddBlock={(input) => onAddSessionBlock(editingSession.id, input)}
              onUpdateBlock={(blockId, input) => onUpdateSessionBlock(editingSession.id, blockId, input)}
              onDeleteBlock={(blockId) => onDeleteSessionBlock(editingSession.id, blockId)}
            />
          )}

          <section className="panel">
            <PanelTitle icon={ShieldCheck} title="发布前检查" action="92%" />
            <div className="checklist">
              <span><CheckCircle2 size={16} />课程名称已更新为“大学英语智课通”</span>
              <span><CheckCircle2 size={16} />已创建 {data.units.length} 个 Unit、{data.sessions.length} 个 Session</span>
              <span><CheckCircle2 size={16} />已上传 {data.resources.length} 个资源</span>
              <span><AlertTriangle size={16} />建议继续补充 Unit 3 作文互评任务</span>
            </div>
          </section>

          <section className="panel">
            <PanelTitle icon={FileText} title="资源编辑效果" action={`${data.resources.length} 个资源`} />
            <div className="table-list">
              {data.resources.slice(0, 5).map((resource) => (
                <div key={resource.id}>
                  <span>{resource.title}</span>
                  <strong>{resourceMeta[resource.type].label}</strong>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : adminTab === "questions" ? (
        <QuestionBankEditor
          data={data}
          onCreateQuestion={onCreateQuestion}
          onUpdateQuestion={onUpdateQuestion}
          onDeleteQuestion={onDeleteQuestion}
          onImportQuestions={onImportQuestions}
        />
      ) : (
        <div className="admin-grid wide">
          <section className="panel">
            <PanelTitle icon={Users} title="成员管理" action={`${data.users.length} 人`} />
            <div className="member-tabs">
              <button
                className={className(memberTab === "classes" && "active")}
                onClick={() => {
                  setMemberTab("classes");
                  setSelectedUserId(students[0]?.id ?? "");
                }}
              >
                学生管理
              </button>
              <button
                className={className(memberTab === "teachers" && "active")}
                onClick={() => {
                  setMemberTab("teachers");
                  setSelectedUserId(teachers[0]?.id ?? "");
                }}
              >
                教师团队管理
              </button>
            </div>
            <div className="member-toolbar">
              <label>
                排序
                <select value={memberSort} onChange={(event) => setMemberSort(event.target.value as typeof memberSort)}>
                  <option value="account">按学号/工号</option>
                  <option value="name">按姓名</option>
                  <option value="class">按班级</option>
                  <option value="createdAt">按加入时间</option>
                </select>
              </label>
            </div>
            <div className="member-table">
              <div className="member-head">
                <span>姓名</span>
                <span>角色</span>
                <span>班级</span>
                <span>学号/工号</span>
                <span>加入时间</span>
              </div>
              {visibleUsers.map((user) => (
                <button key={user.id} className={className("member-row", selectedUser?.id === user.id && "active")} onClick={() => setSelectedUserId(user.id)}>
                  <span>{user.name}</span>
                  <span>{roleLabels[user.role]}</span>
                  <span>{getUserClassNames(data.classes, user.id)}</span>
                  <span>{user.account ?? user.id}</span>
                  <span>{user.createdAt ? formatDate(user.createdAt) : "05/22 00:00"}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <PanelTitle icon={UserPlus} title="添加成员" action="管理员全局创建" />
            <div className="form-grid single">
              <label>
                姓名
                <input value={newUser.name} onChange={(event) => setNewUser({ ...newUser, name: event.target.value })} />
              </label>
              <label>
                角色
                <select value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value as Role })}>
                  <option value="teacher">教师</option>
                  <option value="student">学生</option>
                </select>
              </label>
              <label>
                学号/工号
                <input value={newUser.account} onChange={(event) => setNewUser({ ...newUser, account: event.target.value })} />
              </label>
            </div>
            <button className="primary-button full" onClick={() => onCreateUser(newUser)}>
              <UserPlus size={18} />
              添加成员
            </button>

            {selectedUser && (
              <div className="detail-card">
                <strong>{selectedUser.name}</strong>
                <span>角色：{roleLabels[selectedUser.role]}</span>
                <span>账号：{selectedUser.account ?? selectedUser.id}</span>
                <span>班级：{getUserClassNames(data.classes, selectedUser.id)}</span>
              </div>
            )}
          </section>
        </div>
      )}

      <div className="stat-grid">
        {(Object.keys(resourceCounts) as ResourceType[]).map((type) => (
          <article className="stat-card" key={type}>
            <span>{resourceMeta[type].label}</span>
            <strong>{resourceCounts[type]}</strong>
            <small>可在线预览或按权限下载</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function QuestionBankPage({
  role,
  data,
  onCreateQuestion,
  onUpdateQuestion,
  onDeleteQuestion,
  onImportQuestions,
  onCreatePaper,
  onUpdatePaper,
  onDeletePaper,
  onPublishPaper,
}: {
  role: Role;
  data: PlatformSnapshot;
  onCreateQuestion: (input: CreateQuestionInput) => void;
  onUpdateQuestion: (questionId: string, input: UpdateQuestionInput) => void;
  onDeleteQuestion: (questionId: string) => void;
  onImportQuestions: (inputs: CreateQuestionInput[]) => void;
  onCreatePaper: (input: CreatePaperInput) => void;
  onUpdatePaper: (paperId: string, input: UpdatePaperInput) => void;
  onDeletePaper: (paperId: string) => void;
  onPublishPaper: (paperId: string, classId: string) => void;
}) {
  const [bankTab, setBankTab] = useState<"questions" | "builder" | "papers">("questions");
  const [editingPaper, setEditingPaper] = useState<ExamPaper | undefined>();

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow={`${roleLabels[role]}端`}
        title="题库管理"
        description="维护题目、批量导入、从题库组卷，并将试卷从试卷库发放到班级。"
      />

      <div className="tab-strip">
        <button className={className(bankTab === "questions" && "active")} onClick={() => setBankTab("questions")}>
          题库管理
        </button>
        <button className={className(bankTab === "builder" && "active")} onClick={() => setBankTab("builder")}>
          组卷
        </button>
        <button className={className(bankTab === "papers" && "active")} onClick={() => setBankTab("papers")}>
          试卷库
        </button>
      </div>

      {bankTab === "questions" ? (
        <QuestionBankEditor
          data={data}
          onCreateQuestion={onCreateQuestion}
          onUpdateQuestion={onUpdateQuestion}
          onDeleteQuestion={onDeleteQuestion}
          onImportQuestions={onImportQuestions}
        />
      ) : bankTab === "builder" ? (
        <PaperBuilder
          key={editingPaper?.id ?? "new-paper"}
          data={data}
          editingPaper={editingPaper}
          onCreatePaper={onCreatePaper}
          onUpdatePaper={onUpdatePaper}
          onClearEditing={() => setEditingPaper(undefined)}
        />
      ) : (
        <PaperLibrary
          data={data}
          onEditPaper={(paper) => {
            setEditingPaper(paper);
            setBankTab("builder");
          }}
          onDeletePaper={onDeletePaper}
          onPublishPaper={onPublishPaper}
        />
      )}
    </section>
  );
}

function QuestionBankEditor({
  data,
  onCreateQuestion,
  onUpdateQuestion,
  onDeleteQuestion,
  onImportQuestions,
}: {
  data: PlatformSnapshot;
  onCreateQuestion: (input: CreateQuestionInput) => void;
  onUpdateQuestion: (questionId: string, input: UpdateQuestionInput) => void;
  onDeleteQuestion: (questionId: string) => void;
  onImportQuestions: (inputs: CreateQuestionInput[]) => void;
}) {
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const mediaFileRef = useRef<HTMLInputElement | null>(null);
  const [editingQuestionId, setEditingQuestionId] = useState("");
  const [questionForm, setQuestionForm] = useState<QuestionFormState>(emptyQuestionForm);
  const [editorNotice, setEditorNotice] = useState("");
  const [listTypeFilter, setListTypeFilter] = useState<"all" | Question["type"]>("all");
  const [bulkText, setBulkText] = useState(
    "单选题|Which word is closest in meaning to perspective?|viewpoint;schedule;mistake;weather|viewpoint|Perspective means a viewpoint.|vocabulary,Text A\n填空题|AI tools can support ___ learning.||personalized|Use an adjective to complete the sentence.|grammar,Unit 1",
  );
  const editingQuestion = data.questions.find((question) => question.id === editingQuestionId);
  const optionRows = useMemo(() => {
    const currentRows = questionForm.optionsText ? questionForm.optionsText.split("\n") : [];
    const fallbackCount = questionForm.type === "reading" ? 2 : 4;
    return currentRows.length > 0 ? currentRows : Array.from({ length: fallbackCount }, () => "");
  }, [questionForm.optionsText, questionForm.type]);
  const selectedAnswerTexts = splitAnswerText(questionForm.answerText);
  const canSaveQuestion = Boolean(questionForm.stem.trim() && hasQuestionAnswer(questionForm));
  const visibleQuestions = useMemo(
    () => (listTypeFilter === "all" ? data.questions : data.questions.filter((question) => question.type === listTypeFilter)),
    [data.questions, listTypeFilter],
  );
  const questionStats = useMemo(
    () => ({
      all: data.questions.length,
      choice: data.questions.filter((question) => question.type === "single" || question.type === "multiple").length,
      blank: data.questions.filter((question) => question.type === "blank").length,
      subjective: data.questions.filter((question) => ["reading", "writing", "short_answer", "subjective"].includes(question.type)).length,
    }),
    [data.questions],
  );

  const updateQuestionType = (type: Question["type"]) => {
    setQuestionForm((current) => ({
      ...current,
      type,
      optionsText: questionTypeAllowsOptions(type) ? current.optionsText : "",
      subQuestions: type === "reading" ? (current.subQuestions.length ? current.subQuestions : [emptyReadingSubQuestion()]) : current.subQuestions,
      answerText:
        type === "true_false"
          ? current.answerText === "false"
            ? "false"
            : "true"
          : current.type === "true_false"
            ? ""
            : current.answerText,
    }));
    setEditorNotice("");
  };

  const addQuestionMedia = (file?: File) => {
    if (!file) return;
    void readFileAsDataUrl(file).then((url) => {
      const media: QuestionMedia = {
        id: makeClientId("media"),
        type: inferQuestionMediaType(file),
        url,
        fileName: file.name,
      };
      setQuestionForm((current) => ({ ...current, media: [...current.media, media] }));
    });
  };

  const updateReadingSubQuestion = (index: number, patch: Partial<ReadingSubQuestion>) => {
    setQuestionForm((current) => ({
      ...current,
      subQuestions: current.subQuestions.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    }));
  };

  const updateReadingSubQuestionOptions = (index: number, value: string) => {
    updateReadingSubQuestion(index, { options: value.split("\n") });
  };

  const writeOptionRows = (rows: string[], answerText = questionForm.answerText) => {
    setQuestionForm((current) => ({
      ...current,
      optionsText: rows.join("\n"),
      answerText,
    }));
  };

  const updateOption = (index: number, value: string) => {
    const nextRows = [...optionRows];
    nextRows[index] = value;
    writeOptionRows(nextRows);
  };

  const removeOption = (index: number) => {
    const removed = optionRows[index]?.trim();
    const nextRows = optionRows.filter((_, rowIndex) => rowIndex !== index);
    const nextAnswer =
      questionForm.type === "multiple"
        ? selectedAnswerTexts.filter((answer) => answer !== removed).join(",")
        : questionForm.answerText === removed
          ? ""
          : questionForm.answerText;
    writeOptionRows(nextRows.length > 0 ? nextRows : [""], nextAnswer);
  };

  const toggleAnswerChoice = (option: string) => {
    const cleanOption = option.trim();
    if (!cleanOption) return;
    if (questionForm.type === "multiple") {
      const nextAnswers = selectedAnswerTexts.includes(cleanOption)
        ? selectedAnswerTexts.filter((answer) => answer !== cleanOption)
        : [...selectedAnswerTexts, cleanOption];
      setQuestionForm((current) => ({ ...current, answerText: nextAnswers.join(",") }));
      return;
    }
    setQuestionForm((current) => ({ ...current, answerText: cleanOption }));
  };

  const saveQuestion = () => {
    if (!canSaveQuestion) {
      setEditorNotice("请填写题干和答案/评分要点后再保存。");
      return;
    }
    const input = questionFormToInput(data.course.id, questionForm);
    if (editingQuestionId) {
      onUpdateQuestion(editingQuestionId, {
        type: input.type,
        stem: input.stem,
        options: input.options,
        media: input.media,
        subQuestions: input.subQuestions,
        answer: input.answer,
        analysis: input.analysis,
        difficulty: input.difficulty,
        tags: input.tags,
      });
    } else {
      onCreateQuestion(input);
    }
    setEditorNotice(editingQuestionId ? "已提交题目修改，请查看顶部操作提示。" : "已提交新题保存，请查看顶部操作提示。");
  };

  return (
    <div className="question-bank-grid">
      <section className="panel question-editor-panel">
        <PanelTitle icon={ListChecks} title={editingQuestion ? "编辑题目" : "新建题目"} action={`${data.questions.length} 题`} />
        <div className="question-folder-strip">
          <article>
            <span>全部题目</span>
            <strong>{questionStats.all}</strong>
          </article>
          <article>
            <span>选择题库</span>
            <strong>{questionStats.choice}</strong>
          </article>
          <article>
            <span>填空题库</span>
            <strong>{questionStats.blank}</strong>
          </article>
          <article>
            <span>主观题库</span>
            <strong>{questionStats.subjective}</strong>
          </article>
        </div>

        <div className="question-type-strip" aria-label="选择题型">
          {questionTypeOrder.map((type) => (
            <button key={type} className={className(questionForm.type === type && "active")} onClick={() => updateQuestionType(type)}>
              {questionTypeLabels[type]}
            </button>
          ))}
        </div>

        <div className="question-editor-body">
          <label className="wide-field">
            {questionForm.type === "reading" ? "阅读材料与问题" : questionForm.type === "writing" ? "写作要求" : "题干"}
            <textarea
              value={questionForm.stem}
              placeholder={
                questionForm.type === "blank"
                  ? "例：The author argues that ___ can improve communication."
                  : questionForm.type === "reading"
                    ? "粘贴阅读材料，并在材料后写出问题。"
                    : "输入题干或任务要求"
              }
              onChange={(event) => setQuestionForm({ ...questionForm, stem: event.target.value })}
            />
          </label>

          <div className="question-media-editor wide-field">
            <input
              ref={mediaFileRef}
              className="visually-hidden"
              type="file"
              accept="image/*,audio/*,video/*"
              onChange={(event) => {
                addQuestionMedia(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <button className="secondary-button" onClick={() => mediaFileRef.current?.click()}>
              <Upload size={16} />
              插入图片/音频/视频
            </button>
            <div className="question-media-list">
              {questionForm.media.map((media) => (
                <div key={media.id}>
                  <span>{media.type === "image" ? "图片" : media.type === "audio" ? "音频" : "视频"} · {media.fileName}</span>
                  <button
                    className="icon-soft-button"
                    onClick={() => setQuestionForm((current) => ({ ...current, media: current.media.filter((item) => item.id !== media.id) }))}
                    aria-label="移除媒体"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              {questionForm.media.length === 0 && <span>未插入媒体</span>}
            </div>
          </div>

          {questionTypeAllowsOptions(questionForm.type) && questionForm.type !== "reading" && (
            <div className="option-editor wide-field">
              <div className="option-editor-head">
                <strong>选项</strong>
                <button className="secondary-button" onClick={() => writeOptionRows([...optionRows, ""])}>
                  <Plus size={16} />
                  添加选项
                </button>
              </div>
              {optionRows.map((option, index) => (
                <div className="option-row-editor" key={`${index}-${optionRows.length}`}>
                  <span>{String.fromCharCode(65 + index)}</span>
                  <input value={option} placeholder={`选项 ${String.fromCharCode(65 + index)}`} onChange={(event) => updateOption(index, event.target.value)} />
                  <button className="icon-soft-button" onClick={() => removeOption(index)} aria-label="删除选项">
                    <X size={16} />
                  </button>
                </div>
              ))}
              <div className="answer-chip-grid">
                <span>{questionForm.type === "multiple" ? "勾选正确答案" : "选择正确答案"}</span>
                {optionRows
                  .map((option) => option.trim())
                  .filter(Boolean)
                  .map((option) => {
                    const active = questionForm.type === "multiple" ? selectedAnswerTexts.includes(option) : questionForm.answerText === option;
                    return (
                      <button key={option} className={className(active && "active")} onClick={() => toggleAnswerChoice(option)}>
                        {active && <Check size={14} />}
                        {option}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {questionForm.type === "reading" && (
            <div className="reading-subquestion-editor wide-field">
              <div className="option-editor-head">
                <strong>阅读小题</strong>
                <button className="secondary-button" onClick={() => setQuestionForm((current) => ({ ...current, subQuestions: [...current.subQuestions, emptyReadingSubQuestion()] }))}>
                  <Plus size={16} />
                  添加小题
                </button>
              </div>
              {questionForm.subQuestions.map((item, index) => (
                <article key={item.id}>
                  <div className="subquestion-head">
                    <strong>小题 {index + 1}</strong>
                    <button
                      className="icon-soft-button"
                      disabled={questionForm.subQuestions.length <= 1}
                      onClick={() =>
                        setQuestionForm((current) => ({
                          ...current,
                          subQuestions: current.subQuestions.filter((_, itemIndex) => itemIndex !== index),
                        }))
                      }
                      aria-label="删除阅读小题"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <label>
                    小题题干
                    <input value={item.stem} onChange={(event) => updateReadingSubQuestion(index, { stem: event.target.value })} />
                  </label>
                  <label>
                    小题选项（每行一个，可留空）
                    <textarea value={(item.options ?? []).join("\n")} onChange={(event) => updateReadingSubQuestionOptions(index, event.target.value)} />
                  </label>
                  <label>
                    小题答案
                    <input value={item.answer} onChange={(event) => updateReadingSubQuestion(index, { answer: event.target.value })} />
                  </label>
                  <label>
                    小题解析
                    <input value={item.analysis ?? ""} onChange={(event) => updateReadingSubQuestion(index, { analysis: event.target.value })} />
                  </label>
                </article>
              ))}
            </div>
          )}

          {questionForm.type === "true_false" ? (
            <div className="truth-toggle wide-field">
              <span>正确答案</span>
              <button className={className(questionForm.answerText === "true" && "active")} onClick={() => setQuestionForm({ ...questionForm, answerText: "true" })}>
                正确 True
              </button>
              <button className={className(questionForm.answerText === "false" && "active")} onClick={() => setQuestionForm({ ...questionForm, answerText: "false" })}>
                错误 False
              </button>
            </div>
          ) : questionForm.type === "reading" ? null : (
            <label className="wide-field">
              {questionForm.type === "blank"
                ? "空格答案（每行或逗号分隔）"
                : questionForm.type === "writing" || questionForm.type === "subjective"
                  ? "参考答案 / 评分要点"
                  : questionForm.type === "short_answer"
                    ? "参考答案"
                    : "正确答案"}
              {questionForm.type === "blank" || questionForm.type === "writing" || questionForm.type === "subjective" ? (
                <textarea value={questionForm.answerText} onChange={(event) => setQuestionForm({ ...questionForm, answerText: event.target.value })} />
              ) : (
                <input value={questionForm.answerText} onChange={(event) => setQuestionForm({ ...questionForm, answerText: event.target.value })} />
              )}
            </label>
          )}

          <div className="form-grid compact">
            <label>
              难度
              <select
                value={questionForm.difficulty}
                onChange={(event) => setQuestionForm({ ...questionForm, difficulty: event.target.value as Question["difficulty"] })}
              >
                <option value="easy">易</option>
                <option value="medium">中</option>
                <option value="hard">难</option>
              </select>
            </label>
            <label>
              标签
              <input value={questionForm.tagsText} placeholder="如 vocabulary,Unit 1" onChange={(event) => setQuestionForm({ ...questionForm, tagsText: event.target.value })} />
            </label>
          </div>

          <label className="wide-field">
            解析
            <textarea value={questionForm.analysis} onChange={(event) => setQuestionForm({ ...questionForm, analysis: event.target.value })} />
          </label>
        </div>
        <div className="editor-actions horizontal">
          <button className="primary-button" disabled={!canSaveQuestion} onClick={saveQuestion}>
            <Save size={18} />
            {editingQuestion ? "保存修改" : "保存题目"}
          </button>
          <button
            className="secondary-button"
            onClick={() => {
              setEditingQuestionId("");
              setQuestionForm(emptyQuestionForm(questionForm.type));
              setEditorNotice("已清空题目编辑区，可以直接录入新题。");
            }}
          >
            新建空白题
          </button>
        </div>
        {editorNotice && <div className="inline-notice">{editorNotice}</div>}
      </section>

      <section className="panel">
        <PanelTitle icon={Upload} title="批量导入题库" action="TXT / CSV" />
        <p className="helper-copy">每行一题：题型|题干|选项1;选项2|答案|解析|标签1,标签2。题型可填单选题、多选题、填空题、判断题、阅读理解、写作题、简答题或主观题。</p>
        <textarea className="bulk-question-input" value={bulkText} onChange={(event) => setBulkText(event.target.value)} />
        <input
          ref={importFileRef}
          className="visually-hidden"
          type="file"
          accept=".txt,.csv"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void readFileAsText(file).then(setBulkText);
            event.target.value = "";
          }}
        />
        <div className="editor-actions horizontal">
          <button className="secondary-button" onClick={() => importFileRef.current?.click()}>
            <Upload size={18} />
            选择题库文件
          </button>
          <button
            className="primary-button"
            onClick={() => {
              const parsed = parseQuestionRows(data.course.id, bulkText);
              setEditorNotice(parsed.length ? `已解析 ${parsed.length} 道题，正在导入。` : "未识别到可导入的题目，请检查分隔格式。");
              onImportQuestions(parsed);
            }}
          >
            <CloudUpload size={18} />
            导入题库
          </button>
        </div>
      </section>

      <section className="panel question-list-panel">
        <PanelTitle icon={FileText} title="题目列表" action={`${visibleQuestions.length}/${data.questions.length} 题`} />
        <div className="question-list-filter">
          <button className={className(listTypeFilter === "all" && "active")} onClick={() => setListTypeFilter("all")}>
            全部
          </button>
          {questionTypeOrder.map((type) => (
            <button key={type} className={className(listTypeFilter === type && "active")} onClick={() => setListTypeFilter(type)}>
              {questionTypeLabels[type]}
            </button>
          ))}
        </div>
        <div className="question-admin-list">
          {visibleQuestions.map((question) => (
            <article key={question.id} className={className(editingQuestionId === question.id && "active")}>
              <div>
                <strong title={question.stem}>{question.stem}</strong>
                <span>{questionTypeLabels[question.type]} · {difficultyLabels[question.difficulty]} · {question.tags.join(" / ") || "未标记"}</span>
              </div>
              <button
                className="secondary-button"
                onClick={() => {
                  setEditingQuestionId(question.id);
                  setQuestionForm(questionToForm(question));
                  setEditorNotice(`正在编辑：${questionTypeLabels[question.type]}`);
                }}
              >
                <Edit3 size={16} />
                编辑
              </button>
              <button className="danger-button" onClick={() => onDeleteQuestion(question.id)}>
                <Trash2 size={15} />
                删除
              </button>
            </article>
          ))}
          {visibleQuestions.length === 0 && <div className="empty-state">当前筛选条件下暂无题目。</div>}
        </div>
      </section>
    </div>
  );
}

function PaperBuilder({
  data,
  editingPaper,
  onCreatePaper,
  onUpdatePaper,
  onClearEditing,
}: {
  data: PlatformSnapshot;
  editingPaper?: ExamPaper;
  onCreatePaper: (input: CreatePaperInput) => void;
  onUpdatePaper: (paperId: string, input: UpdatePaperInput) => void;
  onClearEditing: () => void;
}) {
  const [title, setTitle] = useState(editingPaper?.title ?? `新建试卷 ${new Date().toLocaleDateString("zh-CN")}`);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>(editingPaper?.questionIds ?? data.questions.slice(0, 2).map((question) => question.id));
  const [totalScore, setTotalScore] = useState(String(editingPaper?.totalScore ?? 100));
  const [difficulty, setDifficulty] = useState<ExamPaper["difficulty"]>(editingPaper?.difficulty ?? "medium");
  const [typeFilter, setTypeFilter] = useState<"all" | Question["type"]>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<"all" | Question["difficulty"]>("all");
  const [sortMode, setSortMode] = useState<"default" | "type" | "difficulty" | "stem">("default");
  const selectedQuestions = useMemo(
    () => selectedQuestionIds.map((questionId) => data.questions.find((question) => question.id === questionId)).filter((question): question is Question => Boolean(question)),
    [data.questions, selectedQuestionIds],
  );
  const filteredQuestions = useMemo(() => {
    const questions = data.questions.filter((question) => {
      if (typeFilter !== "all" && question.type !== typeFilter) return false;
      if (difficultyFilter !== "all" && question.difficulty !== difficultyFilter) return false;
      return true;
    });
    return [...questions].sort((first, second) => {
      if (sortMode === "type") {
        return questionTypeOrder.indexOf(first.type) - questionTypeOrder.indexOf(second.type) || first.stem.localeCompare(second.stem, "zh-CN");
      }
      if (sortMode === "difficulty") {
        return difficultyOrder[first.difficulty] - difficultyOrder[second.difficulty] || first.stem.localeCompare(second.stem, "zh-CN");
      }
      if (sortMode === "stem") {
        return first.stem.localeCompare(second.stem, "zh-CN");
      }
      return 0;
    });
  }, [data.questions, difficultyFilter, sortMode, typeFilter]);

  const toggleQuestion = (questionId: string) => {
    setSelectedQuestionIds((current) =>
      current.includes(questionId) ? current.filter((item) => item !== questionId) : [...current, questionId],
    );
  };

  const savePaper = () => {
    const payload: CreatePaperInput = {
      courseId: data.course.id,
      title,
      questionIds: selectedQuestionIds,
      totalScore: Number(totalScore) || 100,
      difficulty,
    };
    if (editingPaper) {
      onUpdatePaper(editingPaper.id, {
        title: payload.title,
        questionIds: payload.questionIds,
        totalScore: payload.totalScore,
        difficulty: payload.difficulty,
      });
    } else {
      onCreatePaper(payload);
    }
  };

  return (
    <div className="paper-builder-grid">
      <section className="panel">
        <PanelTitle icon={ClipboardCheck} title={editingPaper ? "修改试卷" : "新建试卷"} action={`${selectedQuestionIds.length} 题`} />
        <div className="form-grid">
          <label className="wide-field">
            试卷名称
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            总分
            <input value={totalScore} onChange={(event) => setTotalScore(event.target.value)} />
          </label>
          <label>
            难度
            <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as ExamPaper["difficulty"])}>
              <option value="easy">易</option>
              <option value="medium">中</option>
              <option value="hard">难</option>
            </select>
          </label>
        </div>
        <div className="paper-summary">
          <strong>{selectedQuestionIds.length}</strong>
          <span>已选题目</span>
          <strong>{totalScore || 100}</strong>
          <span>总分</span>
        </div>
        <div className="editor-actions horizontal">
          <button className="primary-button" disabled={selectedQuestionIds.length === 0 || !title.trim()} onClick={savePaper}>
            <Save size={18} />
            {editingPaper ? "保存修改" : "保存到试卷库"}
          </button>
          {editingPaper && (
            <button className="secondary-button" onClick={onClearEditing}>
              新建试卷
            </button>
          )}
        </div>
        <div className="paper-preview">
          <div className="paper-preview-head">
            <strong>当前试卷预览</strong>
            <span>{selectedQuestions.length} 题</span>
          </div>
          {selectedQuestions.length === 0 ? (
            <div className="empty-state">还没有选择题目。</div>
          ) : (
            selectedQuestions.map((question, index) => (
              <article key={question.id}>
                <div>
                  <span>第 {index + 1} 题 · {questionTypeLabels[question.type]}</span>
                  <strong title={question.stem}>{question.stem}</strong>
                </div>
                <button className="icon-soft-button" onClick={() => toggleQuestion(question.id)} aria-label="从试卷移除">
                  <X size={16} />
                </button>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <PanelTitle icon={ListChecks} title="从题库选题" action={`${filteredQuestions.length}/${data.questions.length} 题`} />
        <div className="paper-filter-bar">
          <label>
            题型
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as "all" | Question["type"])}>
              <option value="all">全部题型</option>
              {questionTypeOrder.map((type) => (
                <option key={type} value={type}>
                  {questionTypeLabels[type]}
                </option>
              ))}
            </select>
          </label>
          <label>
            难度
            <select value={difficultyFilter} onChange={(event) => setDifficultyFilter(event.target.value as "all" | Question["difficulty"])}>
              <option value="all">全部难度</option>
              <option value="easy">易</option>
              <option value="medium">中</option>
              <option value="hard">难</option>
            </select>
          </label>
          <label>
            排序
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value as "default" | "type" | "difficulty" | "stem")}>
              <option value="default">默认顺序</option>
              <option value="type">按题型</option>
              <option value="difficulty">按难度</option>
              <option value="stem">按题干</option>
            </select>
          </label>
          <button
            className="secondary-button"
            onClick={() => {
              setTypeFilter("all");
              setDifficultyFilter("all");
              setSortMode("default");
            }}
          >
            清空筛选
          </button>
        </div>
        <div className="paper-question-picker">
          {filteredQuestions.map((question) => (
            <label key={question.id} className={className("paper-question-row", selectedQuestionIds.includes(question.id) && "active")}>
              <input type="checkbox" checked={selectedQuestionIds.includes(question.id)} onChange={() => toggleQuestion(question.id)} />
              <span>
                <strong title={question.stem}>{question.stem}</strong>
                <small>{questionTypeLabels[question.type]} · {difficultyLabels[question.difficulty]} · {question.tags.join(" / ") || "未标记"}</small>
              </span>
            </label>
          ))}
          {filteredQuestions.length === 0 && <div className="empty-state">当前筛选条件下暂无题目。</div>}
        </div>
      </section>
    </div>
  );
}

function PaperLibrary({
  data,
  onEditPaper,
  onDeletePaper,
  onPublishPaper,
}: {
  data: PlatformSnapshot;
  onEditPaper: (paper: ExamPaper) => void;
  onDeletePaper: (paperId: string) => void;
  onPublishPaper: (paperId: string, classId: string) => void;
}) {
  const [publishClassId, setPublishClassId] = useState(data.classes[0]?.id ?? "");

  return (
    <section className="panel">
      <PanelTitle icon={Archive} title="试卷库" action={`${data.papers.length} 份`} />
      <div className="paper-library-toolbar">
        <label>
          发放班级
          <select value={publishClassId} onChange={(event) => setPublishClassId(event.target.value)}>
            {data.classes.map((courseClass) => (
              <option key={courseClass.id} value={courseClass.id}>
                {courseClass.name} · {courseClass.joinCode}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="paper-table">
        {data.papers.map((paper) => (
          <article key={paper.id}>
            <div>
              <strong>{paper.title}</strong>
              <span>
                {paper.questionIds.length} 题 · {paper.totalScore} 分 · {paper.difficulty} · 创建人 {getUserName(data.users, paper.createdBy)}
              </span>
              <small>{paper.createdAt ? formatDate(paper.createdAt) : "未记录时间"}</small>
            </div>
            <button className="secondary-button" onClick={() => onEditPaper(paper)}>
              <Edit3 size={16} />
              修改
            </button>
            <button className="primary-button" disabled={!publishClassId} onClick={() => onPublishPaper(paper.id, publishClassId)}>
              <Send size={16} />
              发放
            </button>
            <button className="danger-button" onClick={() => onDeletePaper(paper.id)}>
              <Trash2 size={15} />
              删除
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function TeacherPage({
  data,
  onCreateClass,
  onPublishAssignment,
  onRemoveStudent,
  onGradeSubmission,
  onAskAi,
}: {
  data: PlatformSnapshot;
  onCreateClass: () => void;
  onPublishAssignment: (input: CreateAssignmentInput) => void;
  onRemoveStudent: (classId: string, studentId: string) => void;
  onGradeSubmission: (submissionId: string, input: GradeSubmissionInput) => void;
  onAskAi: (message: string, mode?: "explain" | "quiz" | "summary" | "resource") => void;
}) {
  const [selectedClassId, setSelectedClassId] = useState(data.classes[0]?.id ?? "");
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>(data.questions.slice(0, 1).map((question) => question.id));
  const [assignmentTitle, setAssignmentTitle] = useState("Unit 1 课后练习");
  const [gradingScores, setGradingScores] = useState<Record<string, Record<string, string>>>({});
  const [gradingComments, setGradingComments] = useState<Record<string, string>>({});
  const selectedClass = data.classes.find((item) => item.id === selectedClassId);
  const pendingSubmissions = useMemo(
    () =>
      data.submissions.filter((submission) => {
        if (submission.status !== "submitted") return false;
        const assignment = data.assignments.find((item) => item.id === submission.assignmentId);
        return Boolean(assignment?.questionIds.some((questionId) => requiresTeacherReview(data.questions.find((question) => question.id === questionId))));
      }),
    [data.assignments, data.questions, data.submissions],
  );

  const toggleQuestion = (questionId: string) => {
    setSelectedQuestionIds((current) =>
      current.includes(questionId) ? current.filter((item) => item !== questionId) : [...current, questionId],
    );
  };

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow="教师端"
        title="班级、题库与作业发布"
        description="教师浏览管理员上传的资料，从题库选题发布作业或考试，客观题自动批改，主观题回到教师端批改。"
      />
      <div className="two-column">
        <section className="panel">
          <PanelTitle icon={Users} title="我的班级" action={`${data.classes.length} 个`} />
          <div className="class-grid">
            {data.classes.map((item) => (
              <article className={className("class-card", selectedClassId === item.id && "active")} key={item.id}>
                <strong>{item.name}</strong>
                <span>邀请码：{item.joinCode}</span>
                <small>{item.studentIds.length} 名学生</small>
                <button className="text-button" onClick={() => setSelectedClassId((current) => (current === item.id ? "" : item.id))}>
                  <Check size={15} />
                  {selectedClassId === item.id ? "取消发布班级" : "设为发布班级"}
                </button>
              </article>
            ))}
          </div>
          <button className="secondary-button" onClick={onCreateClass}>
            <Plus size={18} />
            新建班级
          </button>
        </section>

        <section className="panel">
          <PanelTitle icon={PencilLine} title="作业 / 考试" action={`${data.assignments.length} 个`} />
          <div className="assignment-list">
            {data.assignments.map((assignment) => (
              <article key={assignment.id}>
                <div>
                  <strong>{assignment.title}</strong>
                  <span>{getClassName(data.classes, assignment.classId)} · 截止 {formatDate(assignment.dueAt)}</span>
                </div>
                <em>{assignment.status === "published" ? "进行中" : assignment.status}</em>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="two-column">
        <section className="panel">
          <PanelTitle icon={ListChecks} title="从题库发布作业" action={`${selectedQuestionIds.length} 题已选`} />
          <div className="form-grid single">
            <label>
              作业标题
              <input value={assignmentTitle} onChange={(event) => setAssignmentTitle(event.target.value)} />
            </label>
            <label>
              发布班级
              <select value={selectedClassId} onChange={(event) => setSelectedClassId(event.target.value)}>
                <option value="">请选择发布班级</option>
                {data.classes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.joinCode}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="question-list selectable">
            {data.questions.map((question) => {
              const mediaCount = question.media?.length ?? 0;
              const subQuestionCount = question.subQuestions?.length ?? 0;
              const extras = [
                mediaCount ? `${mediaCount} 个媒体` : "",
                subQuestionCount ? `${subQuestionCount} 个小题` : "",
              ].filter(Boolean);
              return (
                <button
                  key={question.id}
                  className={className(selectedQuestionIds.includes(question.id) && "active")}
                  onClick={() => toggleQuestion(question.id)}
                >
                  <span className="question-preview-meta">
                    {questionTypeLabels[question.type]} · {difficultyLabels[question.difficulty]}
                    {extras.length ? ` · ${extras.join(" · ")}` : ""}
                  </span>
                  <strong className="question-preview-stem">{question.stem}</strong>
                  <span className="question-preview-tags">{question.tags.join(" / ") || "未标记"}</span>
                </button>
              );
            })}
          </div>
          <button
            className="primary-button full"
            disabled={!selectedClassId || selectedQuestionIds.length === 0}
            onClick={() =>
              onPublishAssignment({
                courseId: data.course.id,
                classId: selectedClassId,
                title: assignmentTitle,
                description: "教师从题库选择题目发布，学生提交后系统自动批改客观题。",
                questionIds: selectedQuestionIds,
                dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                status: "published",
              })
            }
          >
            <ClipboardCheck size={18} />
            发布到{selectedClass?.name ?? "所选班级"}
          </button>
        </section>

        <section className="panel">
          <PanelTitle icon={Users} title="班级学生管理" action={selectedClass?.name ?? "未选择"} />
          <div className="student-roster">
            {!selectedClass ? (
              <div className="empty-state">请先选择一个班级。</div>
            ) : selectedClass.studentIds.length === 0 ? (
              <div className="empty-state">当前班级暂无学生。</div>
            ) : (
              selectedClass.studentIds.map((studentId) => (
                <div key={studentId}>
                  <span>{getUserName(data.users, studentId)}</span>
                  <button className="danger-button" onClick={() => onRemoveStudent(selectedClass.id, studentId)}>
                    <Trash2 size={15} />
                    移出
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="panel manual-grading-panel">
        <PanelTitle icon={ClipboardCheck} title="待教师批改" action={`${pendingSubmissions.length} 份`} />
        {pendingSubmissions.length === 0 ? (
          <div className="empty-state">当前没有需要教师批改的主观题提交。</div>
        ) : (
          <div className="grading-list">
            {pendingSubmissions.map((submission) => {
              const assignment = data.assignments.find((item) => item.id === submission.assignmentId);
              const manualQuestions =
                assignment?.questionIds
                  .map((questionId) => data.questions.find((question) => question.id === questionId))
                  .filter((question): question is Question => requiresTeacherReview(question)) ?? [];
              const scores = gradingScores[submission.id] ?? {};
              const canSubmitGrade = manualQuestions.every((question) => {
                const score = Number(scores[question.id] ?? "");
                return scores[question.id] !== undefined && !Number.isNaN(score) && score >= 0 && score <= 100;
              });

              return (
                <article key={submission.id} className="grading-card">
                  <div className="grading-card-head">
                    <div>
                      <strong>{assignment?.title ?? "未知作业"}</strong>
                      <span>{getUserName(data.users, submission.studentId)} · {formatDate(submission.submittedAt)}</span>
                    </div>
                    <em>客观题已自动批改，待主观题给分</em>
                  </div>
                  {manualQuestions.map((question) => {
                    const answer = submission.answers.find((item) => item.questionId === question.id);
                    return (
                      <div className="manual-score-row" key={question.id}>
                        <div>
                          <strong>{questionTypeLabels[question.type]} · {question.stem}</strong>
                          <span>学生答案：{formatAnswerValue(answer?.answer) || "未作答"}</span>
                          <span>参考要点：{formatAnswerValue(question.answer) || "未设置"}</span>
                          {question.analysis && <span>解析：{question.analysis}</span>}
                        </div>
                        <label>
                          得分
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={scores[question.id] ?? ""}
                            onChange={(event) =>
                              setGradingScores((current) => ({
                                ...current,
                                [submission.id]: {
                                  ...(current[submission.id] ?? {}),
                                  [question.id]: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                      </div>
                    );
                  })}
                  <label className="teacher-comment-box">
                    批改评语
                    <textarea
                      value={gradingComments[submission.id] ?? ""}
                      onChange={(event) => setGradingComments((current) => ({ ...current, [submission.id]: event.target.value }))}
                    />
                  </label>
                  <button
                    className="primary-button"
                    disabled={!canSubmitGrade}
                    onClick={() =>
                      onGradeSubmission(submission.id, {
                        answers: manualQuestions.map((question) => ({
                          questionId: question.id,
                          score: Math.max(0, Math.min(100, Math.round(Number(scores[question.id])))),
                        })),
                        teacherComment: gradingComments[submission.id],
                      })
                    }
                  >
                    <CheckCircle2 size={18} />
                    提交批改并回返成绩
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel">
        <PanelTitle icon={Sparkles} title="AI 教学助手" action="DeepSeek 接入位" />
          <div className="ai-action-grid">
            <button onClick={() => onAskAi("围绕跨文化沟通主题生成一个思政案例", "resource")}>
              <Wand2 size={18} />
              生成思政案例
            </button>
            <button onClick={() => onAskAi("基于 Unit 1 Text A 生成 3 道中等难度词汇题", "quiz")}>
              <ListChecks size={18} />
              智能出题
            </button>
            <button onClick={() => onAskAi("分析本班 Unit 1 作业薄弱点", "summary")}>
              <BarChart3 size={18} />
              学情讲评建议
            </button>
          </div>
      </section>
    </section>
  );
}

function StudentPage({
  data,
  selectedAssignmentId,
  selectedAssignment,
  taskQuestions,
  answers,
  notice,
  onSelectAssignment,
  onAnswer,
  onSubmit,
  onJoinClass,
  onGoResources,
}: {
  data: PlatformSnapshot;
  selectedAssignmentId: string;
  selectedAssignment?: Assignment;
  taskQuestions: Question[];
  answers: Record<string, string | string[]>;
  notice: string;
  onSelectAssignment: (assignmentId: string) => void;
  onAnswer: (questionId: string, value: string | string[]) => void;
  onSubmit: () => void;
  onJoinClass: (joinCode: string) => void;
  onGoResources: () => void;
}) {
  const [joinCode, setJoinCode] = useState("ENG2026A");
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const currentClass = data.classes.find((item) => item.studentIds.includes(data.user.id));
  const existingSubmission = selectedAssignment
    ? data.submissions.find((item) => item.assignmentId === selectedAssignment.id && item.studentId === data.user.id)
    : undefined;
  const pendingTeacherReview = existingSubmission?.status === "submitted";
  const gradedSubmission = existingSubmission?.status === "graded";
  const hasTeacherReviewedQuestions = taskQuestions.some(requiresTeacherReview);
  const assignmentAction = pendingTeacherReview ? "待批改" : gradedSubmission ? `${existingSubmission.score} 分` : "未提交";
  const submittedAnswers = useMemo(() => {
    const map: Record<string, string | string[]> = {};
    existingSubmission?.answers.forEach((item) => {
      map[item.questionId] = item.answer;
    });
    return map;
  }, [existingSubmission]);

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow="学生端"
        title="我的学习任务"
        description="学生可浏览公开资料、接收教师发布的作业考试并在线完成，题库不直接公开。"
      />
      <div className="student-layout">
        <aside className="panel">
          <PanelTitle icon={UserPlus} title="加入班级" action={currentClass ? "已入班" : "输入邀请码"} />
          {currentClass ? (
            <div className="success-note">
              <CheckCircle2 size={17} />
              已加入：{currentClass.name}。学生账号只能加入一个班级。
            </div>
          ) : (
            <div className="join-box">
              <input value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="输入教师邀请码" />
              <button className="primary-button" onClick={() => onJoinClass(joinCode)}>
                <UserPlus size={18} />
                加入
              </button>
            </div>
          )}

          <PanelTitle icon={CalendarClock} title="待完成" action={`${data.assignments.length} 项`} />
          <div className="assignment-list compact">
            {data.assignments.map((assignment) => (
              <button
                key={assignment.id}
                className={className("assignment-button", selectedAssignmentId === assignment.id && "active")}
                onClick={() => onSelectAssignment(assignment.id)}
              >
                <strong>{assignment.title}</strong>
                <span>截止 {formatDate(assignment.dueAt)}</span>
              </button>
            ))}
          </div>
          <button className="secondary-button full" onClick={onGoResources}>
            <BookOpen size={18} />
            先去学习资料
          </button>
        </aside>

        <section className="panel answer-panel">
          <PanelTitle icon={ClipboardCheck} title={selectedAssignment?.title ?? "选择任务"} action={assignmentAction} />
          {notice && <div className="success-note">{notice}</div>}
          {pendingTeacherReview ? (
            <div className="pending-note">
              <CalendarClock size={17} />
              已提交：{existingSubmission ? formatDate(existingSubmission.submittedAt) : ""}，等待教师批改试卷。
            </div>
          ) : gradedSubmission ? (
            <div className="success-note">已提交：{existingSubmission ? formatDate(existingSubmission.submittedAt) : ""}，得分 {existingSubmission?.score ?? 0} 分。</div>
          ) : null}
          {taskQuestions.length === 0 ? (
            <div className="empty-state">请选择一个已发布作业。</div>
          ) : (
            <div className="answer-list">
              {taskQuestions.map((question, index) => (
                <QuestionCard
                  key={question.id}
                  index={index + 1}
                  question={question}
                  value={existingSubmission ? submittedAnswers[question.id] : answers[question.id]}
                  disabled={Boolean(existingSubmission)}
                  showReview={Boolean(gradedSubmission)}
                  onChange={(value) => onAnswer(question.id, value)}
                />
              ))}
            </div>
          )}
          {confirmingSubmit && (
            <div className="confirm-box">
              <strong>是否确认提交？</strong>
              <span>
                {hasTeacherReviewedQuestions
                  ? "确认后将提交答案，客观题自动批改，简答、写作和主观题等待教师批改后再显示成绩。"
                  : "确认后将提交答案，不能重新作答，系统会显示参考答案和解析。"}
              </span>
              <div>
                <button className="secondary-button" onClick={() => setConfirmingSubmit(false)}>
                  取消
                </button>
                <button
                  className="primary-button"
                  onClick={() => {
                    setConfirmingSubmit(false);
                    onSubmit();
                  }}
                >
                  确认提交
                </button>
              </div>
            </div>
          )}
          <button className="primary-button" onClick={() => setConfirmingSubmit(true)} disabled={taskQuestions.length === 0 || Boolean(existingSubmission)}>
            <Send size={18} />
            {pendingTeacherReview ? "等待教师批改" : existingSubmission ? "已提交，不能重复作答" : "提交试卷"}
          </button>
        </section>
      </div>
    </section>
  );
}

function QuestionMediaBlock({ media }: { media?: QuestionMedia[] }) {
  if (!media?.length) return null;
  return (
    <div className="question-media-preview">
      {media.map((item) => (
        <figure key={item.id}>
          {item.type === "image" ? (
            <img src={item.url} alt={item.fileName} />
          ) : item.type === "audio" ? (
            <audio src={item.url} controls />
          ) : (
            <video src={item.url} controls />
          )}
          <figcaption>{item.fileName}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function formatAnswerValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.join("、");
  return value ?? "";
}

function QuestionReview({ question, answer }: { question: Question; answer?: string | string[] }) {
  return (
    <div className="answer-review">
      <span>你的答案：{formatAnswerValue(answer) || "未作答"}</span>
      <span>参考答案：{formatAnswerValue(question.answer) || "未设置"}</span>
      {question.analysis && <span>解析：{question.analysis}</span>}
    </div>
  );
}

function QuestionCard({
  index,
  question,
  value,
  disabled = false,
  showReview = false,
  onChange,
}: {
  index: number;
  question: Question;
  value?: string | string[];
  disabled?: boolean;
  showReview?: boolean;
  onChange: (value: string | string[]) => void;
}) {
  const currentArray = Array.isArray(value) ? value : [];
  const trueFalseOptions = [
    { value: "true", label: "正确 True" },
    { value: "false", label: "错误 False" },
  ];

  if (question.type === "reading" && question.subQuestions?.length) {
    const answers = Array.isArray(value) ? value : [];
    const updateSubAnswer = (subIndex: number, nextValue: string) => {
      const nextAnswers = [...answers];
      nextAnswers[subIndex] = nextValue;
      onChange(nextAnswers);
    };
    return (
      <article className="question-card">
        <span className="question-index">第 {index} 题 · {questionTypeLabels[question.type]}</span>
        <strong>{question.stem}</strong>
        <QuestionMediaBlock media={question.media} />
        <div className="reading-answer-list">
          {question.subQuestions.map((item, subIndex) => (
            <section key={item.id}>
              <strong>{subIndex + 1}. {item.stem}</strong>
              {item.options?.length ? (
                <div className="option-grid">
                  {item.options.map((option) => {
                    const checked = answers[subIndex] === option;
                    return (
                      <label key={option} className={className("option-row", checked && "checked")}>
                        <input type="radio" checked={checked} disabled={disabled} onChange={() => updateSubAnswer(subIndex, option)} />
                        {option}
                      </label>
                    );
                  })}
                </div>
              ) : (
                <textarea
                  placeholder="输入答案"
                  disabled={disabled}
                  value={answers[subIndex] ?? ""}
                  onChange={(event) => updateSubAnswer(subIndex, event.target.value)}
                />
              )}
              {showReview && (
                <div className="answer-review">
                  <span>你的答案：{answers[subIndex] || "未作答"}</span>
                  <span>参考答案：{item.answer || "未设置"}</span>
                  {item.analysis && <span>解析：{item.analysis}</span>}
                </div>
              )}
            </section>
          ))}
        </div>
      </article>
    );
  }

  return (
    <article className="question-card">
      <span className="question-index">第 {index} 题 · {questionTypeLabels[question.type]}</span>
      <strong>{question.stem}</strong>
      <QuestionMediaBlock media={question.media} />
      {question.type === "true_false" ? (
        <div className="option-grid">
          {trueFalseOptions.map((option) => {
            const checked = value === option.value;
            return (
              <label key={option.value} className={className("option-row", checked && "checked")}>
                <input type="radio" checked={checked} disabled={disabled} onChange={() => onChange(option.value)} />
                {option.label}
              </label>
            );
          })}
        </div>
      ) : question.options ? (
        <div className="option-grid">
          {question.options.map((option) => {
            const checked = question.type === "multiple" ? currentArray.includes(option) : value === option;
            return (
              <label key={option} className={className("option-row", checked && "checked")}>
                <input
                  type={question.type === "multiple" ? "checkbox" : "radio"}
                  checked={checked}
                  disabled={disabled}
                  onChange={(event) => {
                    if (question.type === "multiple") {
                      const next = event.target.checked ? [...currentArray, option] : currentArray.filter((item) => item !== option);
                      onChange(next);
                    } else {
                      onChange(option);
                    }
                  }}
                />
                {option}
              </label>
            );
          })}
        </div>
      ) : (
        <textarea
          placeholder={question.type === "blank" ? "每个空按顺序填写，用英文逗号分隔" : "输入答案"}
          disabled={disabled}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {showReview && <QuestionReview question={question} answer={value} />}
    </article>
  );
}

function AnalyticsPage({ data, role, averageScore }: { data: PlatformSnapshot; role: Role; averageScore: number }) {
  if (role === "student") {
    return (
      <section className="page-stack">
        <PageHeader eyebrow="学习反馈" title="个人学习进度" description="学生只能查看自己的学习任务、成绩和 AI 反馈。" />
        <div className="panel locked-panel">
          <Lock size={28} />
          <strong>班级学情分析仅教师和管理员可见</strong>
          <p>学生端保留个人进度与错题解析，避免越权查看全班数据。</p>
        </div>
      </section>
    );
  }

  const analytics = data.analytics;
  return (
    <section className="page-stack">
      <PageHeader
        eyebrow="AI 学情分析"
        title="班级表现与教学建议"
        description="基于资源浏览、作业提交和自动批改数据，辅助教师定位薄弱知识点。"
      />
      <div className="stat-grid">
        <article className="stat-card">
          <span>活跃学生</span>
          <strong>{analytics?.activeStudents ?? data.users.filter((user) => user.role === "student").length}</strong>
          <small>近 7 天有学习行为</small>
        </article>
        <article className="stat-card">
          <span>平均进度</span>
          <strong>{analytics?.averageProgress ?? 62}%</strong>
          <small>课程资源完成率</small>
        </article>
        <article className="stat-card">
          <span>平均成绩</span>
          <strong>{analytics?.averageAssignmentScore ?? averageScore}</strong>
          <small>自动批改记录</small>
        </article>
      </div>

      <div className="two-column">
        <section className="panel">
          <PanelTitle icon={BarChart3} title="资源完成情况" action="浏览 / 完成" />
          <div className="resource-bars tall">
            {(analytics?.resourceViews ?? []).map((item) => {
              const resource = data.resources.find((res) => res.id === item.resourceId);
              return (
                <div className="resource-bar" key={item.resourceId}>
                  <span>{resource?.title ?? item.resourceId}</span>
                  <div><i style={{ width: pct((item.completions / Math.max(item.views, 1)) * 100) }} /></div>
                  <strong>{item.completions}/{item.views}</strong>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <PanelTitle icon={AlertTriangle} title="风险学生与建议" action="AI 生成" />
          <div className="risk-list">
            {(analytics?.riskStudents ?? []).map((item) => (
              <article key={item.studentId}>
                <strong>{getUserName(data.users, item.studentId)}</strong>
                <span>{item.reason}</span>
              </article>
            ))}
          </div>
          <div className="analysis-note">
            <Sparkles size={18} />
            建议下节课补充讲解图灵测试与智能体概念，并追加 5 分钟随堂测验。
          </div>
        </section>
      </div>
    </section>
  );
}

function AssistantPage({
  role,
  data,
  aiMessages,
  aiInput,
  aiBusy,
  onAiInput,
  onAskAi,
}: {
  role: Role;
  data: PlatformSnapshot;
  aiMessages: AiMessage[];
  aiInput: string;
  aiBusy: boolean;
  onAiInput: (value: string) => void;
  onAskAi: (message: string, mode?: "explain" | "quiz" | "summary" | "resource") => void;
}) {
  return (
    <section className="assistant-page">
      <PageHeader eyebrow={`${roleLabels[role]} AI 助教`} title="课程上下文智能助手" description="当前为本地 mock 接口，后续可替换为 DeepSeek 或其他大模型服务。" />
      <div className="assistant-layout">
        <AiDock messages={aiMessages} input={aiInput} busy={aiBusy} role={role} onInput={onAiInput} onAsk={onAskAi} expanded />
        <aside className="panel context-panel">
          <PanelTitle icon={BookOpen} title="课程上下文" action={data.course.code} />
          <p>{data.course.description}</p>
          <div className="context-tags">
            {data.units.map((unit) => (
              <span key={unit.id}>{unit.title}</span>
            ))}
          </div>
          <div className="ai-action-grid">
            {quickQuestions[role].map((question) => (
              <button key={question} onClick={() => onAskAi(question, question.includes("题") ? "quiz" : "summary")}>
                <Sparkles size={17} />
                {question}
              </button>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}

function AiDock({
  messages,
  input,
  busy,
  role,
  expanded,
  onInput,
  onAsk,
}: {
  messages: AiMessage[];
  input: string;
  busy: boolean;
  role: Role;
  expanded?: boolean;
  onInput: (value: string) => void;
  onAsk: (message: string, mode?: "explain" | "quiz" | "summary" | "resource") => void;
}) {
  return (
    <aside className={className("ai-dock", expanded && "expanded")}>
      <PanelTitle icon={Bot} title="AI 助教" action={roleLabels[role]} />
      <div className="quick-grid">
        {quickQuestions[role].slice(0, 3).map((question) => (
          <button key={question} onClick={() => onAsk(question, question.includes("题") ? "quiz" : "summary")}>
            {question}
          </button>
        ))}
      </div>
      <div className="chat-list">
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={className("chat-bubble", message.role)}>
            {message.content}
          </div>
        ))}
        {busy && <div className="chat-bubble assistant">正在结合课程资料分析...</div>}
      </div>
      <form
        className="chat-input"
        onSubmit={(event) => {
          event.preventDefault();
          onAsk(input, "explain");
        }}
      >
        <input value={input} onChange={(event) => onInput(event.target.value)} placeholder="向 AI 提问当前课程内容" />
        <button className="icon-button" disabled={!input.trim() || busy} title="发送">
          <Send size={18} />
        </button>
      </form>
    </aside>
  );
}

function PageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <header className="page-header">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}

function PanelTitle({ icon: Icon, title, action }: { icon: typeof LayoutDashboard; title: string; action?: string }) {
  return (
    <div className="panel-title">
      <h2>
        <Icon size={18} />
        {title}
      </h2>
      {action && <span>{action}</span>}
    </div>
  );
}
