import { describe, expect, it } from 'vitest';
import { mergeCurrentModel, normalizeModelRegistry } from '../model-list.js';

describe('mergeCurrentModel', () => {
  const openai = { provider: 'openai', id: 'gpt-4', name: 'GPT-4' };
  const anthropic = { provider: 'anthropic', id: 'claude-3', name: 'Claude 3' };

  it('returns the available list unchanged when no current model is given', () => {
    expect(mergeCurrentModel([openai, anthropic], undefined)).toEqual([openai, anthropic]);
  });

  it('returns the list unchanged when the current model is already present', () => {
    expect(mergeCurrentModel([openai, anthropic], openai)).toEqual([openai, anthropic]);
  });

  it('prepends the current model when it is missing (e.g. a synthesized fallback default)', () => {
    // glm-5.2 is the user's default but is NOT a registered built-in, so it is
    // absent from getAvailable() and must be injected to stay visible/selectable.
    const glmFallback = { provider: 'zai', id: 'glm-5.2', name: 'glm-5.2' };
    const result = mergeCurrentModel([openai, anthropic], glmFallback);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe(glmFallback);
    expect(result.slice(1)).toEqual([openai, anthropic]);
  });

  it('does not duplicate when an available model shares only the name (identity is provider+id)', () => {
    // Two providers can expose a model with the same display name "GLM-5.1";
    // matching must be on provider+id, not name.
    const nvidiaGlm = { provider: 'nvidia', id: 'z-ai/glm-5.1', name: 'GLM-5.1' };
    const sameNameDifferentId = { provider: 'nvidia', id: 'z-ai/glm-5.1', name: 'GLM-5.1' };
    expect(mergeCurrentModel([nvidiaGlm], sameNameDifferentId)).toEqual([nvidiaGlm]);
  });

  it('handles model ids that contain slashes (local / aggregator models)', () => {
    const local = { provider: 'vast-ai', id: 'Qwen/Qwen3.6-27B', name: 'Qwen 3.6-27B' };
    const result = mergeCurrentModel([openai], local);
    expect(result).toEqual([local, openai]);
  });

  it('still surfaces the current model when the available list is empty', () => {
    const glmFallback = { provider: 'zai', id: 'glm-5.2', name: 'glm-5.2' };
    expect(mergeCurrentModel([], glmFallback)).toEqual([glmFallback]);
  });

  it('returns an empty array when there are no models and no current model', () => {
    expect(mergeCurrentModel([], undefined)).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const input = [openai];
    mergeCurrentModel(input, anthropic);
    expect(input).toEqual([openai]);
  });
});

describe('normalizeModelRegistry (version-resilient SDK shapes)', () => {
  it('reads the 0.78.x facade: session.modelRegistry with getAvailable()/refresh()', async () => {
    const refresh = () => {};
    const facade = {
      modelRegistry: {
        refresh,
        getAvailable: () => [
          { provider: 'zai', id: 'glm-5.2', name: 'GLM-5.2' },
          { provider: 'openai', id: 'gpt-4', name: 'GPT-4' },
        ],
      },
    };
    const reg = normalizeModelRegistry(facade)!;
    expect(reg).toBeDefined();
    expect(await reg.getAvailable()).toHaveLength(2);
  });

  it('reads the 0.80.x runtime: session.modelRuntime with getAvailableSnapshot()/reloadConfig()', async () => {
    const runtime = {
      modelRuntime: {
        reloadConfig: () => {},
        getAvailableSnapshot: () => [
          { provider: 'zai', id: 'glm-5.2', name: 'GLM-5.2' },
          { provider: 'openrouter', id: 'z-ai/glm-5.2', name: 'Z.ai: GLM 5.2' },
        ],
        // 0.80.x modelRuntime also has a (different) getAvailable that must NOT be used
        getAvailable: () => undefined,
      },
    };
    const reg = normalizeModelRegistry(runtime)!;
    const models = await reg.getAvailable();
    expect(models).toHaveLength(2);
    expect(models.map((m) => m.id)).toEqual(['glm-5.2', 'z-ai/glm-5.2']);
  });

  it('prefers modelRegistry when both are present (facade is the higher-level API)', async () => {
    const session = {
      modelRegistry: { refresh: () => {}, getAvailable: () => [{ provider: 'a', id: '1' }] },
      modelRuntime: { reloadConfig: () => {}, getAvailableSnapshot: () => [{ provider: 'b', id: '2' }] },
    };
    expect((await normalizeModelRegistry(session)!.getAvailable()).map((m) => m.id)).toEqual(['1']);
  });

  it('returns undefined when the session exposes neither property', () => {
    expect(normalizeModelRegistry({})).toBeUndefined();
    expect(normalizeModelRegistry(undefined)).toBeUndefined();
  });

  it('returns [] when neither getAvailable nor getAvailableSnapshot exists', async () => {
    const reg = normalizeModelRegistry({ modelRuntime: { reloadConfig: () => {} } })!;
    expect(await reg.getAvailable()).toEqual([]);
  });

  it('coerces a non-array result to []', async () => {
    const reg = normalizeModelRegistry({ modelRuntime: { getAvailableSnapshot: () => undefined } })!;
    expect(await reg.getAvailable()).toEqual([]);
  });

  it('refresh() prefers reloadConfig(), falls back to refresh()', () => {
    const calls: string[] = [];
    const regRuntime = normalizeModelRegistry({ modelRuntime: { reloadConfig: () => calls.push('reload'), getAvailableSnapshot: () => [] } })!;
    regRuntime.refresh();
    const regFacade = normalizeModelRegistry({ modelRegistry: { refresh: () => calls.push('refresh'), getAvailable: () => [] } })!;
    regFacade.refresh();
    expect(calls).toEqual(['reload', 'refresh']);
  });
});
