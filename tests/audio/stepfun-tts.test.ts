import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { DEFAULT_TTS_MODELS, DEFAULT_TTS_VOICES, TTS_PROVIDERS } from '@/lib/audio/constants';
import { generateTTS } from '@/lib/audio/tts-providers';
import { TTS_COALESCE_SPEECH_PROVIDERS, TTS_MAX_TEXT_LENGTH } from '@/lib/audio/tts-utils';
import { lookupStepfunVoiceMapping, stepfunFilesBaseUrl } from '@/lib/audio/stepfun-voice-ids';
import { loadClassroomVoices, readClassroomAudio } from '@/lib/audio/classroom-voices';
import { useAgentRegistry } from '@/lib/orchestration/registry/store';

const mockFetch = vi.fn() as Mock;
vi.stubGlobal('fetch', mockFetch);

function wavBytes(): ArrayBuffer {
  const data = new Uint8Array(16);
  data[0] = 0x52;
  data[1] = 0x49;
  data[2] = 0x46;
  data[3] = 0x46;
  data[8] = 0x57;
  data[9] = 0x41;
  data[10] = 0x56;
  data[11] = 0x45;
  return data.buffer;
}

describe('stepfun-tts provider registry', () => {
  it('exposes the four classroom clone voices', () => {
    expect(TTS_PROVIDERS['stepfun-tts'].voices.map((voice) => voice.id)).toEqual([
      'amiya',
      'rosmontis',
      'angelina',
      'muelsyse',
    ]);
  });

  it('defaults to the persistent-clone model, not zero-shot per request', () => {
    expect(DEFAULT_TTS_VOICES['stepfun-tts']).toBe('amiya');
    expect(DEFAULT_TTS_MODELS['stepfun-tts']).toBe('stepaudio-2.5-tts');
    expect(TTS_PROVIDERS['stepfun-tts'].requiresApiKey).toBe(true);
    expect(TTS_PROVIDERS['stepfun-tts'].defaultBaseUrl).toBe(
      'https://api.stepfun.com/step_plan/v1',
    );
  });

  it('does not coalesce speech the way MiMo zero-shot does', () => {
    expect(TTS_MAX_TEXT_LENGTH['stepfun-tts']).toBe(1000);
    expect(TTS_COALESCE_SPEECH_PROVIDERS.has('stepfun-tts')).toBe(false);
  });

  it('binds the default classroom roster to stepfun persistent clones', () => {
    const voices = Object.fromEntries(
      useAgentRegistry
        .getState()
        .listAgents()
        .filter((agent) => agent.isDefault)
        .map((agent) => [agent.id, agent.voiceConfig]),
    );
    expect(voices).toMatchObject({
      'default-1': { providerId: 'stepfun-tts', voiceId: 'muelsyse' },
      'default-2': { providerId: 'stepfun-tts', voiceId: 'amiya' },
      'default-3': { providerId: 'stepfun-tts', voiceId: 'rosmontis' },
      'default-4': { providerId: 'stepfun-tts', voiceId: 'angelina' },
    });
  });
});

describe('stepfun voice mapping', () => {
  it('maps each classroom wav to a persistent voice-tone- id when the hash matches', () => {
    const voices = loadClassroomVoices();
    for (const id of ['amiya', 'rosmontis', 'angelina', 'muelsyse'] as const) {
      const hash = readClassroomAudio(voices[id]!.audio_path).hash;
      const mapped = lookupStepfunVoiceMapping(id, hash);
      expect(mapped?.voiceId).toMatch(/^voice-tone-/);
      expect(mapped?.fileHash).toBe(hash);
    }
  });

  it('rewrites /step_plan/v1 files uploads onto /v1', () => {
    expect(stepfunFilesBaseUrl('https://api.stepfun.com/step_plan/v1')).toBe(
      'https://api.stepfun.com/v1',
    );
    expect(stepfunFilesBaseUrl('https://api.stepfun.com/v1/')).toBe('https://api.stepfun.com/v1');
  });
});

describe('StepFun TTS synthesis', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('posts /audio/speech with the enrolled voice-tone- id and never re-sends the wav', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => wavBytes(),
      headers: { get: () => 'audio/wav' },
    });

    const result = await generateTTS(
      {
        providerId: 'stepfun-tts',
        apiKey: 'sk-step',
        voice: 'amiya',
      },
      '大家好，今天我们来讲细胞呼吸。',
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.stepfun.com/step_plan/v1/audio/speech',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('stepaudio-2.5-tts');
    expect(body.input).toBe('大家好，今天我们来讲细胞呼吸。');
    expect(body.voice).toBe('voice-tone-UTrmAPdndo');
    expect(body.response_format).toBe('wav');
    expect(JSON.stringify(body)).not.toMatch(/data:audio/);
    expect(result.format).toBe('wav');
    expect(result.audio.byteLength).toBe(16);
  });

  it('accepts an already-enrolled vendor voice id without consulting the classroom map', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => wavBytes(),
      headers: { get: () => 'audio/wav' },
    });

    await generateTTS(
      {
        providerId: 'stepfun-tts',
        apiKey: 'sk-step',
        voice: 'voice-tone-custom',
      },
      '准备好了。',
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.voice).toBe('voice-tone-custom');
  });

  it('throws on an unknown classroom voice without calling the API', async () => {
    await expect(
      generateTTS({ providerId: 'stepfun-tts', apiKey: 'sk-step', voice: 'not-a-voice' }, 'hi'),
    ).rejects.toThrow(/unknown voice/);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
