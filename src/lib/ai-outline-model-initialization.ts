import { loadAiOutlineModel } from "@/lib/project-store"
import { useWikiStore } from "@/stores/wiki-store"

export async function initializeAiOutlineModelFromStorage(): Promise<void> {
  const expectedRevision = useWikiStore.getState().aiOutlineModelRevision
  const storedModel = await loadAiOutlineModel()
  if (!storedModel) return

  const currentState = useWikiStore.getState()
  if (currentState.aiOutlineModelRevision !== expectedRevision) return
  useWikiStore.setState({ aiOutlineModel: storedModel })
}
