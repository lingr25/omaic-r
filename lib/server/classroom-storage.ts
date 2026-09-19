import { promises as fs } from 'fs';
import path from 'path';
import type { NextRequest } from 'next/server';
import type { Slide } from '@openmaic/dsl';
import type { Scene, Stage } from '@/lib/types/stage';

export const CLASSROOMS_DIR = path.join(process.cwd(), 'data', 'classrooms');
export const CLASSROOM_JOBS_DIR = path.join(process.cwd(), 'data', 'classroom-jobs');

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function ensureClassroomsDir() {
  await ensureDir(CLASSROOMS_DIR);
}

export async function ensureClassroomJobsDir() {
  await ensureDir(CLASSROOM_JOBS_DIR);
}

function isReplaceBusyError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException)?.code;
  return code === 'EPERM' || code === 'EEXIST' || code === 'EACCES' || code === 'EBUSY';
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const REPLACE_RETRY_DELAYS_MS = [0, 50, 150, 400, 800];

/**
 * Windows `rename` cannot replace an existing file (EPERM/EEXIST) the way
 * POSIX rename does. Antivirus/indexer locks make this worse for job files
 * that are rewritten every progress tick. Fall back to copy+unlink and retry.
 */
async function replaceFile(tempFilePath: string, filePath: string) {
  try {
    await fs.rename(tempFilePath, filePath);
    return;
  } catch (error) {
    if (!isReplaceBusyError(error)) throw error;
  }

  await fs.copyFile(tempFilePath, filePath);
  await fs.unlink(tempFilePath).catch(() => undefined);
}

export async function writeJsonFileAtomic(filePath: string, data: unknown) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);

  const tempFilePath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(tempFilePath, content, 'utf-8');

  let lastError: unknown;
  for (const delay of REPLACE_RETRY_DELAYS_MS) {
    if (delay > 0) await sleep(delay);
    try {
      await replaceFile(tempFilePath, filePath);
      return;
    } catch (error) {
      lastError = error;
      if (!isReplaceBusyError(error)) {
        await fs.unlink(tempFilePath).catch(() => undefined);
        throw error;
      }
    }
  }

  await fs.unlink(tempFilePath).catch(() => undefined);
  throw lastError;
}

export function buildRequestOrigin(req: NextRequest): string {
  return req.headers.get('x-forwarded-host')
    ? `${req.headers.get('x-forwarded-proto') || 'http'}://${req.headers.get('x-forwarded-host')}`
    : req.nextUrl.origin;
}

export interface PersistedClassroomData {
  id: string;
  stage: Stage;
  scenes: Scene[];
  createdAt: string;
}

/**
 * Homepage / library card for a classroom that lives on disk under
 * `data/classrooms/` (the generate-classroom API persist path). Distinct from
 * the browser IndexedDB / owner document-store listing: those two stores are
 * not the same, so a batch-generated classroom is invisible until it is
 * merged into the home list.
 */
export interface ClassroomSummary {
  id: string;
  name: string;
  description?: string;
  sceneCount: number;
  createdAt: number;
  updatedAt: number;
  interactiveMode?: boolean;
  taskEngineMode?: boolean;
  firstSlide?: Slide;
}

function toTimestamp(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function firstSlideCanvas(scenes: readonly Scene[]): Slide | undefined {
  for (const scene of scenes) {
    if (scene.content?.type === 'slide') return scene.content.canvas;
  }
  return undefined;
}

export function summarizeClassroom(data: PersistedClassroomData): ClassroomSummary {
  const createdAt = toTimestamp(data.stage?.createdAt, toTimestamp(data.createdAt, 0));
  const updatedAt = toTimestamp(data.stage?.updatedAt, createdAt);
  const firstSlide = firstSlideCanvas(data.scenes ?? []);
  return {
    id: data.id,
    name: data.stage?.name || data.id,
    ...(data.stage?.description ? { description: data.stage.description } : {}),
    sceneCount: Array.isArray(data.scenes) ? data.scenes.length : 0,
    createdAt,
    updatedAt,
    ...(data.stage?.interactiveMode ? { interactiveMode: true } : {}),
    ...(data.stage?.taskEngineMode ? { taskEngineMode: true } : {}),
    ...(firstSlide ? { firstSlide } : {}),
  };
}

export function isValidClassroomId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

/**
 * Resolve the on-disk JSON path for a classroom id, asserting the result stays
 * inside CLASSROOMS_DIR. The route validates ids up front, but storage must
 * not trust callers: an id carrying path separators (e.g. `..`) must never be
 * allowed to name a file outside the classrooms directory.
 */
export function resolveClassroomFilePath(id: string): string {
  const resolvedRoot = path.resolve(CLASSROOMS_DIR);
  const filePath = path.resolve(resolvedRoot, `${id}.json`);
  const rootPrefix = `${resolvedRoot}${path.sep}`;
  if (filePath !== resolvedRoot && !filePath.startsWith(rootPrefix)) {
    throw new Error(`Classroom id "${id}" resolves outside the classrooms directory`);
  }
  return filePath;
}

export async function readClassroom(id: string): Promise<PersistedClassroomData | null> {
  const filePath = resolveClassroomFilePath(id);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as PersistedClassroomData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function listClassroomSummaries(): Promise<ClassroomSummary[]> {
  await ensureClassroomsDir();
  let names: string[];
  try {
    names = await fs.readdir(CLASSROOMS_DIR);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const items: ClassroomSummary[] = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const id = name.slice(0, -'.json'.length);
    if (!isValidClassroomId(id)) continue;
    try {
      const data = await readClassroom(id);
      if (!data?.id) continue;
      items.push(summarizeClassroom(data));
    } catch {
      // Skip unreadable or corrupt files so one bad classroom cannot blank the list.
    }
  }
  return items.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function persistClassroom(
  data: {
    id: string;
    stage: Stage;
    scenes: Scene[];
  },
  baseUrl: string,
): Promise<PersistedClassroomData & { url: string }> {
  const classroomData: PersistedClassroomData = {
    id: data.id,
    stage: data.stage,
    scenes: data.scenes,
    createdAt: new Date().toISOString(),
  };

  const filePath = resolveClassroomFilePath(data.id);
  await ensureClassroomsDir();
  await writeJsonFileAtomic(filePath, classroomData);

  return {
    ...classroomData,
    url: `${baseUrl}/classroom/${data.id}`,
  };
}
