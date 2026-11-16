'use strict';

const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const DIR = process.env.MIAOJI_DATA_DIR
  ? path.resolve(process.env.MIAOJI_DATA_DIR)
  : app.getPath('userData');const CONFIG_FILE = path.join(DIR, 'config.json');
const ENTRIES_FILE = path.join(DIR, 'entries.json');

const DEFAULTS = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  obsidianFile: 'D:\\Obsdian\\知识库\\秒记\\生词本.md',
  hotThreshold: 3,
  hotLimit: 15,
  ballPos: null,
  launchAtLogin: false,
  alwaysOnTop: true
};

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
  if (process.env.MIAOJI_VAULT_FILE) conf.obsidianFile = path.resolve(process.env.MIAOJI_VAULT_FILE);

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
  conf.obsidianFile = String(conf.obsidianFile || DEFAULTS.obsidianFile).trim() || DEFAULTS.obsidianFile;

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
    hotThreshold: conf.hotThreshold,
    hotLimit: conf.hotLimit,
    launchAtLogin: conf.launchAtLogin,
    alwaysOnTop: conf.alwaysOnTop
  };
}

function loadEntries() {
  if (!entriesCache) {
    const file = readJson(ENTRIES_FILE, {});
    entriesCache = { version: 1, entries: {} };
    if (file && typeof file.entries === 'object' && file.entries) {
      entriesCache.entries = file.entries;
    }
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

function upsertEntry(fresh) {
  const data = loadEntries();
  const key = keyFor(fresh.word || '');
  if (!key) throw new Error('词条为空，无法记录');

  const now = new Date().toISOString();
  const existing = data.entries[key];

  const entry = {
    ...fresh,
    key,
    count: existing ? (existing.count || 1) + 1 : 1,
    firstAt: existing ? existing.firstAt : now,
    lastAt: now,
    mastered: existing ? false : false,
    masteredAt: null,
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
  persistEntries();
  return entry;
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
  deleteEntry,
  getEntry,
  keyFor,
  DIR
};
