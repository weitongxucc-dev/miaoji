'use strict';

const { app, BrowserWindow, ipcMain, screen, clipboard, shell, dialog, Tray, Menu, globalShortcut, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { detectObsidian, DOWNLOAD_URL } = require('./obsidian-detect');

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
const { askDeepSeek, askFollowUp, testConnection } = require('./ai');
const obsidian = require('./obsidian');

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
  const allowed = ['apiKey', 'baseUrl', 'model', 'obsidianFile', 'obsidianEnabled', 'obsidianOnboarded', 'hotThreshold', 'hotLimit', 'launchAtLogin', 'alwaysOnTop'];
  const clean = {};
  for (const k of allowed) if (k in patch) clean[k] = patch[k];
  const config = store.saveConfig(clean);
  if ('launchAtLogin' in clean) applyLaunchAtLogin(clean.launchAtLogin);
  if ('alwaysOnTop' in clean && win) win.setAlwaysOnTop(Boolean(clean.alwaysOnTop), 'floating');
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

ipcMain.handle('clipboard:read', () => clipboard.readText() || '');

ipcMain.handle('ai:query', async (_e, text) => {
  const input = String(text || '').trim();
  if (!input) return { ok: false, error: '先输入要查的内容' };
  try {
    const conf = store.loadConfig();
    const fresh = await askDeepSeek(input, conf);
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
});
