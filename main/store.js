'use strict';

const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const DIR = process.env.MIAOJI_DATA_DIR
  ? path.resolve(process.env.MIAOJI_DATA_DIR)
  : app.getPath('userData');
const CONFIG_FILE = path.join(DIR, 'config.json');
const ENTRIES_FILE = path.join(DIR, 'entries.json');

const DEFAULTS = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  obsidianFile: '',
  obsidianEnabled: false,
  obsidianOnboarded: false,
  tracks: [],
  reviewDaily: 5,
  hotThreshold: 3,
  hotLimit: 15,
  ballPos: null,
  launchAtLogin: false,
  alwaysOnTop: true,
  // 全局剪贴板监听：默认关闭，只在本机做规则匹配，不联网、不上报
  clipWatch: false,
  clipWatchPaused: false,
  // 本地建议位：默认关闭，只根据本机复习数据生成，不含广告或画像
  recommendSlot: false,
  // 自动周报：默认关闭；开启后每 7 天自动生成一次并写入 Obsidian
  weeklyAuto: false,
  weeklyLastAt: 0,
  // 视频平台登录状态：默认关闭；只在抓取失败、重试时读取本机浏览器 cookie
  videoCookies: '',
  // 受限文章站的 Cookie：只对指定域名生效，加密存储
  articleCookies: '',
  articleCookiesHost: ''
};

// 复习阶梯：每次「想起来了」推进一档（天数），「没想起」回到第一档
const REVIEW_INTERVALS = [1, 3, 7, 14, 30];

let configCache = null;
let entriesCache = null;

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function loadConfig() {
  if (configCache) return configCache;
  const file = readJson(CONFIG_FILE, {});
  const conf = { ...DEFAULTS, ...file };

  if (file.apiKeyEnc && safeStorage.isEncryptionAvailable()) {
    try {
      conf.apiKey = safeStorage.decryptString(Buffer.from(file.apiKeyEnc, 'base64'));
    } catch {
      conf.apiKey = '';
    }
  }
  delete conf.apiKeyEnc;

  if (file.articleCookiesEnc && safeStorage.isEncryptionAvailable()) {
    try {
      conf.articleCookies = safeStorage.decryptString(Buffer.from(file.articleCookiesEnc, 'base64'));
    } catch {
      conf.articleCookies = '';
    }
  }
  delete conf.articleCookiesEnc;

  // 开发/测试时可用环境变量指向临时生词本，避免污染真实库
  if (process.env.MIAOJI_VAULT_FILE) {
    conf.obsidianFile = path.resolve(process.env.MIAOJI_VAULT_FILE);
    conf.obsidianEnabled = true;
  }

  // 旧版本配置没写开关：有笔记路径就视为开启
  if (file.obsidianEnabled === undefined) {
    conf.obsidianEnabled = Boolean(String(conf.obsidianFile || '').trim());
  }
  conf.obsidianEnabled = Boolean(conf.obsidianEnabled) && Boolean(String(conf.obsidianFile || '').trim());

  configCache = conf;
  return conf;
}

function saveConfig(patch) {
  const conf = { ...loadConfig(), ...patch };
  if (patch && 'apiKey' in patch) conf.apiKey = String(patch.apiKey || '').trim();

  if (typeof conf.hotThreshold !== 'number' || !Number.isFinite(conf.hotThreshold)) {
    conf.hotThreshold = DEFAULTS.hotThreshold;
  }
  conf.hotThreshold = Math.max(1, Math.min(99, Math.round(conf.hotThreshold)));
  conf.hotLimit = Math.max(1, Math.min(50, Math.round(Number(conf.hotLimit) || DEFAULTS.hotLimit)));
  conf.baseUrl = String(conf.baseUrl || DEFAULTS.baseUrl).trim() || DEFAULTS.baseUrl;
  conf.model = String(conf.model || DEFAULTS.model).trim() || DEFAULTS.model;
  conf.obsidianFile = String(conf.obsidianFile || '').trim();
  conf.obsidianEnabled = Boolean(conf.obsidianEnabled) && Boolean(conf.obsidianFile);
  conf.obsidianOnboarded = Boolean(conf.obsidianOnboarded);

  // 学习方向：[{ id, name, desc }]，数量由用户决定，不做上限
  if (!Array.isArray(conf.tracks)) conf.tracks = [];
  conf.tracks = conf.tracks
    .map((t, i) => ({
      id: String(t && t.id ? t.id : 't' + (i + 1) + '_' + Date.now().toString(36)),
      name: String(t && t.name ? t.name : '').trim().slice(0, 16),
      desc: String(t && t.desc ? t.desc : '').trim().slice(0, 60)
    }))
    .filter((t) => t.name);
  conf.reviewDaily = Math.max(1, Math.min(20, Math.round(Number(conf.reviewDaily) || DEFAULTS.reviewDaily)));
  conf.articleCookies = String(conf.articleCookies || '').trim().slice(0, 8000);
  conf.articleCookiesHost = String(conf.articleCookiesHost || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    .slice(0, 120);

  configCache = conf;

  const out = { ...conf };
  if (safeStorage.isEncryptionAvailable() && conf.apiKey) {
    out.apiKeyEnc = safeStorage.encryptString(conf.apiKey).toString('base64');
    delete out.apiKey;
  }
  if (safeStorage.isEncryptionAvailable() && conf.articleCookies) {
    out.articleCookiesEnc = safeStorage.encryptString(conf.articleCookies).toString('base64');
  }
  delete out.articleCookies;
  writeJsonAtomic(CONFIG_FILE, out);
  return publicConfig();
}

function publicConfig() {
  const conf = loadConfig();
  return {
    apiKey: conf.apiKey || '',
    hasApiKey: Boolean((conf.apiKey || '').trim()),
    baseUrl: conf.baseUrl,
    model: conf.model,
    obsidianFile: conf.obsidianFile,
    obsidianEnabled: conf.obsidianEnabled,
    obsidianOnboarded: conf.obsidianOnboarded,
    tracks: conf.tracks,
    reviewDaily: conf.reviewDaily,
    hotThreshold: conf.hotThreshold,
    hotLimit: conf.hotLimit,
    launchAtLogin: conf.launchAtLogin,
    alwaysOnTop: conf.alwaysOnTop,
    clipWatch: Boolean(conf.clipWatch),
    clipWatchPaused: Boolean(conf.clipWatchPaused),
    recommendSlot: Boolean(conf.recommendSlot),
    weeklyAuto: Boolean(conf.weeklyAuto),
    weeklyLastAt: Number(conf.weeklyLastAt) || 0,
    videoCookies: String(conf.videoCookies || ''),
    hasArticleCookies: Boolean(String(conf.articleCookies || '').trim()),
    articleCookiesHost: String(conf.articleCookiesHost || '')
  };
}

function loadEntries() {
  if (!entriesCache) {
    const file = readJson(ENTRIES_FILE, {});
    entriesCache = { version: 1, entries: {} };
    if (file && typeof file.entries === 'object' && file.entries) {
      entriesCache.entries = file.entries;
    }
    // 迁移：老词条补上复习字段（已掌握视为已毕业，其余按上次查询+1天排入复习）
    let migrated = false;
    for (const e of Object.values(entriesCache.entries)) {
      if (e.stage === undefined || e.nextReviewAt === undefined) {
        migrated = true;
        e.reviews = Array.isArray(e.reviews) ? e.reviews : [];
        if (e.mastered) {
          e.graduated = true;
          e.stage = null;
          e.nextReviewAt = null;
        } else {
          e.stage = 0;
          e.graduated = false;
          const base = e.lastAt || new Date().toISOString();
          e.nextReviewAt = new Date(new Date(base).getTime() + REVIEW_INTERVALS[0] * 86400000).toISOString();
        }
      }
      // 迁移：闪念默认不进复习队列（2026-11-17 确认）。没有复习记录、也没主动加入过的闪念，移出队列；
      // 已经复习过（reviews 有记录）或主动加入（reviewOptIn）的闪念保持原调度
      if (e.kind === 'note' && !e.reviewOptIn && !e.mastered
        && !(Array.isArray(e.reviews) && e.reviews.length)
        && (e.stage !== null || e.nextReviewAt)) {
        migrated = true;
        e.stage = null;
        e.graduated = false;
        e.nextReviewAt = null;
      }
      // 旧版「毕业即退出队列」的词，补上长尾确认（60 天后第一次确认）
      if (e.graduated && !e.mastered && !e.nextReviewAt && e.confirmLevel === undefined) {
        migrated = true;
        e.confirmLevel = 0;
        e.nextReviewAt = new Date(Date.now() + 60 * 86400000).toISOString();
      }
    }
    if (migrated) persistEntries();
  }
  return entriesCache;
}

function persistEntries() {
  writeJsonAtomic(ENTRIES_FILE, loadEntries());
}

function listEntries() {
  return Object.values(loadEntries().entries);
}

function keyFor(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'.,!?;:()\[\]{}<>]+/, '')
    .replace(/[\s"'.,!?;:()\[\]{}<>]+$/, '')
    .trim();
}

/** 剪藏按网址去重：同一个链接再次保存时更新内容，不新增词条 */
function clipKeyFor(url) {
  const u = String(url || '').trim();
  return u ? 'clip:' + u.replace(/#.*$/, '') : '';
}

/** 术语类词条：同一条术语在不同学习方向下各存一份，分别复习 */
const TERM_KINDS = new Set(['word', 'sentence', 'term', 'lookup']);

/**
 * 术语类词条的主键：
 * - 第一个方向沿用原来的裸词主键，老数据不用迁移，Obsidian 标记块也不用重写；
 * - 同一个词换到另一个方向时，用「裸词@方向 id」另存一条，避免互相覆盖；
 * - 剪藏、闪念保持原有主键规则。
 * 方向 id 只作为内部标识，界面始终显示方向名称。
 */
function entryKeyFor(text, kind, trackId, data) {
  const base = keyFor(text);
  if (!base) return '';
  if (!TERM_KINDS.has(kind)) return base;
  const t = String(trackId || '');
  const existing = data.entries[base];
  if (!existing) return base;
  // 裸词主键被闪念或剪藏占用时，术语另起一个键，避免把别的记录覆盖掉
  if (!TERM_KINDS.has(existing.kind)) return `${base}@${t || 'none'}`;
  if (String(existing.track || '') === t) return base;
  return `${base}@${t || 'none'}`;
}

function sanitizeSource(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const out = {
    type: ['url', 'video', 'selection', 'clipboard', 'manual'].includes(s.type) ? s.type : 'manual',
    url: String(s.url || '').slice(0, 2000),
    title: String(s.title || '').slice(0, 200),
    site: String(s.site || '').slice(0, 120),
    capturedAt: String(s.capturedAt || '').slice(0, 40)
  };
  if (out.type === 'video') {
    out.provider = String(s.provider || '').slice(0, 20);
    out.author = String(s.author || '').slice(0, 80);
    out.durationSeconds = Math.max(0, Math.round(Number(s.durationSeconds) || 0));
    out.transcriptSource = String(s.transcriptSource || '').slice(0, 20);
  }
  return out;
}

function sanitizeTerms(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((t) => {
      if (typeof t === 'string') return { word: t.trim(), meaning: '' };
      return { word: String((t && (t.word || t.term)) || '').trim(), meaning: String((t && t.meaning) || '').trim() };
    })
    .filter((t) => t.word)
    .slice(0, 40);
}

function upsertEntry(fresh) {
  const data = loadEntries();
  // 剪藏用 clip:<url> 作主键；术语类词条按「术语 × 方向」各存一条
  const kind = ['word', 'sentence', 'term', 'note', 'clip', 'lookup'].includes(fresh.kind) ? fresh.kind : 'word';
  const explicitKey = String(fresh.key || '').trim();
  const key = explicitKey || entryKeyFor(fresh.word || '', kind, fresh.track, data);
  if (!key) throw new Error('词条为空，无法记录');

  const now = new Date();
  const nowIso = now.toISOString();
  const existing = data.entries[key];

  const entry = {
    ...fresh,
    key,
    kind,
    source: sanitizeSource(fresh.source),
    original: typeof fresh.original === 'string' ? fresh.original : '',
    summary: String(fresh.summary || ''),
    terms: sanitizeTerms(fresh.terms),
    count: existing ? (existing.count || 1) + 1 : 1,
    firstAt: existing ? existing.firstAt : nowIso,
    lastAt: nowIso,
    mastered: existing ? Boolean(existing.mastered) : false,
    masteredAt: existing ? (existing.masteredAt || null) : null,
    // 复习调度：词条收下次日到期；闪念默认不进队列（用户点「加入复习」才排期）；重查保留进度
    // 指定了方向就写进这一条；没指定时保留原方向，避免自动建议把老词条搬走
    track: existing
      ? (String(fresh.track || '') || String(existing.track || ''))
      : String(fresh.track || ''),
    stage: existing
      ? (existing.stage === undefined ? (kind === 'note' ? null : 0) : existing.stage)
      : (kind === 'note' ? null : 0),
    graduated: existing ? Boolean(existing.graduated) : false,
    // 闪念主动加入过复习的标记；没有它，迁移会把用户排期过的闪念再次移出
    reviewOptIn: existing ? Boolean(existing.reviewOptIn) : false,
    nextReviewAt: existing && existing.nextReviewAt
      ? existing.nextReviewAt
      : (kind === 'note' ? null : new Date(now.getTime() + REVIEW_INTERVALS[0] * 86400000).toISOString()),
    reviews: existing && Array.isArray(existing.reviews) ? existing.reviews.slice(-200) : [],
    // 重新查询时保留已经聊过的追问记录，只刷新词条内容
    thread: existing && Array.isArray(existing.thread) ? existing.thread.slice(-40) : [],
    followups: (fresh.followups && fresh.followups.length)
      ? fresh.followups
      : (existing && Array.isArray(existing.followups) ? existing.followups : [])
  };

  data.entries[key] = entry;
  persistEntries();
  return { entry, isNew: !existing };
}

/**
 * 追加一轮追问，并把 AI 给的新问题建议存进词条。
 * messages: [{ role: 'user'|'assistant', text, at }]
 */
function appendThread(key, messages, followups) {
  const data = loadEntries();
  const entry = data.entries[key];
  if (!entry) throw new Error('找不到该词条');
  const thread = Array.isArray(entry.thread) ? entry.thread.slice() : [];
  for (const m of messages || []) {
    if (!m || !m.text) continue;
    thread.push({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      text: String(m.text),
      at: m.at || new Date().toISOString()
    });
  }
  entry.thread = thread.slice(-40);
  if (Array.isArray(followups) && followups.length) {
    entry.followups = followups.slice(0, 4);
  }
  entry.lastAt = new Date().toISOString();
  persistEntries();
  return entry;
}

function setMastered(key, mastered) {
  const data = loadEntries();
  const entry = data.entries[key];
  if (!entry) throw new Error('找不到该词条');
  entry.mastered = Boolean(mastered);
  entry.masteredAt = mastered ? new Date().toISOString() : null;
  // 标记掌握 = 移出复习队列；取消掌握则重新排入，明天到期
  if (mastered) {
    entry.graduated = true;
    entry.nextReviewAt = null;
  } else {
    entry.graduated = false;
    entry.nextReviewAt = new Date(Date.now() + REVIEW_INTERVALS[0] * 86400000).toISOString();
  }
  persistEntries();
  return entry;
}

/**
 * 闪念主动加入复习队列：从明天开始按间隔排期。
 * 闪念默认不排期（见 upsertEntry），只有用户在界面上点「加入复习」才进队列。
 */
function optInNoteReview(key) {
  const data = loadEntries();
  const entry = data.entries[key];
  if (!entry) throw new Error('找不到该词条');
  if (entry.kind !== 'note') throw new Error('只有闪念需要手动加入复习');
  if (entry.mastered) throw new Error('这条闪念已标记掌握');
  entry.reviewOptIn = true;
  entry.graduated = false;
  entry.stage = 0;
  entry.nextReviewAt = new Date(Date.now() + REVIEW_INTERVALS[0] * 86400000).toISOString();
  persistEntries();
  return entry;
}

/**
 * 提交一次复习自评。grade: 0=没想起 1=模糊 2=想起来了
 */
function recordReview(key, grade) {
  const data = loadEntries();
  const entry = data.entries[key];
  if (!entry) throw new Error('找不到该词条');
  const g = Math.max(0, Math.min(2, Math.round(Number(grade))));
  const now = Date.now();
  entry.reviews = Array.isArray(entry.reviews) ? entry.reviews : [];
  entry.reviews.push({ at: new Date(now).toISOString(), grade: g });

  // 毕业后的长尾确认：毕业后 60 / 120 / 240 天各确认一次，避免「毕业即遗忘」
  if (entry.graduated && !entry.mastered) {
    if (g === 2) {
      entry.confirmLevel = Math.min(3, (Number(entry.confirmLevel) || 0) + 1);
      const gaps = { 1: 120, 2: 240 };
      const days = gaps[entry.confirmLevel];
      entry.nextReviewAt = days ? new Date(now + days * 86400000).toISOString() : null;
    } else {
      // 确认时想不起来：回到复习队列重新走
      entry.graduated = false;
      entry.confirmLevel = 0;
      entry.fuzzyStreak = 0;
      entry.stage = g === 0 ? 0 : 2;
      entry.nextReviewAt = new Date(now + REVIEW_INTERVALS[entry.stage] * 86400000).toISOString();
    }
    persistEntries();
    return entry;
  }

  if (g === 0) {
    entry.fuzzyStreak = 0;
    entry.stage = 0;
    entry.nextReviewAt = new Date(now + REVIEW_INTERVALS[0] * 86400000).toISOString();
  } else if (g === 1) {
    // 「模糊」不再永远停在 3 天：间隔随阶段增长；连续两次模糊算半次进步，
    // 避免只点「模糊」的词永远不毕业。
    if (!Number.isInteger(entry.stage) || entry.stage < 0) entry.stage = 0;
    entry.fuzzyStreak = (Number(entry.fuzzyStreak) || 0) + 1;
    if (entry.fuzzyStreak % 2 === 0) {
      entry.stage += 1;
      if (entry.stage >= REVIEW_INTERVALS.length) {
        entry.graduated = true;
        entry.confirmLevel = 0;
        entry.nextReviewAt = new Date(now + 60 * 86400000).toISOString();
      } else {
        entry.nextReviewAt = new Date(now + REVIEW_INTERVALS[entry.stage] * 86400000).toISOString();
      }
    } else {
      const days = Math.max(REVIEW_INTERVALS[1], REVIEW_INTERVALS[entry.stage] || 0);
      entry.nextReviewAt = new Date(now + days * 86400000).toISOString();
    }
  } else {
    entry.fuzzyStreak = 0;
    entry.stage = Number.isInteger(entry.stage) ? entry.stage + 1 : 1;
    if (entry.stage >= REVIEW_INTERVALS.length) {
      entry.graduated = true;
      entry.confirmLevel = 0;
      // 毕业后先安排 60 天后的第一次确认
      entry.nextReviewAt = new Date(now + 60 * 86400000).toISOString();
    } else {
      entry.nextReviewAt = new Date(now + REVIEW_INTERVALS[entry.stage] * 86400000).toISOString();
    }
  }
  // lastAt 保持「最近查词」的语义，复习时间只记在 reviews 里，避免把「今天 N 词」虚增
  persistEntries();
  return entry;
}

/**
 * 词条的学习方向（track 存 id）
 * 术语类词条换方向时一起换主键：第一个方向继续用裸词键，其余方向用「裸词@方向 id」。
 * 目标方向下已经有同一条术语时拒绝，不静默合并或覆盖。
 */
function setEntryTrack(key, trackId) {
  const data = loadEntries();
  const entry = data.entries[key];
  if (!entry) throw new Error('找不到该词条');
  const t = String(trackId || '');
  const oldKey = entry.key;
  let newKey = oldKey;

  if (TERM_KINDS.has(entry.kind)) {
    const base = keyFor(entry.word || '');
    if (base) {
      const baseEntry = data.entries[base];
      if (oldKey === base) {
        // 裸词键始终留给「第一个方向」；如果另一个方向的副本已经存在，不把两条并成一条
        const variantKey = `${base}@${t || 'none'}`;
        if (data.entries[variantKey] && String(data.entries[variantKey].track || '') === t) {
          throw new Error('这个方向下已经有同一条术语，先删掉另一条再改');
        }
        newKey = base;
      } else if (!baseEntry) {
        newKey = base;
        // 把副本提成裸词键时，也要确认目标方向的副本不存在，避免同词同方向两条
        const variantKey = `${base}@${t || 'none'}`;
        const variant = data.entries[variantKey];
        if (variant && variant.key !== oldKey && String(variant.track || '') === t) {
          throw new Error('这个方向下已经有同一条术语，先删掉另一条再改');
        }
      } else if (String(baseEntry.track || '') === t) {
        throw new Error('这个方向下已经有同一条术语，先删掉另一条再改');
      } else {
        newKey = `${base}@${t || 'none'}`;
      }
    }
  }

  if (newKey !== oldKey && data.entries[newKey]) {
    throw new Error('这个方向下已经有同一条术语，先删掉另一条再改');
  }
  if (newKey !== oldKey) {
    delete data.entries[oldKey];
    entry.key = newKey;
    data.entries[newKey] = entry;
  }
  entry.track = t;
  persistEntries();
  // oldKey 交给主进程去改 Obsidian 标记块
  return { entry, oldKey };
}

/**
 * 复习总览：到期队列、今日已完成、诚实统计
 */
function reviewState(reviewDaily) {
  const all = listEntries();
  const now = Date.now();
  const today = new Date().toDateString();
  let doneToday = 0;
  for (const e of all) {
    for (const r of Array.isArray(e.reviews) ? e.reviews : []) {
      if (r && r.at && new Date(r.at).toDateString() === today) doneToday += 1;
    }
  }
  const due = all
    // 毕业的词也保留长尾确认（nextReviewAt 为 60/120/240 天后的确认时间）
    .filter((e) => !e.mastered && e.nextReviewAt && new Date(e.nextReviewAt).getTime() <= now)
    .sort((a, b) => new Date(a.nextReviewAt) - new Date(b.nextReviewAt));
  const collected = all.length;
  const reviewedWords = all.filter((e) => Array.isArray(e.reviews) && e.reviews.length > 0).length;
  const stable = all.filter((e) => e.graduated || e.mastered).length;
  return {
    due: due.map((e) => e.key),
    doneToday,
    remaining: Math.max(0, (reviewDaily || 5) - doneToday),
    stats: { collected, reviewedWords, stable }
  };
}

function deleteEntry(key) {
  const data = loadEntries();
  if (!data.entries[key]) return false;
  delete data.entries[key];
  persistEntries();
  return true;
}

function getEntry(key) {
  return loadEntries().entries[key] || null;
}

module.exports = {
  loadConfig,
  saveConfig,
  publicConfig,
  listEntries,
  loadEntries,
  upsertEntry,
  appendThread,
  setMastered,
  optInNoteReview,
  recordReview,
  setEntryTrack,
  reviewState,
  deleteEntry,
  getEntry,
  keyFor,
  entryKeyFor,
  clipKeyFor,
  DIR
};
