import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useWikiStore } from "@/stores/wiki-store"
import { readFile, writeFile } from "@/commands/fs"
import { join } from "@tauri-apps/api/path"

const DEFAULT_DE_AI_SKILL = `# 中文小说去AI味专业规则

## 一、AI味识别清单（必须消除）

### 1. 禁用词汇（Slop Words）
**总结腔**：这一切、显然、事实上、实际上、毫无疑问、无可否认
**解释腔**：其实、说白了、换句话说、简单来说、通俗点讲
**模板句首**：与此同时、紧接着、就在这时、恰在此时、正当此刻
**空洞形容**：复杂、微妙、深刻、独特、特殊、某种程度上
**转折滥用**：然而、但是、不过、可是（每段都用）
**AI特征词**：似乎、仿佛、如同、宛如、犹如（过度使用）

### 2. 机械句式（必须打破）
- 每段都是"起承转合"四段式
- 连续3句以上相同句式结构
- "目光交汇的瞬间"
- "空气仿佛凝固"
- "心中五味杂陈"
- "眼神变得坚定"
- 机械排比：既...又...、不仅...还...（工整过度）

### 3. 叙事缺陷（必须修复）
- 过度解释动机："他这么做是因为..."
- 总结情绪："她感到失望/欣慰/复杂"
- 固定场景模板：环境→人物→对话→内心
- 无意义转场："时间一分一秒过去"
- 概括式冲突："双方陷入僵持"

## 二、去AI味核心方法

### 方法1：删减原则
**必删内容**：
- Filler短语：可以说、某种意义上、在某种程度上
- 多余情绪总结：用动作和对白代替
- 重复转折词：一段内不超过1个"但是"
- 装饰性副词：缓缓、慢慢、轻轻（除非必要）
- 无效铺垫：删掉不影响理解的句子

### 方法2：具体化
**用具体替代抽象**：
❌ 他很生气 → ✅ 他拍桌而起
❌ 她很难过 → ✅ 她别过脸去
❌ 气氛紧张 → ✅ 没人说话，只有钟摆声
❌ 他很犹豫 → ✅ 他攥紧又松开拳头

### 方法3：断句
**长句拆分**：
❌ 他看着她，眼神复杂，既有愧疚又有无奈，还夹杂着一丝不甘
✅ 他看着她。愧疚，无奈，还有不甘。

### 方法4：破坏工整
- 段落长度不对称
- 句式结构不整齐
- 允许单句成段
- 允许突然转场
- 允许留白和省略

### 方法5：对话真实化
- 人物说半句话，不把话说完整
- 答非所问、顾左右而言他
- 紧张时重复、结巴
- 保留"呃""嗯""那个"
- 不解释潜台词，让读者自己体会

## 三、执行流程

### 步骤1：识别文本功能
先判断这段是什么：
- **叙事推进** → 精简直接，删除修饰
- **人物对白** → 口语化，避免书面腔
- **心理描写** → 感官细节代替"他觉得"
- **场景描写** → 选择性描写，不面面俱到
- **动作场面** → 短句、动词、节奏快
- **情绪爆发** → 破坏平衡，允许突兀
- **悬疑铺垫** → 留白，不解释
- **章节收束** → 悬念钩子，不总结

### 步骤2：逐句检查
- 这句删了影响理解吗？→ 不影响就删
- 同义重复了吗？→ 删一个
- 铺垫过度了吗？→ 直接进入正题

### 步骤3：变化句式
- 禁止连续3句主谓宾
- 主语可省略（中文特性）
- 允许倒装、插入、破折号

### 步骤4：信任读者
- 不解释显而易见的情绪
- 不总结已经发生的事
- 不提醒读者应该有的感受

## 四、保留内容（不可删改）

**必须保留**：
1. 剧情事实、人物关系、时间线
2. 视角人称、角色声线
3. 伏笔、章节钩子
4. 原有对话和关键动作
5. 不增删剧情点，只改写作方式

## 五、最终检查（10项）

处理完后逐条确认：
1. ✓ 删除了禁用词汇
2. ✓ 打破了工整句式
3. ✓ 情绪用动作/环境表现而非总结
4. ✓ 对话保留口语特征和潜台词
5. ✓ 没有每段转折、每句修饰
6. ✓ 快慢节奏有变化
7. ✓ 保留了原有剧情、人物、伏笔
8. ✓ 章节钩子没被删除
9. ✓ 没为了"自然"增加新情节
10. ✓ 读起来不像AI，也不刻意反AI

---

**核心理念**：好的去AI味是让文字为故事服务。删掉一切不推进故事、不塑造人物、不制造氛围的东西。

---

**参考资源**：
- Stop Slop: https://github.com/drm-collab/stop-slop
- AI Flavor Remover: https://github.com/hylarucoder/ai-flavor-remover
- Writing Humanizer: https://github.com/shyuan/writing-humanizer`

export function DeAiSkillEditor() {
  const project = useWikiStore((s) => s.project)
  const [content, setContent] = useState("")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [isDefault, setIsDefault] = useState(true)

  useEffect(() => {
    if (!project) return
    loadSkill()
  }, [project?.path])

  async function loadSkill() {
    if (!project) return
    try {
      const skillPath = await join(project.path, "de-ai-skill.txt")
      const skillContent = await readFile(skillPath)
      setContent(skillContent)
      setIsDefault(false)
    } catch {
      setContent(DEFAULT_DE_AI_SKILL)
      setIsDefault(true)
    }
  }

  async function handleSave() {
    if (!project) return
    setSaving(true)
    try {
      const skillPath = await join(project.path, "de-ai-skill.txt")
      await writeFile(skillPath, content)
      setMessage("保存成功")
      setIsDefault(false)
    } catch {
      setMessage("保存失败，请稍后重试")
    } finally {
      setSaving(false)
      setTimeout(() => setMessage(""), 2000)
    }
  }

  async function handleReset() {
    setContent(DEFAULT_DE_AI_SKILL)
    setMessage("已重置为默认规则")
    setTimeout(() => setMessage(""), 2000)
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <Label>去AI味Skill</Label>
        <p className="text-sm text-muted-foreground mt-1">
          自定义去AI味规则，将应用到全局所有去AI味功能（章节去AI味、选中文本去AI味、AI会话深度思考阶段6）
        </p>
        {isDefault && (
          <p className="text-xs text-amber-600 mt-2">
            当前使用默认规则。保存后将创建自定义规则文件。
          </p>
        )}
      </div>
      <Textarea
        className="min-h-[400px] font-mono text-sm"
        placeholder="在此输入你的去AI味规则..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <Button onClick={handleSave} disabled={saving || content.trim() === ""}>
          {saving ? "保存中..." : "保存"}
        </Button>
        <Button onClick={handleReset} variant="outline" disabled={saving}>
          重置为默认
        </Button>
        {message && <span className="text-sm text-muted-foreground">{message}</span>}
      </div>
      <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
        <div className="font-medium mb-2">使用提示：</div>
        <ul className="space-y-1 list-disc list-inside">
          <li>编辑规则后点击"保存"，将自动应用到所有去AI味功能</li>
          <li>可以参考默认规则，根据你的写作风格调整</li>
          <li>支持多行文本，可以使用分点、分段的形式组织规则</li>
          <li>规则会保存为项目根目录下的 de-ai-skill.txt 文件</li>
        </ul>
      </div>
    </div>
  )
}
