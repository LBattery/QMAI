/**
 * Pure budget allocator for chat context assembly.
 *
 * Given an LLM's `maxContextSize` (in characters — see wiki-store.ts;
 * yes, that's a quirky unit, but tokens-vs-chars conversion lives
 * elsewhere), compute the per-section character budgets used by
 * chat-panel when packing the prompt.
 *
 * Why this is its own module:
 *   - The math has corner cases that deserve their own tests
 *     (tiny configs, huge configs, the legacy 30K cap removal).
 *   - Inlining it in chat-panel.tsx made it untestable in isolation.
 *
 * The shape of the budget:
 *
 *   ┌─────────────────────────────────────────────────────┐
 *   │              maxCtx (100%)                          │
 *   ├──────┬───────────────┬──────────────────┬───────────┤
 *   │ idx  │   pages       │  history + sys   │  resp     │
 *   │  5%  │    50%        │    ~30%          │   15%     │
 *   └──────┴───────────────┴──────────────────┴───────────┘
 *
 * `historyAndSystem` isn't returned because it's not enforced as a
 * single budget — system prompt is roughly fixed-size, and history
 * is gated by `maxHistoryMessages` (count, not bytes). The leftover
 * just provides headroom.
 *
 * The response reserve is a "passive" reservation: we don't pass
 * `max_tokens: responseReserve / 3` to the LLM (yet — that's a
 * follow-up). We just refuse to fill above (maxCtx - responseReserve)
 * so the LLM has room to actually answer.
 */

import i18n from "@/i18n"

/** Result of `computeContextBudget`. All values are character counts. */
export interface ContextBudget {
  /** The model's full context window (always populated; falls back
   *  to a sensible default when caller passes 0/undefined). */
  maxCtx: number
  /** Characters NOT to be filled with prompt content — left empty so
   *  the LLM has room to write its response. */
  responseReserve: number
  /** Wiki index summary budget. ~5% — enough to list every page's
   *  title without occupying serious budget. */
  indexBudget: number
  /** Total characters available for retrieved wiki page content. */
  pageBudget: number
  /** Per-page truncation cap. A single page won't be embedded longer
   *  than this even if `pageBudget` would allow it. Scales with
   *  pageBudget (used to be hard-capped at 30,000 chars regardless
   *  of context size — that wasted budget on long-context models). */
  maxPageSize: number
}

const DEFAULT_MAX_CTX = 204_800
const RESPONSE_RESERVE_FRAC = 0.15
const INDEX_BUDGET_FRAC = 0.05
const PAGE_BUDGET_FRAC = 0.5
const PER_PAGE_FRAC = 0.3
const PER_PAGE_FLOOR = 5_000

/** Approximate characters per token the whole budgeting layer assumes.
 *  `maxContextSize` is expressed in CHARACTERS under the English-ish
 *  assumption of ~4 chars/token (see contextPackToPrompt). */
const CHARS_PER_TOKEN = 4
/** Empirical chars/token for CJK (Chinese/Japanese/Korean) text. CJK is
 *  ~2.3x denser than English, so the same character budget maps to far
 *  more tokens and can overflow the model window. */
const CHARS_PER_TOKEN_CJK = 1.7
/** Effective-window multiplier for CJK UIs. Shrinks the character budget
 *  so its TOKEN footprint matches what the English assumption expects,
 *  keeping token usage comparable across languages. ≈ 0.425. */
const CJK_CONTEXT_SCALE = CHARS_PER_TOKEN_CJK / CHARS_PER_TOKEN

function isCjkLanguage(lang: string | undefined): boolean {
  if (!lang) return false
  const l = lang.toLowerCase()
  return l.startsWith("zh") || l.startsWith("ja") || l.startsWith("ko")
}

/**
 * Window scale for a UI language. English (and any non-CJK language)
 * returns 1 → zero behavioural change. CJK returns `CJK_CONTEXT_SCALE`
 * so the character budgets translate to a safe token footprint.
 *
 * `lang` defaults to the active i18n language; pass an explicit value
 * (e.g. in tests) to keep the calculation deterministic.
 */
export function contextScaleForLanguage(lang?: string): number {
  const resolved =
    lang ?? (typeof i18n?.language === "string" ? i18n.language : undefined)
  return isCjkLanguage(resolved) ? CJK_CONTEXT_SCALE : 1
}

/**
 * Compute character budgets from the LLM's max context window.
 *
 * Falsy `maxContextSize` (0 / NaN / undefined) falls back to the
 * pre-Phase-1 default of 200K chars so existing configs don't break.
 */
export function computeContextBudget(
  maxContextSize: number | undefined,
  langScale: number = contextScaleForLanguage(),
): ContextBudget {
  const rawMaxCtx =
    typeof maxContextSize === "number" && maxContextSize > 0
      ? maxContextSize
      : DEFAULT_MAX_CTX
  const scale = typeof langScale === "number" && langScale > 0 ? langScale : 1
  const maxCtx = Math.max(1, Math.floor(rawMaxCtx * scale))

  const responseReserve = Math.floor(maxCtx * RESPONSE_RESERVE_FRAC)
  const indexBudget = Math.floor(maxCtx * INDEX_BUDGET_FRAC)
  const pageBudget = Math.floor(maxCtx * PAGE_BUDGET_FRAC)

  // Per-page cap rules:
  //   - At minimum, allow PER_PAGE_FLOOR (5K) so a small config still
  //     fits one short page.
  //   - At maximum, never exceed pageBudget itself — for tiny configs
  //     where pageBudget < 5K, the floor would otherwise allow a
  //     single page bigger than the entire page budget, which then
  //     gets entirely rejected by tryAddPage in chat-panel.
  //   - Otherwise scale linearly with pageBudget at PER_PAGE_FRAC (30%).
  const maxPageSize = Math.min(
    pageBudget,
    Math.max(PER_PAGE_FLOOR, Math.floor(pageBudget * PER_PAGE_FRAC)),
  )

  return {
    maxCtx,
    responseReserve,
    indexBudget,
    pageBudget,
    maxPageSize,
  }
}

/** Share of the window the novel context pack may occupy. Chosen so the
 *  default 200K-char window preserves the legacy 32K-token deep-chapter
 *  budget while smaller windows are capped down proportionally. */
const NOVEL_CONTEXT_FRAC = 0.65
/** Absolute floor so a tiny window still injects some context. */
const NOVEL_CONTEXT_TOKEN_FLOOR = 4_000

/**
 * Token budget for the novel context pack (`contextPackToPrompt`).
 *
 * The novel context (memory, settings, search hits, character souls) is
 * the bulk of the writing prompt and must scale with — and never exceed —
 * the model's context window, leaving room for the chapter output and
 * prompt scaffolding.
 *
 * `requestedTokenBudget` is the user's `novelConfig.contextTokenBudget`
 * (0 / undefined = "no explicit limit"). When set it is honored but still
 * clamped to the window-derived cap; when unset the cap itself is used so
 * the injection is never truly unbounded.
 *
 * Unit note: `maxContextSize` is in CHARACTERS while `contextPackToPrompt`
 * expects a TOKEN budget (~4 chars/token), hence the division.
 */
export function computeNovelContextTokenBudget(
  maxContextSize: number | undefined,
  requestedTokenBudget?: number,
  langScale?: number,
): number {
  const { maxCtx } = computeContextBudget(maxContextSize, langScale)
  const cap = Math.max(
    NOVEL_CONTEXT_TOKEN_FLOOR,
    Math.floor((maxCtx * NOVEL_CONTEXT_FRAC) / CHARS_PER_TOKEN),
  )
  if (requestedTokenBudget && requestedTokenBudget > 0) {
    return Math.min(requestedTokenBudget, cap)
  }
  return cap
}

export interface ResolveContextPackTokenBudgetInput {
  maxContextSize?: number
  /** User setting; 0 / undefined = auto from window. */
  contextTokenBudget?: number
  langScale?: number
}

/**
 * Canonical resolver for chat / context-hub / trim-plugin ContextPack budgets.
 * Always returns a positive finite token budget (never "unbounded").
 */
export function resolveContextPackTokenBudget(
  input: ResolveContextPackTokenBudgetInput = {},
): number {
  return computeNovelContextTokenBudget(
    input.maxContextSize,
    input.contextTokenBudget,
    input.langScale,
  )
}

/** Output reserve multiplier: chapter target chars × this factor. */
export const WRITING_OUTPUT_RESERVE_MULTIPLIER = 2
/** Minimum scaffold reserve for writing prompts (instructions / outline shell). */
const WRITING_SCAFFOLD_RESERVE_FLOOR = 8_000
const WRITING_SCAFFOLD_RESERVE_FRAC = 0.08

export interface ComputeWritingContextPackTokenBudgetInput {
  maxContextSize?: number
  contextTokenBudget?: number
  chapterTargetChars?: number
  langScale?: number
}

/**
 * Deep-chapter ContextPack budget: window minus output reserve (target×2)
 * and scaffold, then clamped by the general window cap / user budget.
 */
export function computeWritingContextPackTokenBudget(
  input: ComputeWritingContextPackTokenBudgetInput,
): number {
  const langScale = input.langScale
  const { maxCtx } = computeContextBudget(input.maxContextSize, langScale)
  // Inline clamp mirrors resolveChapterLengthSpec without importing deep-chapter-prompts
  // (avoids circular deps). Keep in sync with DEEP_CHAPTER 2000–6000 bounds.
  const rawTarget = input.chapterTargetChars
  const target = Number.isFinite(rawTarget) && (rawTarget as number) > 0
    ? Math.max(2_000, Math.min(6_000, Math.round(rawTarget as number)))
    : 3_000
  // Same formula as resolveChapterLengthSpec.maxOutputTokens.
  const maxOutputTokens = target === 3_000
    ? 8_000
    : Math.max(8_000, Math.ceil((target + 500) * 2))
  // User redundancy: 2× target chars at CJK density (~1.7 chars/token), then take the
  // larger of that vs the chapter maxOutputTokens so generation headroom is real.
  const targetReserveTokens = Math.ceil(
    (target * WRITING_OUTPUT_RESERVE_MULTIPLIER) / CHARS_PER_TOKEN_CJK,
  )
  const outputReserveTokens = Math.max(targetReserveTokens, maxOutputTokens)
  const outputReserveChars = outputReserveTokens * CHARS_PER_TOKEN
  const scaffoldReserveChars = Math.max(
    WRITING_SCAFFOLD_RESERVE_FLOOR,
    Math.floor(maxCtx * WRITING_SCAFFOLD_RESERVE_FRAC),
  )
  const availableChars = Math.max(0, maxCtx - outputReserveChars - scaffoldReserveChars)
  // Do not inflate with NOVEL_CONTEXT_TOKEN_FLOOR: that would steal the output reserve
  // on small windows. Prefer leaving room for chapter generation.
  const derivedTokens = Math.max(0, Math.floor(availableChars / CHARS_PER_TOKEN))
  const windowCap = computeNovelContextTokenBudget(input.maxContextSize, 0, langScale)
  const autoTokens = Math.min(derivedTokens, windowCap)
  if (input.contextTokenBudget && input.contextTokenBudget > 0) {
    return Math.min(input.contextTokenBudget, autoTokens)
  }
  return autoTokens
}

/** Legacy single-pass outline ingest floor; kept so small windows still behave predictably. */
export const OUTLINE_INGEST_MIN_BODY_BUDGET = 8_000
/** Upper cap aligned with wiki long-source ingest. */
export const OUTLINE_INGEST_MAX_BODY_BUDGET = 300_000

function clampBudget(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Character budget for the outline body in `ingestOutline`.
 *
 * Reserves space for fixed prompts and JSON output, then allocates the
 * remainder to the outline markdown. Scales with `maxContextSize` and
 * CJK language scale like other budget helpers.
 */
export function computeOutlineIngestBodyBudget(
  maxContextSize: number | undefined,
  promptOverheadChars: number,
  langScale?: number,
): number {
  const { maxCtx, responseReserve } = computeContextBudget(maxContextSize, langScale)
  const outputReserve = Math.max(responseReserve, Math.floor(maxCtx * 0.15))
  const instructionReserve = Math.max(promptOverheadChars, Math.floor(maxCtx * 0.08))
  const available = maxCtx - outputReserve - instructionReserve
  const upper = Math.min(
    OUTLINE_INGEST_MAX_BODY_BUDGET,
    Math.max(OUTLINE_INGEST_MIN_BODY_BUDGET, Math.floor(maxCtx * 0.6)),
  )
  const min = Math.min(
    OUTLINE_INGEST_MIN_BODY_BUDGET,
    Math.max(1_000, Math.floor(available)),
  )
  return clampBudget(Math.floor(available), min, upper)
}
