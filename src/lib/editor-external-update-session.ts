type EditorExternalUpdateHandler = (path: string, candidateContent: string) => Promise<boolean>

let activeHandler: EditorExternalUpdateHandler | null = null

export function registerEditorExternalUpdateHandler(handler: EditorExternalUpdateHandler): () => void {
  activeHandler = handler
  return () => {
    if (activeHandler === handler) activeHandler = null
  }
}

export async function requestEditorExternalChapterBodyUpdate(
  path: string,
  candidateContent: string,
): Promise<boolean> {
  if (!activeHandler) return false
  return activeHandler(path, candidateContent)
}