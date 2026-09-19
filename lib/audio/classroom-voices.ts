/**
 * Classroom reference-voice registry (tools/classroom-voices/).
 *
 * Server-only: reads wavs from disk. TTS providers that clone those samples
 * (MiMo zero-shot, StepFun persistent clone) share this loader.
 */

import { createHash } from 'node:crypto';
import fs from 'fs';
import path from 'path';

export interface ClassroomVoiceEntry {
  name?: string;
  language?: string;
  audio_path: string;
  audio_text?: string;
}

const CLASSROOM_VOICES_FILE = 'tools/classroom-voices/voices.json';

export function classroomVoicesFilePath(): string {
  return path.isAbsolute(CLASSROOM_VOICES_FILE)
    ? CLASSROOM_VOICES_FILE
    : path.resolve(process.cwd(), CLASSROOM_VOICES_FILE);
}

export function loadClassroomVoices(): Record<string, ClassroomVoiceEntry> {
  const file = classroomVoicesFilePath();
  const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as {
    voices?: Record<string, ClassroomVoiceEntry>;
  };
  if (!parsed.voices || typeof parsed.voices !== 'object') {
    throw new Error(`Classroom voice registry has no "voices" object: ${file}`);
  }
  return parsed.voices;
}

export function resolveClassroomAudioPath(audioPath: string): string {
  return path.isAbsolute(audioPath) ? audioPath : path.resolve(process.cwd(), audioPath);
}

export function readClassroomAudio(audioPath: string): { bytes: Buffer; hash: string; abs: string } {
  const abs = resolveClassroomAudioPath(audioPath);
  const bytes = fs.readFileSync(abs);
  const hash = createHash('sha256').update(bytes).digest('hex');
  return { bytes, hash, abs };
}
