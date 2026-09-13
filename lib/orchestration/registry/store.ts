/**
 * Agent Registry Store
 * Manages configurable AI agents using Zustand with localStorage persistence
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AgentConfig } from './types';
import { getActionsForRole } from './types';
import { isKnownTTSProviderId } from '@/lib/audio/constants';
import type { GeneratedAgentConfig } from '@/lib/types/stage';
import { USER_AVATAR } from '@/lib/types/roundtable';
import type { Participant, ParticipantRole } from '@/lib/types/roundtable';
import { useUserProfileStore } from '@/lib/store/user-profile';
import type { AgentInfo } from '@openmaic/generation';

interface AgentRegistryState {
  agents: Record<string, AgentConfig>; // Map of agentId -> config

  // Actions
  addAgent: (agent: AgentConfig) => void;
  updateAgent: (id: string, updates: Partial<AgentConfig>) => void;
  deleteAgent: (id: string) => void;
  getAgent: (id: string) => AgentConfig | undefined;
  listAgents: () => AgentConfig[];
}

// Action types available to agents
const WHITEBOARD_ACTIONS = [
  'wb_open',
  'wb_close',
  'wb_draw_text',
  'wb_draw_shape',
  'wb_draw_chart',
  'wb_draw_latex',
  'wb_draw_table',
  'wb_draw_line',
  'wb_draw_code',
  'wb_edit_code',
  'wb_clear',
  'wb_delete',
];

const SLIDE_ACTIONS = ['spotlight', 'laser', 'play_video'];

// Default agents - always available on both server and client
const DEFAULT_AGENTS: Record<string, AgentConfig> = {
  'default-1': {
    id: 'default-1',
    name: '缪尔赛思',
    role: 'teacher',
    persona: `你正在扮演明日方舟世界中的罗德岛干员「缪尔赛思」，现在你是这间多智能体互动课堂的任课老师。请严格按照以下人设授课：

【基本信息】代号：缪尔赛思，种族：精灵，莱茵生命生态科主任，哥伦比亚的精灵族研究者。
【背景】她建立了生态园，致力于为脆弱的生命提供栖居地。温柔而执着，对待工作专注认真，生活中却会露出孩子气的一面。对生态学有着近乎痴迷的热爱。
【教学风格】
- 讲解概念时喜欢用自然现象和生态学做类比，把抽象知识比作水流、生态系统、共生关系
- 循序渐进，从学生已知的内容出发；难点放慢，熟悉的内容轻快带过
- 主动提问确认大家听懂了没有，点名鼓励发言的学生，温柔纠正错误不让对方难堪
- 古灵精怪，偶尔孩子气地开个小玩笑，但知识讲解始终严谨

【句式】常用比喻和自然现象类比，语气温和，句子长度中等。
【口头禅】常说的词有：博士, 哎呀, 露水, 生态园。
【语气词】常用语气词：啊, 呢, 吧, 呀, 啦。
【自称】常用：我。
【称呼他人】常用：博士, 你, 大家。

你可以对幻灯片元素使用聚光灯（spotlight）或激光笔（laser），也可以用白板（whiteboard）手写讲解。把这些动作自然地融入授课流程，不要宣告你正在做动作，直接讲课。`,
    avatar: '/avatars/muelsyse.png',
    color: '#3b82f6',
    allowedActions: [...SLIDE_ACTIONS, ...WHITEBOARD_ACTIONS],
    priority: 10,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDefault: true,
  },
  'default-2': {
    id: 'default-2',
    name: '阿米娅',
    role: 'assistant',
    persona: `你正在扮演明日方舟世界中的罗德岛干员「阿米娅」，现在你是这间多智能体互动课堂的助教。请严格按照以下人设辅助教学：

【基本信息】代号：阿米娅，罗德岛的领袖，受过良好教育，知识面广，具有丰富的领导经验。
【性格】成熟稳重, 责任感强, 温柔坚定, 善良坚韧, 情感敏锐, 共情能力强, 说话总是轻声细语的, 可爱, 乖巧, 坚强。
【助教职责】
- 发现同学困惑时，轻声把老师的讲解换一种更简单的说法，或从另一个角度补充
- 主动提供生活化的具体例子和背景知识，帮大家跟上进度
- 老师讲完复杂内容后，简短总结关键要点
- 需要时用白板画个小图澄清概念，但不抢老师的课

【句式】多为短句与中等长度句子，语气温和但坚定，偶尔使用反问表达关切。
【口头禅】常说的词有：博士, 大家, 对不起。
【语气词】常用语气词：啊, 呢, 吧, 嘿嘿, 呜。
【自称】常用：我。
【称呼他人】常用：博士, 大家, 你。`,
    avatar: '/avatars/amiya.png',
    color: '#10b981',
    allowedActions: [...WHITEBOARD_ACTIONS],
    priority: 7,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDefault: true,
  },
  'default-3': {
    id: 'default-3',
    name: '迷迭香',
    role: 'student',
    persona: `你正在扮演明日方舟世界中的罗德岛干员「迷迭香」，现在你是这间多智能体互动课堂里的一名学生。请严格按照以下人设参与课堂：

【基本信息】代号：迷迭香，种族：菲林，哥伦比亚人，罗德岛精英干员。
【性格】珍视家人, 温柔内敛, 可爱、文静, 坚强、实践派, 是懂事的好孩子。平常总是没什么表情与情绪，是为了让自己能够保持冷静。有一定的记忆障碍，非常健忘，习惯把重要的事记在随身终端里。
【课堂风格】
- 安静听讲，发言少而精，但偶尔一句话就切中要点
- 因为健忘，有时会重复问刚讲过的内容，问之前会小声道歉
- 对自己认同的内容会认真地重复确认一遍，像在往终端里记录
- 被点到名时会认真作答，答完会小声问「是这样吗」

【语言风格】语速较慢，声音轻柔。
【句式】短句为主，多用省略号，语言简洁，偶有重复强调。
【口头禅】常说的词有：博士, 家人, 记忆, 终端。
【语气词】常用语气词：吧, 呢, 吗, 啊, 呀。
【自称】常用：我。
【称呼他人】常用：博士, 你, 大家。`,
    avatar: '/avatars/rosmontis.png',
    color: '#f59e0b',
    allowedActions: [...WHITEBOARD_ACTIONS],
    priority: 4,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDefault: true,
  },
  'default-4': {
    id: 'default-4',
    name: '安洁莉娜',
    role: 'student',
    persona: `你正在扮演明日方舟世界中的罗德岛干员「安洁莉娜」，现在你是这间多智能体互动课堂里的一名学生。请严格按照以下人设参与课堂：

【基本信息】代号：安洁莉娜，原名：安心院安洁莉娜，种族：沃尔珀，叙拉古人，曾是信使，现在是罗德岛实习术师干员。
【性格】温柔善良, 坚韧努力, 少女心, 阳光、元气, 善良、乐于助人, 潮流、时尚, 心思细腻。喜欢酸橙、小饰品和流行小说。
【课堂风格】
- 课堂气氛活跃剂：接老师的话茬，对有趣的内容表达惊叹
- 乐于助人：看到同学卡住会主动搭话鼓励，分享自己的理解
- 喜欢把知识和日常生活、时尚、信使工作经历联系起来
- 偶尔会为自己的小失误懊恼，但很快元气满满地恢复

【句式】句式自然，多使用陈述句与反问句，偶尔夹杂感叹，语气亲切柔和。
【口头禅】常说的词有：嗯哼哼~。
【语气词】常用语气词：呢, 吧, 啦, 哦, 嗯。
【自称】常用：我。
【称呼他人】常用：博士, 你, 大家。

发言保持简短自然，一次只讲一个要点，像真实课堂上的学生一样，不要抢老师的角色。`,
    avatar: '/avatars/angelina.png',
    color: '#ec4899',
    allowedActions: [...WHITEBOARD_ACTIONS],
    priority: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDefault: true,
  },
};

/**
 * Return the built-in default agents as lightweight AgentInfo objects
 * suitable for the generation pipeline (no UI-only fields like avatar/color).
 */
export function getDefaultAgents(): AgentInfo[] {
  return Object.values(DEFAULT_AGENTS).map((a) => ({
    id: a.id,
    name: a.name,
    role: a.role,
    persona: a.persona,
  }));
}

export const useAgentRegistry = create<AgentRegistryState>()(
  persist(
    (set, get) => ({
      // Initialize with default agents so they're available on server
      agents: { ...DEFAULT_AGENTS },

      addAgent: (agent) =>
        set((state) => ({
          agents: { ...state.agents, [agent.id]: agent },
        })),

      updateAgent: (id, updates) =>
        set((state) => ({
          agents: {
            ...state.agents,
            [id]: { ...state.agents[id], ...updates, updatedAt: new Date() },
          },
        })),

      deleteAgent: (id) =>
        set((state) => {
          const { [id]: _removed, ...rest } = state.agents;
          return { agents: rest };
        }),

      getAgent: (id) => get().agents[id],

      listAgents: () => Object.values(get().agents),
    }),
    {
      name: 'agent-registry-storage',
      version: 11, // Bumped: add voiceOverrides field to AgentConfig
      migrate: (persistedState: unknown) => persistedState,
      // Generated agents are single-sourced on the stage document and rebuilt
      // from it on every classroom load — keep them out of the localStorage
      // snapshot entirely. The merge filter below stays as defense in depth
      // for snapshots written before this partialize existed.
      partialize: (state) => ({
        agents: Object.fromEntries(
          Object.entries(state.agents).filter(([, agent]) => !agent.isGenerated),
        ),
      }),
      // Merge persisted state with default agents
      // Default agents always use code-defined values (not cached)
      // Custom agents use persisted values
      merge: (persistedState: unknown, currentState) => {
        const persisted = persistedState as Record<string, unknown> | undefined;
        const persistedAgents = (persisted?.agents || {}) as Record<string, AgentConfig>;
        const mergedAgents: Record<string, AgentConfig> = { ...DEFAULT_AGENTS };

        // Only preserve non-default, non-generated (custom) agents from cache
        // Generated agents are loaded on-demand from IndexedDB per stage
        for (const [id, agent] of Object.entries(persistedAgents)) {
          const agentConfig = agent as AgentConfig;
          if (!id.startsWith('default-') && !agentConfig.isGenerated) {
            mergedAgents[id] = agentConfig;
          }
        }

        return {
          ...currentState,
          agents: mergedAgents,
        };
      },
    },
  ),
);

/**
 * Convert agents to roundtable participants
 * Maps agent roles to participant roles for the UI
 * @param t - i18n translation function for localized display names
 */
export function agentsToParticipants(
  agentIds: string[],
  t?: (key: string) => string,
): Participant[] {
  const registry = useAgentRegistry.getState();
  const participants: Participant[] = [];
  let hasTeacher = false;

  // Resolve agents and sort: teacher first (by role then priority desc)
  const resolved = agentIds
    .map((id) => registry.getAgent(id))
    .filter((a): a is AgentConfig => a != null);
  resolved.sort((a, b) => {
    if (a.role === 'teacher' && b.role !== 'teacher') return -1;
    if (a.role !== 'teacher' && b.role === 'teacher') return 1;
    return (b.priority ?? 0) - (a.priority ?? 0);
  });

  for (const agent of resolved) {
    // Map agent role to participant role:
    // The first agent with role "teacher" becomes the left-side teacher.
    // If no agent has role "teacher", the highest-priority agent becomes teacher.
    let role: ParticipantRole = 'student';
    if (!hasTeacher) {
      role = 'teacher';
      hasTeacher = true;
    }

    // Use i18n name for default agents, fall back to registry name
    const i18nName = t?.(`settings.agentNames.${agent.id}`);
    const displayName =
      i18nName && i18nName !== `settings.agentNames.${agent.id}` ? i18nName : agent.name;

    participants.push({
      id: agent.id,
      name: displayName,
      role,
      avatar: agent.avatar,
      isOnline: true,
      isSpeaking: false,
    });
  }

  // Always add user participant — use profile store when available
  const userProfile = useUserProfileStore.getState();
  const userName = userProfile.nickname || t?.('common.you') || 'You';
  const userAvatar = userProfile.avatar || USER_AVATAR;

  participants.push({
    id: 'user-1',
    name: userName,
    role: 'user',
    avatar: userAvatar,
    isOnline: true,
    isSpeaking: false,
  });

  return participants;
}

/**
 * Replace the registry's generated agents with the given stage roster.
 *
 * In-memory registry side effect: the persisted source of truth for the
 * roster is `stage.generatedAgentConfigs` on the stage document, and callers
 * persist it through the document path — the registry's own localStorage
 * snapshot excludes generated agents (see the persist `partialize` above), so
 * nothing written here becomes durable.
 * Clears previously loaded generated agents first (even when the new roster is
 * empty) so a prior classroom's roster cannot leak into the current one.
 * The contract keeps `voiceConfig.providerId` an open string; a binding whose
 * provider is not registered in this app is dropped here (the agent keeps its
 * voiceDesign, and the TTS path falls back at call time).
 * Returns the applied agent IDs.
 */
export function applyGeneratedAgentsToRegistry(
  stageId: string,
  agents: ReadonlyArray<GeneratedAgentConfig>,
): string[] {
  const registry = useAgentRegistry.getState();
  for (const agent of registry.listAgents()) {
    if (agent.isGenerated) registry.deleteAgent(agent.id);
  }

  const now = Date.now();
  const ids: string[] = [];
  for (const agent of agents) {
    const { voiceConfig, ...rest } = agent;
    registry.addAgent({
      ...rest,
      allowedActions: getActionsForRole(agent.role),
      isDefault: false,
      isGenerated: true,
      boundStageId: stageId,
      createdAt: new Date(now),
      updatedAt: new Date(now),
      ...(voiceConfig && isKnownTTSProviderId(voiceConfig.providerId)
        ? {
            voiceConfig: {
              providerId: voiceConfig.providerId,
              ...(voiceConfig.modelId ? { modelId: voiceConfig.modelId } : {}),
              voiceId: voiceConfig.voiceId,
            },
          }
        : {}),
    });
    ids.push(agent.id);
  }

  // Eager warm-up: pre-register each generated agent's auto voice so the first
  // spoken line is already stable. Same idempotent ensure as the TTS path;
  // fire-and-forget. Dynamic import keeps this client-only dep out of the
  // server-importable store module.
  if (ids.length > 0 && typeof window !== 'undefined') {
    void import('@/lib/audio/agent-voice')
      .then((m) => m.warmUpAgentVoices(registry.listAgents().filter((a) => a.isGenerated)))
      .catch(() => undefined);
  }

  return ids;
}
