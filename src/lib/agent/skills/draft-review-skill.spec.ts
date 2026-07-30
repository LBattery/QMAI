import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  identifyDeviations,
  loadReviewEvidence,
  runDraftReviewSkill,
  type ReviewEvidence,
} from "./draft-review-skill";

const mockCognition = vi.hoisted(() => vi.fn());
const mockCharacterStates = vi.hoisted(() => vi.fn());
const mockForeshadowing = vi.hoisted(() => vi.fn());
const mockListSnapshots = vi.hoisted(() => vi.fn());
const mockLoadSnapshot = vi.hoisted(() => vi.fn());

vi.mock("@/lib/novel/character-cognition", () => ({
  loadCognitionState: mockCognition,
  emptyCognitionState: vi.fn(() => ({
    characters: [],
    readerKnows: [],
    lastUpdatedChapter: 0,
  })),
}));

vi.mock("@/lib/novel/character-state", () => ({
  loadCharacterStates: mockCharacterStates,
  createEmptyCharacterStateStore: vi.fn(() => ({
    characters: [],
    lastUpdated: "2026-07-05T00:00:00.000Z",
  })),
}));

vi.mock("@/lib/novel/foreshadowing-tracker", () => ({
  loadForeshadowingTracker: mockForeshadowing,
  createEmptyForeshadowingStore: vi.fn(() => ({
    items: [],
    lastUpdated: "2026-07-05T00:00:00.000Z",
  })),
}));

vi.mock("@/lib/novel/chapter-ingest", () => ({
  listSnapshots: mockListSnapshots,
  loadSnapshot: mockLoadSnapshot,
}));

vi.mock("@/lib/llm-client", () => ({
  streamChat: vi.fn(),
}));
vi.mock("@/lib/novel/model-resolver", () => ({
  resolveNovelModel: vi.fn(() => ({
    provider: "custom",
    apiKey: "k",
    baseUrl: "x",
    model: "m",
  })),
}));
vi.mock("@/lib/has-usable-llm", () => ({
  hasUsableLlm: vi.fn(() => true),
}));
vi.mock("@/stores/wiki-store", () => ({
  useWikiStore: {
    getState: () => ({ providerConfigs: {}, novelConfig: {} }),
  },
}));
vi.mock("@/commands/fs", () => ({
  readFile: vi.fn(),
  fileExists: vi.fn(),
  writeFileAtomic: vi.fn(),
  createDirectory: vi.fn(),
}));

const aSnapshot = (chapterNumber: number) => ({
  chapterId: `ch${chapterNumber}`,
  chapterNumber,
  characters: [],
  locations: [],
  organizations: [],
  items: [],
  events: [],
  characterStateChanges: [],
  relationshipChanges: [],
  knowledgeChanges: [],
  foreshadowingChanges: [],
  newCanonFacts: [],
  timelineEvents: [],
  conflicts: [],
  summary: "",
  endingHook: "",
  snapshotPath: "",
  memorySynced: true,
  memorySyncedAt: "",
});

describe("loadReviewEvidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCognition.mockResolvedValue(null);
    mockCharacterStates.mockResolvedValue({ characters: [], lastUpdated: "" });
    mockForeshadowing.mockResolvedValue({ items: [], lastUpdated: "" });
    mockListSnapshots.mockResolvedValue([]);
    mockLoadSnapshot.mockResolvedValue(null);
  });

  it("返回空真源当记忆中心没有任何派生数据", async () => {
    const evidence = await loadReviewEvidence("/proj");
    expect(evidence.cognition).toBeNull();
    expect(evidence.characterStates.characters).toHaveLength(0);
    expect(evidence.foreshadowing.items).toHaveLength(0);
    expect(evidence.previousSnapshot).toBeNull();
    expect(evidence.internalConflict).toBe(false);
    expect(evidence.rawLoadError).toBe(false);
  });

  it("当全部读取成功时聚合返回", async () => {
    mockCognition.mockResolvedValueOnce({
      characters: [{ character: "李雷", knows: ["暗杀计划"], doesNotKnow: [] }],
      readerKnows: [],
      lastUpdatedChapter: 3,
    });
    mockCharacterStates.mockResolvedValueOnce({
      characters: [
        {
          characterName: "李雷",
          currentLocation: "客栈",
          status: "正常",
          equipment: [],
          abilities: [],
          relationships: {},
          lastUpdatedChapter: 3,
          lastUpdatedAt: "",
        },
      ],
      lastUpdated: "",
    });
    mockForeshadowing.mockResolvedValueOnce({
      items: [
        {
          id: "fs1",
          name: "黑令符",
          description: "暗杀信物",
          status: "planted",
          plantedChapter: 2,
          advancedChapters: [],
          relatedCharacters: [],
          relatedEvents: [],
          notes: "",
        },
      ],
      lastUpdated: "",
    });
    mockListSnapshots.mockResolvedValueOnce([3]);
    mockLoadSnapshot.mockResolvedValueOnce(aSnapshot(3));

    const evidence = await loadReviewEvidence("/proj");
    expect(evidence.cognition?.characters[0].character).toBe("李雷");
    expect(evidence.characterStates.characters[0].characterName).toBe("李雷");
    expect(evidence.foreshadowing.items[0].name).toBe("黑令符");
    expect(evidence.previousSnapshot?.chapterNumber).toBe(3);
    expect(evidence.rawLoadError).toBe(false);
  });

  it("读取异常时 rawLoadError=true 但不抛出", async () => {
    mockCognition.mockRejectedValueOnce(new Error("文件损坏"));

    const evidence = await loadReviewEvidence("/proj");
    expect(evidence.rawLoadError).toBe(true);
    expect(evidence.cognition).toBeNull();
    expect(evidence.characterStates.characters).toHaveLength(0);
    expect(evidence.foreshadowing.items).toHaveLength(0);
  });

  it("listSnapshots 返回负数时只取正数章节快照", async () => {
    mockCognition.mockResolvedValueOnce(null);
    mockListSnapshots.mockResolvedValueOnce([-2, -1, 3]);
    mockLoadSnapshot.mockResolvedValueOnce(aSnapshot(3));

    const evidence = await loadReviewEvidence("/proj");
    expect(evidence.previousSnapshot?.chapterNumber).toBe(3);
    expect(evidence.rawLoadError).toBe(false);
  });

  it("多个模块同时失败时 rawLoadError 仍为 true", async () => {
    mockCognition.mockRejectedValueOnce(new Error("损坏1"));
    mockCharacterStates.mockRejectedValueOnce(new Error("损坏2"));
    mockForeshadowing.mockRejectedValueOnce(new Error("损坏3"));

    const evidence = await loadReviewEvidence("/proj");
    expect(evidence.rawLoadError).toBe(true);
    expect(evidence.cognition).toBeNull();
  });
});

describe("identifyDeviations - 角色认知偏差", () => {
  it("角色说出了 doesNotKnow 里的信息 → 标 high 偏差", () => {
    const evidence: ReviewEvidence = {
      cognition: {
        characters: [
          { character: "李雷", knows: [], doesNotKnow: ["暗杀计划"] },
        ],
        readerKnows: [],
        lastUpdatedChapter: 3,
      },
      characterStates: { characters: [], lastUpdated: "" },
      foreshadowing: { items: [], lastUpdated: "" },
      previousSnapshot: null,
      internalConflict: false,
      rawLoadError: false,
    };
    const draft = '李雷说："我已经知道了暗杀计划，所以早有准备。"';
    const deviations = identifyDeviations(draft, evidence);
    expect(deviations).toHaveLength(1);
    expect(deviations[0].type).toBe("cognition");
    expect(deviations[0].severity).toBe("high");
    expect(deviations[0].expected).toContain("李雷不知道暗杀计划");
    expect(deviations[0].memoryEvidence).toContain("暗杀计划");
  });

  it("没有偏差时返回空数组", () => {
    const evidence: ReviewEvidence = {
      cognition: {
        characters: [
          { character: "李雷", knows: ["暗杀计划"], doesNotKnow: [] },
        ],
        readerKnows: [],
        lastUpdatedChapter: 3,
      },
      characterStates: { characters: [], lastUpdated: "" },
      foreshadowing: { items: [], lastUpdated: "" },
      previousSnapshot: null,
      internalConflict: false,
      rawLoadError: false,
    };
    const draft = '李雷说："我已经知道了暗杀计划，所以早有准备。"';
    const deviations = identifyDeviations(draft, evidence);
    expect(deviations).toHaveLength(0);
  });

  it("记忆中心为空时不下偏差（新作品首章）", () => {
    const evidence: ReviewEvidence = {
      cognition: null,
      characterStates: { characters: [], lastUpdated: "" },
      foreshadowing: { items: [], lastUpdated: "" },
      previousSnapshot: null,
      internalConflict: false,
      rawLoadError: false,
    };
    const deviations = identifyDeviations("任意草稿内容", evidence);
    expect(deviations).toHaveLength(0);
  });
});

describe("identifyDeviations - 角色状态偏差", () => {
  it("角色上章重伤本章却全力战斗 → 标 high 偏差", () => {
    const evidence: ReviewEvidence = {
      cognition: null,
      characterStates: {
        characters: [
          {
            characterName: "李雷",
            currentLocation: "客栈",
            status: "重伤昏迷中",
            equipment: [],
            abilities: [],
            relationships: {},
            lastUpdatedChapter: 3,
            lastUpdatedAt: "",
          },
        ],
        lastUpdated: "",
      },
      foreshadowing: { items: [], lastUpdated: "" },
      previousSnapshot: null,
      internalConflict: false,
      rawLoadError: false,
    };
    const draft = "李雷拔剑冲入敌阵，连续斩倒七人。";
    const deviations = identifyDeviations(draft, evidence);
    expect(
      deviations.some((d) => d.type === "state" && d.severity === "high"),
    ).toBe(true);
  });
});

describe("identifyDeviations - 上一章承接偏差", () => {
  it("本章开头与上章结尾钩子场景矛盾 → 标 high 偏差", () => {
    const evidence: ReviewEvidence = {
      cognition: null,
      characterStates: { characters: [], lastUpdated: "" },
      foreshadowing: { items: [], lastUpdated: "" },
      previousSnapshot: {
        chapterId: "ch3",
        chapterNumber: 3,
        chapterTitle: "第三章",
        summary: "李雷在客栈被困。",
        characters: ["李雷"],
        locations: ["客栈"],
        organizations: [],
        items: [],
        events: ["被困"],
        characterStateChanges: [],
        relationshipChanges: [],
        knowledgeChanges: [],
        foreshadowingChanges: [],
        newCanonFacts: [],
        timelineEvents: [],
        conflicts: [],
        endingHook: "李雷被困客栈，杀手即将动手。",
        snapshotPath: "",
        memorySynced: true,
        memorySyncedAt: "2026-07-05T00:00:00.000Z",
      } as any,
      internalConflict: false,
      rawLoadError: false,
    };
    const draft = "李雷回到家中安然入睡。";
    const deviations = identifyDeviations(draft, evidence);
    expect(deviations.some((d) => d.type === "continuity")).toBe(true);
  });
});

describe("identifyDeviations - 伏笔冲突", () => {
  it("已埋未启伏笔被本章提前说破 → 标 high 偏差", () => {
    const evidence: ReviewEvidence = {
      cognition: null,
      characterStates: { characters: [], lastUpdated: "" },
      foreshadowing: {
        items: [
          {
            id: "fs_1",
            name: "黑令符",
            description: "黑令符是仇家留下的暗杀信物",
            status: "planted",
            plantedChapter: 2,
            advancedChapters: [],
            relatedCharacters: ["李雷"],
            relatedEvents: [],
            notes: "",
          },
        ],
        lastUpdated: "",
      },
      previousSnapshot: null,
      internalConflict: false,
      rawLoadError: false,
    };
    const draft = "李雷一眼认出黑令符正是仇家留下的暗杀信物。";
    const deviations = identifyDeviations(draft, evidence);
    expect(deviations.some((d) => d.type === "foreshadowing")).toBe(true);
  });
  it("已 resolved 伏笔不报偏差", () => {
    const evidence: ReviewEvidence = {
      cognition: null,
      characterStates: { characters: [], lastUpdated: "" },
      foreshadowing: {
        items: [
          {
            id: "fs_1",
            name: "黑令符",
            description: "黑令符是仇家留下的暗杀信物",
            status: "resolved",
            plantedChapter: 2,
            advancedChapters: [],
            relatedCharacters: [],
            relatedEvents: [],
            notes: "",
          },
        ],
        lastUpdated: "",
      },
      previousSnapshot: null,
      internalConflict: false,
      rawLoadError: false,
    };
    const deviations = identifyDeviations("黑令符被认出。", evidence);
    expect(deviations).toHaveLength(0);
  });
});

describe("loadReviewEvidence - I3 仲裁降级", () => {
  beforeEach(() => vi.clearAllMocks());

  it("派生数据内部矛盾时读取上一章正文", async () => {
    const { loadCognitionState } =
      await import("@/lib/novel/character-cognition");
    const { loadCharacterStates } = await import("@/lib/novel/character-state");
    const { loadForeshadowingTracker } =
      await import("@/lib/novel/foreshadowing-tracker");
    const { readFile, fileExists } = await import("@/commands/fs");

    vi.mocked(loadCognitionState).mockResolvedValueOnce({
      characters: [{ character: "李雷", knows: ["暗杀计划"], doesNotKnow: [] }],
      readerKnows: [],
      lastUpdatedChapter: 3,
    });
    // 故意让 characterStates.status 与 cognition 矛盾
    vi.mocked(loadCharacterStates).mockResolvedValueOnce({
      characters: [
        {
          characterName: "李雷",
          currentLocation: "",
          status: "失忆中(不知暗杀计划)",
          equipment: [],
          abilities: [],
          relationships: {},
          lastUpdatedChapter: 3,
          lastUpdatedAt: "",
        },
      ],
      lastUpdated: "",
    });
    vi.mocked(loadForeshadowingTracker).mockResolvedValueOnce({
      items: [],
      lastUpdated: "",
    });
    mockListSnapshots.mockResolvedValueOnce([3]);
    mockLoadSnapshot.mockResolvedValueOnce(aSnapshot(3));
    vi.mocked(fileExists).mockResolvedValueOnce(true);
    vi.mocked(readFile).mockResolvedValueOnce("# 第三章\n李雷失忆中。");

    const evidence = await loadReviewEvidence("/proj");
    expect(evidence.internalConflict).toBe(true);
    expect(evidence.previousChapterRawText).toBe("# 第三章\n李雷失忆中。");
  });

  it("无内部矛盾时不读正文", async () => {
    const { loadCognitionState } =
      await import("@/lib/novel/character-cognition");
    vi.mocked(loadCognitionState).mockResolvedValueOnce(null);

    const evidence = await loadReviewEvidence("/proj");
    expect(evidence.internalConflict).toBe(false);
    expect(evidence.previousChapterRawText).toBeUndefined();
  });
});

describe("runDraftReviewSkill", () => {
  it("无偏差时直接返回原稿，无修复", async () => {
    const { loadCognitionState } =
      await import("@/lib/novel/character-cognition");
    vi.mocked(loadCognitionState).mockResolvedValueOnce({
      characters: [{ character: "李雷", knows: ["暗杀计划"], doesNotKnow: [] }],
      readerKnows: [],
      lastUpdatedChapter: 3,
    });
    const result = await runDraftReviewSkill({
      projectPath: "/proj",
      draftChapterText: "李雷知道暗杀计划。",
      draftChapterNumber: 4,
      mode: "full",
    });
    expect(result.deviations).toHaveLength(0);
    expect(result.revisedDraft).toBe("李雷知道暗杀计划。");
    expect(result.retryRound).toBe(0);
    expect(result.truncated).toBe(false);
    expect(result.repairSummary).toContain("无偏差");
  });

  it("发现偏差后调用 LLM 修复并重校，最多 2 轮", async () => {
    const { loadCognitionState } =
      await import("@/lib/novel/character-cognition");
    vi.mocked(loadCognitionState).mockResolvedValue({
      characters: [
        {
          character: "李雷",
          knows: ["暗杀计划"],
          doesNotKnow: ["地图密道"],
        },
      ],
      readerKnows: [],
      lastUpdatedChapter: 3,
    });
    const { streamChat } = await import("@/lib/llm-client");
    vi.mocked(streamChat).mockImplementation(
      async (_c: any, _m: any, cb: any) => {
        cb.onToken("李雷知道了地图密道，立即上报。");
        cb.onDone();
      },
    );
    const result = await runDraftReviewSkill({
      projectPath: "/proj",
      draftChapterText: "李雷知道了地图密道，立即上报。",
      draftChapterNumber: 4,
      mode: "full",
    });
    expect(result.truncated).toBe(true);
    expect(result.retryRound).toBe(2);
    expect(result.deviations.length).toBeGreaterThan(0);
    expect(result.repairSummary).toContain("截断");
  });

  it("第二轮修复消解偏差后正常结束", async () => {
    const { loadCognitionState } =
      await import("@/lib/novel/character-cognition");
    vi.mocked(loadCognitionState).mockResolvedValue({
      characters: [
        {
          character: "李雷",
          knows: ["暗杀计划"],
          doesNotKnow: ["地图密道"],
        },
      ],
      readerKnows: [],
      lastUpdatedChapter: 3,
    });
    const { streamChat } = await import("@/lib/llm-client");
    let callCount = 0;
    vi.mocked(streamChat).mockImplementation(
      async (_c: any, _m: any, cb: any) => {
        callCount += 1;
        if (callCount === 1) {
          cb.onToken("李雷知道了地图密道，立即上报。");
        } else {
          cb.onToken("李雷在城中行走。");
        }
        cb.onDone();
      },
    );
    const result = await runDraftReviewSkill({
      projectPath: "/proj",
      draftChapterText: "李雷知道了地图密道，立即上报。",
      draftChapterNumber: 4,
      mode: "full",
    });
    expect(result.truncated).toBe(false);
    expect(result.retryRound).toBeGreaterThan(0);
    expect(result.deviations).toHaveLength(0);
  });
});
