import { useTranslation } from "react-i18next";
import { FileText, ShieldCheck } from "lucide-react";
import { ChatPanel } from "./chat-panel";
import { DraftReviewPanel } from "./draft-review-panel";
import { useDraftReviewStore } from "@/stores/draft-review-store";

type AIChatTab = "dialog" | "review";

export function AIChatTabContainer() {
  const { t } = useTranslation();
  const draftReviewActive = useDraftReviewStore((s) => s.active);
  const dialogTabLocked = useDraftReviewStore((s) => s.dialogTabLocked);
  const phaseStage = useDraftReviewStore((s) => s.phase.stage);

  // 当校验未激活时始终显示对话 Tab
  const activeTab: AIChatTab = draftReviewActive ? "review" : "dialog";

  const handleTabClick = (tab: AIChatTab) => {
    if (tab === "dialog" && dialogTabLocked) return; // 校验进行中锁定
    // 切换逻辑通过 store 的 active 状态控制
    if (tab === "dialog") {
      useDraftReviewStore.getState().reset();
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Tab 标签栏 */}
      <div className="flex shrink-0 items-center border-b bg-muted/20 px-3">
        <button
          type="button"
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === "dialog"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          } ${dialogTabLocked ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`}
          onClick={() => handleTabClick("dialog")}
          disabled={dialogTabLocked}
        >
          <FileText className="h-3.5 w-3.5" />
          {t("novel.draftReview.dialogTab")}
        </button>
        <button
          type="button"
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === "review"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          } cursor-pointer`}
          onClick={() => handleTabClick("review")}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          {t("novel.draftReview.reviewTab")}
          {phaseStage === "reviewing" || phaseStage === "repairing" ? (
            <span className="ml-1 h-2 w-2 animate-pulse rounded-full bg-amber-500" />
          ) : null}
        </button>
      </div>

      {/* Tab 内容 */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {activeTab === "dialog" ? <ChatPanel /> : <DraftReviewPanel />}
      </div>
    </div>
  );
}
