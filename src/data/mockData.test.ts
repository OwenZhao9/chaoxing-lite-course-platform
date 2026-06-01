import { describe, expect, it } from "vitest";
import { mockData } from "./mockData";
import type { ResourceType } from "../types";

describe("mock platform data", () => {
  it("covers every required teaching resource type", () => {
    const types = new Set(mockData.resources.map((resource) => resource.type));
    const requiredTypes: ResourceType[] = ["ppt", "video", "audio", "pdf", "download"];

    requiredTypes.forEach((type) => expect(types.has(type)).toBe(true));
  });

  it("keeps course resources owned by the administrator", () => {
    const resourceOwners = new Set(mockData.resources.map((resource) => resource.uploadedBy));

    expect(resourceOwners).toEqual(new Set(["u-admin"]));
  });

  it("links every assignment to an existing class and question", () => {
    const classIds = new Set(mockData.classes.map((courseClass) => courseClass.id));
    const questionIds = new Set(mockData.questions.map((question) => question.id));

    mockData.assignments.forEach((assignment) => {
      expect(classIds.has(assignment.classId)).toBe(true);
      expect(assignment.questionIds.length).toBeGreaterThan(0);
      assignment.questionIds.forEach((questionId) => expect(questionIds.has(questionId)).toBe(true));
    });
  });

  it("keeps exam papers linked to existing questions", () => {
    const questionIds = new Set(mockData.questions.map((question) => question.id));

    mockData.papers.forEach((paper) => {
      expect(paper.questionIds.length).toBeGreaterThan(0);
      paper.questionIds.forEach((questionId) => expect(questionIds.has(questionId)).toBe(true));
    });
  });

  it("includes a graded objective submission sample", () => {
    const submission = mockData.submissions.find((item) => item.id === "sub-chen-intro");

    expect(submission?.status).toBe("graded");
    expect(submission?.score).toBe(100);
    expect(submission?.answers[0]?.score).toBe(100);
  });

  it("keeps subjective writing submissions pending for teacher grading", () => {
    const submission = mockData.submissions.find((item) => item.id === "sub-li-writing");

    expect(submission?.status).toBe("submitted");
    expect(submission?.answers[0]?.reviewRequired).toBe(true);
    expect(submission?.answers[0]?.score).toBeUndefined();
  });

  it("includes interleaved chapter content blocks for course browsing", () => {
    const textASession = mockData.sessions.find((item) => item.id === "session-ai-agent");
    const types = textASession?.contentBlocks.map((block) => block.type);

    expect(types).toEqual(["text", "audio", "text", "image", "text"]);
  });
});
