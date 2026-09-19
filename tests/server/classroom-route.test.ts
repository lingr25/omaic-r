import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// POST /api/classroom must reject an id that would escape the classrooms
// directory before any persistence happens, and must keep accepting generated
// uuids and ordinary allowlisted ids.

const mocks = vi.hoisted(() => ({
  persistClassroom: vi.fn(),
  readClassroom: vi.fn(),
  listClassroomSummaries: vi.fn(),
}));

vi.mock('@/lib/server/classroom-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/classroom-storage')>();
  return {
    ...actual,
    persistClassroom: mocks.persistClassroom,
    readClassroom: mocks.readClassroom,
    listClassroomSummaries: mocks.listClassroomSummaries,
  };
});

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

function postClassroom(stage: Record<string, unknown>, scenes: unknown[] = []) {
  const request = new NextRequest('http://localhost/api/classroom', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ stage, scenes }),
  });
  return request;
}

describe('POST /api/classroom — id validation before persistence', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.persistClassroom.mockReset();
    mocks.readClassroom.mockReset();
    mocks.persistClassroom.mockImplementation(async ({ id }: { id: string }) => ({
      id,
      url: `http://localhost/classroom/${id}`,
    }));
  });

  it('returns 400 for a traversal-style stage id and never persists', async () => {
    const { POST } = await import('@/app/api/classroom/route');

    const res = await POST(
      postClassroom({
        id: '../../../../tmp/openmaic-escape',
        title: 'Lesson',
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toMatchObject({
      success: false,
      errorCode: 'INVALID_REQUEST',
      error: 'Invalid classroom id',
    });
    expect(mocks.persistClassroom).not.toHaveBeenCalled();
  });

  it('accepts an omitted stage id and persists with a generated uuid', async () => {
    const { POST } = await import('@/app/api/classroom/route');

    const res = await POST(
      postClassroom(
        {
          title: 'Lesson',
          type: 'slide',
        },
        [
          {
            id: 'scene-1',
            stageId: 'classroom-1',
            title: 'Scene 1',
            order: 0,
            type: 'slide',
            content: { type: 'slide', canvas: {} },
          },
        ],
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json).toMatchObject({ success: true });
    expect(typeof json.id).toBe('string');
    expect(mocks.persistClassroom).toHaveBeenCalledTimes(1);
    const [persisted] = mocks.persistClassroom.mock.calls[0];
    expect(persisted.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(persisted.stage.id).toBe(persisted.id);
  });

  it('still persists an ordinary allowlisted id', async () => {
    const { POST } = await import('@/app/api/classroom/route');

    const res = await POST(
      postClassroom(
        {
          id: 'abc-123_XY',
          title: 'Lesson',
        },
        [
          {
            id: 'scene-1',
            stageId: 'abc-123_XY',
            title: 'Scene 1',
            order: 0,
            type: 'slide',
            content: { type: 'slide', canvas: {} },
          },
        ],
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json).toMatchObject({ success: true, id: 'abc-123_XY' });
    expect(mocks.persistClassroom).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'abc-123_XY' }),
      'http://localhost',
    );
  });
});

describe('GET /api/classroom — list shareable classrooms', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.listClassroomSummaries.mockReset();
  });

  it('lists disk classrooms when no id is provided', async () => {
    mocks.listClassroomSummaries.mockResolvedValue([
      {
        id: 'XO8XbxdHPw',
        name: '1.1 生物的特征',
        sceneCount: 12,
        createdAt: 100,
        updatedAt: 200,
        firstSlide: {
          id: 'slide-1',
          viewportSize: 1000,
          viewportRatio: 0.5625,
          elements: [
            {
              type: 'text',
              id: 'el-1',
              content: '<p>hello</p>',
              left: 0,
              top: 0,
              width: 100,
              height: 40,
              rotate: 0,
              defaultFontName: 'Microsoft YaHei',
              defaultColor: '#333',
            },
          ],
        },
      },
    ]);

    const { GET } = await import('@/app/api/classroom/route');
    const res = await GET(new NextRequest('http://localhost/api/classroom'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.classrooms).toEqual([
      expect.objectContaining({
        id: 'XO8XbxdHPw',
        name: '1.1 生物的特征',
        sceneCount: 12,
      }),
    ]);
    expect(mocks.listClassroomSummaries).toHaveBeenCalledTimes(1);
  });
});
