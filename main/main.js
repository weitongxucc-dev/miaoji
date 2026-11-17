'use strict';

const { app, BrowserWindow, ipcMain, screen, clipboard, shell, dialog, Tray, Menu, globalShortcut, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { detectObsidian, DOWNLOAD_URL } = require('./obsidian-detect');
const extract = require('./extract');

/*
 * 数据默认放在 D:\秒记数据，避免占用 C 盘。
 * 必须在 require('./store') 之前设置 userData，因为 store 会在加载时读取该路径。
 * 首次从旧版本升级时，把 C 盘 userData 里的配置和词条迁移过来。
 */
const DEFAULT_DATA_DIR = 'D:\\秒记数据';
const ENV_DATA_DIR = process.env.MIAOJI_DATA_DIR ? path.resolve(process.env.MIAOJI_DATA_DIR) : '';
const OLD_USER_DATA = app.getPath('userData');
let DATA_DIR = ENV_DATA_DIR || OLD_USER_DATA;

if (!ENV_DATA_DIR && fs.existsSync('D:\\')) {
  try {
    fs.mkdirSync(DEFAULT_DATA_DIR, { recursive: true });
    DATA_DIR = DEFAULT_DATA_DIR;
  } catch {
    DATA_DIR = OLD_USER_DATA;
  }
}

if (DATA_DIR !== OLD_USER_DATA) {
  try {
    app.setPath('userData', DATA_DIR);
    fs.mkdirSync(path.join(DATA_DIR, 'session'), { recursive: true });
    app.setPath('sessionData', path.join(DATA_DIR, 'session'));
  } catch {
    DATA_DIR = OLD_USER_DATA;
  }
}

if (!ENV_DATA_DIR && DATA_DIR !== OLD_USER_DATA) {
  /*
   * 旧版本的 userData 可能是 %APPDATA%\miaoji（包名），新版本打包后可能是
   * %APPDATA%\秒记（productName）。两处都找一遍，优先当前默认目录。
   * Local State 里存着 safeStorage 的加密密钥，必须和 config.json 一起迁移，
   * 否则旧配置里的 API Key 无法解密。
   */
  const APP_DATA = app.getPath('appData');
  const sources = [OLD_USER_DATA, path.join(APP_DATA, 'miaoji'), path.join(APP_DATA, '秒记')]
    .filter((dir, i, arr) => dir && arr.indexOf(dir) === i);
  const copyIfMissing = (dir, name) => {
    if (!dir) return false;
    const src = path.join(dir, name);
    const dst = path.join(DATA_DIR, name);
    try {
      if (!fs.existsSync(src) || fs.existsSync(dst)) return false;
      fs.copyFileSync(src, dst);
      return true;
    } catch {
      return false;
    }
  };

  const configSource = sources.find((dir) => fs.existsSync(path.join(dir, 'config.json')));
  if (copyIfMissing(configSource, 'config.json')) copyIfMissing(configSource, 'Local State');
  const entriesSource = sources.find((dir) => fs.existsSync(path.join(dir, 'entries.json')));
  copyIfMissing(entriesSource, 'entries.json');
}

const store = require('./store');
const { askDeepSeek, askFollowUp, testConnection, summarizeClip, cleanNote, lookupZh, makeQuiz, weeklyReport } = require('./ai');
const obsidian = require('./obsidian');
const agent = require('./agent');
const stats = require('./stats');

const PET_W = 128;
const PET_H = 152;
const PANEL_W = 440;
const PANEL_H = 680;
const SHORTCUT = 'Control+Alt+M';
const ICON = path.join(__dirname, '..', 'assets', 'icon.ico');
const TRAY_ICON = path.join(__dirname, '..', 'assets', 'tray.ico');

let win = null;
let tray = null;
let expanded = false;
let petPos = null;
let dragState = null;
let saveTimer = null;
let quitting = false;

app.setAppUserModelId('com.miaoji.app');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    win.show();
    expand();
  });
}

function defaultPos() {
  const wa = screen.getPrimaryDisplay().workArea;
  return {
    x: wa.x + wa.width - PET_W - 24,
    y: wa.y + wa.height - PET_H - 20
  };
}

function clampPet(pos) {
  const p = { x: Math.round(pos.x), y: Math.round(pos.y) };
  const display = screen.getDisplayNearestPoint(p);
  const wa = display.workArea;
  const margin = 4;
  return {
    x: Math.min(Math.max(p.x, wa.x + margin), wa.x + wa.width - PET_W - margin),
    y: Math.min(Math.max(p.y, wa.y + margin), wa.y + wa.height - PET_H - margin)
  };
}

function scheduleSavePetPos() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    store.saveConfig({ ballPos: petPos });
  }, 500);
}

function createWindow() {
  const conf = store.loadConfig();
  petPos = clampPet(conf.ballPos && Number.isFinite(conf.ballPos.x) ? conf.ballPos : defaultPos());

  win = new BrowserWindow({
    width: PET_W,
    height: PET_H,
    x: petPos.x,
    y: petPos.y,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    icon: ICON,
    title: '秒记',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  win.setAlwaysOnTop(true, 'floating');
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  win.webContents.once('did-finish-load', () => {
    if (process.env.MIAOJI_EXPAND === '1') setTimeout(() => expand(), 400);
    const q = process.env.MIAOJI_TEST_QUERY;
    const repeat = Math.max(0, Math.min(5, Number(process.env.MIAOJI_TEST_REPEAT) || 0));
    if (q) {
      for (let i = 0; i <= repeat; i++) {
        setTimeout(() => win && win.webContents.send('ui:dev-query', q), 1000 + i * 2000);
      }
    }
    const fq = process.env.MIAOJI_TEST_FOLLOWUP;
    if (fq) {
      setTimeout(() => win && win.webContents.send('ui:dev-followup', fq), 2600 + repeat * 2000);
    }
    const zone = process.env.MIAOJI_TEST_ZONE;
    if (zone) {
      setTimeout(() => win && win.webContents.send('ui:dev-zone', Number(zone)), 2300 + repeat * 2000);
    }
    if (process.env.MIAOJI_NAV) {
      setTimeout(() => win && win.webContents.send('ui:nav', process.env.MIAOJI_NAV), 4200 + repeat * 2000);
    }
  });

  win.once('ready-to-show', () => {
    if (!win) return;
    win.showInactive();
  });

  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      collapse();
    }
  });

  win.on('focus', () => {
    if (win && !win.isDestroyed()) win.webContents.send('ui:focus');
  });

  win.on('closed', () => {
    win = null;
  });
}

function expand() {
  if (!win) return;
  if (expanded) {
    win.show();
    win.focus();
    win.webContents.send('ui:expanded');
    return;
  }
  const display = screen.getDisplayNearestPoint(petPos);
  const wa = display.workArea;
  // 让面板贴着机器人展开：面板右下角对齐机器人的右下角
  let x = petPos.x + PET_W - PANEL_W;
  let y = petPos.y + PET_H - PANEL_H;
  if (x < wa.x + 8) x = wa.x + 8;
  if (y < wa.y + 8) y = wa.y + 8;
  if (x + PANEL_W > wa.x + wa.width - 8) x = wa.x + wa.width - PANEL_W - 8;
  if (y + PANEL_H > wa.y + wa.height - 8) y = wa.y + wa.height - PANEL_H - 8;

  expanded = true;
  win.setBounds({ x, y, width: PANEL_W, height: PANEL_H }, false);
  win.show();
  win.focus();
  win.webContents.send('ui:expanded');
}

function collapse() {
  if (!win || !expanded) return;
  expanded = false;
  win.setBounds({ x: petPos.x, y: petPos.y, width: PET_W, height: PET_H }, false);
  win.webContents.send('ui:collapsed');
  win.blur();
}

function toggle() {
  if (!win) return;
  if (!win.isVisible()) win.show();
  if (expanded) collapse();
  else expand();
}

function applyLaunchAtLogin(enabled) {
  try {
    const opts = { openAtLogin: Boolean(enabled) };
    if (!app.isPackaged) opts.args = [app.getAppPath()];
    app.setLoginItemSettings(opts);
    return true;
  } catch {
    return false;
  }
}

function findVaultRoot(file) {
  let dir = path.dirname(file);
  for (let i = 0; i < 12; i++) {
    if (fs.existsSync(path.join(dir, '.obsidian'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

async function openObsidianNote() {
  const conf = store.loadConfig();
  const file = conf.obsidianFile;
  if (!file) return { ok: false, error: '还没有设置 Obsidian 生词本，去「设置 → 笔记」里选择库或文件' };
  const root = findVaultRoot(file);
  if (root) {
    const rel = path.relative(root, file).replace(/\\/g, '/').replace(/\.md$/i, '');
    const uri = `obsidian://open?vault=${encodeURIComponent(path.basename(root))}&file=${encodeURIComponent(rel)}`;
    try {
      await shell.openExternal(uri);
      return { ok: true };
    } catch {
      /* 回退到系统默认打开方式 */
    }
  }
  const err = await shell.openPath(file);
  if (err) return { ok: false, error: err };
  return { ok: true };
}

function openNoteWithFeedback() {
  openObsidianNote().then((r) => {
    if (!r.ok && win) win.webContents.send('ui:toast', { text: '打不开笔记：' + r.error, type: 'warn' });
  });
}

function buildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开秒记', accelerator: SHORTCUT, click: () => expand() },
      { label: '收起', click: () => collapse() },
      { type: 'separator' },
      {
        label: '打开 Obsidian 生词本',
        click: () => openNoteWithFeedback()
      },
      {
        label: '设置…',
        click: () => {
          expand();
          if (win) win.webContents.send('ui:nav', 'settings');
        }
      },
      { type: 'separator' },
      {
        label: '开机自动启动',
        type: 'checkbox',
        checked: Boolean(store.loadConfig().launchAtLogin),
        click: (item) => {
          store.saveConfig({ launchAtLogin: item.checked });
          applyLaunchAtLogin(item.checked);
        }
      },
      {
        label: '退出秒记',
        click: () => {
          quitting = true;
          store.saveConfig({ ballPos: petPos });
          app.quit();
        }
      }
    ])
  );
}

function showPetMenu() {
  if (!win) return;
  const menu = Menu.buildFromTemplate([
    { label: '展开秒记', accelerator: SHORTCUT, click: () => expand() },
    { type: 'separator' },
    { label: '打开 Obsidian 生词本', click: () => openNoteWithFeedback() },
    {
      label: '设置…',
      click: () => {
        expand();
        if (win) win.webContents.send('ui:nav', 'settings');
      }
    },
    { type: 'separator' },
    {
      label: '开机自动启动',
      type: 'checkbox',
      checked: Boolean(store.loadConfig().launchAtLogin),
      click: (item) => {
        store.saveConfig({ launchAtLogin: item.checked });
        applyLaunchAtLogin(item.checked);
      }
    },
    {
      label: '退出秒记',
      click: () => {
        quitting = true;
        store.saveConfig({ ballPos: petPos });
        app.quit();
      }
    }
  ]);
  menu.popup({ window: win });
}

function createTray() {
  const image = nativeImage.createFromPath(TRAY_ICON);
  tray = new Tray(image);
  tray.setToolTip('秒记 · 英文生词速记');
  tray.on('click', () => toggle());
  buildTrayMenu();
}

function registerShortcut() {
  try {
    globalShortcut.register(SHORTCUT, () => toggle());
  } catch {
    /* 快捷键被占用时忽略 */
  }
  try {
    globalShortcut.register('CommandOrControl+Alt+S', () => captureSelection());
  } catch {
    /* 快捷键被占用时忽略 */
  }
}

/**
 * 划词抓取：优先用 Windows UI Automation 读取当前焦点元素里的选中文字；
 * 失败的桌面应用退回到「模拟 Ctrl+C → 读剪贴板 → 还原剪贴板」。
 */
function readSelectionViaUia() {
  const script = [
    'Add-Type -AssemblyName UIAutomationClient;',
    'Add-Type -AssemblyName UIAutomationTypes;',
    '$el = [System.Windows.Automation.AutomationElement]::FocusedElement;',
    'try {',
    '  $tp = $el.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern);',
    '  $sel = $tp.GetSelection();',
    '  if ($sel -and $sel.Length -gt 0) { $sel[0].GetText(-1) }',
    '} catch { "" }'
  ].join('\n');
  const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    timeout: 4000,
    windowsHide: true,
    encoding: 'utf8'
  });
  return String(out || '').trim();
}

function simulateCopy() {
  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^c')"],
    { timeout: 4000, windowsHide: true }
  );
}

async function captureSelection() {
  if (!win || win.isFocused()) return; // 在自己窗口里不抢
  let text = '';
  try {
    text = readSelectionViaUia();
  } catch {
    text = '';
  }
  if (!text) {
    const prev = await Promise.resolve(clipboard.readText());
    try {
      simulateCopy();
      await new Promise((r) => setTimeout(r, 200));
      const copied = await Promise.resolve(clipboard.readText());
      if (copied && copied !== prev) text = copied;
      await Promise.resolve(clipboard.writeText(prev || ''));
    } catch {
      text = '';
    }
  }
  text = String(text || '').trim().slice(0, 8000);
  if (!text) return;
  expand();
  setTimeout(() => {
    if (win && !win.isDestroyed()) win.webContents.send('ui:capture', { text, source: 'selection' });
  }, 160);
}

/* ---------------- 全局剪贴板监听（opt-in） ---------------- */

let clipTimer = null;
let lastClipSeen = '';

/** 只匹配「像要查的东西」：单个词、2–3 个词的短语、2–16 个汉字的术语 */
function looksLikeCaptureText(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 60 || /[\r\n]/.test(t)) return false;
  if (/^https?:\/\//i.test(t)) return false;
  if (t.includes('@')) return false;
  if (/^[A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*){0,3}$/.test(t)) return true;
  if (/^[一-龥]{2,16}$/.test(t)) return true;
  return false;
}

async function clipWatchTick() {
  const conf = store.loadConfig();
  if (!conf.clipWatch || conf.clipWatchPaused) return;
  if (!win || win.isDestroyed() || expanded || win.isFocused()) return;
  let text = '';
  try {
    text = String((await clipboard.readText()) || '').trim();
  } catch {
    return;
  }
  if (!text || text === lastClipSeen) return;
  lastClipSeen = text;
  if (!looksLikeCaptureText(text)) return;
  win.webContents.send('ui:clipwatch', { text });
}

function syncClipWatch() {
  const conf = store.loadConfig();
  const shouldRun = Boolean(conf.clipWatch) && !conf.clipWatchPaused;
  if (!shouldRun) {
    if (clipTimer) clearInterval(clipTimer);
    clipTimer = null;
    return;
  }
  if (clipTimer) return;
  // 启动时先记住当前剪贴板，避免把旧内容当成新复制
  Promise.resolve(clipboard.readText())
    .then((t) => {
      lastClipSeen = String(t || '').trim();
    })
    .catch(() => {
      lastClipSeen = '';
    });
  clipTimer = setInterval(clipWatchTick, 2500);
}

/* ---------------- IPC ---------------- */

ipcMain.handle('app:init', () => {
  const conf = store.loadConfig();
  let installDir = '';
  try {
    installDir = app.isPackaged
      ? path.dirname(path.dirname(app.getAppPath()))
      : path.resolve(__dirname, '..');
  } catch {
    installDir = '';
  }
  return {
    config: store.publicConfig(),
    entries: store.loadEntries().entries,
    userData: store.DIR,
    installDir,
    shortcut: 'Ctrl + Alt + M',
    expanded,
    alwaysOnTop: conf.alwaysOnTop,
    obsidianFile: conf.obsidianFile
  };
});

ipcMain.handle('config:save', (_e, patch) => {
  if (!patch || typeof patch !== 'object') return { ok: false, error: '参数错误' };
  const allowed = ['apiKey', 'baseUrl', 'model', 'obsidianFile', 'obsidianEnabled', 'obsidianOnboarded', 'tracks', 'reviewDaily', 'hotThreshold', 'hotLimit', 'launchAtLogin', 'alwaysOnTop', 'clipWatch', 'clipWatchPaused', 'recommendSlot'];
  const clean = {};
  for (const k of allowed) if (k in patch) clean[k] = patch[k];
  const config = store.saveConfig(clean);
  if ('launchAtLogin' in clean) applyLaunchAtLogin(clean.launchAtLogin);
  if ('alwaysOnTop' in clean && win) win.setAlwaysOnTop(Boolean(clean.alwaysOnTop), 'floating');
  if ('clipWatch' in clean || 'clipWatchPaused' in clean) syncClipWatch();
  if (tray) buildTrayMenu();
  return { ok: true, config };
});

ipcMain.handle('config:choose-file', async () => {
  const conf = store.loadConfig();
  const res = await dialog.showSaveDialog(win, {
    title: '选择秒记生词本文件',
    defaultPath: conf.obsidianFile,
    buttonLabel: '使用这个文件',
    filters: [{ name: 'Markdown', extensions: ['md'] }],
    properties: ['createDirectory']
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  const config = store.saveConfig({ obsidianFile: res.filePath, obsidianEnabled: true, obsidianOnboarded: true });
  return { canceled: false, config };
});

ipcMain.handle('obsidian:detect', () => detectObsidian());

ipcMain.handle('obsidian:use-vault', (_e, vaultPath) => {
  const dir = String(vaultPath || '').trim();
  if (!dir || !fs.existsSync(dir)) return { ok: false, error: '找不到这个库目录，可能已经被移动' };
  const file = path.join(dir, '秒记', '生词本.md');
  const config = store.saveConfig({ obsidianFile: file, obsidianEnabled: true, obsidianOnboarded: true });
  return { ok: true, config };
});

ipcMain.handle('app:open-obsidian-download', async () => {
  try {
    await shell.openExternal(DOWNLOAD_URL);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

ipcMain.handle('ai:test', async () => {
  try {
    const conf = store.loadConfig();
    const r = await testConnection(conf);
    return { ok: true, reply: r.reply };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

ipcMain.handle('clipboard:read', async () => (await clipboard.readText()) || '');

ipcMain.handle('ai:query', async (_e, text, mode) => {
  const input = String(text || '').trim();
  if (!input) return { ok: false, error: '先输入要查的内容' };
  try {
    const conf = store.loadConfig();
    const m = ['auto', 'lookup', 'note'].includes(mode) ? mode : 'auto';
    let fresh;
    let explicitKey = '';

    if (m === 'lookup') {
      fresh = await lookupZh(input, conf);
    } else if (m === 'note') {
      fresh = await cleanNote(input, conf);
    } else if (/^https?:\/\/\S+$/i.test(input)) {
      // 链接 → 抓正文、摘要、术语标注，原文一起保存
      const page = await extract.extractFromUrl(input);
      fresh = await summarizeClip(page, conf);
      explicitKey = store.clipKeyFor(page.url);
    } else if (/[一-龥]/.test(input) && input.length >= 40 && !/[a-zA-Z]{4,}/.test(input)) {
      // 较长的纯中文输入按「闪念」处理，避免被当成术语
      fresh = await cleanNote(input, conf);
    } else {
      fresh = await askDeepSeek(input, conf);
    }

    // AI 建议的学习方向（名称）映射成 id
    if (fresh.track) {
      const hit = (conf.tracks || []).find((t) => t.name === fresh.track);
      fresh.track = hit ? hit.id : '';
    }
    if (explicitKey) fresh.key = explicitKey;
    const { entry, isNew } = store.upsertEntry(fresh);
    const all = store.listEntries();
    let write;
    try {
      write = obsidian.upsert(entry, all, conf);
    } catch (err) {
      write = { ok: false, error: err && err.message ? err.message : String(err) };
    }
    return { ok: true, entry, isNew, count: entry.count, obsidian: write };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

ipcMain.handle('term:collect', async (_e, word) => {
  const text = String(word || '').trim();
  if (!text) return { ok: false, error: '术语为空' };
  try {
    const conf = store.loadConfig();
    const fresh = await askDeepSeek(text, conf);
    if (fresh.track) {
      const hit = (conf.tracks || []).find((t) => t.name === fresh.track);
      fresh.track = hit ? hit.id : '';
    }
    const { entry, isNew } = store.upsertEntry(fresh);
    let write = { ok: true, skipped: true };
    try {
      write = obsidian.upsert(entry, store.listEntries(), conf);
    } catch (err) {
      write = { ok: false, error: err && err.message ? err.message : String(err) };
    }
    return { ok: true, entry, isNew, obsidian: write };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

ipcMain.handle('app:open-url', (_e, url) => {
  const u = String(url || '');
  if (!/^https?:\/\//i.test(u)) return { ok: false, error: '只支持网页链接' };
  shell.openExternal(u);
  return { ok: true };
});

ipcMain.handle('review:submit', (_e, key, grade) => {
  try {
    const entry = store.recordReview(String(key), grade);
    const conf = store.loadConfig();
    const all = store.listEntries();
    let write = { ok: true, skipped: true };
    try {
      write = obsidian.update(entry, all, conf);
    } catch (err) {
      write = { ok: false, error: err && err.message ? err.message : String(err) };
    }
    return { ok: true, entry, obsidian: write };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

ipcMain.handle('quiz:generate', async (_e, keys) => {
  try {
    const conf = store.loadConfig();
    const wanted = Array.isArray(keys) ? keys.map(String).filter(Boolean) : [];
    const all = store.listEntries();
    let list = wanted.length ? wanted.map((k) => all.find((x) => x.key === k)).filter(Boolean) : [];
    if (!list.length) {
      const state = store.reviewState(conf.reviewDaily);
      list = state.due.slice(0, conf.reviewDaily).map((k) => all.find((x) => x.key === k)).filter(Boolean);
    }
    list = list.slice(0, 8);
    if (!list.length) return { ok: false, error: '还没有可出题的词条' };
    const questions = await makeQuiz(list, conf);
    return { ok: true, questions, keys: list.map((x) => x.key) };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

ipcMain.handle('weekly:report', async () => {
  try {
    const conf = store.loadConfig();
    const data = agent.weekData();
    if (!data.added.length && !data.reviewCount) {
      return { ok: false, error: '这周还没有学习记录，先收几个词再来生成周报' };
    }
    const report = await weeklyReport(data, conf);
    let write = { ok: true, skipped: true, path: '' };
    try {
      write = obsidian.writeWeekly(report, conf, data.period);
    } catch (err) {
      write = { ok: false, error: err && err.message ? err.message : String(err) };
    }
    return { ok: true, report, period: data.period, obsidian: write, stats: data };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

ipcMain.handle('pipeline:terms', async (_e, key) => {
  const k = String(key || '').trim();
  if (!k) return { ok: false, error: '缺少词条' };
  try {
    const notify = (p) => {
      if (win && !win.isDestroyed()) win.webContents.send('ui:pipeline-progress', p);
    };
    const result = await agent.collectClipTerms(k, 8, notify);
    return result;
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

ipcMain.handle('agent:run', async (_e, text) => {
  try {
    const conf = store.loadConfig();
    const result = await agent.runAgent(text, conf);
    return result;
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

ipcMain.handle('stats:overview', () => {
  try {
    const conf = store.loadConfig();
    const data = stats.overview();
    return {
      ok: true,
      ...data,
      suggestions: conf.recommendSlot ? stats.suggestions(data, conf) : [],
      recommendSlot: Boolean(conf.recommendSlot)
    };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

ipcMain.handle('entry:set-track', (_e, key, trackId) => {
  try {
    const entry = store.setEntryTrack(String(key), String(trackId || ''));
    const conf = store.loadConfig();
    const all = store.listEntries();
    let write = { ok: true, skipped: true };
    if (conf.obsidianEnabled) {
      try {
        write = obsidian.update(entry, all, conf);
      } catch (err) {
        write = { ok: false, error: err && err.message ? err.message : String(err) };
      }
    }
    return { ok: true, entry, obsidian: write };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

ipcMain.handle('ai:followup', async (_e, key, question) => {
  const q = String(question || '').trim();
  if (!q) return { ok: false, error: '先写一个追问' };
  try {
    const entry = store.getEntry(String(key));
    if (!entry) return { ok: false, error: '找不到这个词条，请重新查询' };
    const conf = store.loadConfig();
    const result = await askFollowUp(entry, q, conf);
    const now = new Date().toISOString();
    const updated = store.appendThread(
      entry.key,
      [
        { role: 'user', text: q, at: now },
        { role: 'assistant', text: result.answer, at: now }
      ],
      result.suggestions
    );
    const all = store.listEntries();
    let write;
    try {
      write = obsidian.update(updated, all, conf);
    } catch (err) {
      write = { ok: false, error: err && err.message ? err.message : String(err) };
    }
    return {
      ok: true,
      entry: updated,
      answer: result.answer,
      suggestions: result.suggestions,
      obsidian: write
    };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

ipcMain.handle('entry:master', (_e, key, mastered) => {
  try {
    const entry = store.setMastered(String(key), Boolean(mastered));
    const conf = store.loadConfig();
    const all = store.listEntries();
    let write;
    try {
      write = obsidian.update(entry, all, conf);
    } catch (err) {
      write = { ok: false, error: err.message };
    }
    return { ok: true, entry, obsidian: write };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('entry:delete', (_e, key) => {
  try {
    const k = String(key);
    const removed = store.deleteEntry(k);
    const conf = store.loadConfig();
    const all = store.listEntries();
    let write;
    try {
      write = obsidian.remove(k, all, conf);
    } catch (err) {
      write = { ok: false, error: err.message };
    }
    return { ok: true, removed, obsidian: write };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('obsidian:open', async () => {
  try {
    return await openObsidianNote();
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('app:open-data-dir', async () => {
  try {
    const err = await shell.openPath(store.DIR);
    return err ? { ok: false, error: err } : { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('obsidian:sync', () => {
  try {
    const conf = store.loadConfig();
    const all = store.listEntries();
    const r = obsidian.syncAll(all, conf);
    return { ok: true, count: all.length, path: r.path };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('app:launch-at-login', (_e, enabled) => {
  const config = store.saveConfig({ launchAtLogin: Boolean(enabled) });
  const applied = applyLaunchAtLogin(Boolean(enabled));
  return { ok: applied, config };
});

ipcMain.handle('app:quit', () => {
  quitting = true;
  store.saveConfig({ ballPos: petPos });
  app.quit();
});

ipcMain.handle('win:expand', () => {
  expand();
  return { expanded: true };
});

ipcMain.handle('win:collapse', () => {
  collapse();
  return { expanded: false };
});

ipcMain.on('win:pet-menu', (e) => {
  if (!win || e.sender !== win.webContents) return;
  showPetMenu();
});

ipcMain.on('win:drag-start', (_e, p) => {
  if (!win || expanded || !p) return;
  const b = win.getBounds();
  dragState = { sx: p.x, sy: p.y, wx: b.x, wy: b.y, moved: false };
});

ipcMain.on('win:drag-move', (_e, p) => {
  if (!win || !dragState || !p) return;
  const dx = p.x - dragState.sx;
  const dy = p.y - dragState.sy;
  if (!dragState.moved && Math.abs(dx) + Math.abs(dy) > 4) dragState.moved = true;
  if (!dragState.moved) return;
  petPos = clampPet({ x: dragState.wx + dx, y: dragState.wy + dy });
  win.setPosition(petPos.x, petPos.y, false);
});

ipcMain.on('win:drag-end', () => {
  const moved = dragState && dragState.moved;
  dragState = null;
  if (moved) scheduleSavePetPos();
});

/* ---------------- lifecycle ---------------- */

app.whenReady().then(() => {
  createWindow();
  createTray();
  registerShortcut();
  syncClipWatch();

  let conf = store.loadConfig();
  if (conf.launchAtLogin) applyLaunchAtLogin(true);

  screen.on('display-metrics-changed', () => {
    if (!win || expanded) return;
    petPos = clampPet(petPos);
    win.setPosition(petPos.x, petPos.y, false);
  });

  app.on('activate', () => {
    if (!win) createWindow();
    else expand();
  });
});

app.on('window-all-closed', () => {
  /* 常驻托盘，不退出 */
});

app.on('before-quit', () => {
  quitting = true;
  if (petPos) store.saveConfig({ ballPos: petPos });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (clipTimer) clearInterval(clipTimer);
});
