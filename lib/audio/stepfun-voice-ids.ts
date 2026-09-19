/**
 * StepFun persistent voice-clone IDs for classroom refs.
 *
 * Official clone audio is 5–10s (not the 3s zero-shot marketing figure).
 * Register once via POST /audio/voices, then every TTS call uses the returned
 * `voice-tone-…` id. Re-sending the wav on each request is what we are
 * avoiding (MiMo zero-shot timbre drift).
 */

import fs from 'fs';
import path from 'path';
import { loadClassroomVoices, readClassroomAudio } from '@/lib/audio/classroom-voices';
import { createLogger } from '@/lib/logger';

const log = createLogger('StepFunVoice');

export const STEPFUN_TTS_MODEL = 'stepaudio-2.5-tts';
export const STEPFUN_DEFAULT_BASE_URL = 'https://api.stepfun.com/step_plan/v1';
export const STEPFUN_CLASSROOM_INSTRUCTION =
  '用自然、清晰的课堂口吻朗读。希腊字母和科学符号要读出来，不要跳过。';

const COMMITTED_MAP_FILE = 'tools/classroom-voices/stepfun-voices.json';
const DISK_CACHE_FILE = 'data/stepfun-voice-ids.json';

export interface StepfunVoiceMapEntry {
  voiceId: string;
  fileHash: string;
  fileId?: string;
}

interface StepfunVoiceMapFile {
  voices?: Record<string, StepfunVoiceMapEntry>;
}

const memory = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

export function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Files live under /v1 even when speech uses /step_plan/v1. */
export function stepfunFilesBaseUrl(speechBase: string): string {
  return stripTrailingSlash(speechBase).replace(/\/step_plan\/v1$/, '/v1');
}

export function isStepfunVendorVoiceId(voiceId: string): boolean {
  return voiceId.startsWith('voice-tone-');
}

function resolveRepoFile(relative: string): string {
  return path.isAbsolute(relative) ? relative : path.resolve(process.cwd(), relative);
}

function readMapFile(file: string): Record<string, StepfunVoiceMapEntry> {
  if (!fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as StepfunVoiceMapFile;
    return parsed.voices && typeof parsed.voices === 'object' ? parsed.voices : {};
  } catch (error) {
    log.warn('Failed to read StepFun voice map', { file, error });
    return {};
  }
}

function writeDiskCache(voices: Record<string, StepfunVoiceMapEntry>): void {
  const file = resolveRepoFile(DISK_CACHE_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const existing = readMapFile(file);
  const merged = { ...existing, ...voices };
  fs.writeFileSync(file, `${JSON.stringify({ voices: merged }, null, 2)}\n`, 'utf-8');
}

/** Lookup a previously registered vendor id when the wav hash still matches. */
export function lookupStepfunVoiceMapping(
  classroomVoiceId: string,
  fileHash: string,
): StepfunVoiceMapEntry | undefined {
  const disk = readMapFile(resolveRepoFile(DISK_CACHE_FILE))[classroomVoiceId];
  if (disk?.voiceId && disk.fileHash === fileHash) return disk;
  const committed = readMapFile(resolveRepoFile(COMMITTED_MAP_FILE))[classroomVoiceId];
  if (committed?.voiceId && committed.fileHash === fileHash) return committed;
  return undefined;
}

async function uploadReferenceWav(opts: {
  filesBase: string;
  apiKey: string;
  bytes: Buffer;
  filename: string;
  signal: AbortSignal;
}): Promise<string> {
  const form = new FormData();
  form.append('purpose', 'storage');
  form.append('file', new Blob([new Uint8Array(opts.bytes)], { type: 'audio/wav' }), opts.filename);
  const response = await fetch(`${opts.filesBase}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.apiKey}` },
    body: form,
    signal: opts.signal,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`StepFun file upload failed (${response.status}): ${text}`);
  }
  const data = (await response.json()) as { id?: string };
  if (!data.id) {
    throw new Error('StepFun file upload returned no file id');
  }
  return data.id;
}

async function createClonedVoice(opts: {
  speechBase: string;
  apiKey: string;
  fileId: string;
  model: string;
  text?: string;
  signal: AbortSignal;
}): Promise<string> {
  const response = await fetch(`${opts.speechBase}/audio/voices`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      file_id: opts.fileId,
      model: opts.model,
      ...(opts.text?.trim() ? { text: opts.text.trim() } : {}),
    }),
    signal: opts.signal,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`StepFun voice clone failed (${response.status}): ${text}`);
  }
  const data = (await response.json()) as { id?: string; duplicated?: boolean };
  if (!data.id) {
    throw new Error('StepFun voice clone returned no voice id');
  }
  if (data.duplicated) {
    log.info('Reused existing StepFun cloned voice', { voiceId: data.id });
  }
  return data.id;
}

/**
 * Resolve a classroom voice (amiya/…) to a persistent StepFun `voice-tone-…`.
 * Clones from the 5–10s classroom wav only when no matching mapping exists.
 */
export async function resolveStepfunVendorVoiceId(opts: {
  voice: string;
  apiKey: string;
  speechBase: string;
  model?: string;
  signal: AbortSignal;
}): Promise<string> {
  const voice = opts.voice.trim();
  if (!voice) {
    throw new Error('StepFun TTS: empty voice');
  }
  if (isStepfunVendorVoiceId(voice)) return voice;

  const entry = loadClassroomVoices()[voice];
  if (!entry) {
    throw new Error(
      `StepFun TTS: unknown voice "${voice}". Register it in tools/classroom-voices/voices.json or pass a voice-tone- id.`,
    );
  }

  const { bytes, hash, abs } = readClassroomAudio(entry.audio_path);
  const memoKey = `${voice}:${hash}`;
  const memoized = memory.get(memoKey);
  if (memoized) return memoized;

  const mapped = lookupStepfunVoiceMapping(voice, hash);
  if (mapped?.voiceId) {
    memory.set(memoKey, mapped.voiceId);
    return mapped.voiceId;
  }

  const pending = inFlight.get(memoKey);
  if (pending) return pending;

  const job = (async () => {
    const filesBase = stepfunFilesBaseUrl(opts.speechBase);
    const fileId = await uploadReferenceWav({
      filesBase,
      apiKey: opts.apiKey,
      bytes,
      filename: path.basename(abs),
      signal: opts.signal,
    });
    const vendorId = await createClonedVoice({
      speechBase: opts.speechBase,
      apiKey: opts.apiKey,
      fileId,
      model: opts.model || STEPFUN_TTS_MODEL,
      text: entry.audio_text,
      signal: opts.signal,
    });
    const record = { voiceId: vendorId, fileHash: hash, fileId };
    try {
      writeDiskCache({ [voice]: record });
    } catch (error) {
      log.warn('Failed to persist StepFun voice id cache', { voice, error });
    }
    memory.set(memoKey, vendorId);
    log.info('Registered StepFun cloned voice', { voice, vendorId });
    return vendorId;
  })();

  inFlight.set(memoKey, job);
  try {
    return await job;
  } finally {
    inFlight.delete(memoKey);
  }
}
