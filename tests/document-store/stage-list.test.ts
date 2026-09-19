import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { listDocuments, listLegacyStages, readLegacyStage } = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  listLegacyStages: vi.fn(),
  readLegacyStage: vi.fn(),
}));

vi.mock('@/lib/document-store', () => ({
  getDocumentStore: () => ({ listDocuments }),
  getLegacyDocumentStore: () => ({
    listStages: listLegacyStages,
    read: readLegacyStage,
  }),
}));

vi.mock('@/lib/utils/database', () => ({
  db: { stageFolders: { toArray: () => Promise.resolve([]) } },
}));
vi.mock('@/lib/utils/chat-storage', () => ({
  ChatStorageLockUnavailableError: class extends Error {},
  saveChatSessions: vi.fn(),
  loadChatSessions: vi.fn(),
  deleteChatSessions: vi.fn(),
}));
vi.mock('@/lib/playback/cursor', () => ({ clearCursor: vi.fn() }));
vi.mock('@/lib/quiz/persistence', () => ({ clearAllForScene: vi.fn() }));
vi.mock('@/lib/runtime/store', () => ({ beginStageRuntimeDeletionSafely: vi.fn() }));
vi.mock('@/lib/pbl/v2/runtime/drain', () => ({ clearStageDrainWatermarks: vi.fn() }));
vi.mock('@/lib/utils/chat-storage-lock', () => ({
  withRuntimeStorageExclusiveLockUntilSettled: vi.fn(),
  withRuntimeStorageSharedLock: vi.fn(),
}));

import { listStages } from '@/lib/utils/stage-storage';

describe('legacy stage listing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listDocuments.mockResolvedValue([]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ classrooms: [] }), { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('drops a legacy stage concurrently deleted before its snapshot read', async () => {
    listLegacyStages.mockResolvedValue([
      { id: 'ghost-stage', name: 'Ghost', createdAt: 1_000, updatedAt: 2_000 },
    ]);
    readLegacyStage.mockResolvedValue(null);

    await expect(listStages()).resolves.toEqual([]);
    expect(readLegacyStage).toHaveBeenCalledExactlyOnceWith('ghost-stage');
  });

  it('surfaces document backend failures instead of presenting an empty list', async () => {
    const unavailable = new Error('persistence unavailable');
    listDocuments.mockRejectedValueOnce(unavailable);

    await expect(listStages()).rejects.toBe(unavailable);
    expect(listLegacyStages).not.toHaveBeenCalled();
  });

  it('merges shareable disk classrooms that are not already in the local list', async () => {
    listDocuments.mockResolvedValue([
      { id: 'local-1', name: 'Local', sceneCount: 1, createdAt: 1, updatedAt: 10 },
    ]);
    listLegacyStages.mockResolvedValue([]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe('/api/classroom');
        return new Response(
          JSON.stringify({
            success: true,
            classrooms: [
              {
                id: 'local-1',
                name: 'Should not duplicate',
                sceneCount: 9,
                createdAt: 1,
                updatedAt: 99,
              },
              {
                id: 'XO8XbxdHPw',
                name: '1.1 生物的特征',
                sceneCount: 12,
                createdAt: 2,
                updatedAt: 20,
                firstSlide: { id: 'slide-1', elements: [] },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );

    await expect(listStages()).resolves.toEqual([
      expect.objectContaining({
        id: 'XO8XbxdHPw',
        name: '1.1 生物的特征',
        sceneCount: 12,
        previewSlide: { id: 'slide-1', elements: [] },
      }),
      expect.objectContaining({ id: 'local-1', name: 'Local', sceneCount: 1 }),
    ]);
  });
});
