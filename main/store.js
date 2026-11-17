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
  recommendSlot: false
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

  configCache = conf;

  const out = { ...conf };
  if (safeStorage.isEncryptionAvailable() && conf.apiKey) {
    out.apiKeyEnc = safeStorage.encryptString(conf.apiKey).toString('base64');
    delete out.apiKey;
  }
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
    recommendSlot: Boolean(conf.recommendSlot)
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

function sanitizeSource(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    type: ['url', 'selection', 'clipboard', 'manual'].includes(s.type) ? s.type : 'manual',
    url: String(s.url || '').slice(0, 2000),
    title: String(s.title || '').slice(0, 200),
    site: String(s.site || '').slice(0, 120),
    capturedAt: String(s.capturedAt || '').slice(0, 40)
  };
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
  // 剪藏用 clip:<url> 作主键；其它类型用词条文本
  const explicitKey = String(fresh.key || '').trim();
  const key = explicitKey || keyFor(fresh.word || '');
  if (!key) throw new Error('词条为空，无法记录');

  const now = new Date();
  const nowIso = now.toISOString();
  const existing = data.entries[key];

  const entry = {
    ...fresh,
    key,
    kind: ['word', 'sentence', 'term', 'note', 'clip', 'lookup'].includes(fresh.kind) ? fresh.kind : 'word',
    source: sanitizeSource(fresh.source),
    original: typeof fresh.original === 'string' ? fresh.original : '',
    summary: String(fresh.summary || ''),
    terms: sanitizeTerms(fresh.terms),
    count: existing ? (existing.count || 1) + 1 : 1,
    firstAt: existing ? existing.firstAt : nowIso,
    lastAt: nowIso,
    mastered: existing ? Boolean(existing.mastered) : false,
    masteredAt: existing ? (existing.masteredAt || null) : null,
    // 复习调度：新词条收下次日到期；重查保留进度，未排期过的老词条排入队列
    track: existing ? (existing.track || '') : String(fresh.track || ''),
    stage: existing ? (existing.stage ?? 0) : 0,
    graduated: existing ? Boolean(existing.graduated) : false,
    nextReviewAt: existing && existing.nextReviewAt
      ? existing.nextReviewAt
      : new Date(now.getTime() + REVIEW_INTERVALS[0] * 86400000).toISOString(),
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

  if (g === 0) {
    entry.stage = 0;
    entry.nextReviewAt = new Date(now + REVIEW_INTERVALS[0] * 86400000).toISOString();
  } else if (g === 1) {
    if (!Number.isInteger(entry.stage) || entry.stage < 0) entry.stage = 0;
    entry.nextReviewAt = new Date(now + REVIEW_INTERVALS[1] * 86400000).toISOString();
  } else {
    entry.stage = Number.isInteger(entry.stage) ? entry.stage + 1 : 1;
    if (entry.stage >= REVIEW_INTERVALS.length) {
      entry.graduated = true;
      entry.nextReviewAt = null;
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
 */
function setEntryTrack(key, trackId) {
  const data = loadEntries();
  const entry = data.entries[key];
  if (!entry) throw new Error('找不到该词条');
  entry.track = String(trackId || '');
  persistEntries();
  return entry;
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
    .filter((e) => !e.mastered && !e.graduated && e.nextReviewAt && new Date(e.nextReviewAt).getTime() <= now)
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
  recordReview,
  setEntryTrack,
  reviewState,
  deleteEntry,
  getEntry,
  keyFor,
  clipKeyFor,
  DIR
};
