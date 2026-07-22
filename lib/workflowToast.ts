// Tiny window-event bus connecting "the Workflow Engine just created an
// action" (LeadBoard's drag handler, LeadPanel's First Text / Complete
// handlers) to "show the toast" (WorkflowActionToast, mounted once in
// DashboardClient). A CustomEvent keeps this decoupled from prop-drilling
// through components that otherwise have no reason to know about the
// toast — emitting call sites never need a reference to the toast itself.

export type WorkflowToastAction = {
  id: number
  lead_id: number
  title: string
  due_at: string
  priority: "low" | "medium" | "high"
}

const EVENT_NAME = "workflow-action-created"

export function emitWorkflowActionCreated(action: WorkflowToastAction | null | undefined) {
  if (!action) return
  window.dispatchEvent(new CustomEvent<WorkflowToastAction>(EVENT_NAME, { detail: action }))
}

export function onWorkflowActionCreated(handler: (action: WorkflowToastAction) => void): () => void {
  function listener(e: Event) {
    handler((e as CustomEvent<WorkflowToastAction>).detail)
  }
  window.addEventListener(EVENT_NAME, listener as EventListener)
  return () => window.removeEventListener(EVENT_NAME, listener as EventListener)
}
