/**
 * Helpers for building the `model_list` payload broadcast to bridge clients
 * (e.g. the Chrome side-panel extension).
 *
 * Models are identified by the canonical `provider` + `id` pair (see
 * `@earendil-works/pi-coding-agent` model resolution). Note that *both* the
 * provider name and the model id may contain slashes (e.g. provider
 * `vercel-ai-gateway` with id `zai/glm-5.1`, or a local model id
 * `Qwen/Qwen3.6-27B`), so consumers must never parse them with `split('/')`.
 */

/** Minimal shape of a model object used for list building. */
export interface ModelLike {
  provider: string;
  id: string;
  name?: string;
}

/**
 * Ensure the session's currently active model is present in the list that gets
 * sent to clients.
 *
 * The active model is not guaranteed to be part of `modelRegistry.getAvailable()`:
 * when a default model id does not exactly match a registered built-in (e.g.
 * `zai/glm-5.2` where only `glm-5`/`glm-5.1` are registered), the agent resolves
 * it to a synthesized *fallback* model that lives on `session.model` but is never
 * added to the registry. Without this merge, the active/default model is
 * invisible — and unselectable — in the extension's model picker.
 *
 * Identity is matched on `provider` + `id` (the canonical key), never on `name`,
 * since multiple models across providers frequently share a display name.
 */
export function mergeCurrentModel<T extends ModelLike>(
  availableModels: readonly T[],
  currentModel: T | undefined,
): T[] {
  if (!currentModel) return [...availableModels];
  const present = availableModels.some(
    (m) => m.provider === currentModel.provider && m.id === currentModel.id,
  );
  return present ? [...availableModels] : [currentModel, ...availableModels];
}
