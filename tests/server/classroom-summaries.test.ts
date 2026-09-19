import { describe, expect, it } from 'vitest';

import { summarizeClassroom, type PersistedClassroomData } from '@/lib/server/classroom-storage';

describe('summarizeClassroom', () => {
  it('extracts library fields and the first slide canvas', () => {
    const data = {
      id: 'XO8XbxdHPw',
      createdAt: '2026-09-17T04:45:17.916Z',
      stage: {
        id: 'XO8XbxdHPw',
        name: '1.1 生物的特征',
        createdAt: 1_000,
        updatedAt: 2_000,
      },
      scenes: [
        {
          id: 's1',
          stageId: 'XO8XbxdHPw',
          title: 'Intro',
          order: 0,
          type: 'slide',
          content: {
            type: 'slide',
            canvas: { id: 'c1', viewportSize: 1000, viewportRatio: 0.5625, elements: [] },
          },
        },
      ],
    } as unknown as PersistedClassroomData;

    expect(summarizeClassroom(data)).toEqual({
      id: 'XO8XbxdHPw',
      name: '1.1 生物的特征',
      sceneCount: 1,
      createdAt: 1_000,
      updatedAt: 2_000,
      firstSlide: { id: 'c1', viewportSize: 1000, viewportRatio: 0.5625, elements: [] },
    });
  });

  it('falls back to the persisted createdAt when the stage has no timestamps', () => {
    const data = {
      id: 'abc',
      createdAt: '2026-01-02T00:00:00.000Z',
      stage: { id: 'abc', name: 'Untitled' },
      scenes: [],
    } as unknown as PersistedClassroomData;

    expect(summarizeClassroom(data)).toEqual({
      id: 'abc',
      name: 'Untitled',
      sceneCount: 0,
      createdAt: Date.parse('2026-01-02T00:00:00.000Z'),
      updatedAt: Date.parse('2026-01-02T00:00:00.000Z'),
    });
  });
});
