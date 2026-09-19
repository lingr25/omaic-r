import { describe, expect, it } from 'vitest';

import { DEFAULT_TTS_MODELS, DEFAULT_TTS_VOICES, TTS_PROVIDERS } from '@/lib/audio/constants';

describe('mimo-tts provider registry', () => {
  it('exposes the four classroom clone voices', () => {
    expect(TTS_PROVIDERS['mimo-tts'].voices.map((voice) => voice.id)).toEqual([
      'amiya',
      'rosmontis',
      'angelina',
      'muelsyse',
    ]);
  });

  it('defaults to the voice-clone model', () => {
    expect(DEFAULT_TTS_VOICES['mimo-tts']).toBe('amiya');
    expect(DEFAULT_TTS_MODELS['mimo-tts']).toBe('mimo-v2.5-tts-voiceclone');
    expect(TTS_PROVIDERS['mimo-tts'].requiresApiKey).toBe(true);
  });
});
