import { describe, expect, it } from 'vitest';

import {
  splitLongSpeechText,
  splitLongSpeechActions,
  TTS_MAX_TEXT_LENGTH,
  ensureGenieSentenceTerminator,
} from '@/lib/audio/tts-utils';
import type { Action, SpeechAction } from '@/lib/types/action';

describe('splitLongSpeechText', () => {
  it('returns the trimmed text unchanged when within the limit', () => {
    expect(splitLongSpeechText('  hello world  ', 100)).toEqual(['hello world']);
  });

  it('splits at sentence boundaries, keeping the punctuation', () => {
    expect(splitLongSpeechText('句子一。句子二！句子三？', 6)).toEqual([
      '句子一。',
      '句子二！',
      '句子三？',
    ]);
  });

  it('packs consecutive short sentences up to the limit', () => {
    const out = splitLongSpeechText('aa。bb。cc。dd。', 6);
    expect(out).toEqual(['aa。bb。', 'cc。dd。']);
    expect(out.join('')).toBe('aa。bb。cc。dd。');
  });

  it('falls back to clause punctuation for an over-long sentence', () => {
    const out = splitLongSpeechText('一，二，三，四，五', 4);
    expect(out.every((c) => c.length <= 4)).toBe(true);
    expect(out.join('').replace(/，/g, '')).toContain('一');
  });

  it('hard-splits a long run with no punctuation', () => {
    expect(splitLongSpeechText('x'.repeat(25), 10)).toEqual(['xxxxxxxxxx', 'xxxxxxxxxx', 'xxxxx']);
  });

  it('never emits a chunk longer than maxLength, nor an empty chunk (invariant)', () => {
    const text = '这是一个很长的句子，包含很多子句、标点。'.repeat(50) + 'z'.repeat(120);
    for (const max of [8, 16, 64, 200]) {
      const out = splitLongSpeechText(text, max);
      expect(
        out.every((c) => c.length <= max),
        `max=${max}`,
      ).toBe(true);
      expect(
        out.some((c) => c.length === 0),
        `max=${max}`,
      ).toBe(false);
    }
  });
});

describe('splitLongSpeechActions', () => {
  const speech = (id: string, text: string): SpeechAction =>
    ({ id, type: 'speech', text }) as SpeechAction;

  it('returns actions untouched for a provider with no length limit', () => {
    const actions: Action[] = [speech('a', 'x'.repeat(5000))];
    expect(splitLongSpeechActions(actions, 'openai-tts')).toBe(actions);
  });

  it('leaves short speech and non-speech actions unchanged', () => {
    const actions: Action[] = [speech('s', 'short'), { id: 'sp', type: 'spotlight' } as Action];
    expect(splitLongSpeechActions(actions, 'glm-tts')).toBe(actions);
  });

  it('splits an over-limit speech action into chunked sub-actions', () => {
    const max = TTS_MAX_TEXT_LENGTH['glm-tts']!; // 1024
    const long = '句子。'.repeat(400); // 1200 chars > 1024
    const out = splitLongSpeechActions([speech('a', long)], 'glm-tts') as SpeechAction[];

    expect(out.length).toBeGreaterThan(1);
    expect(out.every((a) => a.type === 'speech' && a.text.length <= max)).toBe(true);
    // deterministic sub-action ids…
    expect(out.map((a) => a.id)).toEqual(out.map((_, i) => `a_tts_${i + 1}`));
    // …each gets its own audio (the parent audioId is dropped)…
    expect(out.every((a) => a.audioId === undefined)).toBe(true);
    // …and the text is preserved across the split.
    expect(out.map((a) => a.text).join('')).toBe(long);
  });

  it('splits genie-tts lecture lines at the tight ~24-char cap', () => {
    const max = TTS_MAX_TEXT_LENGTH['genie-tts']!;
    expect(max).toBe(24);
    const lecture =
      '同学们，我们先来回顾一下上节课的内容。生态系统由生物群落和非生物环境两部分组成，它们之间通过能量流动和物质循环紧密联系在一起。';
    const out = splitLongSpeechActions([speech('a', lecture)], 'genie-tts') as SpeechAction[];
    expect(out.length).toBeGreaterThan(1);
    expect(out.every((a) => a.text.length <= max)).toBe(true);
    expect(out.map((a) => a.text).join('')).toBe(lecture);
  });
});

describe('ensureGenieSentenceTerminator', () => {
  it('leaves a sentence that already ends with a terminator unchanged', () => {
    expect(ensureGenieSentenceTerminator('今天要重点讨论分解者的作用。')).toBe(
      '今天要重点讨论分解者的作用。',
    );
    expect(ensureGenieSentenceTerminator('真的吗？')).toBe('真的吗？');
  });

  it('appends a period when the line has no terminator', () => {
    expect(ensureGenieSentenceTerminator('今天要重点讨论分解者的作用')).toBe(
      '今天要重点讨论分解者的作用。',
    );
  });

  it('promotes a trailing clause mark to a period', () => {
    expect(ensureGenieSentenceTerminator('今天要重点讨论分解者的作用，')).toBe(
      '今天要重点讨论分解者的作用。',
    );
  });
});
