import { describe, expect, it } from 'vitest';

import {
  splitLongSpeechText,
  splitLongSpeechActions,
  mergeConsecutiveSpeechActions,
  prepareSpeechActionsForTts,
  TTS_MAX_TEXT_LENGTH,
} from '@/lib/audio/tts-utils';
import type { Action, SpeechAction } from '@/lib/types/action';

const speech = (id: string, text: string): SpeechAction =>
  ({ id, type: 'speech', text }) as SpeechAction;

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

  it('keeps a typical lecture paragraph as one mimo-tts request', () => {
    const max = TTS_MAX_TEXT_LENGTH['mimo-tts']!;
    expect(max).toBe(800);
    const lecture =
      '同学们，我们先来回顾一下上节课的内容。生态系统由生物群落和非生物环境两部分组成，它们之间通过能量流动和物质循环紧密联系在一起。';
    const out = splitLongSpeechActions([speech('a', lecture)], 'mimo-tts') as SpeechAction[];
    expect(out).toHaveLength(1);
    expect(out[0]!.text).toBe(lecture);
  });
});

describe('mergeConsecutiveSpeechActions', () => {
  it('joins adjacent speech lines up to the cap', () => {
    const out = mergeConsecutiveSpeechActions(
      [speech('a', '第一句。'), speech('b', '第二句。'), speech('c', '第三句。')],
      20,
    ) as SpeechAction[];
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe('a');
    expect(out[0]!.text).toBe('第一句。第二句。第三句。');
  });

  it('stops at a visual action so spotlight timing stays intact', () => {
    const spotlight = { id: 'sp', type: 'spotlight' } as Action;
    const out = mergeConsecutiveSpeechActions(
      [speech('a', '先看这里。'), spotlight, speech('b', '再看那里。')],
      100,
    );
    expect(out.map((action) => action.id)).toEqual(['a', 'sp', 'b']);
  });

  it('does not merge when the combined text would exceed the cap', () => {
    const out = mergeConsecutiveSpeechActions(
      [speech('a', '12345'), speech('b', '67890')],
      8,
    ) as SpeechAction[];
    expect(out).toHaveLength(2);
  });
});

describe('prepareSpeechActionsForTts', () => {
  it('coalesces short mimo-tts lines that other providers keep split', () => {
    const actions = [speech('a', '第一句。'), speech('b', '第二句。')];
    const mimo = prepareSpeechActionsForTts(actions, 'mimo-tts') as SpeechAction[];
    const openai = prepareSpeechActionsForTts(actions, 'openai-tts') as SpeechAction[];
    expect(mimo).toHaveLength(1);
    expect(mimo[0]!.text).toBe('第一句。第二句。');
    expect(openai).toHaveLength(2);
    const stepfun = prepareSpeechActionsForTts(actions, 'stepfun-tts') as SpeechAction[];
    expect(stepfun).toHaveLength(2);
  });
});
