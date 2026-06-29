import { useState, useCallback, useEffect } from "react"
import { Plus, User, Merge, Pencil, X, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { BookAnalysisLibraryBook } from "@/lib/novel/book-analysis/library-state"
import type { ExtractedCharacter, PersonalityProfile } from "@/lib/novel/book-analysis/types"
import { mergeCharacters, persistMergedCharacter } from "@/lib/novel/book-analysis/character-merger"
import { persistCharacterToDisk } from "@/lib/novel/book-analysis/character-disk-store"
import { generateSimpleSkillMarkdown } from "@/lib/novel/book-analysis/skill-generator"
import { loadRecognizedCharacters, saveRecognizedCharacters } from "@/lib/novel/book-analysis/recognized-character-store"
import { writeFile, deleteFile } from "@/commands/fs"
import { joinPath, normalizePath } from "@/lib/path-utils"
import { buildNameAliasMap } from "@/lib/novel/book-analysis/alias-resolver"
import { useBookAnalysisStore } from "@/stores/book-analysis-store"
import { useWikiStore } from "@/stores/wiki-store"
import { toast } from "@/lib/toast"

interface BookAnalysisCharacterPanelProps {
  book: BookAnalysisLibraryBook
  selectedCharacterId: string | null
  addingToSoul: boolean
  onSelectCharacter: (characterId: string) => void
  onAddSelectedSkillsToSoul: (skillId: string) => void
  /** 合并/编辑完成后回调，用于刷新父组件的数据 */
  onAfterMerge?: () => void
}

const categoryLabels: Record<string, string> = {
  protagonist: "主角",
  antagonist: "反派",
  supporting: "配角",
  minor: "次要",
}

const categoryOptions = [
  { value: "protagonist", label: "主角" },
  { value: "antagonist", label: "反派" },
  { value: "supporting", label: "配角" },
  { value: "minor", label: "次要" },
]

function safeSkillFileName(name: string): string {
  return `${name.replace(/[^一-龥a-zA-Z0-9]/g, "_")}-skill.md`
}

interface EditDraft {
  name: string
  aliases: string
  category: string
  importance: number
  description: string
  personality: string
  speechStyle: string
  // PersonalityProfile 字段
  profilePersonality: string
  profileMotivation: string
  profileSpeechStyle: string
  profileBehaviorPatterns: string
  profileQuotes: string
}

function characterToDraft(c: ExtractedCharacter): EditDraft {
  const p = c.personalityProfile
  return {
    name: c.name,
    aliases: c.aliases.join("、"),
    category: c.category,
    importance: c.importance,
    description: c.description,
    personality: c.personality,
    speechStyle: c.speechStyle,
    profilePersonality: p?.personality || "",
    profileMotivation: p?.motivation || "",
    profileSpeechStyle: p?.speechStyle || "",
    profileBehaviorPatterns: p?.behaviorPatterns || "",
    profileQuotes: p?.quotes?.join("\n") || "",
  }
}

export function BookAnalysisCharacterPanel({
  book,
  selectedCharacterId,
  addingToSoul,
  onSelectCharacter,
  onAddSelectedSkillsToSoul,
  onAfterMerge,
}: BookAnalysisCharacterPanelProps) {
  const selectedCharacter = book.characters.find((character) => character.id === selectedCharacterId) ?? book.characters[0] ?? null
  const selectedSkill = selectedCharacter
    ? book.skills.find((skill) => skill.characterId === selectedCharacter.id || skill.characterName === selectedCharacter.name) ?? null
    : null
  const selectedAuraAdded = selectedCharacter ? book.addedAuraCharacterIds.includes(selectedCharacter.id) : false
  const addButtonLabel = addingToSoul
    ? "加入中..."
    : selectedAuraAdded
      ? "已加入自定义灵魂库"
      : "加入自定义灵魂库"

  const profile = selectedCharacter?.personalityProfile

  // 合并相关状态
  const [selectedMergeIds, setSelectedMergeIds] = useState<Set<string>>(new Set())
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false)
  const [mergePrimaryId, setMergePrimaryId] = useState<string>("")
  const [mergeMerging, setMergeMerging] = useState(false)

  // 编辑相关状态
  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)
  const [editSaving, setEditSaving] = useState(false)

  // 切换角色时退出编辑模式
  useEffect(() => {
    setEditing(false)
    setEditDraft(null)
  }, [selectedCharacterId])

  const handleToggleMergeSelect = useCallback((id: string) => {
    setSelectedMergeIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleStartEdit = useCallback(() => {
    if (!selectedCharacter) return
    setEditDraft(characterToDraft(selectedCharacter))
    setEditing(true)
  }, [selectedCharacter])

  const handleCancelEdit = useCallback(() => {
    setEditing(false)
    setEditDraft(null)
  }, [])

  const handleSaveEdit = useCallback(async () => {
    if (!selectedCharacter || !editDraft) return
    setEditSaving(true)
    try {
      const draft = editDraft
      // 解析 aliases
      const newAliases = draft.aliases
        .split(/[、,，\n]/)
        .map((s) => s.trim())
        .filter(Boolean)

      // 名字变化时需要处理旧 Skill 文件
      const nameChanged = draft.name !== selectedCharacter.name

      // 构建 personalityProfile
      const newProfile: PersonalityProfile | undefined =
        draft.profilePersonality || draft.profileMotivation || draft.profileSpeechStyle || draft.profileBehaviorPatterns || draft.profileQuotes
          ? {
              personality: draft.profilePersonality,
              motivation: draft.profileMotivation,
              speechStyle: draft.profileSpeechStyle,
              behaviorPatterns: draft.profileBehaviorPatterns,
              quotes: draft.profileQuotes
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(0, 8),
            }
          : selectedCharacter.personalityProfile

      // 构建更新后的 character
      const updated: ExtractedCharacter = {
        ...selectedCharacter,
        name: draft.name,
        aliases: newAliases,
        category: draft.category as ExtractedCharacter["category"],
        importance: draft.importance,
        description: draft.description,
        personality: draft.personality,
        speechStyle: draft.speechStyle,
        personalityProfile: newProfile,
        aliasMap: buildNameAliasMap(draft.name, newAliases),
      }

      // 1. 持久化角色 JSON
      const bookPath = book.path
      await persistCharacterToDisk(bookPath, updated)

      // 2. 名字变了：删除旧 Skill 文件，写新 Skill 文件
      if (nameChanged) {
        const oldSkillPath = normalizePath(joinPath(bookPath, "skills", safeSkillFileName(selectedCharacter.name)))
        await deleteFile(oldSkillPath).catch(() => {})
      }

      // 写入新 Skill 文件
      let skillContent: string
      if (updated.personalityProfile) {
        skillContent = generateSimpleSkillMarkdown({
          characterName: updated.name,
          profile: updated.personalityProfile,
          sourceBook: book.metadata.title,
        })
      } else {
        skillContent = generateSimpleSkillMarkdown({
          characterName: updated.name,
          profile: {
            personality: updated.personality,
            motivation: "",
            speechStyle: updated.speechStyle,
            behaviorPatterns: "",
            quotes: [],
          },
          sourceBook: book.metadata.title,
        })
      }
      const newSkillPath = normalizePath(joinPath(bookPath, "skills", safeSkillFileName(updated.name)))
      await writeFile(newSkillPath, skillContent)

      // 3. 名字变了：更新 recognized-characters.json
      if (nameChanged) {
        try {
          const recognized = await loadRecognizedCharacters(bookPath)
          const updatedRecognized = recognized.map((c) =>
            c.id === updated.id ? { ...c, name: updated.name, aliases: updated.aliases } : c,
          )
          await saveRecognizedCharacters(bookPath, updatedRecognized)
        } catch { /* ignore */ }
      }

      // 4. 更新 store
      const currentProject = useWikiStore.getState().project
      if (currentProject?.path) {
        const storeState = useBookAnalysisStore.getState()
        const normalizedProjectPath = currentProject.path.replace(/\\/g, "/")
        const matchingTask = storeState.tasks.find(
          (t) => t.projectPath === normalizedProjectPath && t.status === "completed",
        )
        if (matchingTask) {
          storeState.updateCharacterInTask(matchingTask.id, updated)
        }
      }

      setEditing(false)
      setEditDraft(null)
      toast.success(`角色「${updated.name}」已保存`)
      onAfterMerge?.()
    } catch (err) {
      toast.error(`保存失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setEditSaving(false)
    }
  }, [selectedCharacter, editDraft, book, onAfterMerge])

  const handleMergeCharacters = useCallback(async () => {
    if (mergeMerging) return
    const selectedChars = book.characters.filter((c) => selectedMergeIds.has(c.id))
    if (selectedChars.length < 2) return

    const primary = selectedChars.find((c) => c.id === mergePrimaryId)
    if (!primary) return
    const others = selectedChars.filter((c) => c.id !== mergePrimaryId)

    setMergeMerging(true)
    try {
      const merged = mergeCharacters(primary, others)

      const currentProject = useWikiStore.getState().project
      if (!currentProject?.path) {
        toast.error("无法确定项目路径")
        return
      }

      const bookPath = book.path
      await persistMergedCharacter(bookPath, merged, others, book.metadata.title)

      const storeState = useBookAnalysisStore.getState()
      const tasks = storeState.tasks
      const normalizedProjectPath = currentProject.path.replace(/\\/g, "/")
      const matchingTask = tasks.find(
        (t) => t.projectPath === normalizedProjectPath && t.status === "completed",
      )
      if (matchingTask) {
        const deletedIds = others.map((c) => c.id)
        storeState.mergeCharactersInTask(matchingTask.id, merged, deletedIds)
      }

      setSelectedMergeIds(new Set())
      setMergeDialogOpen(false)
      setMergePrimaryId("")

      toast.success(`已将 ${others.map((c) => c.name).join("、")} 合并到「${merged.name}」`)
      onAfterMerge?.()
    } catch (err) {
      toast.error(`合并失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setMergeMerging(false)
    }
  }, [book, mergeMerging, mergePrimaryId, selectedMergeIds, onAfterMerge])

  return (
    <section className="min-h-0 flex-1 rounded-lg border bg-background">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">角色 Skill</h3>
          <p className="mt-1 text-xs text-muted-foreground">选择角色 Skill 加入自定义灵魂库。勾选多个角色可合并。</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedMergeIds.size >= 2 && (
            <Button
              size="sm"
              variant="outline"
              className="text-primary"
              onClick={() => {
                const firstId = Array.from(selectedMergeIds)[0]
                setMergePrimaryId(firstId)
                setMergeDialogOpen(true)
              }}
            >
              <Merge className="mr-1.5 h-3.5 w-3.5" />
              合并 ({selectedMergeIds.size})
            </Button>
          )}
          {selectedMergeIds.size > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedMergeIds(new Set())}
            >
              清空勾选
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => selectedSkill && !selectedAuraAdded && onAddSelectedSkillsToSoul(selectedSkill.id)}
            disabled={addingToSoul || !selectedSkill || selectedAuraAdded}
          >
            <Plus className="mr-2 h-4 w-4" />
            {addButtonLabel}
          </Button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: "minmax(220px, 320px) 1fr" }}>
        <div className="min-h-0 space-y-2 overflow-y-auto border-r p-3">
          {book.characters.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">暂无角色数据。</div>
          ) : (
            book.characters.map((character) => {
              const active = selectedCharacter?.id === character.id
              const hasSkill = book.skills.some((skill) => skill.characterId === character.id || skill.characterName === character.name)
              const mergeChecked = selectedMergeIds.has(character.id)
              return (
                <div
                  key={character.id}
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    mergeChecked
                      ? "border-primary bg-primary/5"
                      : active
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={mergeChecked}
                      onChange={() => handleToggleMergeSelect(character.id)}
                      className="mt-1 h-3.5 w-3.5 cursor-pointer accent-primary shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      type="button"
                      className="flex-1 min-w-0 text-left"
                      onClick={() => onSelectCharacter(character.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{character.name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {categoryLabels[character.category] ?? character.category} · 重要度 {character.importance}/10
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs">
                          {hasSkill ? "已生成" : "未生成"}
                        </span>
                      </div>
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
        <div className="min-h-0 overflow-y-auto p-5">
          {selectedCharacter ? (
            editing && editDraft ? (
              /* === 编辑模式 === */
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-semibold">编辑角色</h4>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={handleCancelEdit} disabled={editSaving}>
                      <X className="mr-1 h-3.5 w-3.5" />
                      取消
                    </Button>
                    <Button size="sm" onClick={handleSaveEdit} disabled={editSaving}>
                      {editSaving ? "保存中..." : (
                        <><Check className="mr-1 h-3.5 w-3.5" />保存</>
                      )}
                    </Button>
                  </div>
                </div>

                {/* 基本信息 */}
                <div className="space-y-3">
                  <div className="text-sm font-medium text-muted-foreground">基本信息</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium">角色名</label>
                      <input
                        type="text"
                        value={editDraft.name}
                        onChange={(e) => setEditDraft((d) => d ? { ...d, name: e.target.value } : d)}
                        className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium">别名（顿号分隔）</label>
                      <input
                        type="text"
                        value={editDraft.aliases}
                        onChange={(e) => setEditDraft((d) => d ? { ...d, aliases: e.target.value } : d)}
                        placeholder="别名1、别名2"
                        className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium">分类</label>
                      <select
                        value={editDraft.category}
                        onChange={(e) => setEditDraft((d) => d ? { ...d, category: e.target.value } : d)}
                        className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                      >
                        {categoryOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium">重要度 (1-10)</label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={editDraft.importance}
                        onChange={(e) => setEditDraft((d) => d ? { ...d, importance: Math.min(10, Math.max(1, Number(e.target.value) || 1)) } : d)}
                        className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">描述</label>
                    <textarea
                      value={editDraft.description}
                      onChange={(e) => setEditDraft((d) => d ? { ...d, description: e.target.value } : d)}
                      rows={3}
                      className="w-full rounded-md border bg-background px-3 py-1.5 text-sm resize-none"
                    />
                  </div>
                </div>

                {/* 深度字段 */}
                <div className="space-y-3">
                  <div className="text-sm font-medium text-muted-foreground">深度字段（基础）</div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">性格</label>
                    <textarea
                      value={editDraft.personality}
                      onChange={(e) => setEditDraft((d) => d ? { ...d, personality: e.target.value } : d)}
                      rows={2}
                      className="w-full rounded-md border bg-background px-3 py-1.5 text-sm resize-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">说话风格</label>
                    <textarea
                      value={editDraft.speechStyle}
                      onChange={(e) => setEditDraft((d) => d ? { ...d, speechStyle: e.target.value } : d)}
                      rows={2}
                      className="w-full rounded-md border bg-background px-3 py-1.5 text-sm resize-none"
                    />
                  </div>
                </div>

                {/* 简单提取 Profile 字段 */}
                <div className="space-y-3">
                  <div className="text-sm font-medium text-muted-foreground">简单提取字段</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium">性格</label>
                      <textarea
                        value={editDraft.profilePersonality}
                        onChange={(e) => setEditDraft((d) => d ? { ...d, profilePersonality: e.target.value } : d)}
                        rows={3}
                        className="w-full rounded-md border bg-background px-3 py-1.5 text-sm resize-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium">动机</label>
                      <textarea
                        value={editDraft.profileMotivation}
                        onChange={(e) => setEditDraft((d) => d ? { ...d, profileMotivation: e.target.value } : d)}
                        rows={3}
                        className="w-full rounded-md border bg-background px-3 py-1.5 text-sm resize-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium">说话风格</label>
                      <textarea
                        value={editDraft.profileSpeechStyle}
                        onChange={(e) => setEditDraft((d) => d ? { ...d, profileSpeechStyle: e.target.value } : d)}
                        rows={3}
                        className="w-full rounded-md border bg-background px-3 py-1.5 text-sm resize-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium">行为模式</label>
                      <textarea
                        value={editDraft.profileBehaviorPatterns}
                        onChange={(e) => setEditDraft((d) => d ? { ...d, profileBehaviorPatterns: e.target.value } : d)}
                        rows={3}
                        className="w-full rounded-md border bg-background px-3 py-1.5 text-sm resize-none"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">代表性台词（每行一句）</label>
                    <textarea
                      value={editDraft.profileQuotes}
                      onChange={(e) => setEditDraft((d) => d ? { ...d, profileQuotes: e.target.value } : d)}
                      rows={4}
                      placeholder={"台词1\n台词2\n台词3"}
                      className="w-full rounded-md border bg-background px-3 py-1.5 text-sm resize-none font-mono"
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* === 只读模式 === */
              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-primary" />
                      <h4 className="text-lg font-semibold">{selectedCharacter.name}</h4>
                      <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                        {categoryLabels[selectedCharacter.category] ?? selectedCharacter.category}
                      </span>
                    </div>
                    <Button size="sm" variant="ghost" onClick={handleStartEdit}>
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      编辑
                    </Button>
                  </div>
                  {selectedCharacter.description && (
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{selectedCharacter.description}</p>
                  )}
                  {selectedCharacter.aliases.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      别名：{selectedCharacter.aliases.join("、")}
                    </p>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md bg-muted/40 p-3 text-sm">
                    <div className="font-medium">性格</div>
                    <div className="mt-1 text-muted-foreground">{profile?.personality || selectedCharacter.personality || "暂无"}</div>
                  </div>
                  <div className="rounded-md bg-muted/40 p-3 text-sm">
                    <div className="font-medium">说话风格</div>
                    <div className="mt-1 text-muted-foreground">{profile?.speechStyle || selectedCharacter.speechStyle || "暂无"}</div>
                  </div>
                  <div className="rounded-md bg-muted/40 p-3 text-sm">
                    <div className="font-medium">动机</div>
                    <div className="mt-1 text-muted-foreground">{profile?.motivation || "暂无"}</div>
                  </div>
                  <div className="rounded-md bg-muted/40 p-3 text-sm">
                    <div className="font-medium">行为模式</div>
                    <div className="mt-1 text-muted-foreground">{profile?.behaviorPatterns || "暂无"}</div>
                  </div>
                </div>
                {profile?.quotes && profile.quotes.length > 0 && (
                  <div className="rounded-md bg-muted/40 p-3 text-sm">
                    <div className="font-medium">代表性台词</div>
                    <div className="mt-1 space-y-1 text-muted-foreground">
                      {profile.quotes.map((q, i) => (
                        <div key={i}>「{q}」</div>
                      ))}
                    </div>
                  </div>
                )}
                {selectedSkill && (
                  <div className="rounded-md bg-muted/40 p-3 text-sm">
                    <div className="font-medium">Skill 内容预览</div>
                    <div className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap text-xs text-muted-foreground">
                      {selectedSkill.skillContent.slice(0, 800)}{selectedSkill.skillContent.length > 800 ? "..." : ""}
                    </div>
                  </div>
                )}
              </div>
            )
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">请从左侧选择角色。</div>
          )}
        </div>
      </div>

      {/* 合并确认对话框 */}
      {mergeDialogOpen && (() => {
        const selectedChars = book.characters.filter((c) => selectedMergeIds.has(c.id))
        const primary = selectedChars.find((c) => c.id === mergePrimaryId)
        const others = selectedChars.filter((c) => c.id !== mergePrimaryId)
        const previewAliases = primary
          ? Array.from(new Set([
              ...primary.aliases,
              ...others.map((c) => c.name),
              ...others.flatMap((c) => c.aliases),
            ].filter((a) => a !== primary?.name)))
          : []
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
            <div className="bg-background rounded-lg shadow-lg w-full max-w-md mx-4 p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Merge className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">合并角色</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                选择一个主角色，其他角色将合并到此角色中（其他角色的名字会作为别名保留）。
              </p>

              <div className="space-y-2">
                <div className="text-sm font-medium">选择主角色：</div>
                {selectedChars.map((c) => (
                  <label
                    key={c.id}
                    className={`flex items-center gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                      mergePrimaryId === c.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    <input
                      type="radio"
                      name="merge-primary-library"
                      checked={mergePrimaryId === c.id}
                      onChange={() => setMergePrimaryId(c.id)}
                      className="accent-primary"
                    />
                    <div>
                      <div className="font-medium">{c.name}</div>
                      {c.aliases.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          别名：{c.aliases.join("、")}
                        </div>
                      )}
                    </div>
                  </label>
                ))}
              </div>

              {primary && (
                <div className="rounded-md bg-muted/30 p-3 text-sm space-y-1">
                  <div className="font-medium">合并预览</div>
                  <div className="text-muted-foreground">
                    <span>角色名：</span>
                    <span className="text-foreground">{primary.name}</span>
                  </div>
                  <div className="text-muted-foreground">
                    <span>合并后别名：</span>
                    <span className="text-foreground">
                      {previewAliases.length > 0 ? previewAliases.join("、") : "（无）"}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    <span>将被合并：</span>
                    <span className="text-foreground">
                      {others.map((c) => c.name).join("、")}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setMergeDialogOpen(false)
                    setMergePrimaryId("")
                  }}
                  disabled={mergeMerging}
                >
                  取消
                </Button>
                <Button
                  size="sm"
                  onClick={handleMergeCharacters}
                  disabled={mergeMerging || !mergePrimaryId}
                >
                  {mergeMerging ? "合并中..." : "确认合并"}
                </Button>
              </div>
            </div>
          </div>
        )
      })()}
    </section>
  )
}
