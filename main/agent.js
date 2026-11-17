'use strict';

/**
 * 本地 Agent：把秒记的词条库操作暴露成 DeepSeek function calling 工具，
 * 让模型自己决定先查什么、再存什么，而不是一次一问。
 */

const ai = require('./ai');
const store = require('./store');
const obsidian = require('./obsidian');

const MAX_STEPS = 6;

const AGENT_PROMPT = `你是「秒记」的本地学习助手，可以调用工具直接操作用户本机的词条库。
可做的事：查词并收录、搜索已收录词条、改学习方向、查到期复习、提交复习结果、看统计、把一篇文章里的术语批量收进复习、生成周报。
规则：
- 先判断需要哪些工具，可以连续调用；总共最多 6 轮。
- 工具返回的结果就是事实，不要编造词条、数字或失败原因。
- 涉及删除、覆盖整篇笔记、改 API Key 的操作一律不做，只能建议用户自己去界面操作。
- 完成后用简体中文简洁汇报：做了什么、结果数量；不要重复贴大段内容。
- 不要向用户索要 API Key，也不要输出工具调用的原始 JSON。`;

function toolDef(name, description, properties, required) {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: { type: 'object', properties, required }
    }
  };
}

const TOOL_DEFS = [
  toolDef('search_entries', '按关键词搜索本机已收录的词条，返回最匹配的若干条（词、释义/摘要、方向、复习状态）。', {
    query: { type: 'string', description: '关键词，可以是英文、中文或术语' },
    limit: { type: 'number', description: '最多返回几条，默认 5' }
  }, ['query']),
  toolDef('save_term', '查一个单词、短语、术语或中文概念，生成词条并保存到本机词条库（同时写 Obsidian）。', {
    text: { type: 'string', description: '要查询并保存的内容' }
  }, ['text']),
  toolDef('set_entry_track', '修改某个已收录词条的学习方向；方向不存在时会自动创建。', {
    key: { type: 'string', description: '词条主键，通常来自 search_entries 或 save_term 的结果' },
    track: { type: 'string', description: '方向名称，如「编程」「供应链」' }
  }, ['key', 'track']),
  toolDef('list_due', '列出当前到期、需要复习的词条。', {
    limit: { type: 'number', description: '最多返回几条，默认 10' }
  }, []),
  toolDef('submit_review', '为某个词条提交一次复习自评：0=没想起，1=模糊，2=想起来了。', {
    key: { type: 'string', description: '词条主键' },
    grade: { type: 'number', description: '0、1 或 2' }
  }, ['key', 'grade']),
  toolDef('get_stats', '获取收录量、已复习词数、稳固数、到期数、方向分布等统计。', {}, []),
  toolDef('collect_clip_terms', '把一条剪藏或闪念里标注的术语逐个查词并收进复习，最多处理 8 个。', {
    key: { type: 'string', description: '剪藏/闪念词条的主键' },
    limit: { type: 'number', description: '最多处理几个术语，默认 8' }
  }, ['key']),
  toolDef('write_weekly_report', '根据过去 7 天的数据生成周报，并写入 Obsidian。', {}, [])
];

function entryBrief(e) {
  const t = (store.loadConfig().tracks || []).find((x) => x.id === e.track);
  return {
    key: e.key,
    word: e.word,
    kind: e.kind,
    track: t ? t.name : '',
    meaning: String(e.meaning_zh || e.sentence_translation || e.summary || '').slice(0, 80),
    stage: e.stage,
    graduated: Boolean(e.graduated),
    mastered: Boolean(e.mastered),
    nextReviewAt: e.nextReviewAt || null
  };
}

function weekData() {
  const all = store.listEntries();
  const now = Date.now();
  const since = now - 7 * 86400000;
  const inWeek = (iso) => {
    const t = new Date(iso).getTime();
    return Number.isFinite(t) && t >= since && t <= now;
  };

  const added = all.filter((e) => inWeek(e.firstAt)).map(entryBrief);
  const reviewEvents = [];
  for (const e of all) {
    for (const r of Array.isArray(e.reviews) ? e.reviews : []) {
      if (r && r.at && inWeek(r.at)) reviewEvents.push({ word: e.word, grade: r.grade, at: r.at });
    }
  }
  const state = store.reviewState(store.loadConfig().reviewDaily);
  const trackCounts = {};
  for (const e of all) {
    const b = entryBrief(e);
    if (!b.track) continue;
    trackCounts[b.track] = (trackCounts[b.track] || 0) + 1;
  }
  const weakSet = new Map();
  for (const r of reviewEvents) {
    if (r.grade === 0) weakSet.set(r.word, (weakSet.get(r.word) || 0) + 1);
  }

  return {
    period: { from: new Date(since).toISOString().slice(0, 10), to: new Date(now).toISOString().slice(0, 10) },
    added,
    reviewCount: reviewEvents.length,
    reviewedWords: new Set(reviewEvents.map((r) => r.word)).size,
    gradeSplit: {
      forgot: reviewEvents.filter((r) => r.grade === 0).length,
      fuzzy: reviewEvents.filter((r) => r.grade === 1).length,
      recalled: reviewEvents.filter((r) => r.grade === 2).length
    },
    dueNow: state.due.length,
    stats: state.stats,
    tracks: trackCounts,
    weak: Array.from(weakSet.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([word, n]) => ({ word, forgot: n }))
  };
}

function findEntry(key) {
  const entry = store.getEntry(String(key || ''));
  if (!entry) throw new Error(`找不到词条：${key}`);
  return entry;
}

async function collectClipTerms(key, limit, onProgress) {
  const entry = findEntry(key);
  const max = Math.max(1, Math.min(12, Number(limit) || 8));
  const terms = (entry.terms || []).slice(0, max);
  if (!terms.length) throw new Error('这条记录没有标注术语');
  const confNow = store.loadConfig();
  const results = [];
  for (let i = 0; i < terms.length; i += 1) {
    const t = terms[i];
    if (typeof onProgress === 'function') {
      onProgress({ index: i, total: terms.length, word: t.word });
    }
    try {
      const fresh = await ai.askDeepSeek(t.word, confNow);
      if (fresh.track) {
        const hit = (confNow.tracks || []).find((x) => x.name === fresh.track);
        fresh.track = hit ? hit.id : '';
      }
      const saved = store.upsertEntry(fresh);
      try {
        obsidian.upsert(saved.entry, store.listEntries(), confNow);
      } catch {
        /* ignore */
      }
      results.push({ word: saved.entry.word, ok: true, isNew: saved.isNew });
    } catch (err) {
      results.push({ word: t.word, ok: false, error: err && err.message ? err.message : String(err) });
    }
  }
  return { ok: true, collected: results.filter((r) => r.ok).length, total: terms.length, results };
}

async function execute(name, args, conf) {
  if (name === 'search_entries') {
    const q = String(args.query || '').toLowerCase().trim();
    if (!q) return { ok: false, error: '搜索关键词为空' };
    const limit = Math.max(1, Math.min(20, Number(args.limit) || 5));
    const hits = store.listEntries()
      .filter((e) => {
        const hay = [e.word, e.meaning_zh, e.sentence_translation, e.summary, e.note,
          (e.terms || []).map((t) => t.word + t.meaning).join(' ')].join(' ').toLowerCase();
        return hay.includes(q);
      })
      .slice(0, limit)
      .map(entryBrief);
    return { ok: true, count: hits.length, entries: hits };
  }

  if (name === 'save_term') {
    const text = String(args.text || '').trim();
    if (!text) return { ok: false, error: '内容为空' };
    const fresh = await ai.askDeepSeek(text, conf);
    const live = store.loadConfig();
    if (fresh.track) {
      const hit = (live.tracks || []).find((t) => t.name === fresh.track);
      fresh.track = hit ? hit.id : '';
    }
    const { entry, isNew } = store.upsertEntry(fresh);
    let write = { ok: true, skipped: true };
    try {
      write = obsidian.upsert(entry, store.listEntries(), conf);
    } catch (err) {
      write = { ok: false, error: err && err.message ? err.message : String(err) };
    }
    return { ok: true, isNew, entry: entryBrief(entry), obsidian: write.ok };
  }

  if (name === 'set_entry_track') {
    const key = String(args.key || '').trim();
    const name2 = String(args.track || '').trim().slice(0, 16);
    if (!key || !name2) return { ok: false, error: '缺少词条或方向名称' };
    const live = store.loadConfig();
    const tracks = (live.tracks || []).slice();
    let hit = tracks.find((t) => t.name === name2);
    if (!hit) {
      hit = { id: 't' + Date.now().toString(36), name: name2, desc: '' };
      tracks.push(hit);
      store.saveConfig({ tracks });
    }
    const entry = store.setEntryTrack(key, hit.id);
    try {
      obsidian.update(entry, store.listEntries(), store.loadConfig());
    } catch {
      /* 笔记写入失败不影响本地记录 */
    }
    return { ok: true, word: entry.word, track: hit.name };
  }

  if (name === 'list_due') {
    const limit = Math.max(1, Math.min(50, Number(args.limit) || 10));
    const state = store.reviewState(store.loadConfig().reviewDaily);
    const list = state.due.slice(0, limit).map((k) => entryBrief(findEntry(k)));
    return { ok: true, count: state.due.length, entries: list };
  }

  if (name === 'submit_review') {
    const key = String(args.key || '').trim();
    const grade = Math.max(0, Math.min(2, Math.round(Number(args.grade))));
    if (!Number.isFinite(grade)) return { ok: false, error: 'grade 必须是 0、1 或 2' };
    const entry = store.recordReview(key, grade);
    try {
      obsidian.update(entry, store.listEntries(), store.loadConfig());
    } catch {
      /* ignore */
    }
    return { ok: true, word: entry.word, stage: entry.stage, graduated: Boolean(entry.graduated), nextReviewAt: entry.nextReviewAt };
  }

  if (name === 'get_stats') {
    const state = store.reviewState(store.loadConfig().reviewDaily);
    const data = weekData();
    return { ok: true, ...state.stats, due: state.due.length, doneToday: state.doneToday, tracks: data.tracks };
  }

  if (name === 'collect_clip_terms') {
    try {
      return await collectClipTerms(args.key, args.limit);
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  }

  if (name === 'write_weekly_report') {
    const data = weekData();
    const report = await ai.weeklyReport(data, conf);
    let write;
    try {
      write = obsidian.writeWeekly(report, conf, data.period);
    } catch (err) {
      write = { ok: false, error: err && err.message ? err.message : String(err) };
    }
    return { ok: true, report, obsidian: write.ok !== false };
  }

  return { ok: false, error: `未知工具：${name}` };
}

function mockAgent(text) {
  return {
    ok: true,
    answer: `（测试回答）我理解你想：${text}。在这个测试环境里，我只会演示工具链，不会真的调用接口。实际运行时会先搜索本机词条，再按需要保存或安排复习，并把每一步的结果告诉你。`,
    steps: [
      { name: 'search_entries', ok: true },
      { name: 'get_stats', ok: true }
    ]
  };
}

async function runAgent(text, conf) {
  const input = String(text || '').trim();
  if (!input) return { ok: false, error: '先说你想做什么' };
  if (process.env.MIAOJI_MOCK === '1') {
    await new Promise((r) => setTimeout(r, 500));
    return mockAgent(input);
  }

  const messages = [
    { role: 'system', content: AGENT_PROMPT },
    { role: 'user', content: input }
  ];
  const steps = [];

  for (let i = 0; i < MAX_STEPS; i += 1) {
    const msg = await ai.callChat(messages, conf, {
      maxTokens: 1500,
      temperature: 0.2,
      json: false,
      raw: true,
      tools: TOOL_DEFS
    });

    const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    if (!calls.length) {
      return { ok: true, answer: String(msg.content || '').trim() || '（没有返回内容）', steps };
    }

    messages.push({ role: 'assistant', content: msg.content || '', tool_calls: calls });
    for (const call of calls) {
      const name = call.function && call.function.name;
      let args = {};
      try {
        args = JSON.parse((call.function && call.function.arguments) || '{}');
      } catch {
        args = {};
      }
      let result;
      try {
        result = await execute(name, args, conf);
      } catch (err) {
        result = { ok: false, error: err && err.message ? err.message : String(err) };
      }
      steps.push({ name, ok: result.ok !== false });
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result).slice(0, 4000)
      });
    }
  }

  return { ok: false, error: '工具调用轮次过多，已停止。可以把任务拆小一点再试。', steps };
}

module.exports = { runAgent, weekData, TOOL_DEFS, collectClipTerms };
