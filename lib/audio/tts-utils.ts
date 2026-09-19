/**
 * Shared TTS utilities used by both client-side and server-side generation.
 */

import type { TTSProviderId } from './types';
import type { Action, SpeechAction } from '@/lib/types/action';
import { createLogger } from '@/lib/logger';

const log = createLogger('TTS');

/**
 * Provider-specific max text length limits.
 *
 * MiMo's published limit is an 8K context/output window, not a character
 * cap. In practice a clone call also re-sends ~1MB of reference audio and
 * sits in a shared queue, so the bound is a timeout budget: ~90 CJK chars
 * synthesized in ~7s when warm → 800 chars stays inside the 120s request
 * timeout even with a sluggish queue.
 */
export const TTS_MAX_TEXT_LENGTH: Partial<Record<TTSProviderId, number>> = {
  'glm-tts': 1024,
  'mimo-tts': 800,
  'stepfun-tts': 1000,
};

/**
 * Providers whose per-request overhead (queue + re-sending a clone sample)
 * dominates inference. Consecutive speech actions with no visual in between
 * are merged up to {@link TTS_MAX_TEXT_LENGTH} so we fire fewer requests.
 */
export const TTS_COALESCE_SPEECH_PROVIDERS = new Set<TTSProviderId>(['mimo-tts']);

/**
 * Split long text into chunks that respect sentence boundaries.
 * Tries splitting at sentence-ending punctuation first, then clause-level
 * punctuation, and finally hard-splits at maxLength as a last resort.
 */
export function splitLongSpeechText(text: string, maxLength: number): string[] {
  const normalized = text.trim();
  if (!normalized || normalized.length <= maxLength) return [normalized];

  const units = normalized
    .split(/(?<=[。！？!?；;：:\n])/u)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  const pushChunk = (value: string) => {
    const trimmed = value.trim();
    if (trimmed) chunks.push(trimmed);
  };

  const appendUnit = (unit: string) => {
    if (!current) {
      current = unit;
      return;
    }
    if ((current + unit).length <= maxLength) {
      current += unit;
      return;
    }
    pushChunk(current);
    current = unit;
  };

  const hardSplitUnit = (unit: string) => {
    const parts = unit.split(/(?<=[，,、])/u).filter(Boolean);
    if (parts.length > 1) {
      for (const part of parts) {
        if (part.length <= maxLength) appendUnit(part);
        else hardSplitUnit(part);
      }
      return;
    }

    let start = 0;
    while (start < unit.length) {
      appendUnit(unit.slice(start, start + maxLength));
      start += maxLength;
    }
  };

  for (const unit of units.length > 0 ? units : [normalized]) {
    if (unit.length <= maxLength) appendUnit(unit);
    else hardSplitUnit(unit);
  }

  pushChunk(current);
  return chunks;
}

/**
 * Split long speech actions into multiple shorter actions so each stays
 * within the TTS provider's text length limit. Each sub-action gets its
 * own independent audio file — no byte concatenation needed.
 */
function canCoalesceSpeech(previous: SpeechAction, next: SpeechAction, maxLength: number): boolean {
  if (!previous.text || !next.text) return false;
  if (previous.voice && next.voice && previous.voice !== next.voice) return false;
  if (previous.speed != null && next.speed != null && previous.speed !== next.speed) return false;
  return previous.text.length + next.text.length <= maxLength;
}

/**
 * Fold adjacent speech actions (no spotlight/laser/whiteboard in between) into
 * one line, up to `maxLength`. Visual actions remain hard boundaries so stage
 * timing stays aligned.
 */
export function mergeConsecutiveSpeechActions(actions: Action[], maxLength: number): Action[] {
  if (!Number.isFinite(maxLength) || maxLength <= 0 || actions.length < 2) return actions;

  const merged: Action[] = [];
  for (const action of actions) {
    const previous = merged.at(-1);
    if (
      previous?.type === 'speech' &&
      action.type === 'speech' &&
      canCoalesceSpeech(previous, action, maxLength)
    ) {
      previous.text += action.text;
      continue;
    }
    merged.push(action.type === 'speech' ? { ...action } : action);
  }
  return merged;
}

/**
 * Provider-aware prep: merge short consecutive lines where queue cost dominates,
 * then split anything still over the provider cap.
 */
export function prepareSpeechActionsForTts(actions: Action[], providerId: TTSProviderId): Action[] {
  const maxLength = TTS_MAX_TEXT_LENGTH[providerId];
  const coalesced =
    TTS_COALESCE_SPEECH_PROVIDERS.has(providerId) && maxLength
      ? mergeConsecutiveSpeechActions(actions, maxLength)
      : actions;
  return splitLongSpeechActions(coalesced, providerId);
}

export function splitLongSpeechActions(actions: Action[], providerId: TTSProviderId): Action[] {
  const maxLength = TTS_MAX_TEXT_LENGTH[providerId];
  if (!maxLength) return actions;

  let didSplit = false;
  const nextActions: Action[] = actions.flatMap((action) => {
    if (action.type !== 'speech' || !action.text || action.text.length <= maxLength)
      return [action];

    const chunks = splitLongSpeechText(action.text, maxLength);
    if (chunks.length <= 1) return [action];
    didSplit = true;
    const { audioId: _audioId, ...baseAction } = action as SpeechAction;

    log.info(
      `Split speech for ${providerId}: action=${action.id}, len=${action.text.length}, chunks=${chunks.length}`,
    );
    return chunks.map((chunk, i) => ({
      ...baseAction,
      id: `${action.id}_tts_${i + 1}`,
      text: chunk,
    }));
  });
  return didSplit ? nextActions : actions;
}
