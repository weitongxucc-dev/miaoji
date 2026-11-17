'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const el = {
  pet: $('#pet'),
  petBody: $('#petBody'),
  petImg: $('#petImg'),
  bubble: $('#bubble'),
  petCount: $('#petCount'),
  panel: $('#panel'),
  brand: $('#brand'),
  headAvatar: $('#headAvatar'),
  headStat: $('#headStat'),
  btnCollapse: $('#btnCollapse'),
  btnOpenNote: $('#btnOpenNote'),
  composerWrap: $('#composerWrap'),
  input: $('#input'),
  btnParse: $('#btnParse'),
  clipChip: $('#clipChip'),
  result: $('#result'),
  hotSearch: $('#hotSearch'),
  hotSeg: $('#hotSeg'),
  hotList: $('#hotList'),
  btnHot: $('#btnHot'),
  hotCount: $('#hotCount'),
  hotHeadCount: $('#hotHeadCount'),
  cfgKey: $('#cfgKey'),
  cfgBase: $('#cfgBase'),
  cfgModel: $('#cfgModel'),
  cfgFile: $('#cfgFile'),
  cfgVault: $('#cfgVault'),
  obsStatus: $('#obsStatus'),
  btnObsDetect: $('#btnObsDetect'),
  cfgObsidianOn: $('#cfgObsidianOn'),
  btnGetObsidian: $('#btnGetObsidian'),
  vaultField: $('#vaultField'),
  cfgThreshold: $('#cfgThreshold'),
  cfgLimit: $('#cfgLimit'),
  cfgLaunch: $('#cfgLaunch'),
  btnChoose: $('#btnChoose'),
  btnTest: $('#btnTest'),
  btnSaveCfg: $('#btnSaveCfg'),
  btnSync: $('#btnSync'),
  btnDataDir: $('#btnDataDir'),
  dataDir: $('#dataDir'),
  installDir: $('#installDir'),
  modal: $('#modal'),
  modalCard: $('#modalCard'),
  toast: $('#toast')
};

const state = {
  config: null,
  entries: {},
  dataDir: '',
  installDir: '',
  tab: 'jot',
  filter: 'hot',
  search: '',
  busy: false,
  expanded: false,
  clip: '',
  lastInput: '',
  lastResult: null,
  zone: 0,
  followBusy: false,
  pendingQ: '',
  lastFollowQuestion: '',
  followError: '',
  devFollowup: '',
  obsDetect: null,
  obsDetectAt: 0,
  onboardPending: false,
  onboardShown: false
};

/* ---------------- 工具 ---------------- */

const esc = (v) =>
  String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

const icon = (id, cls = '') => `<svg class="ico ${cls}"><use href="#${id}"></use></svg>`;
const pad2 = (n) => String(n).padStart(2, '0');

/* 轻量富文本：先转义，只放行 **加粗**、`代码`、换行分段和 - / 1. 列表 */
const plainText = (v) => String(v || '')
  .replace(/\*\*|`/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const richInline = (v) =>
  esc(v)
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>');

function richBlock(v) {
  const raw = String(v === null || v === undefined ? '' : v).replace(/\r\n?/g, '\n').trim();
  if (!raw) return '';
  const lines = raw.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  let html = '';
  let list = null;
  const closeList = () => {
    if (!list) return;
    html += `</${list}>`;
    list = null;
  };
  for (const line of lines) {
    const bullet = line.match(/^[-•·]\s+(.+)$/);
    const numbered = line.match(/^\d+[.、)]\s+(.+)$/);
    if (bullet) {
      if (list !== 'ul') {
        closeList();
        html += '<ul>';
        list = 'ul';
      }
      html += `<li>${richInline(bullet[1])}</li>`;
    } else if (numbered) {
      if (list !== 'ol') {
        closeList();
        html += '<ol>';
        list = 'ol';
      }
      html += `<li>${richInline(numbered[1])}</li>`;
    } else {
      closeList();
      html += `<p>${richInline(line)}</p>`;
    }
  }
  closeList();
  return html;
}

function meaningHTML(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const parts = raw.split(/\s*[；;]\s*/).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 5) return `<p class="meaning">${richInline(raw)}</p>`;
  return `<ol class="sense-list">${parts.map((p, i) => `<li>
    <span class="sense-idx">${pad2(i + 1)}</span>
    <span class="sense-text">${richInline(p)}</span>
  </li>`).join('')}</ol>`;
}

function highlightWord(text, word) {
  const safe = esc(text);
  const w = String(word || '').trim();
  if (w.length < 2) return safe;
  const stem = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b(${stem}(?:s|es|ed|d|ing|ly)?)\\b`, 'gi');
  return safe.replace(re, '<b class="hl">$1</b>');
}

function truncate(s, n) {
  const str = String(s || '');
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

function decodeKey(v) {
  try {
    return decodeURIComponent(v || '');
  } catch {
    return v || '';
  }
}

function isToday(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.toDateString() === new Date().toDateString();
}

function fmtShort(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return '今天';
  if (d.getFullYear() === now.getFullYear()) return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

let toastTimer = 0;
function toast(text, type = '') {
  el.toast.textContent = text;
  el.toast.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), type === 'warn' ? 4200 : 2200);
}

/* ---------------- 小机器人状态机 ----------------
   借鉴 Grok Bot 的做法：状态由「片段池 + 随机顺序」组合，
   而不是循环一段固定动画。折叠态和 32px 头像使用不同尺寸与片段。
   ------------------------------------------------- */

const robot = {
  petMode: 'idle',
  petHoldTimer: 0,
  petClipTimer: 0,
  petIdleTimer: 0,
  petSleepTimer: 0,
  petLastClip: '',
  sleeping: false,
  emptyMode: 'idle',
  emptyIdleTimer: 0,
  emptyClipTimer: 0,
  emptyLastClip: '',
  emptyGazeClip: '',
  emptyBody: null,
  emptyImg: null,
  avatarMode: 'idle',
  avatarHoldTimer: 0,
  avatarClipTimer: 0,
  avatarIdleTimer: 0,
  avatarLastClip: '',
  avatarWildTimer: 0,
  avatarWilding: false
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const rand = (min, max) => min + Math.random() * (max - min);
const robotSrc = (mode, compact) => `assets/robot-${mode}${compact ? '-compact' : ''}.png`;

const PET_CLIPS = [
  'blink', 'blink', 'blink', 'wink',
  'look-left', 'look-left', 'look-right', 'look-right',
  'look-up', 'look-down',
  'tilt-left', 'tilt-right', 'squash', 'hop'
];
const PET_CLIPS_REDUCED = ['blink'];
const EMPTY_CLIPS = [
  'blink', 'blink', 'blink', 'wink',
  'look-left', 'look-right', 'look-up', 'look-down',
  'tilt-left', 'tilt-right', 'squash', 'hop'
];
const EMPTY_CLIPS_REDUCED = ['blink'];
const AVATAR_CLIPS = ['blink', 'blink', 'blink', 'wink', 'look-left', 'look-right', 'look-up', 'look-down'];
const AVATAR_CLIPS_REDUCED = ['blink'];

function pickClip(pool, last) {
  const options = pool.filter((x) => x !== last);
  const list = options.length ? options : pool;
  return list[Math.floor(Math.random() * list.length)];
}

function canPetIdle() {
  return (
    !state.expanded &&
    !state.busy &&
    !state.followBusy &&
    !robot.sleeping &&
    !document.body.classList.contains('dragging') &&
    document.visibilityState === 'visible'
  );
}

function canAvatarIdle() {
  return (
    state.expanded &&
    !state.busy &&
    !state.followBusy &&
    document.visibilityState === 'visible'
  );
}

function schedulePetSleep() {
  clearTimeout(robot.petSleepTimer);
  if (state.expanded || robot.sleeping) return;
  robot.petSleepTimer = setTimeout(() => {
    if (canPetIdle() && robot.petMode === 'idle') setPetMode('sleep');
  }, 60000);
}

function setPetMode(mode, hold = 0) {
  clearTimeout(robot.petHoldTimer);
  clearTimeout(robot.petClipTimer);
  clearTimeout(robot.petIdleTimer);
  robot.petHoldTimer = 0;
  robot.petClipTimer = 0;
  robot.petIdleTimer = 0;

  el.petBody.classList.remove('is-tilt-left', 'is-tilt-right', 'is-squash', 'is-hop', 'is-pop', 'is-shake');
  robot.petMode = mode;
  robot.sleeping = mode === 'sleep';

  const src = robotSrc(mode, false);
  if (el.petImg.getAttribute('src') !== src) el.petImg.src = src;
  el.petBody.classList.toggle('is-thinking', mode === 'think');
  el.petBody.classList.toggle('is-sleeping', mode === 'sleep');
  el.petBody.classList.toggle('is-dots', mode === 'dots');
  if (mode === 'happy') el.petBody.classList.add('is-pop');
  if (mode === 'error') el.petBody.classList.add('is-shake');

  if (mode === 'sleep') {
    clearTimeout(robot.petSleepTimer);
  } else if (mode === 'idle') {
    schedulePetIdle(rand(1400, 3000));
    schedulePetSleep();
  } else if (mode === 'think' && !state.expanded) {
    // 折叠态思考久了，做一次轻量的形态变换：变成三个点
    robot.petClipTimer = setTimeout(() => {
      if (robot.petMode === 'think' && !state.expanded && (state.busy || state.followBusy)) {
        setPetMode('dots');
      }
    }, 1600);
  }

  if (hold) {
    robot.petHoldTimer = setTimeout(() => {
      robot.petHoldTimer = 0;
      if (state.busy || state.followBusy) return;
      if (robot.petMode === mode) setPetMode('idle');
    }, hold);
  }
}

function schedulePetIdle(delay) {
  clearTimeout(robot.petIdleTimer);
  robot.petIdleTimer = 0;
  if (!canPetIdle()) return;
  const wait = delay === undefined ? rand(2400, 5200) : delay;
  robot.petIdleTimer = setTimeout(runPetIdleClip, wait);
}

function runPetIdleClip() {
  robot.petIdleTimer = 0;
  if (!canPetIdle()) return;

  const pool = reducedMotion.matches ? PET_CLIPS_REDUCED : PET_CLIPS;
  const clip = pickClip(pool, robot.petLastClip);
  robot.petLastClip = clip;

  const finish = () => {
    robot.petClipTimer = 0;
    el.petImg.src = robotSrc('idle', false);
    el.petBody.classList.remove('is-tilt-left', 'is-tilt-right', 'is-squash', 'is-hop');
    if (canPetIdle()) schedulePetIdle();
  };

  if (clip === 'blink') {
    el.petImg.src = robotSrc('blink', false);
    robot.petClipTimer = setTimeout(() => {
      el.petImg.src = robotSrc('idle', false);
      if (!reducedMotion.matches && Math.random() < 0.3) {
        robot.petClipTimer = setTimeout(() => {
          el.petImg.src = robotSrc('blink', false);
          robot.petClipTimer = setTimeout(finish, 150);
        }, 100);
      } else {
        finish();
      }
    }, 150);
  } else if (clip === 'wink') {
    el.petImg.src = robotSrc('wink', false);
    robot.petClipTimer = setTimeout(finish, 260);
  } else if (clip.startsWith('look-')) {
    el.petImg.src = robotSrc(clip, false);
    robot.petClipTimer = setTimeout(finish, rand(620, 980));
  } else if (clip.startsWith('tilt-')) {
    el.petBody.classList.add(clip === 'tilt-left' ? 'is-tilt-left' : 'is-tilt-right');
    robot.petClipTimer = setTimeout(() => {
      el.petBody.classList.remove('is-tilt-left', 'is-tilt-right');
      finish();
    }, rand(620, 820));
  } else if (clip === 'squash') {
    el.petBody.classList.add('is-squash');
    robot.petClipTimer = setTimeout(() => {
      el.petBody.classList.remove('is-squash');
      finish();
    }, 440);
  } else if (clip === 'hop') {
    el.petBody.classList.add('is-hop');
    robot.petClipTimer = setTimeout(() => {
      el.petBody.classList.remove('is-hop');
      finish();
    }, 560);
  }
}

function wakePet() {
  if (!robot.sleeping) return;
  setPetMode('idle');
}

function settlePet() {
  if (state.busy || state.followBusy) return;
  if (robot.petMode === 'think' || robot.petMode === 'dots') setPetMode('idle');
}

function canEmptyIdle() {
  return (
    state.tab === 'jot' &&
    !state.busy &&
    !state.followBusy &&
    !robot.emptyGazeClip &&
    robot.emptyBody &&
    robot.emptyBody.isConnected &&
    document.visibilityState === 'visible'
  );
}

function stopEmptyRobot() {
  clearTimeout(robot.emptyIdleTimer);
  clearTimeout(robot.emptyClipTimer);
  robot.emptyIdleTimer = 0;
  robot.emptyClipTimer = 0;
  robot.emptyGazeClip = '';
  if (robot.emptyBody) {
    robot.emptyBody.classList.remove('is-tilt-left', 'is-tilt-right', 'is-squash', 'is-hop');
  }
  robot.emptyBody = null;
  robot.emptyImg = null;
  robot.emptyLastClip = '';
}

function startEmptyRobot() {
  const body = document.getElementById('emptyBotBody');
  const img = document.getElementById('emptyBotImg');
  if (!body || !img) return;
  robot.emptyBody = body;
  robot.emptyImg = img;
  img.src = robotSrc('idle', false);
  scheduleEmptyIdle(rand(700, 1500));
}

function scheduleEmptyIdle(delay) {
  clearTimeout(robot.emptyIdleTimer);
  robot.emptyIdleTimer = 0;
  if (!canEmptyIdle()) return;
  const wait = delay === undefined ? rand(1400, 3400) : delay;
  robot.emptyIdleTimer = setTimeout(runEmptyIdleClip, wait);
}

function runEmptyIdleClip() {
  robot.emptyIdleTimer = 0;
  if (!canEmptyIdle()) return;

  const pool = reducedMotion.matches ? EMPTY_CLIPS_REDUCED : EMPTY_CLIPS;
  const clip = pickClip(pool, robot.emptyLastClip);
  robot.emptyLastClip = clip;

  const body = robot.emptyBody;
  const img = robot.emptyImg;
  if (!body || !img) return;

  const finish = () => {
    robot.emptyClipTimer = 0;
    img.src = robotSrc('idle', false);
    body.classList.remove('is-tilt-left', 'is-tilt-right', 'is-squash', 'is-hop');
    if (canEmptyIdle()) scheduleEmptyIdle();
  };

  body.classList.remove('is-tilt-left', 'is-tilt-right', 'is-squash', 'is-hop');

  if (clip === 'blink') {
    img.src = robotSrc('blink', false);
    robot.emptyClipTimer = setTimeout(() => {
      img.src = robotSrc('idle', false);
      if (!reducedMotion.matches && Math.random() < 0.3) {
        robot.emptyClipTimer = setTimeout(() => {
          img.src = robotSrc('blink', false);
          robot.emptyClipTimer = setTimeout(finish, 140);
        }, 100);
      } else {
        finish();
      }
    }, 150);
  } else if (clip === 'wink') {
    img.src = robotSrc('wink', false);
    robot.emptyClipTimer = setTimeout(finish, 260);
  } else if (clip.startsWith('look-')) {
    img.src = robotSrc(clip, false);
    robot.emptyClipTimer = setTimeout(finish, rand(560, 920));
  } else if (clip === 'tilt-left' || clip === 'tilt-right') {
    body.classList.add(clip === 'tilt-left' ? 'is-tilt-left' : 'is-tilt-right');
    robot.emptyClipTimer = setTimeout(finish, rand(620, 860));
  } else if (clip === 'squash') {
    body.classList.add('is-squash');
    robot.emptyClipTimer = setTimeout(finish, 440);
  } else if (clip === 'hop') {
    body.classList.add('is-hop');
    robot.emptyClipTimer = setTimeout(finish, 560);
  }
}

function onEmptyGaze(e) {
  const body = robot.emptyBody;
  const img = robot.emptyImg;
  if (!body || !img) return;

  const r = body.getBoundingClientRect();
  const pad = 14;
  if (
    e.clientX < r.left - pad ||
    e.clientX > r.right + pad ||
    e.clientY < r.top - pad ||
    e.clientY > r.bottom + pad
  ) {
    if (robot.emptyGazeClip) leaveEmptyGaze();
    return;
  }

  const dx = e.clientX - (r.left + r.width / 2);
  const dy = e.clientY - (r.top + r.height * 0.45);
  const clip = Math.abs(dx) >= Math.abs(dy)
    ? (dx < 0 ? 'look-left' : 'look-right')
    : (dy < 0 ? 'look-up' : 'look-down');

  body.classList.toggle('is-tilt-left', dx < -16);
  body.classList.toggle('is-tilt-right', dx > 16);

  if (robot.emptyGazeClip === clip) return;
  robot.emptyGazeClip = clip;
  clearTimeout(robot.emptyIdleTimer);
  robot.emptyIdleTimer = 0;
  if (robot.emptyClipTimer) return;
  img.src = robotSrc(clip, false);
}

function leaveEmptyGaze() {
  robot.emptyGazeClip = '';
  if (!robot.emptyBody) return;
  robot.emptyBody.classList.remove('is-tilt-left', 'is-tilt-right');
  if (robot.emptyClipTimer) return;
  if (robot.emptyImg) robot.emptyImg.src = robotSrc('idle', false);
  scheduleEmptyIdle(rand(500, 1100));
}

function scheduleAvatarIdle(delay) {
  clearTimeout(robot.avatarIdleTimer);
  robot.avatarIdleTimer = 0;
  if (!canAvatarIdle() || robot.avatarMode !== 'idle') return;
  const wait = delay === undefined ? rand(2600, 5400) : delay;
  robot.avatarIdleTimer = setTimeout(runAvatarIdleClip, wait);
}

function runAvatarIdleClip() {
  robot.avatarIdleTimer = 0;
  if (!canAvatarIdle() || robot.avatarMode !== 'idle') return;

  const pool = reducedMotion.matches ? AVATAR_CLIPS_REDUCED : AVATAR_CLIPS;
  const clip = pickClip(pool, robot.avatarLastClip);
  robot.avatarLastClip = clip;

  const avatar = el.headAvatar.parentElement;
  if (avatar) {
    avatar.classList.toggle('is-tilt-left', clip === 'look-left');
    avatar.classList.toggle('is-tilt-right', clip === 'look-right');
  }
  el.headAvatar.src = robotSrc(clip, true);
  robot.avatarClipTimer = setTimeout(() => {
    robot.avatarClipTimer = 0;
    if (robot.avatarMode === 'idle') el.headAvatar.src = robotSrc('idle', true);
    if (avatar) avatar.classList.remove('is-tilt-left', 'is-tilt-right');
    scheduleAvatarIdle();
  }, clip === 'blink' ? 140 : clip === 'wink' ? 260 : rand(520, 760));
}

const AVATAR_WILD_FRAMES = ['look-left', 'wink', 'look-up', 'blink', 'look-right', 'look-down'];

function clearAvatarWild() {
  if (!robot.avatarWilding) return;
  robot.avatarWilding = false;
  clearInterval(robot.avatarWildTimer);
  robot.avatarWildTimer = 0;
  const avatar = el.headAvatar.parentElement;
  if (avatar) avatar.classList.remove('is-wild');
}

function startAvatarWild() {
  if (robot.avatarWilding || reducedMotion.matches) return;
  clearTimeout(robot.avatarHoldTimer);
  clearTimeout(robot.avatarClipTimer);
  clearTimeout(robot.avatarIdleTimer);
  robot.avatarHoldTimer = 0;
  robot.avatarClipTimer = 0;
  robot.avatarIdleTimer = 0;
  robot.avatarMode = 'wild';
  robot.avatarWilding = true;

  const avatar = el.headAvatar.parentElement;
  if (avatar) {
    avatar.classList.remove('is-happy', 'is-error', 'is-thinking', 'is-tilt-left', 'is-tilt-right');
    avatar.classList.add('is-wild');
  }

  let i = 0;
  const frame = () => {
    const clip = AVATAR_WILD_FRAMES[i % AVATAR_WILD_FRAMES.length];
    el.headAvatar.src = robotSrc(clip, true);
    if (avatar) {
      avatar.classList.toggle('is-tilt-left', clip === 'look-left');
      avatar.classList.toggle('is-tilt-right', clip === 'look-right');
    }
    i += 1;
  };
  frame();
  robot.avatarWildTimer = setInterval(frame, 110);
}

function stopAvatarWild() {
  if (!robot.avatarWilding) return;
  clearAvatarWild();
  setHeadAvatar(state.busy || state.followBusy ? 'think' : 'idle');
}

function setHeadAvatar(mode, hold = 0) {
  clearAvatarWild();
  clearTimeout(robot.avatarHoldTimer);
  clearTimeout(robot.avatarClipTimer);
  clearTimeout(robot.avatarIdleTimer);
  robot.avatarHoldTimer = 0;
  robot.avatarClipTimer = 0;
  robot.avatarIdleTimer = 0;
  robot.avatarMode = mode;

  el.headAvatar.src = robotSrc(mode, true);
  const avatar = el.headAvatar.parentElement;
  if (avatar) {
    avatar.classList.remove('is-happy', 'is-error', 'is-thinking', 'is-tilt-left', 'is-tilt-right');
    if (mode === 'happy' || mode === 'error' || mode === 'think') {
      void avatar.offsetWidth;
      avatar.classList.add(mode === 'think' ? 'is-thinking' : 'is-' + mode);
    }
  }

  if (mode === 'idle') scheduleAvatarIdle();
  if (hold) {
    robot.avatarHoldTimer = setTimeout(() => {
      robot.avatarHoldTimer = 0;
      if (robot.avatarMode === mode) setHeadAvatar('idle');
    }, hold);
  }
}

/* ---------------- 统计 ---------------- */

function stats() {
  const all = Object.values(state.entries);
  const today = all.filter((e) => isToday(e.lastAt)).length;
  const hot = all.filter((e) => !e.mastered && (e.count || 1) >= (state.config?.hotThreshold || 3)).length;
  return { total: all.length, today, hot };
}

function renderStats() {
  if (!state.config) return;
  const s = stats();
  el.headStat.textContent = s.total === 0
    ? '今天还没查词'
    : s.today === 0
      ? `今天还没查词 · 累计 ${s.total}`
      : `今天 ${s.today} · 累计 ${s.total}`;

  if (s.today > 0) {
    el.petCount.textContent = `今日 ${s.today}`;
    el.bubble.classList.remove('hidden');
  } else if (s.total === 0) {
    el.petCount.textContent = '查词';
    el.bubble.classList.remove('hidden');
  } else {
    el.bubble.classList.add('hidden');
  }

  if (s.hot > 0) {
    el.hotCount.textContent = String(s.hot);
    el.hotCount.classList.remove('hidden');
    if (el.btnHot) el.btnHot.setAttribute('aria-label', `热词，${s.hot} 个`);
  } else {
    el.hotCount.classList.add('hidden');
    if (el.btnHot) el.btnHot.setAttribute('aria-label', '热词');
  }
}

/* ---------------- 词条渲染 ---------------- */

function entryGist(e) {
  return plainText(e.meaning_zh || e.sentence_translation || '');
}

function countPill(e) {
  const n = e.count || 1;
  return `<span class="count-pill${n <= 1 ? ' is-new' : ''}">${n <= 1 ? 'NEW' : n + '次'}</span>`;
}

function tags(list) {
  return (list || []).map((x) => `<span class="tag">${esc(x)}</span>`).join('');
}

function basicsZone(e) {
  const isSentence = e.kind === 'sentence';
  let body = '';

  if (isSentence) {
    body += `<div class="rich-text sentence-trans">${richBlock(e.sentence_translation)}</div>`;
    if (e.key_points && e.key_points.length) {
      body += `<div class="sec-label"><span>要点</span><b>${pad2(e.key_points.length)}</b></div>
        <ul class="point-list">${e.key_points.map((p) => `<li>${richInline(p)}</li>`).join('')}</ul>`;
    }
    if (e.key_words && e.key_words.length) {
      body += `<div class="sec-label"><span>关键词</span><b>${pad2(e.key_words.length)}</b></div>
        <ul class="kw-list">${e.key_words.map((k) => `<li><b>${esc(k.word)}</b>${k.meaning ? ' · ' + esc(k.meaning) : ''}</li>`).join('')}</ul>`;
    }
    if (e.note) {
      body += `<p class="note-line"><span>${richInline(e.note)}</span></p>`;
    }
  } else {
    if (e.meaning_zh) body += meaningHTML(e.meaning_zh);
    if (e.definition_en) body += `<p class="def-en">${richInline(e.definition_en)}</p>`;

    if (e.examples && e.examples.length) {
      body += `<div class="sec-label"><span>例句</span><b>${pad2(e.examples.length)}</b></div>
        <div class="examples">${e.examples.map((x, i) => `
          <div class="ex">
            <span class="ex-idx">${pad2(i + 1)}</span>
            <div>
              <p class="ex-en">${highlightWord(x.en, e.word)}</p>
              ${x.zh ? `<p class="ex-zh">${richInline(x.zh)}</p>` : ''}
            </div>
          </div>`).join('')}</div>`;
    }

    const syn = tags(e.synonyms);
    const col = tags(e.collocations);
    if (syn && col) {
      body += `<div class="two-col">
        <div><div class="sec-label"><span>近义</span></div><div class="tag-row">${syn}</div></div>
        <div><div class="sec-label"><span>搭配</span></div><div class="tag-row">${col}</div></div>
      </div>`;
    } else if (syn) {
      body += `<div class="sec-label"><span>近义</span></div><div class="tag-row">${syn}</div>`;
    } else if (col) {
      body += `<div class="sec-label"><span>搭配</span></div><div class="tag-row">${col}</div>`;
    }

    if (e.memory) {
      body += `<div class="memory">${icon('i-bulb', 'sm')}<span>${richInline(e.memory)}</span></div>`;
    }
    if (e.note) {
      body += `<p class="note-line"><span>${richInline(e.note)}</span></p>`;
    }
  }

  return `<section class="zone${state.zone === 0 ? ' active' : ''}" data-zone="0"><div class="zone-inner">${body}</div></section>`;
}

function originHasContent(o) {
  if (!o) return false;
  return Boolean(
    o.root || o.first_use || o.story || o.why ||
    (o.timeline && o.timeline.length) ||
    (o.scenes && o.scenes.length) ||
    (o.related && o.related.length)
  );
}

function originZone(e) {
  const o = e.origin || {};
  const isSentence = e.kind === 'sentence';
  let body = '';

  if (!originHasContent(o)) {
    body = `<div class="missing-origin">
      <p>这条记录还没有脉络资料。重新解析一次，让 AI 补上词源、历史演变和关联场景。</p>
      <button class="btn sm ghost" data-reparse>${icon('i-repeat')}重新解析</button>
    </div>`;
  } else {
    const facts = [];
    if (o.root) facts.push(`<div class="fact"><b>${isSentence ? '出处' : '词源'}</b><span>${esc(o.root)}</span></div>`);
    if (o.first_use) facts.push(`<div class="fact"><b>最早</b><span>${esc(o.first_use)}</span></div>`);
    if (facts.length) body += `<div class="origin-facts">${facts.join('')}</div>`;

    if (o.story) {
      body += `<div class="sec-label"><span>${isSentence ? '语境' : '脉络'}</span></div>
        <div class="rich-text origin-story">${richBlock(o.story)}</div>`;
    }

    if (o.timeline && o.timeline.length) {
      body += `<div class="sec-label"><span>时间脉络</span><b>${pad2(o.timeline.length)}</b></div>
        <ol class="timeline">${o.timeline.map((t) => `
          <li>
            <span class="t-when">${esc(t.when || '—')}</span>
            <span class="t-what">${esc(t.what)}</span>
          </li>`).join('')}</ol>`;
    }

    if (o.scenes && o.scenes.length) {
      body += `<div class="sec-label"><span>关联场景</span></div>
        <ul class="scene-list">${o.scenes.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`;
    }

    if (o.why) {
      body += `<div class="why-box"><span class="why-tag">辨析</span><p>${richInline(o.why)}</p></div>`;
    }

    if (o.related && o.related.length) {
      body += `<div class="sec-label"><span>相关</span></div><div class="related-row">${tags(o.related)}</div>`;
    }
  }

  return `<section class="zone${state.zone === 1 ? ' active' : ''}" data-zone="1"><div class="zone-inner">${body}</div></section>`;
}

function lastUserQuestion(e) {
  const thread = Array.isArray(e.thread) ? e.thread : [];
  for (let i = thread.length - 1; i >= 0; i--) {
    if (thread[i].role === 'user' && thread[i].text) return thread[i].text;
  }
  return '';
}

function defaultSuggestions(e) {
  if (e.kind === 'sentence') {
    return ['这句话的语法结构是什么？', '换成口语怎么说？', '关键词还有别的用法吗？'];
  }
  return ['它和近义词的差别是什么？', '再给一个技术语境的例句', '口语里怎么替换它？'];
}

function suggestionsFor(e) {
  const lastQ = lastUserQuestion(e);
  let list = (e.followups || []).filter((q) => q && q !== lastQ);
  if (!list.length) list = defaultSuggestions(e);
  return list.slice(0, 3);
}

function threadTurns(e) {
  const thread = Array.isArray(e.thread) ? e.thread : [];
  let out = thread.map((m) => {
    const who = m.role === 'assistant' ? '答' : '问';
    const cls = m.role === 'assistant' ? 'a' : 'q';
    const text = m.role === 'assistant'
      ? `<div class="rich-text">${richBlock(m.text)}</div>`
      : `<p>${esc(m.text)}</p>`;
    return `<div class="turn ${cls}">
      <span class="turn-tag">${who}</span>
      <div class="turn-text">${text}</div>
    </div>`;
  }).join('');

  if (state.followBusy && state.pendingQ) {
    out += `<div class="turn q pending">
      <span class="turn-tag">问</span>
      <p class="turn-text">${esc(state.pendingQ)}</p>
    </div>
    <div class="turn a">
      <span class="turn-tag">答</span>
      <p class="turn-text">正在想<span class="typing"><i></i><i></i><i></i></span></p>
    </div>`;
  }

  if (state.followError) {
    out += `<div class="thread-error">
      ${esc(state.followError)}
      ${state.lastFollowQuestion ? `<br><button class="btn sm ghost" data-retry-follow>${icon('i-repeat')}重试刚才的问题</button>` : ''}
    </div>`;
  }
  return out;
}

function followHTML(e) {
  const active = state.zone === 2;
  const turns = threadTurns(e);
  const suggestions = suggestionsFor(e);
  const hasThread = Array.isArray(e.thread) && e.thread.length > 0;
  const empty = !hasThread && !state.followBusy && !state.followError;
  const suggestHTML = suggestions.map((q) => `
    <button class="suggest" data-suggest="${encodeURIComponent(q)}" ${state.followBusy ? 'disabled' : ''}>
      ${icon('i-chevron')}<span>${esc(q)}</span>
    </button>`).join('');

  return `<section class="zone follow${active ? ' active' : ''}${empty ? ' is-empty' : ''}" data-zone="2">
    <div class="thread-scroll" id="threadScroll">
      ${hasThread || state.followBusy || state.followError ? turns : `
        <div class="thread-empty">
          <div class="thread-empty-title">${icon('i-spark')}继续追问</div>
          <p class="thread-empty-copy">词义辨析、用法差别、词源背景，都可以问。<br>问答会一起写进 Obsidian。</p>
          ${suggestions.length ? suggestHTML : ''}
        </div>`}
    </div>
    <div class="follow-bottom">
      ${empty ? '' : (suggestions.length ? `<div class="suggest-label">${icon('i-spark')}接着问</div>${suggestHTML}` : '')}
      <form class="follow-form" data-follow-form>
        <input id="followInput" class="follow-input" type="text" autocomplete="off" spellcheck="false"
          placeholder="继续问点什么…" ${state.followBusy ? 'disabled' : ''}>
        <button id="followSend" class="follow-send" type="submit" aria-label="发送" ${state.followBusy ? 'disabled' : ''}>
          ${icon('i-send')}
        </button>
      </form>
    </div>
  </section>`;
}

function dossierHTML(e) {
  const isSentence = e.kind === 'sentence';
  const meta = [];
  if (e.phonetic) meta.push(`<span class="phon">${esc(e.phonetic)}</span>`);
  if (e.pos) meta.push(`<span class="pos-tag">${esc(e.pos)}</span>`);
  if (e.mastered) meta.push('<span class="pos-tag">已掌握</span>');
  meta.push(`<button class="speak-btn" data-speak="${esc(e.word)}" title="朗读">${icon('i-speaker')}</button>`);

  const zones = [
    { id: 0, label: '释义' },
    { id: 1, label: '脉络' },
    { id: 2, label: '追问' }
  ];
  const hasThread = Array.isArray(e.thread) && e.thread.length > 0;

  return `<div class="dossier">
    <header class="dossier-head">
      <div class="dossier-top">
        <div class="word-wrap">
          <h2 class="headword${isSentence ? ' is-sentence' : ''}"${isSentence ? ` title="${esc(e.word)}"` : ''}>${isSentence ? '<span class="sentence-flag">句</span>' + esc(e.word) : esc(e.word)}</h2>
        </div>
        <div class="dossier-tools">
          <button class="more-btn" data-new title="查新词" aria-label="查新词">${icon('i-plus')}</button>
          ${countPill(e)}
          <button class="more-btn" data-more title="词条操作" aria-label="词条操作">${icon('i-more')}</button>
        </div>
      </div>
      <div class="dossier-meta">${meta.join('')}</div>
    </header>
    <nav class="zone-tabs" aria-label="内容分区">
      ${zones.map((z) => `
        <button class="zone-tab${state.zone === z.id ? ' active' : ''}" data-zone="${z.id}">
          <span class="num">0${z.id + 1}</span>
          <span class="lbl">${z.label}</span>
          ${z.id === 2 && hasThread ? '<span class="follow-dot"></span>' : ''}
        </button>`).join('')}
    </nav>
    <div class="zone-stack">
      ${basicsZone(e)}
      ${originZone(e)}
      ${followHTML(e)}
    </div>
  </div>`;
}

/* ---------------- 空 / 加载 / 错误 ---------------- */

function renderEmpty() {
  document.body.classList.remove('result-view');
  el.composerWrap.classList.remove('hidden');

  const recent = Object.values(state.entries)
    .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt))
    .slice(0, 4);
  const needKey = !state.config || !state.config.hasApiKey;

  el.result.innerHTML = `<div class="empty">
    <div class="empty-bot-body" id="emptyBotBody">
      <img id="emptyBotImg" class="empty-bot" src="assets/robot-idle.png" alt="">
    </div>
    <h3>${needKey ? '先填一个 API Key' : '把词丢进来'}</h3>
    <p>${needKey
      ? '秒记用 DeepSeek 解析词义、词源和技术脉络，Key 只存在你这台电脑上。'
      : '单词、短语、句子都行。释义、例句、词源脉络一次给出，并自动写进 Obsidian。'}</p>
    ${needKey
      ? `<div class="recent-row"><button class="recent-chip warn" data-settings>去设置 API Key</button></div>`
      : ''}
    ${recent.length ? `<div class="recent-row"><span class="recent-label">最近</span>${recent.map((e) => `
      <button class="recent-chip" data-key="${encodeURIComponent(e.key)}" title="${esc(e.word)}">${esc(truncate(e.word, 18))}</button>`).join('')}</div>` : ''}
  </div>`;
  startEmptyRobot();
}

function renderLoading(text) {
  stopEmptyRobot();
  el.result.innerHTML = `<div class="state-card">
    <img class="state-bot" src="assets/robot-think.png" alt="">
    <p class="state-title">正在解析 <b>${esc(truncate(text, 30))}</b></p>
    <div class="loader"><i></i><i></i><i></i><i></i><i></i></div>
    <p class="help">释义、词源脉络和新追问会一起准备好</p>
  </div>`;
  setHeadAvatar('think');
  setPetMode('think');
}

function renderError(message) {
  stopEmptyRobot();
  state.lastResult = null;
  document.body.classList.remove('result-view');
  el.composerWrap.classList.remove('hidden');
  el.result.innerHTML = `<div class="state-card error-card">
    <div class="error-head">${icon('i-warn')}<h3>这次没解析成功</h3></div>
    <p class="error-msg">${esc(message)}</p>
    <div class="error-actions">
      <button class="btn sm ghost" data-retry>${icon('i-repeat')}重试</button>
      <button class="btn sm ghost" data-settings>${icon('i-gear')}设置</button>
    </div>
  </div>`;
  if (state.lastInput) {
    el.input.value = state.lastInput;
    autoGrow();
  }
  setHeadAvatar('error', 1400);
  setPetMode('error', 1400);
}

function renderResult() {
  stopEmptyRobot();
  if (!state.lastResult) {
    renderEmpty();
    return;
  }
  const meta = state.lastResult;
  const e = meta.entry;
  document.body.classList.add('result-view');
  el.composerWrap.classList.add('hidden');
  el.result.innerHTML = dossierHTML(e);
  requestAnimationFrame(() => {
    if (state.zone === 2) scrollThreadBottom();
  });
}

function updateFollowZone() {
  if (!state.lastResult) return;
  const e = state.lastResult.entry;
  const current = $('.zone.follow', el.result);
  if (!current) return;
  current.outerHTML = followHTML(e);

  const tab = $('.zone-tab[data-zone="2"]', el.result);
  const hasThread = Array.isArray(e.thread) && e.thread.length > 0;
  if (tab && hasThread && !$('.follow-dot', tab)) {
    tab.insertAdjacentHTML('beforeend', '<span class="follow-dot"></span>');
  }

  if (state.zone === 2) {
    scrollThreadBottom();
    if (!state.followBusy) {
      const input = $('#followInput');
      if (input) input.focus();
    }
  }
}

function scrollThreadBottom() {
  const box = $('#threadScroll');
  if (box) box.scrollTop = box.scrollHeight;
}

/* ---------------- 热词 ---------------- */

function hotItemHTML(e, idx) {
  const isSentence = e.kind === 'sentence';
  const meaning = entryGist(e);
  const mastered = e.mastered ? ' mastered' : '';
  return `<button class="hot-row${isSentence ? ' is-sentence' : ''}${mastered}" data-key="${encodeURIComponent(e.key)}" title="${esc(e.word)}">
    <span class="idx">${pad2(idx + 1)}</span>
    <span class="hot-main">
      <span class="hot-word-line">
        <span class="hot-word">${esc(isSentence ? truncate(e.word, 64) : e.word)}</span>
        <span class="hot-count">${e.count || 1}</span>
        ${e.mastered ? '<span class="hot-count">✓</span>' : ''}
      </span>
      <span class="hot-meaning">${esc(truncate(meaning, 58))}</span>
      <span class="hot-meta"><span>${fmtShort(e.lastAt)}</span><span>${(e.thread && e.thread.length) ? '有追问' : '未追问'}</span></span>
    </span>
    <span class="chev">${icon('i-chevron')}</span>
  </button>`;
}

function renderHot() {
  if (!state.config) return;
  const q = state.search.trim().toLowerCase();
  let list = Object.values(state.entries).filter((e) => {
    if (!q) return true;
    const hay = [e.word, e.meaning_zh, e.sentence_translation, e.memory, e.note].join(' ').toLowerCase();
    return hay.includes(q);
  });

  if (state.filter === 'hot') {
    list = list.filter((e) => !e.mastered && (e.count || 1) >= state.config.hotThreshold);
    list.sort((a, b) => (b.count || 0) - (a.count || 0) || new Date(b.lastAt) - new Date(a.lastAt));
  } else if (state.filter === 'mastered') {
    list = list.filter((e) => e.mastered);
    list.sort((a, b) => new Date(b.masteredAt || b.lastAt) - new Date(a.masteredAt || a.lastAt));
  } else {
    list.sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
  }

  el.hotHeadCount.textContent = String(list.length);

  if (!list.length) {
    const searching = Boolean(state.search.trim());
    const msg = searching
      ? '没有匹配的词条。'
      : state.filter === 'hot'
        ? `还没有热词。<br>同一个词查询满 <b>${state.config.hotThreshold}</b> 次就会出现在这里。`
        : state.filter === 'mastered'
          ? '还没有标记为已掌握的词。'
          : '还没有记录。<br>回到「查词」记下第一个词吧。';
    const action = searching
      ? '<button class="btn sm ghost" data-clear-search>清除搜索</button>'
      : state.filter === 'mastered'
        ? '<button class="btn sm ghost" data-all-words>查看全部词条</button>'
        : '<button class="btn sm ghost" data-go-jot>去查一个词</button>';
    el.hotList.innerHTML = `<div class="hot-empty">
      <img src="assets/robot-think.png" alt="">
      <div>${msg}</div>
      ${action}
    </div>`;
    return;
  }

  el.hotList.innerHTML = list.map((e, i) => hotItemHTML(e, i)).join('');
}

function renderAll() {
  renderStats();
  if (state.tab === 'hot') renderHot();
}

/* ---------------- 查询 / 追问 ---------------- */

function autoGrow() {
  el.input.style.height = 'auto';
  el.input.style.height = Math.min(104, Math.max(42, el.input.scrollHeight)) + 'px';
}

function setParseBusy(busy) {
  el.btnParse.disabled = busy;
  const label = el.btnParse.querySelector('span');
  if (label) label.textContent = busy ? '解析中' : '解析';
}

async function parse(text) {
  if (state.busy) return;
  if (state.followBusy) {
    toast('等这次追问回答完再查新词', 'warn');
    return;
  }
  const input = String(text === undefined ? el.input.value : text).trim();
  if (!input) {
    toast('先粘贴或输入一个词');
    el.input.focus();
    return;
  }

  state.lastInput = input;
  state.busy = true;
  state.zone = 0;
  state.pendingQ = '';
  state.followError = '';
  setParseBusy(true);
  renderLoading(input);

  try {
    const res = await window.api.query(input);
    if (!res.ok) {
      renderError(res.error);
      toast(res.error, 'warn');
      return;
    }
    state.entries[res.entry.key] = res.entry;
    state.lastResult = {
      entry: res.entry,
      obsidian: res.obsidian,
      isNew: res.isNew,
      cached: false,
      animate: true
    };
    state.zone = 0;
    el.input.value = '';
    autoGrow();
    renderResult();
    renderAll();
    setHeadAvatar('happy', 1000);
    setPetMode('happy', 1000);

    if (state.devFollowup) {
      const followText = state.devFollowup;
      state.devFollowup = '';
      setTimeout(() => { setZone(2); sendFollowUp(followText); }, 450);
    }

    if (res.obsidian && res.obsidian.ok) {
      toast(res.isNew ? '新词已记入 Obsidian' : `已累计到第 ${res.count} 次 · 笔记已更新`);
    } else {
      toast('已记录在本机，但写入 Obsidian 失败：' + (res.obsidian?.error || '未知错误'), 'warn');
    }
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    renderError(msg);
    toast(msg, 'warn');
  } finally {
    state.busy = false;
    setParseBusy(false);
    autoGrow();
    settlePet();
  }
}

function sendFollowUp(text) {
  const q = String(text || '').trim();
  if (!q) {
    const input = $('#followInput');
    if (input) input.focus();
    return;
  }
  if (state.followBusy || state.busy) return;
  if (!state.lastResult) return;

  const key = state.lastResult.entry.key;
  state.followBusy = true;
  state.pendingQ = q;
  state.lastFollowQuestion = q;
  state.followError = '';
  setHeadAvatar('think');
  setPetMode('think');
  updateFollowZone();

  window.api.followUp(key, q).then((res) => {
    state.followBusy = false;
    state.pendingQ = '';

    if (!res || !res.ok) {
      state.followError = (res && res.error) || '追问失败，请重试';
      if (state.lastResult && state.lastResult.entry.key === key) {
        updateFollowZone();
        const input = $('#followInput');
        if (input) {
          input.value = q;
          input.focus();
        }
      }
      setHeadAvatar('error', 1200);
      setPetMode('error', 1200);
      toast(state.followError, 'warn');
      return;
    }

    state.entries[res.entry.key] = res.entry;
    if (state.lastResult && state.lastResult.entry.key === res.entry.key) {
      state.lastResult.entry = res.entry;
      state.lastResult.obsidian = res.obsidian;
      updateFollowZone();
    } else {
      renderStats();
    }

    renderStats();
    setHeadAvatar('happy', 900);
    setPetMode('happy', 900);
    if (res.obsidian && res.obsidian.ok) {
      toast('回答已写入 Obsidian');
    } else {
      toast('回答已保存在本机，但 Obsidian 写入失败：' + (res.obsidian?.error || '未知错误'), 'warn');
    }
  }).catch((err) => {
    state.followBusy = false;
    state.pendingQ = '';
    state.followError = err && err.message ? err.message : String(err);
    if (state.lastResult && state.lastResult.entry.key === key) {
      updateFollowZone();
      const input = $('#followInput');
      if (input) {
        input.value = q;
        input.focus();
      }
    }
    setHeadAvatar('error', 1200);
    setPetMode('error', 1200);
    toast(state.followError, 'warn');
  });
}

function setZone(n) {
  if (!state.lastResult) return;
  state.zone = n;
  $$('.zone-tab', el.result).forEach((b) => b.classList.toggle('active', Number(b.dataset.zone) === n));
  $$('.zone', el.result).forEach((z) => z.classList.toggle('active', Number(z.dataset.zone) === n));
  if (n === 2) {
    scrollThreadBottom();
    requestAnimationFrame(() => {
      const input = $('#followInput');
      if (input) input.focus();
    });
  }
}

function startNew() {
  if (state.followBusy) {
    toast('等这次追问回答完再查新词', 'warn');
    return;
  }
  state.lastResult = null;
  state.zone = 0;
  state.pendingQ = '';
  state.followError = '';
  state.lastFollowQuestion = '';
  document.body.classList.remove('result-view');
  el.input.value = '';
  autoGrow();
  renderEmpty();
  refreshClipboard(true);
  setTimeout(() => el.input.focus(), 30);
}

function loadEntry(entry) {
  if (!entry) return;
  if (state.busy) {
    toast('正在解析，等结果出来再切换', 'warn');
    return;
  }
  if (state.followBusy) {
    toast('等这次追问回答完再切换词条', 'warn');
    return;
  }
  state.lastResult = {
    entry,
    obsidian: null,
    cached: true,
    isNew: false,
    animate: false
  };
  state.zone = 0;
  state.pendingQ = '';
  state.followError = '';
  state.lastFollowQuestion = '';
  switchTab('jot');
  renderResult();
  renderStats();
  setHeadAvatar('idle');
}

/* ---------------- 剪贴板 ---------------- */

async function refreshClipboard(autofill) {
  let text = '';
  try {
    text = await window.api.readClipboard();
  } catch {
    return;
  }
  const clean = String(text || '').replace(/\u0000/g, '').trim();
  state.clip = clean;
  const letters = (clean.match(/[A-Za-z]/g) || []).length;
  const nonSpace = clean.replace(/\s+/g, '').length;
  const usable =
    clean.length > 0 &&
    clean.length <= 400 &&
    letters >= 2 &&
    letters / Math.max(1, nonSpace) > 0.6 &&
    !/[\\/]|https?:|```/.test(clean);

  if (usable) {
    el.clipChip.innerHTML = `${icon('i-clipboard', 'sm')}<span>${esc(truncate(clean, 34))}</span>`;
    el.clipChip.classList.remove('hidden');
    if (autofill && !state.lastResult && (!el.input.value.trim() || el.input.value.trim() === state.lastInput)) {
      el.input.value = clean;
      autoGrow();
      el.input.select();
    }
  } else {
    el.clipChip.classList.add('hidden');
  }
}

/* ---------------- 展开 / 收起 ---------------- */

function setExpanded(v) {
  state.expanded = Boolean(v);
  document.body.classList.toggle('expanded', state.expanded);
  if (state.expanded) {
    closeModal();
    wakePet();
    setPetMode(state.busy || state.followBusy ? 'think' : 'idle');
    setHeadAvatar(state.busy || state.followBusy ? 'think' : 'idle');
    refreshClipboard(true);
    if (!state.lastResult) setTimeout(() => el.input.focus(), 100);
    maybeOnboardObsidian();
  } else {
    closeModal();
    setHeadAvatar('idle');
    setPetMode(state.busy || state.followBusy ? 'think' : 'idle');
  }
}

function switchTab(tab) {
  state.tab = tab;
  $$('.nav-icon').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + tab));
  document.body.classList.toggle('result-view', tab === 'jot' && Boolean(state.lastResult) && !state.busy);
  if (tab === 'hot') renderHot();
  if (tab === 'settings') fillSettings();
  if (tab === 'jot' && !state.lastResult) setTimeout(() => el.input.focus(), 40);
  if (tab !== 'jot') stopEmptyRobot();
  else if (!state.lastResult) startEmptyRobot();
}

function closeModal() {
  el.modal.classList.add('hidden');
  el.modalCard.innerHTML = '';
  el.modal.dataset.key = '';
}

function openDetail(entry) {
  if (!entry) return;
  const isSentence = entry.kind === 'sentence';
  el.modalCard.innerHTML = `
    <div class="modal-head">
      <h3>词条操作</h3>
      <button class="icon-btn" data-close aria-label="关闭">${icon('i-x')}</button>
    </div>
    <p class="modal-word${isSentence ? ' is-sentence' : ''}">${esc(truncate(entry.word, 120))}</p>
    <p class="modal-sub">${esc(truncate(entryGist(entry), 100))}</p>
    <div class="modal-actions">
      <button class="btn ghost" data-action="reparse">${icon('i-repeat')}重新解析</button>
      <button class="btn ghost" data-action="master">${icon('i-check')}${entry.mastered ? '取消掌握' : '标记掌握'}</button>
      <button class="btn ghost" data-action="open">${icon('i-open')}打开笔记</button>
      <button class="btn danger" data-action="delete">${icon('i-trash')}删除</button>
    </div>
    <p class="modal-note">重新解析会刷新释义和词源脉络，并累计一次查询。删除会同时移除 Obsidian 里的词条块。</p>`;
  el.modal.dataset.key = entry.key;
  el.modal.classList.remove('hidden');
}

async function openNote() {
  const r = await window.api.openNote();
  if (!r.ok) toast('打不开笔记：' + r.error, 'warn');
}

/* ---------------- 设置 ---------------- */

async function refreshObsidianDetect(force = false) {
  if (!el.obsStatus) return;
  if (!force && state.obsDetect && Date.now() - state.obsDetectAt < 30000) {
    renderObsDetect();
    return;
  }
  el.obsStatus.textContent = '正在检测 Obsidian…';
  el.obsStatus.classList.remove('warn');
  try {
    state.obsDetect = await window.api.detectObsidian();
  } catch {
    state.obsDetect = { installed: false, vaults: [] };
  }
  state.obsDetectAt = Date.now();
  renderObsDetect();
}

function renderObsDetect() {
  const d = state.obsDetect || { installed: false, vaults: [] };
  const vaults = Array.isArray(d.vaults) ? d.vaults : [];
  el.obsStatus.textContent = d.installed
    ? `已检测到 Obsidian${vaults.length ? ` · ${vaults.length} 个库` : '（还没有库）'}`
    : '未检测到 Obsidian';
  el.obsStatus.classList.toggle('warn', !d.installed);
  el.btnGetObsidian.classList.toggle('hidden', Boolean(d.installed));
  el.vaultField.classList.toggle('hidden', vaults.length === 0);

  const cur = String(state.config?.obsidianFile || '');
  const match = vaults.find((v) => cur.toLowerCase().startsWith(String(v.path).toLowerCase()));
  const opts = vaults.map((v) => `
    <option value="${esc(v.path)}">${esc(v.path)}${v.open ? '（当前打开）' : ''}</option>`);
  if (!match) {
    opts.unshift(`<option value="">${cur ? '（当前使用下方自定义路径）' : '选择一个库…'}</option>`);
  }
  el.cfgVault.innerHTML = opts.join('');
  el.cfgVault.value = match ? match.path : '';
}

async function maybeOnboardObsidian() {
  const c = state.config;
  if (!c || state.onboardShown || c.obsidianOnboarded || c.obsidianFile) return;
  if (!state.expanded) {
    state.onboardPending = true;
    return;
  }
  state.onboardPending = false;
  state.onboardShown = true;
  await refreshObsidianDetect(true);
  showObsidianOnboard();
}

function showObsidianOnboard() {
  const d = state.obsDetect || { installed: false, vaults: [] };
  const vaults = Array.isArray(d.vaults) ? d.vaults : [];
  const vaultList = vaults.map((v) => `
    <button class="onboard-vault" data-obs-vault="${esc(v.path)}">
      ${icon('i-book')}<span>${esc(v.path)}</span>${v.open ? '<em>当前打开</em>' : ''}
    </button>`).join('');

  let body = '';
  if (!d.installed) {
    body = `<p class="modal-sub">没有检测到 Obsidian。秒记可以先独立使用，词条保存在本机；之后装了 Obsidian 再回来开启。</p>`;
  } else if (!vaults.length) {
    body = `<p class="modal-sub">检测到 Obsidian，但还没有库。先在 Obsidian 里创建一个库，再回来点「重新检测」。</p>`;
  } else {
    body = `<p class="modal-sub">找到 Obsidian。选一个库，笔记会写到「库\\秒记\\生词本.md」。</p>
      <div class="onboard-list">${vaultList}</div>`;
  }

  el.modalCard.innerHTML = `
    <div class="modal-head">
      <h3>笔记写到哪？</h3>
      <button class="icon-btn" data-obs-later aria-label="稍后">${icon('i-x')}</button>
    </div>
    ${body}
    <div class="modal-actions">
      ${d.installed ? '' : `<button class="btn ghost" data-obs-download>${icon('i-open')}下载 Obsidian</button>`}
      <button class="btn ghost" data-obs-redetect>${icon('i-repeat')}重新检测</button>
      <button class="btn primary" data-obs-later>先不用 Obsidian</button>
    </div>
    <p class="modal-note">不用 Obsidian 也能查词；热词和追问记录都在秒记本地。</p>`;
  el.modal.dataset.key = '';
  el.modal.classList.remove('hidden');
}

async function finishObsidianOnboard() {
  const r = await window.api.saveConfig({ obsidianOnboarded: true, obsidianEnabled: false });
  if (r.ok) state.config = r.config;
  closeModal();
  toast('先存本地，之后可在设置里开启 Obsidian');
}

function fillSettings() {
  if (!state.config) return;
  el.cfgKey.value = state.config.apiKey || '';
  el.cfgBase.value = state.config.baseUrl || '';
  el.cfgModel.value = state.config.model || '';
  el.cfgFile.value = state.config.obsidianFile || '';
  el.cfgObsidianOn.checked = Boolean(state.config.obsidianEnabled);
  el.cfgThreshold.value = state.config.hotThreshold || 3;
  el.cfgLimit.value = state.config.hotLimit || 15;
  el.cfgLaunch.checked = Boolean(state.config.launchAtLogin);
  el.dataDir.textContent = state.dataDir || '—';
  el.dataDir.title = state.dataDir || '';
  el.installDir.textContent = state.installDir || '—';
  el.installDir.title = state.installDir || '';
  refreshObsidianDetect();
}

async function saveSettings(showFeedback = true) {
  const patch = {
    apiKey: el.cfgKey.value.trim(),
    baseUrl: el.cfgBase.value.trim(),
    model: el.cfgModel.value.trim(),
    hotThreshold: Number(el.cfgThreshold.value) || 3,
    hotLimit: Number(el.cfgLimit.value) || 15,
    launchAtLogin: el.cfgLaunch.checked
  };
  const r = await window.api.saveConfig(patch);
  if (!r.ok) {
    toast(r.error || '保存失败', 'warn');
    return false;
  }
  state.config = r.config;
  fillSettings();
  renderAll();
  if (showFeedback) toast('设置已保存');
  return true;
}

/* ---------------- 拖拽 / 机器人 ---------------- */

function bindPetDrag() {
  let dragging = null;
  let moved = false;
  let frame = 0;
  let pending = null;

  function flush() {
    frame = 0;
    if (!dragging || !pending) return;
    window.api.dragMove(pending.x, pending.y);
    pending = null;
  }

  function endDrag(allowClick) {
    if (!dragging) return;
    const wasDrag = moved;
    dragging = null;
    pending = null;
    moved = false;
    document.body.classList.remove('dragging');
    window.api.dragEnd();
    if (allowClick && !wasDrag) {
      wakePet();
      setPetMode('happy');
      setTimeout(() => {
        setPetMode('idle');
        window.api.expand();
      }, 130);
    } else if (wasDrag) {
      if (!state.expanded) setPetMode(state.busy || state.followBusy ? 'think' : 'idle');
    }
  }

  el.pet.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    wakePet();
    dragging = { sx: e.screenX, sy: e.screenY };
    moved = false;
    window.api.dragStart(e.screenX, e.screenY);
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    if (e.buttons === 0) {
      endDrag(false);
      return;
    }
    const dx = e.screenX - dragging.sx;
    const dy = e.screenY - dragging.sy;
    if (!moved && Math.abs(dx) + Math.abs(dy) > 4) {
      moved = true;
      document.body.classList.add('dragging');
    }
    if (!moved) return;
    pending = { x: e.screenX, y: e.screenY };
    if (!frame) frame = requestAnimationFrame(flush);
  });

  window.addEventListener('mouseup', () => endDrag(true));
  window.addEventListener('blur', () => endDrag(false));

  el.pet.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      wakePet();
      window.api.expand();
    }
  });
  el.pet.addEventListener('pointerenter', wakePet);
  el.pet.addEventListener('focus', wakePet);
}

/* ---------------- 事件 ---------------- */

function bindBrand() {
  const brand = el.brand;
  if (!brand) return;

  let pressTimer = 0;
  let pressed = false;
  let wild = false;
  let startX = 0;
  let startY = 0;
  let stopTimer = 0;

  const cancelPress = () => {
    clearTimeout(pressTimer);
    pressTimer = 0;
  };

  const finish = (collapse) => {
    if (!pressed) return;
    pressed = false;
    cancelPress();
    if (wild) {
      wild = false;
      stopTimer = setTimeout(stopAvatarWild, 620);
    } else if (collapse) {
      window.api.collapse();
    }
  };

  brand.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    clearTimeout(stopTimer);
    pressed = true;
    wild = false;
    startX = e.clientX;
    startY = e.clientY;
    try {
      brand.setPointerCapture(e.pointerId);
    } catch {
      /* 合成事件可能没有 pointerId */
    }
    cancelPress();
    pressTimer = setTimeout(() => {
      pressTimer = 0;
      wild = true;
      startAvatarWild();
    }, 480);
  });

  window.addEventListener('pointerup', () => finish(true));
  window.addEventListener('pointercancel', () => finish(false));
  brand.addEventListener('pointermove', (e) => {
    if (!pressed) return;
    if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > 8) {
      pressed = false;
      cancelPress();
      if (wild) {
        wild = false;
        stopAvatarWild();
      }
    }
  });

  brand.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      window.api.collapse();
    }
  });

  brand.addEventListener('contextmenu', (e) => e.preventDefault());
}

function bind() {
  bindPetDrag();
  bindBrand();

  el.pet.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!state.expanded) window.api.petMenu();
  });

  el.btnCollapse.addEventListener('click', () => window.api.collapse());
  el.btnOpenNote.addEventListener('click', openNote);

  el.btnParse.addEventListener('click', () => parse());

  el.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      parse();
    }
  });
  el.input.addEventListener('input', autoGrow);

  el.clipChip.addEventListener('click', () => {
    if (!state.clip) return;
    el.input.value = state.clip;
    autoGrow();
    el.input.focus();
    el.input.setSelectionRange(el.input.value.length, el.input.value.length);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!el.modal.classList.contains('hidden')) {
      closeModal();
    } else if (state.expanded) {
      window.api.collapse();
    }
  });

  $$('.nav-icon').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

  el.hotSearch.addEventListener('input', () => {
    state.search = el.hotSearch.value;
    renderHot();
  });

  el.hotSeg.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-filter]');
    if (!btn) return;
    state.filter = btn.dataset.filter;
    $$('button', el.hotSeg).forEach((b) => b.classList.toggle('active', b === btn));
    renderHot();
  });

  el.hotList.addEventListener('click', (e) => {
    if (e.target.closest('[data-go-jot]')) {
      switchTab('jot');
      el.input.focus();
      return;
    }
    if (e.target.closest('[data-all-words]')) {
      state.filter = 'all';
      state.search = '';
      el.hotSearch.value = '';
      $$('button', el.hotSeg).forEach((b) => b.classList.toggle('active', b.dataset.filter === 'all'));
      renderHot();
      return;
    }
    if (e.target.closest('[data-clear-search]')) {
      state.search = '';
      el.hotSearch.value = '';
      renderHot();
      el.hotSearch.focus();
      return;
    }
    const row = e.target.closest('.hot-row');
    if (!row) return;
    const key = decodeKey(row.dataset.key);
    if (state.entries[key]) loadEntry(state.entries[key]);
  });

  el.result.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.dataset.speak !== undefined) {
      speak(btn.dataset.speak);
      return;
    }

    const zone = btn.dataset.zone;
    if (zone !== undefined) {
      setZone(Number(zone));
      return;
    }

    if (btn.dataset.suggest !== undefined) {
      sendFollowUp(decodeKey(btn.dataset.suggest));
      return;
    }

    if (btn.dataset.key !== undefined) {
      const key = decodeKey(btn.dataset.key);
      if (state.entries[key]) loadEntry(state.entries[key]);
      return;
    }

    if (btn.dataset.more !== undefined) {
      if (state.lastResult) openDetail(state.lastResult.entry);
      return;
    }

    if (btn.dataset.reparse !== undefined) {
      if (state.lastResult) {
        const word = state.lastResult.entry.word;
        el.input.value = word;
        autoGrow();
        parse(word);
      }
      return;
    }

    if (btn.dataset.retryFollow !== undefined) {
      sendFollowUp(state.lastFollowQuestion);
      return;
    }

    if (btn.dataset.retry !== undefined) {
      parse(state.lastInput);
      return;
    }

    if (btn.dataset.settings !== undefined) {
      switchTab('settings');
      return;
    }

    if (btn.dataset.open !== undefined) {
      openNote();
      return;
    }

    if (btn.dataset.new !== undefined) {
      startNew();
    }
  });

  el.result.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-follow-form]');
    if (!form) return;
    e.preventDefault();
    sendFollowUp($('#followInput', form)?.value);
  });

  el.result.addEventListener('keydown', (e) => {
    if (e.target.id !== 'followInput') return;
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      sendFollowUp(e.target.value);
    }
  });

  el.modal.addEventListener('click', (e) => {
    if (e.target === el.modal) {
      closeModal();
      return;
    }
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.obsLater !== undefined) {
      finishObsidianOnboard();
      return;
    }
    if (btn.dataset.obsDownload !== undefined) {
      window.api.openObsidianDownload();
      return;
    }
    if (btn.dataset.obsRedetect !== undefined) {
      btn.disabled = true;
      refreshObsidianDetect(true).then(() => {
        showObsidianOnboard();
        if (state.obsDetect && state.obsDetect.installed) toast('检测完成');
        else toast('还是没有检测到 Obsidian', 'warn');
      });
      return;
    }
    if (btn.dataset.obsVault !== undefined) {
      window.api.useVault(btn.dataset.obsVault).then((r) => {
        if (!r.ok) {
          toast(r.error || '设置失败', 'warn');
          return;
        }
        state.config = r.config;
        closeModal();
        fillSettings();
        toast('笔记会写到所选库的「秒记\\生词本.md」');
      });
      return;
    }
    if (btn.dataset.close !== undefined) {
      closeModal();
      return;
    }
    const action = btn.dataset.action;
    if (!action) return;

    const key = el.modal.dataset.key;
    const entry = state.entries[key];
    if (!entry) {
      closeModal();
      return;
    }

    if (action === 'open') {
      openNote();
    } else if (action === 'reparse') {
      closeModal();
      el.input.value = entry.word;
      autoGrow();
      parse(entry.word);
    } else if (action === 'master') {
      window.api.master(key, !entry.mastered).then((r) => {
        if (!r.ok) {
          toast(r.error || '操作失败', 'warn');
          return;
        }
        state.entries[key] = r.entry;
        closeModal();
        renderAll();
        if (state.lastResult && state.lastResult.entry.key === key) {
          state.lastResult.entry = r.entry;
          renderResult();
        }
        toast(r.entry.mastered ? '已标记为掌握' : '已移回热词');
      });
    } else if (action === 'delete') {
      if (!window.confirm(`删除「${truncate(entry.word, 30)}」？\n会同时从 Obsidian 笔记中移除。`)) return;
      window.api.remove(key).then((r) => {
        if (!r.ok) {
          toast(r.error || '删除失败', 'warn');
          return;
        }
        delete state.entries[key];
        closeModal();
        renderAll();
        if (state.lastResult && state.lastResult.entry.key === key) {
          state.lastResult = null;
          startNew();
        }
        toast('已删除');
      });
    }
  });

  el.cfgLaunch.addEventListener('change', async () => {
    const r = await window.api.setLaunch(el.cfgLaunch.checked);
    if (r.ok) {
      state.config = r.config;
      toast(el.cfgLaunch.checked ? '已开启开机启动' : '已关闭开机启动');
    } else {
      toast('设置开机启动失败', 'warn');
    }
  });

  el.btnChoose.addEventListener('click', async () => {
    const r = await window.api.chooseFile();
    if (r.canceled) return;
    state.config = r.config;
    fillSettings();
    toast('已切换生词本文件');
  });

  el.btnObsDetect.addEventListener('click', async () => {
    await refreshObsidianDetect(true);
    toast(state.obsDetect?.installed ? '检测完成' : '没有检测到 Obsidian', state.obsDetect?.installed ? '' : 'warn');
  });

  el.btnGetObsidian.addEventListener('click', () => window.api.openObsidianDownload());

  el.cfgVault.addEventListener('change', async () => {
    const dir = el.cfgVault.value;
    if (!dir) return;
    const r = await window.api.useVault(dir);
    if (!r.ok) {
      toast(r.error || '设置失败', 'warn');
      return;
    }
    state.config = r.config;
    fillSettings();
    toast('笔记会写到所选库的「秒记\\生词本.md」');
  });

  el.cfgObsidianOn.addEventListener('change', async () => {
    const on = el.cfgObsidianOn.checked;
    if (on && !state.config?.obsidianFile) {
      el.cfgObsidianOn.checked = false;
      await refreshObsidianDetect(true);
      const vaults = state.obsDetect?.vaults || [];
      if (vaults.length) showObsidianOnboard();
      else toast('先选择一个 Obsidian 库，或手动选择生词本文件', 'warn');
      return;
    }
    const r = await window.api.saveConfig({ obsidianEnabled: on, obsidianOnboarded: true });
    if (!r.ok) {
      el.cfgObsidianOn.checked = !on;
      toast(r.error || '保存失败', 'warn');
      return;
    }
    state.config = r.config;
    el.cfgObsidianOn.checked = Boolean(state.config.obsidianEnabled);
    toast(on ? '已开启笔记写入' : '已关闭笔记写入，只存本地');
  });

  el.btnSaveCfg.addEventListener('click', () => saveSettings(true));

  el.btnTest.addEventListener('click', async () => {
    const saved = await saveSettings(false);
    if (!saved) return;
    toast('正在连接 DeepSeek…');
    const r = await window.api.testApi();
    if (r.ok) toast('连接成功');
    else toast('连接失败：' + r.error, 'warn');
  });

  el.btnSync.addEventListener('click', async () => {
    if (!window.confirm('将按本地记录重新生成整篇笔记。\n你在文件里手动添加的内容会丢失，确定继续？')) return;
    const r = await window.api.syncNote();
    if (r.ok) toast(`已重新生成，共 ${r.count} 条`);
    else toast('生成失败：' + r.error, 'warn');
  });

  el.btnDataDir.addEventListener('click', async () => {
    const r = await window.api.openDataDir();
    if (!r.ok) toast('打不开数据目录：' + r.error, 'warn');
  });

  window.api.on('ui:expanded', () => setExpanded(true));
  window.api.on('ui:collapsed', () => setExpanded(false));
  window.api.on('ui:nav', (tab) => {
    if (tab) switchTab(tab);
  });
  window.api.on('ui:toast', (payload) => {
    if (payload && payload.text) toast(payload.text, payload.type || '');
  });
  window.api.on('ui:focus', () => {
    if (state.expanded && !state.busy && !state.followBusy) {
      refreshClipboard(!state.lastResult);
    }
  });
  window.api.on('ui:dev-query', (text) => {
    if (!text) return;
    switchTab('jot');
    el.input.value = text;
    autoGrow();
    parse(text);
  });
  window.api.on('ui:dev-followup', (text) => {
    if (!text) return;
    if (!state.lastResult) {
      state.devFollowup = text;
      return;
    }
    setZone(2);
    sendFollowUp(text);
  });
  window.api.on('ui:dev-zone', (zone) => {
    if (!state.lastResult) return;
    setZone(Math.max(0, Math.min(2, Number(zone) || 0)));
  });
}

/* ---------------- 朗读 ---------------- */

const voiceCache = { list: [] };
function loadVoices() {
  try {
    voiceCache.list = window.speechSynthesis.getVoices() || [];
  } catch {
    voiceCache.list = [];
  }
}
if ('speechSynthesis' in window) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

function speak(text) {
  if (!('speechSynthesis' in window)) {
    toast('这台电脑没有可用的朗读引擎', 'warn');
    return;
  }
  const sentence = String(text || '').trim();
  if (!sentence) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(sentence);
  utter.lang = 'en-US';
  utter.rate = 0.92;
  const voices = voiceCache.list.length ? voiceCache.list : window.speechSynthesis.getVoices();
  const preferred =
    voices.find((v) => /^en-(US|GB)/i.test(v.lang) && /natural|aria|jenny|guy|zira|david/i.test(v.name)) ||
    voices.find((v) => /^en-(US|GB)/i.test(v.lang)) ||
    voices.find((v) => /^en/i.test(v.lang));
  if (preferred) utter.voice = preferred;
  window.speechSynthesis.speak(utter);
}

/* ---------------- 启动 ---------------- */

async function initData() {
  try {
    const data = await window.api.init();
    state.config = data.config;
    state.entries = data.entries || {};
    state.dataDir = data.userData || '';
    state.installDir = data.installDir || '';
    state.expanded = Boolean(data.expanded);
    document.body.classList.toggle('expanded', state.expanded);
    renderStats();
    renderEmpty();
    if (state.expanded) refreshClipboard(true);
    setHeadAvatar('idle');
    setPetMode('idle');
  } catch (err) {
    document.body.classList.add('expanded');
    window.api.expand();
    el.result.innerHTML = `<div class="state-card error-card">
      <div class="error-head">${icon('i-warn')}<h3>启动失败</h3></div>
      <p class="error-msg">${esc(err && err.message ? err.message : err)}</p>
    </div>`;
  }
}

el.result.addEventListener('pointermove', onEmptyGaze);
el.result.addEventListener('pointerleave', leaveEmptyGaze);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearAvatarWild();
    clearTimeout(robot.petIdleTimer);
    clearTimeout(robot.petClipTimer);
    clearTimeout(robot.avatarIdleTimer);
    clearTimeout(robot.avatarClipTimer);
    clearTimeout(robot.emptyIdleTimer);
    clearTimeout(robot.emptyClipTimer);
    robot.petIdleTimer = 0;
    robot.petClipTimer = 0;
    robot.avatarIdleTimer = 0;
    robot.avatarClipTimer = 0;
    robot.emptyIdleTimer = 0;
    robot.emptyClipTimer = 0;
  } else if (!state.expanded) {
    if (robot.petMode === 'idle') schedulePetIdle(700);
  } else if (robot.avatarMode === 'idle') {
    scheduleAvatarIdle(900);
    if (state.tab === 'jot' && !state.lastResult) scheduleEmptyIdle(900);
  }
});

if (reducedMotion.addEventListener) {
  reducedMotion.addEventListener('change', () => {
    clearTimeout(robot.petIdleTimer);
    clearTimeout(robot.petClipTimer);
    clearTimeout(robot.avatarIdleTimer);
    clearTimeout(robot.avatarClipTimer);
    clearTimeout(robot.emptyIdleTimer);
    clearTimeout(robot.emptyClipTimer);
    if (robot.petMode === 'idle') setPetMode('idle');
    if (robot.avatarMode === 'idle') setHeadAvatar('idle');
    if (robot.emptyMode === 'idle' && robot.emptyBody) scheduleEmptyIdle(500);
  });
}

bind();
initData().then(() => maybeOnboardObsidian());
