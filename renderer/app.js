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
  modeSeg: $('#modeSeg'),
  clipChip: $('#clipChip'),
  result: $('#result'),
  hotSearch: $('#hotSearch'),
  hotSeg: $('#hotSeg'),
  hotList: $('#hotList'),
  btnHot: $('#btnHot'),
  hotCount: $('#hotCount'),
  hotHeadCount: $('#hotHeadCount'),
  btnReview: $('#btnReview'),
  reviewDue: $('#reviewDue'),
  reviewStats: $('#reviewStats'),
  reviewArea: $('#reviewArea'),
  btnQuiz: $('#btnQuiz'),
  statsArea: $('#statsArea'),
  statsWeek: $('#statsWeek'),
  agentLog: $('#agentLog'),
  agentInput: $('#agentInput'),
  agentChips: $('#agentChips'),
  btnAgentSend: $('#btnAgentSend'),
  trackList: $('#trackList'),
  trackName: $('#trackName'),
  btnAddTrack: $('#btnAddTrack'),
  trackPresets: $('#trackPresets'),
  cfgReviewDaily: $('#cfgReviewDaily'),
  cfgClipWatch: $('#cfgClipWatch'),
  cfgClipPause: $('#cfgClipPause'),
  clipPauseRow: $('#clipPauseRow'),
  cfgRecommend: $('#cfgRecommend'),
  cfgWeeklyAuto: $('#cfgWeeklyAuto'),
  cfgVideoCookies: $('#cfgVideoCookies'),
  cfgArticleHost: $('#cfgArticleHost'),
  cfgArticleCookies: $('#cfgArticleCookies'),
  btnSaveArticleCookies: $('#btnSaveArticleCookies'),
  btnClearArticleCookies: $('#btnClearArticleCookies'),
  articleCookieNote: $('#articleCookieNote'),
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
  appVersion: $('#appVersion'),
  btnCheckUpdate: $('#btnCheckUpdate'),
  updateNote: $('#updateNote'),
  btnOpenRelease: $('#btnOpenRelease'),
  modal: $('#modal'),
  modalCard: $('#modalCard'),
  toast: $('#toast')
};

const state = {
  config: null,
  entries: {},
  dataDir: '',
  installDir: '',
  version: '',
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
  onboardShown: false,
  reviewSession: null,
  reviewGrades: [],
  quiz: null,
  quizBusy: false,
  statsData: null,
  weekly: null,
  weeklyBusy: false,
  statsRange: '7',
  agentLog: [],
  agentBusy: false,
  clipWatchText: '',
  clipWatchTimer: 0,
  captureMode: 'auto'
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
  avatarWilding: false,
  petWildTimer: 0,
  petWilding: false,
  quipTimer: 0
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const rand = (min, max) => min + Math.random() * (max - min);
const robotSrc = (mode, compact) => `assets/robot-${mode}${compact ? '-compact' : ''}.png`;

const PET_CLIPS = [
  'blink', 'blink', 'blink', 'wink',
  'look-left', 'look-left', 'look-right', 'look-right',
  'look-up', 'look-down', 'squint', 'smirk',
  'tilt-left', 'tilt-right', 'squash', 'hop'
];
const PET_CLIPS_REDUCED = ['blink'];
const EMPTY_CLIPS = [
  'blink', 'blink', 'blink', 'wink',
  'look-left', 'look-right', 'look-up', 'look-down',
  'squint', 'smirk',
  'tilt-left', 'tilt-right', 'squash', 'hop'
];
const EMPTY_CLIPS_REDUCED = ['blink'];
const AVATAR_CLIPS = ['blink', 'blink', 'blink', 'wink', 'look-left', 'look-right', 'look-up', 'look-down', 'squint'];
const AVATAR_CLIPS_REDUCED = ['blink'];

// 长按机器人时快速轮换的表情：眼睛左右晃、眯眼、坏笑、惊讶
const PET_WILD_FRAMES = ['look-left', 'look-right', 'squint', 'wink', 'look-up', 'smirk', 'look-down', 'surprised'];
const PET_QUIPS = [
  '别戳我，痒',
  '我在记单词',
  '轻点…',
  '再按就记住了',
  '今天复习了吗',
  '查个词？',
  '手别抖',
  '再戳就收费'
];

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
  if (robot.petWilding) {
    robot.petWilding = false;
    clearInterval(robot.petWildTimer);
    robot.petWildTimer = 0;
  }
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

/* ---------------- 长按机器人：发疯 + 俏皮话 ---------------- */

function showQuip(text, ms = 2000) {
  clearTimeout(robot.quipTimer);
  el.petCount.textContent = text;
  el.bubble.classList.add('quip');
  robot.quipTimer = setTimeout(() => {
    el.bubble.classList.remove('quip');
    renderStats();
  }, ms);
}

function startPetWild() {
  if (robot.petWilding || reducedMotion.matches) return;
  clearTimeout(robot.petIdleTimer);
  clearTimeout(robot.petClipTimer);
  robot.petIdleTimer = 0;
  robot.petClipTimer = 0;
  robot.petWilding = true;
  el.petBody.classList.remove('is-squash', 'is-hop', 'is-shake', 'is-tilt-left', 'is-tilt-right');

  let i = 0;
  const frame = () => {
    const clip = PET_WILD_FRAMES[i % PET_WILD_FRAMES.length];
    el.petImg.src = robotSrc(clip, false);
    el.petBody.classList.toggle('is-tilt-left', clip === 'look-left');
    el.petBody.classList.toggle('is-tilt-right', clip === 'look-right');
    i += 1;
  };
  frame();
  robot.petWildTimer = setInterval(frame, 100);
}

function stopPetWild() {
  if (!robot.petWilding) return;
  robot.petWilding = false;
  clearInterval(robot.petWildTimer);
  robot.petWildTimer = 0;
  el.petBody.classList.remove('is-tilt-left', 'is-tilt-right');
  el.petImg.src = robotSrc('idle', false);
  if (canPetIdle()) schedulePetIdle(rand(1200, 2400));
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

/** 后台可能新增了词条（术语流水线 / Agent），重新拉一次本机数据 */
async function reloadEntries() {
  try {
    const data = await window.api.init();
    state.entries = data.entries || {};
    state.config = data.config || state.config;
    renderStats();
    renderAll();
    if (state.tab === 'stats') renderStatsView();
  } catch {
    /* 拉取失败时保留当前界面 */
  }
}

function stats() {
  const all = Object.values(state.entries);
  const today = all.filter((e) => isToday(e.lastAt)).length;
  const hot = all.filter((e) => !e.mastered && (e.count || 1) >= (state.config?.hotThreshold || 3)).length;
  const now = Date.now();
  const due = all.filter((e) => !e.mastered && !e.graduated && e.nextReviewAt && new Date(e.nextReviewAt).getTime() <= now);
  const todayStr = new Date().toDateString();
  let doneToday = 0;
  for (const e of all) {
    for (const r of Array.isArray(e.reviews) ? e.reviews : []) {
      if (r && r.at && new Date(r.at).toDateString() === todayStr) doneToday += 1;
    }
  }
  const reviewedWords = all.filter((e) => Array.isArray(e.reviews) && e.reviews.length > 0).length;
  const stable = all.filter((e) => e.graduated || e.mastered).length;
  return { total: all.length, today, hot, due, doneToday, reviewedWords, stable };
}

function renderStats() {
  if (!state.config) return;
  const s = stats();
  el.headStat.textContent = s.total === 0
    ? '今天还没查词'
    : s.today === 0
      ? `今天还没查词 · 累计 ${s.total}`
      : `今天 ${s.today} · 累计 ${s.total}`;
  // 回顾页头部的差距统计跟全站状态走，复习打完分立即反映
  if (el.reviewStats) {
    el.reviewStats.innerHTML = `已收 <b>${s.total}</b> · 复习过 <b>${s.reviewedWords}</b> · 稳固 <b>${s.stable}</b>`;
  }

  // 气泡：有到期复习时优先提醒「回顾 N」，机器人成为复习信使
  const dueLeft = Math.max(0, s.due.length - Math.min(s.doneToday, s.due.length));
  if (state.clipWatchText && !state.expanded) {
    el.petCount.textContent = '收 ' + truncate(state.clipWatchText, 7);
    el.bubble.classList.add('clipwatch');
    el.bubble.classList.remove('hidden');
  } else if (dueLeft > 0 && s.due.length > 0) {
    el.bubble.classList.remove('clipwatch');
    el.petCount.textContent = `回顾 ${Math.min(dueLeft, state.config.reviewDaily || 5)}`;
    el.bubble.classList.remove('hidden');
  } else if (s.today > 0) {
    el.bubble.classList.remove('clipwatch');
    el.petCount.textContent = `今日 ${s.today}`;
    el.bubble.classList.remove('hidden');
  } else if (s.total === 0) {
    el.bubble.classList.remove('clipwatch');
    el.petCount.textContent = '查词';
    el.bubble.classList.remove('hidden');
  } else {
    el.bubble.classList.add('hidden');
  }

  if (s.due.length > 0) {
    el.reviewDue.textContent = String(s.due.length);
    el.reviewDue.classList.remove('hidden');
  } else {
    el.reviewDue.classList.add('hidden');
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
  return plainText(e.meaning_zh || e.sentence_translation || e.summary || '');
}

function countPill(e) {
  const n = e.count || 1;
  return `<span class="count-pill${n <= 1 ? ' is-new' : ''}">${n <= 1 ? 'NEW' : n + '次'}</span>`;
}

function tags(list) {
  return (list || []).map((x) => `<span class="tag">${esc(x)}</span>`).join('');
}

/** 原文按段落输出，保留换行；内容一律转义 */
function originalHTML(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
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
    if (e.kind === 'lookup' && e.lookup_zh) {
      body += `<div class="lookup-src"><span class="lookup-lbl">你想表达</span><b>${esc(e.lookup_zh)}</b></div>`;
    }
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
  const isClip = e.kind === 'clip';
  const isNote = e.kind === 'note';
  const isLookup = e.kind === 'lookup';
  const isLongHead = isSentence || isClip || isNote;
  const kindTag = { clip: '剪藏', note: '闪念', lookup: '反查' }[e.kind] || '';
  const tracks = state.config?.tracks || [];
  const meta = [];
  if (kindTag) meta.push(`<span class="pos-tag">${kindTag}</span>`);
  if (e.source && e.source.type === 'video') {
    const bits = ['🎬'];
    if (e.source.author) bits.push(esc(e.source.author));
    if (e.source.durationSeconds) {
      const n = Math.round(Number(e.source.durationSeconds) || 0);
      bits.push(`${Math.floor(n / 60)}分${String(n % 60).padStart(2, '0')}秒`);
    }
    if (e.source.transcriptSource) bits.push(esc(e.source.transcriptSource));
    meta.push(`<span class="src-tag">${bits.join(' · ')}</span>`);
  }
  if (e.source && e.source.site && isClip) meta.push(`<span class="src-tag">${esc(e.source.site)}</span>`);
  if (e.phonetic) meta.push(`<span class="phon">${esc(e.phonetic)}</span>`);
  if (e.pos) meta.push(`<span class="pos-tag">${esc(e.pos)}</span>`);
  if (e.mastered) meta.push('<span class="pos-tag">已掌握</span>');
  if (tracks.length) {
    const options = ['<option value="">方向</option>']
      .concat(tracks.map((t) => `<option value="${esc(t.id)}"${e.track === t.id ? ' selected' : ''}>${esc(t.name)}</option>`))
      .join('');
    meta.push(`<select class="track-select" data-track-select title="学习方向：AI 会按它解释这个词">${options}</select>`);
  }
  if (!isClip && !isNote) {
    meta.push(`<button class="speak-btn" data-speak="${esc(e.word)}" title="朗读">${icon('i-speaker')}</button>`);
  }

  const zones = isClip
    ? [{ id: 0, label: '摘要' }, { id: 1, label: '原文' }, { id: 2, label: '追问' }]
    : isNote
      ? [{ id: 0, label: '整理' }, { id: 1, label: '原文' }, { id: 2, label: '追问' }]
      : isLookup
        ? [{ id: 0, label: '释义' }, { id: 1, label: '辨析' }, { id: 2, label: '追问' }]
        : [{ id: 0, label: '释义' }, { id: 1, label: '脉络' }, { id: 2, label: '追问' }];
  const hasThread = Array.isArray(e.thread) && e.thread.length > 0;
  const zoneStack = isClip
    ? clipBasicsZone(e) + clipOriginalZone(e) + followHTML(e)
    : isNote
      ? noteBasicsZone(e) + noteOriginalZone(e) + followHTML(e)
      : isLookup
        ? basicsZone(e) + lookupAltZone(e) + followHTML(e)
        : basicsZone(e) + originZone(e) + followHTML(e);

  return `<div class="dossier">
    <header class="dossier-head">
      <div class="dossier-top">
        <div class="word-wrap">
          <h2 class="headword${isLongHead ? (isSentence ? ' is-sentence' : ' is-title') : ''}"${isLongHead ? ` title="${esc(e.word)}"` : ''}>${isSentence ? '<span class="sentence-flag">句</span>' + esc(e.word) : esc(e.word)}</h2>
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
      ${zoneStack}
    </div>
  </div>`;
}

/* ---------------- 剪藏 / 闪念 / 反查 的分区 ---------------- */

function termsHTML(terms) {
  if (!terms || !terms.length) return '';
  return `<div class="sec-label"><span>文中术语</span><b>${pad2(terms.length)}</b></div>
    <ul class="term-list">${terms.map((t) => `
      <li class="term-row">
        <button class="term-word" data-collect-term="${esc(t.word)}" title="查这个术语，收进复习">${esc(t.word)}</button>
        ${t.meaning ? `<span class="term-mean">${esc(t.meaning)}</span>` : ''}
      </li>`).join('')}</ul>`;
}

function clipBasicsZone(e) {
  let body = '';
  if (e.summary) body += `<div class="rich-text clip-summary">${richBlock(e.summary)}</div>`;
  if (e.key_points && e.key_points.length) {
    body += `<div class="sec-label"><span>关键点</span><b>${pad2(e.key_points.length)}</b></div>
      <ul class="point-list">${e.key_points.map((p) => `<li>${richInline(p)}</li>`).join('')}</ul>`;
  }
  body += termsHTML(e.terms);
  if (e.terms && e.terms.length) {
    body += `<button class="btn ghost sm pipeline-btn" data-collect-all="${esc(e.key)}">${icon('i-spark')}把这 ${e.terms.length} 个术语全部收进复习</button>`;
  }
  if (e.note) body += `<p class="note-line"><span>${richInline(e.note)}</span></p>`;
  if (e.source && e.source.url) {
    body += `<button class="link-btn sm clip-link" data-open-url="${esc(e.source.url)}">${icon('i-open')}打开原网页</button>`;
  }
  return `<section class="zone${state.zone === 0 ? ' active' : ''}" data-zone="0"><div class="zone-inner">${body}</div></section>`;
}

function clipOriginalZone(e) {
  if (!e.original) {
    return `<section class="zone${state.zone === 1 ? ' active' : ''}" data-zone="1"><div class="zone-inner">
      <div class="missing-origin"><p>这条记录没有保存原文。</p></div></div></section>`;
  }
  return `<section class="zone${state.zone === 1 ? ' active' : ''}" data-zone="1"><div class="zone-inner">
    <div class="sec-label"><span>原文</span><b>${pad2(e.original.length)}</b></div>
    <div class="original-text">${originalHTML(e.original)}</div>
  </div></section>`;
}

function noteBasicsZone(e) {
  let body = '';
  if (e.summary) body += `<div class="rich-text note-summary">${richBlock(e.summary)}</div>`;
  if (e.key_points && e.key_points.length) {
    body += `<div class="sec-label"><span>要点</span><b>${pad2(e.key_points.length)}</b></div>
      <ul class="point-list">${e.key_points.map((p) => `<li>${richInline(p)}</li>`).join('')}</ul>`;
  }
  body += termsHTML(e.terms);
  if (e.note) body += `<p class="note-line"><span>${richInline(e.note)}</span></p>`;
  return `<section class="zone${state.zone === 0 ? ' active' : ''}" data-zone="0"><div class="zone-inner">${body}</div></section>`;
}

function noteOriginalZone(e) {
  return `<section class="zone${state.zone === 1 ? ' active' : ''}" data-zone="1"><div class="zone-inner">
    <div class="sec-label"><span>你写下的原文</span></div>
    <div class="original-text">${originalHTML(e.original || '')}</div>
  </div></section>`;
}

function lookupAltZone(e) {
  const alts = e.alternatives || [];
  let body = '';
  if (alts.length) {
    body += `<div class="sec-label"><span>备选表达</span><b>${pad2(alts.length)}</b></div>
      <ul class="alt-list">${alts.map((a) => `
        <li><b>${esc(a.en)}</b>${a.nuance ? `<span>${esc(a.nuance)}</span>` : ''}</li>`).join('')}</ul>`;
  }
  if (e.memory) body += `<div class="memory">${icon('i-bulb', 'sm')}<span>${richInline(e.memory)}</span></div>`;
  if (e.note) body += `<p class="note-line"><span>${richInline(e.note)}</span></p>`;
  if (!body) body = `<div class="missing-origin"><p>这条反查没有备选表达。</p></div>`;
  return `<section class="zone${state.zone === 1 ? ' active' : ''}" data-zone="1"><div class="zone-inner">${body}</div></section>`;
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
      : '单词、句子、网页链接、一段随手记都行。理解、整理和复习，一次做完，并自动写进 Obsidian。'}</p>
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
    const hay = [e.word, e.meaning_zh, e.sentence_translation, e.summary, e.memory, e.note,
      (e.terms || []).map((t) => t.word + ' ' + t.meaning).join(' ')].join(' ').toLowerCase();
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
  if (state.tab === 'review') renderReview();
}

/* ---------------- 回顾（提取式复习） ---------------- */

const REVIEW_GRADES = [
  { g: 0, label: '没想起', key: '1', hint: '明天再来' },
  { g: 1, label: '模糊', key: '2', hint: '3 天后' },
  { g: 2, label: '想起来了', key: '3', hint: '进入下一阶段' }
];

function trackNameOf(trackId) {
  const t = (state.config?.tracks || []).find((x) => x.id === trackId);
  return t ? t.name : '';
}

function dueEntries() {
  const now = Date.now();
  return Object.values(state.entries)
    // 毕业的词也会在 60/120/240 天后回来确认一次
    .filter((e) => !e.mastered && e.nextReviewAt && new Date(e.nextReviewAt).getTime() <= now)
    .sort((a, b) => new Date(a.nextReviewAt) - new Date(b.nextReviewAt));
}

function renderReview() {
  if (!state.config || !el.reviewArea) return;
  if (el.btnQuiz) el.btnQuiz.textContent = state.quiz ? '退出考官' : 'AI 考官';
  if (state.quiz) return renderQuizCard();
  const s = stats();

  // 进行中的会话优先渲染
  if (state.reviewSession) return renderReviewCard();

  const remaining = Math.max(0, (state.config.reviewDaily || 5) - s.doneToday);
  const due = dueEntries();
  const list = due.slice(0, remaining);
  const backlog = due.length - list.length;

  if (!list.length) {
    const next = Object.values(state.entries)
      .filter((e) => !e.mastered && e.nextReviewAt)
      .sort((a, b) => new Date(a.nextReviewAt) - new Date(b.nextReviewAt))[0];
    const done = s.doneToday > 0;
    el.reviewArea.innerHTML = `<div class="review-empty">
      <img src="assets/robot-${done ? 'happy' : 'idle'}.png" alt="">
      <div class="review-empty-title">${done ? '今天的回顾完成了' : '今天没有到期的词'}</div>
      <div class="review-empty-sub">${
        next
          ? `下一个到期：${esc(truncate(next.word, 24))} · ${fmtShort(next.nextReviewAt)}`
          : '查一个词，明天它就会回到这里等你'
      }<br>记住的秘诀不是多看，是先想再翻。</div>
    </div>`;
    return;
  }

  el.reviewArea.innerHTML = `<div class="review-done">
    <img src="assets/robot-idle.png" alt="">
    <div class="review-empty-title">${list.length} 个词到期</div>
    <div class="review-empty-sub">按今天的额度，这次回顾 ${list.length} 个。<br>先想它的意思，再翻面。</div>
    ${backlog > 0 ? `<p class="review-backlog">另有 ${backlog} 个已到期，积压会越滚越大。今天可以一次清完。</p>` : ''}
    <button class="review-flip-btn" data-review-start>开始回顾${backlog > 0 ? '（按额度）' : ''}</button>
    ${backlog > 0 ? `<button class="btn ghost sm review-all-btn" data-review-all>清积压 · 全部 ${due.length} 个</button>` : ''}
  </div>`;
}

function startReviewSession(all) {
  const s = stats();
  const remaining = Math.max(0, (state.config.reviewDaily || 5) - s.doneToday);
  const allDue = dueEntries();
  const list = (all ? allDue : allDue.slice(0, remaining)).map((e) => e.key);
  if (!list.length) {
    renderReview();
    return;
  }
  state.reviewSession = { ids: list, idx: 0, flipped: false, grades: [] };
  renderReviewCard();
}

function renderReviewCard() {
  const session = state.reviewSession;
  if (!session || !el.reviewArea) return;

  if (session.idx >= session.ids.length) return renderReviewSummary();

  const entry = state.entries[session.ids[session.idx]];
  if (!entry) {
    session.idx += 1;
    return renderReviewCard();
  }

  const track = trackNameOf(entry.track);
  const trackChip = (track ? `<span class="pos-tag">${esc(track)}</span>` : '')
    + (entry.graduated && !entry.mastered ? '<span class="pos-tag review-grad-tag">毕业确认</span>' : '');
  const progress = `回顾 · ${session.idx + 1}/${session.ids.length}`;

  if (!session.flipped) {
    el.reviewArea.innerHTML = `<div class="review-card">
      <div class="review-progress">${progress}</div>
      <div class="review-term">${esc(truncate(entry.word, 60))}</div>
      <div class="review-meta">${trackChip}</div>
      <div class="review-hint">先想一下它的意思，再翻面。<br>按 <kbd>空格</kbd> 或点下面的按钮。</div>
      <button class="review-flip-btn" data-review-flip>显示答案</button>
    </div>`;
    return;
  }

  const meaning = plainText(entry.meaning_zh || entry.sentence_translation || entry.summary || '');
  const memory = plainText(entry.memory || '');
  el.reviewArea.innerHTML = `<div class="review-card">
    <div class="review-progress">${progress}</div>
    <div class="review-term">${esc(truncate(entry.word, 60))}</div>
    <div class="review-meta">${trackChip}</div>
    <div class="review-answer">
      <div class="review-meaning">${esc(truncate(meaning, 120))}</div>
      ${memory ? `<div class="review-extra"><span class="lbl">// 为什么重要</span><br>${esc(truncate(memory, 90))}</div>` : ''}
      <div class="grade-row">${REVIEW_GRADES.map((g) => `
        <button class="grade-btn g${g.g}" data-review-grade="${g.g}">
          ${g.label}<small>${g.key} · ${g.hint}</small>
        </button>`).join('')}
      </div>
    </div>
  </div>`;
}

async function submitReviewGrade(grade) {
  const session = state.reviewSession;
  if (!session) return;
  const key = session.ids[session.idx];
  const entry = state.entries[key];
  if (!entry) return;

  session.grades.push({ word: entry.word, grade });
  state.reviewGrades = session.grades;

  const r = await window.api.submitReview(key, grade);
  if (r.ok) state.entries[key] = r.entry;

  session.idx += 1;
  session.flipped = false;
  if (session.idx >= session.ids.length) renderReviewSummary();
  else renderReviewCard();
  renderStats();
}

function renderReviewSummary() {
  const session = state.reviewSession;
  const grades = session ? session.grades : [];
  const good = grades.filter((g) => g.grade === 2).length;
  const weak = grades.filter((g) => g.grade === 0).length;
  state.reviewSession = null;

  if (!grades.length) {
    renderReview();
    return;
  }
  if (el.reviewArea) {
    const forgot = grades.filter((g) => g.grade === 0).map((g) => g.word);
    const tip = state.config?.recommendSlot && forgot.length
      ? `<div class="review-tip">建议：明天先把 ${forgot.slice(0, 2).map((w) => `<b>${esc(w)}</b>`).join('、')} 过一遍，再收新词。</div>`
      : '';
    el.reviewArea.innerHTML = `<div class="review-done">
      <img src="assets/robot-happy.png" alt="">
      <div class="review-done-title">回顾完成 · ${grades.length} 词</div>
      <div class="review-done-sub">想起来了 ${good} · 需要加强 ${weak + grades.filter((g) => g.grade === 1).length}<br>
        ${weak ? '没想起的词明天会再回来。' : '明天的它还会来找你。'}</div>
      ${tip}
    </div>`;
  }
  renderStats();
  setPetMode('happy');
  setTimeout(() => setPetMode('idle'), 900);
}

function bindReview() {
  if (el.btnQuiz) {
    el.btnQuiz.addEventListener('click', () => startQuiz());
  }

  el.reviewArea.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.reviewStart !== undefined) {
      startReviewSession(false);
    } else if (btn.dataset.reviewAll !== undefined) {
      startReviewSession(true);
    } else if (btn.dataset.reviewFlip !== undefined) {
      if (state.reviewSession) {
        state.reviewSession.flipped = true;
        renderReviewCard();
      }
    } else if (btn.dataset.reviewGrade !== undefined) {
      submitReviewGrade(Number(btn.dataset.reviewGrade));
    } else if (btn.dataset.quizOption !== undefined) {
      answerQuiz(Number(btn.dataset.quizOption));
    } else if (btn.dataset.quizNext !== undefined) {
      nextQuiz();
    } else if (btn.dataset.quizRestart !== undefined) {
      state.quiz = null;
      startQuiz();
    } else if (btn.dataset.reviewBack !== undefined) {
      state.quiz = null;
      renderReview();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (state.tab !== 'review') return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

    if (state.quiz) {
      if (!state.quiz.revealed && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        answerQuiz(Number(e.key) - 1);
      } else if (state.quiz.revealed && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        nextQuiz();
      }
      return;
    }

    if (!state.reviewSession) return;
    if (e.key === ' ' && !state.reviewSession.flipped) {
      e.preventDefault();
      state.reviewSession.flipped = true;
      renderReviewCard();
    } else if (state.reviewSession.flipped && ['1', '2', '3'].includes(e.key)) {
      e.preventDefault();
      submitReviewGrade(Number(e.key) - 1);
    }
  });
}

/* ---------------- AI 考官 ---------------- */

function startQuiz() {
  if (state.quiz) {
    state.quiz = null;
    renderReview();
    return;
  }
  if (state.quizBusy) return;
  const s = stats();
  const remaining = Math.max(0, (state.config.reviewDaily || 5) - s.doneToday);
  const keys = dueEntries().slice(0, remaining).map((e) => e.key);
  if (!keys.length) {
    toast(s.due.length ? '今天的复习额度用完了，明天再来' : '今天没有到期的词，考官先休息');
    renderReview();
    return;
  }
  state.quizBusy = true;
  state.reviewSession = null;
  if (el.btnQuiz) {
    el.btnQuiz.disabled = true;
    el.btnQuiz.textContent = '出题中…';
  }
  el.reviewArea.innerHTML = `<div class="review-done">
    <img src="assets/robot-think.png" alt="">
    <div class="review-empty-title">AI 正在出题</div>
    <div class="review-empty-sub">按你到期的词生成单选题，答完自动判分并安排下一次复习。</div>
  </div>`;
  window.api.generateQuiz(keys).then((r) => {
    if (!r.ok) {
      toast(r.error || '出题失败', 'warn');
      renderReview();
      return;
    }
    state.quiz = { questions: r.questions, idx: 0, selected: null, revealed: false, answers: [] };
    renderQuizCard();
  }).catch((err) => {
    toast('出题失败：' + (err && err.message ? err.message : err), 'warn');
    renderReview();
  }).finally(() => {
    state.quizBusy = false;
    if (el.btnQuiz) {
      el.btnQuiz.disabled = false;
      el.btnQuiz.textContent = state.quiz ? '退出考官' : 'AI 考官';
    }
  });
}

function renderQuizCard() {
  const qz = state.quiz;
  if (!qz || !el.reviewArea) return;
  if (qz.idx >= qz.questions.length) return renderQuizSummary();

  const q = qz.questions[qz.idx];
  const progress = `考官 · ${qz.idx + 1}/${qz.questions.length}`;
  let options = q.options.map((opt, i) => {
    let cls = 'quiz-option';
    if (qz.revealed) {
      if (i === q.answer) cls += ' is-correct';
      else if (i === qz.selected) cls += ' is-wrong';
    }
    return `<button class="${cls}" data-quiz-option="${i}"${qz.revealed ? ' disabled' : ''}>
      <span class="quiz-key">${i + 1}</span><span>${esc(opt)}</span>
    </button>`;
  }).join('');

  el.reviewArea.innerHTML = `<div class="review-card quiz-card">
    <div class="review-progress">${progress}</div>
    <div class="quiz-question">${esc(q.question)}</div>
    <div class="quiz-options">${options}</div>
    ${qz.revealed ? `
      <div class="quiz-explain ${qz.answers[qz.answers.length - 1]?.correct ? 'is-good' : 'is-bad'}">
        <b>${qz.answers[qz.answers.length - 1]?.correct ? '答对了' : '答错了'}</b>
        ${q.explain ? `<span>${esc(q.explain)}</span>` : ''}
      </div>
      <button class="review-flip-btn" data-quiz-next>${qz.idx + 1 >= qz.questions.length ? '看结果' : '下一题'}</button>
    ` : '<div class="review-hint">按 <kbd>1</kbd>–<kbd>4</kbd> 选答案，答完会给出解析。</div>'}
  </div>`;
}

async function answerQuiz(option) {
  const qz = state.quiz;
  if (!qz || qz.revealed) return;
  const q = qz.questions[qz.idx];
  const correct = option === q.answer;
  qz.selected = option;
  qz.revealed = true;
  qz.answers.push({ key: q.key, word: q.word, correct, chosen: option, answer: q.answer });
  renderQuizCard();
  setPetMode(correct ? 'happy' : 'surprised', 800);
  try {
    const r = await window.api.submitReview(q.key, correct ? 2 : 0);
    if (r.ok) {
      state.entries[q.key] = r.entry;
      renderStats();
    }
  } catch {
    /* 记录失败不打断答题 */
  }
}

function nextQuiz() {
  const qz = state.quiz;
  if (!qz) return;
  qz.idx += 1;
  qz.selected = null;
  qz.revealed = false;
  if (qz.idx >= qz.questions.length) renderQuizSummary();
  else renderQuizCard();
}

function renderQuizSummary() {
  const qz = state.quiz;
  if (!qz || !el.reviewArea) return;
  const answers = qz.answers || [];
  const right = answers.filter((a) => a.correct).length;
  const rows = answers.map((a) => `
    <div class="quiz-result-row ${a.correct ? 'ok' : 'bad'}">
      <span class="quiz-mark">${a.correct ? '✓' : '×'}</span>
      <b>${esc(a.word)}</b>
      <span>${a.correct ? '记对了' : '下一轮再来'}</span>
    </div>`).join('');
  const forgot = answers.filter((a) => !a.correct).map((a) => a.word);
  const tip = state.config?.recommendSlot && forgot.length
    ? `<div class="review-tip">建议：明天先把 ${forgot.slice(0, 2).map((w) => `<b>${esc(w)}</b>`).join('、')} 过一遍。</div>`
    : '';
  el.reviewArea.innerHTML = `<div class="review-done quiz-done">
    <img src="assets/robot-${right === answers.length ? 'happy' : 'idle'}.png" alt="">
    <div class="review-done-title">考官结果 · ${right}/${answers.length}</div>
    <div class="review-done-sub">答对的进入下一复习阶段，答错的明天回来。</div>
    ${tip}
    <div class="quiz-result-list">${rows || '<p class="review-empty-sub">这一轮没有作答。</p>'}</div>
    <div class="quiz-done-actions">
      <button class="review-flip-btn" data-quiz-restart>再来一轮</button>
      <button class="btn ghost sm" data-review-back>回到回顾</button>
    </div>
  </div>`;
  if (state.quiz) state.quiz.revealed = true;
}

/* ---------------- 洞察（统计 / 周报 / 本地建议） ---------------- */

function chartBarHeight(v, max) {
  if (!v) return 0;
  return Math.max(6, Math.round((v / max) * 100));
}

function statsHTML(d) {
  const max = Math.max(1, ...d.days.map((x) => Math.max(x.added, x.reviewed)));
  const rangeLabel = d.rangeLabel || '近 7 天';
  const legend = `
    <div class="chart-legend">
      <span><i class="chart-dot added"></i>新增</span>
      <span><i class="chart-dot reviewed"></i>复习</span>
    </div>`;
  const showEvery = d.days.length > 14 ? 5 : d.days.length > 7 ? 2 : 1;
  const days = d.days.map((x, i) => {
    const showLabel = showEvery === 1 || i === 0 || i === d.days.length - 1 || (d.days.length - 1 - i) % showEvery === 0;
    return `
    <div class="chart-day${showLabel ? '' : ' no-label'}" tabindex="0" aria-label="${esc(x.date)} 新增 ${x.added}，复习 ${x.reviewed}">
      <span class="chart-tip">${esc(x.date)} · 新增 ${x.added} · 复习 ${x.reviewed}</span>
      <div class="chart-bars">
        <span class="chart-bar added" style="height:${chartBarHeight(x.added, max)}%"></span>
        <span class="chart-bar reviewed" style="height:${chartBarHeight(x.reviewed, max)}%"></span>
      </div>
      <span class="chart-x">${esc(x.label)}</span>
    </div>`;
  }).join('');

  const tableRows = d.days.map((x) => `<tr><td>${esc(x.date)}</td><td>${x.added}</td><td>${x.reviewed}</td></tr>`).join('');

  const tracks = d.tracks.length
    ? d.tracks.map((t) => `
      <div class="dist-row">
        <span class="dist-name" title="${esc(t.name)}">${esc(t.name)}</span>
        <span class="dist-track"><i style="width:${Math.max(3, Math.round((t.count / Math.max(1, d.tracks[0].count)) * 100))}%"></i></span>
        <span class="dist-count">${t.count}</span>
      </div>`).join('')
    : '<p class="stats-note">还没有方向。可在设置里加一个，AI 会按方向解释词条。</p>';

  const weak = d.weak.length
    ? d.weak.map((w) => `<li><b>${esc(w.word)}</b><span>最近 ${w.times} 次没想起</span></li>`).join('')
    : `<li class="stats-quiet">${esc(rangeLabel)}没有「没想起」的记录。</li>`;

  const suggestions = d.recommendSlot
    ? `<div class="stat-block insight-block">
        <div class="stat-block-head"><span>本地建议</span><b>${d.suggestions.length}</b></div>
        <div class="insight-list">${d.suggestions.length
          ? d.suggestions.map((s) => `<div class="insight-item">
              <span class="insight-mark">›</span>
              <p>${esc(s.text)}</p>
              <button class="link-btn sm" data-suggest-action="${esc(s.action)}"${s.word ? ` data-suggest-word="${esc(s.word)}"` : ''}>去看看</button>
            </div>`).join('')
          : '<p class="stats-note">暂时没有需要调整的，按现在的节奏继续。</p>'}</div>
        <p class="stats-foot">只根据本机复习数据生成，不含广告或画像。</p>
      </div>`
    : `<p class="stats-foot">本地建议默认关闭。需要时在设置里开启；建议只根据你自己的复习数据生成，不联网、不含广告。</p>`;

  return `
    <div class="range-switch" role="tablist" aria-label="统计区间">
      <button data-range="7" class="${d.range === '7' ? 'active' : ''}" role="tab" aria-selected="${d.range === '7'}">7 天</button>
      <button data-range="30" class="${d.range === '30' ? 'active' : ''}" role="tab" aria-selected="${d.range === '30'}">30 天</button>
      <button data-range="month" class="${d.range === 'month' ? 'active' : ''}" role="tab" aria-selected="${d.range === 'month'}">本月</button>
    </div>
    <div class="stats-hero">
      <div class="stat-tile"><b>${d.total}</b><span>收录</span></div>
      <div class="stat-tile"><b>${d.stats.reviewedWords}</b><span>复习过</span></div>
      <div class="stat-tile"><b>${d.stats.stable}</b><span>稳固</span></div>
      <div class="stat-tile${d.due ? ' is-due' : ''}"><b>${d.due}</b><span>到期</span></div>
    </div>
    <p class="stats-streak">${d.total === 0 ? '还没有学习记录' : d.streak ? `连续学习 <b>${d.streak}</b> 天` : '今天还没开始'} · ${esc(rangeLabel)}新增 <b>${d.rangeAdded}</b> · 复习 <b>${d.rangeReviewed}</b> 次</p>

    <div class="chart-card">
      <div class="chart-head"><span class="chart-title">${esc(rangeLabel)}</span>${legend}</div>
      <div class="chart-plot${d.days.length > 14 ? ' dense' : ''}">${days}</div>
      ${!d.rangeAdded && !d.rangeReviewed ? `<p class="stats-note">${esc(rangeLabel)}还没有新增或复习记录。</p>` : ''}
      <details class="chart-table"><summary>看数字</summary>
        <table><thead><tr><th>日期</th><th>新增</th><th>复习</th></tr></thead><tbody>${tableRows}</tbody></table>
      </details>
    </div>

    <div class="stat-block">
      <div class="stat-block-head"><span>方向分布</span><b>${d.tracks.length}</b></div>
      ${tracks}
      ${d.noTrack ? `<p class="stats-note">另有 ${d.noTrack} 条未归方向。</p>` : ''}
    </div>

    <div class="stat-block">
      <div class="stat-block-head"><span>还不稳的词</span><b>${d.weak.length}</b></div>
      <ul class="weak-list">${weak}</ul>
    </div>

    ${suggestions}

    <div class="stat-block weekly-block">
      <div class="stat-block-head"><span>周报</span>${state.weekly?.period ? `<b>${esc(state.weekly.period.from)} → ${esc(state.weekly.period.to)}</b>` : ''}</div>
      ${state.weekly ? weeklyHTML(state.weekly.report) : '<p class="stats-note">把这一周做了什么、哪些还不稳写成一页，写进 Obsidian 的「秒记周报.md」。</p>'}
      <button class="btn ghost sm" data-weekly${state.weeklyBusy ? ' disabled' : ''}>${state.weeklyBusy ? '生成中…' : state.weekly ? '重新生成周报' : '生成本周周报'}</button>
      ${state.weekly?.obsidian && state.weekly.obsidian.ok && !state.weekly.obsidian.skipped ? `<p class="stats-foot">已写入 ${esc(state.weekly.obsidian.path || 'Obsidian')}</p>` : state.weekly ? '<p class="stats-foot">Obsidian 未开启时只在当前页面显示，可在设置里开启笔记写入。</p>' : ''}
    </div>`;
}

function weeklyHTML(report) {
  if (!report) return '';
  const list = (arr) => (arr && arr.length ? `<ul>${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
  return `<div class="weekly-report">
    <h4>${esc(report.title || '本周学习记录')}</h4>
    ${report.summary ? `<p>${esc(report.summary)}</p>` : ''}
    ${report.highlights && report.highlights.length ? `<div class="weekly-sec"><span class="weekly-label">做得好的</span>${list(report.highlights)}</div>` : ''}
    ${report.weak && report.weak.length ? `<div class="weekly-sec"><span class="weekly-label">还不太稳</span>${list(report.weak)}</div>` : ''}
    ${report.advice ? `<div class="weekly-advice"><b>下一步</b>${esc(report.advice)}</div>` : ''}
    ${report.next ? `<p class="weekly-next">下周目标：${esc(report.next)}</p>` : ''}
  </div>`;
}

async function renderStatsView() {
  if (!el.statsArea) return;
  try {
    const r = await window.api.statsOverview(state.statsRange);
    if (!r.ok) {
      el.statsArea.innerHTML = `<div class="review-empty"><div class="review-empty-title">读不到统计</div><div class="review-empty-sub">${esc(r.error || '未知错误')}</div></div>`;
      return;
    }
    state.statsData = r;
    el.statsArea.innerHTML = statsHTML(r);
    if (el.statsWeek) el.statsWeek.textContent = r.rangeLabel || '近 7 天';
  } catch (err) {
    el.statsArea.innerHTML = `<div class="review-empty"><div class="review-empty-title">读不到统计</div><div class="review-empty-sub">${esc(err && err.message ? err.message : err)}</div></div>`;
  }
}

async function generateWeekly() {
  if (state.weeklyBusy) return;
  state.weeklyBusy = true;
  renderStatsView();
  try {
    const r = await window.api.weeklyReport();
    if (!r.ok) {
      toast(r.error || '周报生成失败', 'warn');
      return;
    }
    state.weekly = { report: r.report, period: r.period, obsidian: r.obsidian };
    const wrote = r.obsidian && r.obsidian.ok && !r.obsidian.skipped;
    toast(wrote ? '周报已生成并写入 Obsidian' : '周报已生成');
  } catch (err) {
    toast('周报生成失败：' + (err && err.message ? err.message : err), 'warn');
  } finally {
    state.weeklyBusy = false;
    if (state.tab === 'stats') renderStatsView();
  }
}

/* ---------------- 助手（Agent） ---------------- */

const AGENT_STEP_LABELS = {
  search_entries: '搜索词条',
  save_term: '收录词条',
  set_entry_track: '改方向',
  list_due: '查到期',
  submit_review: '提交复习',
  get_stats: '看统计',
  collect_clip_terms: '收文章术语',
  write_weekly_report: '写周报'
};

function renderAgentLog() {
  if (!el.agentLog) return;
  if (!state.agentLog.length && !state.agentBusy) {
    el.agentLog.innerHTML = `<div class="agent-empty">
      <img src="assets/robot-idle.png" alt="">
      <p>说一件具体的事，比如「查一下 idempotent 并放进编程方向」。</p>
    </div>`;
    return;
  }
  const msgs = state.agentLog.map((m) => {
    if (m.role === 'user') {
      return `<div class="agent-msg user"><span class="agent-prefix">你 ›</span><p>${esc(m.text)}</p></div>`;
    }
    const steps = (m.steps || []).map((s) => `<span class="agent-step${s.ok ? '' : ' is-fail'}">${esc(AGENT_STEP_LABELS[s.name] || s.name)}${s.ok ? ' ✓' : ' ×'}</span>`).join('');
    return `<div class="agent-msg assistant${m.role === 'error' ? ' is-error' : ''}">
      <span class="agent-prefix">小记 ›</span>
      <div class="rich-text">${richBlock(m.text || '')}</div>
      ${steps ? `<div class="agent-steps">${steps}</div>` : ''}
    </div>`;
  }).join('');
  el.agentLog.innerHTML = msgs + (state.agentBusy
    ? `<div class="agent-msg assistant is-busy"><span class="agent-prefix">小记 ›</span><p class="agent-thinking">正在调用工具…</p></div>`
    : '');
  el.agentLog.scrollTop = el.agentLog.scrollHeight;
}

function renderAgent() {
  renderAgentLog();
  if (el.agentInput) setTimeout(() => el.agentInput.focus(), 40);
}

async function runAgentPrompt(text) {
  const prompt = String(text === undefined ? el.agentInput?.value : text).trim();
  if (!prompt) {
    toast('先说你想做什么');
    el.agentInput?.focus();
    return;
  }
  if (state.agentBusy) {
    toast('上一个任务还在跑');
    return;
  }
  state.agentLog.push({ role: 'user', text: prompt });
  if (el.agentInput) el.agentInput.value = '';
  state.agentBusy = true;
  if (el.btnAgentSend) el.btnAgentSend.disabled = true;
  renderAgentLog();
  try {
    const r = await window.api.runAgent(prompt);
    state.agentLog.push({
      role: r.ok ? 'assistant' : 'error',
      text: r.ok ? r.answer : (r.error || '助手没有完成'),
      steps: r.steps || []
    });
    if (r.ok) reloadEntries();
    else if (r.steps && r.steps.length) reloadEntries();
  } catch (err) {
    state.agentLog.push({ role: 'error', text: err && err.message ? err.message : String(err), steps: [] });
  } finally {
    state.agentBusy = false;
    if (el.btnAgentSend) el.btnAgentSend.disabled = false;
    renderAgentLog();
  }
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

async function parse(text, mode) {
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
    const res = await window.api.query(input, mode || state.captureMode || 'auto');
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
  if (tab === 'review') renderReview();
  if (tab === 'stats') renderStatsView();
  if (tab === 'agent') renderAgent();
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
  el.cfgClipWatch.checked = Boolean(state.config.clipWatch);
  el.cfgClipPause.checked = Boolean(state.config.clipWatchPaused);
  el.clipPauseRow.classList.toggle('hidden', !state.config.clipWatch);
  el.cfgRecommend.checked = Boolean(state.config.recommendSlot);
  el.cfgWeeklyAuto.checked = Boolean(state.config.weeklyAuto);
  if (el.cfgVideoCookies) el.cfgVideoCookies.value = state.config.videoCookies || '';
  if (el.cfgArticleHost) el.cfgArticleHost.value = state.config.articleCookiesHost || '';
  if (el.cfgArticleCookies) el.cfgArticleCookies.value = '';
  if (el.articleCookieNote) {
    const host = state.config.articleCookiesHost;
    el.articleCookieNote.textContent = state.config.hasArticleCookies
      ? `已保存 ${host || '受限站点'} 的登录 Cookie。重新填写会覆盖，留空并保存不会清除。`
      : '还没有保存 Cookie。';
  }
  el.cfgReviewDaily.value = state.config.reviewDaily || 5;
  el.dataDir.textContent = state.dataDir || '—';
  el.dataDir.title = state.dataDir || '';
  el.installDir.textContent = state.installDir || '—';
  el.installDir.title = state.installDir || '';
  if (el.appVersion) el.appVersion.textContent = state.version ? 'v' + state.version : '—';
  renderTrackList();
  refreshObsidianDetect();
}

/* ---------------- 学习方向管理 ---------------- */

function renderTrackList() {
  if (!el.trackList) return;
  const tracks = state.config?.tracks || [];
  const counts = {};
  for (const e of Object.values(state.entries)) {
    if (e.track) counts[e.track] = (counts[e.track] || 0) + 1;
  }
  if (!tracks.length) {
    el.trackList.innerHTML = '<div class="review-empty-sub" style="padding:2px 0;">还没有方向。查词后 AI 会自动建议归属。</div>';
    return;
  }
  el.trackList.innerHTML = tracks.map((t) => `
    <div class="track-row">
      <div>
        <div class="t-name">${esc(t.name)}</div>
        ${counts[t.id] ? `<div class="t-desc">${counts[t.id]} 个词条</div>` : ''}
      </div>
      <span class="t-count">${counts[t.id] ? counts[t.id] + ' 词' : ''}</span>
      <button class="t-del" data-track-del="${esc(t.id)}">移除</button>
    </div>`).join('');
}

async function saveTracks(tracks, msg) {
  const r = await window.api.saveConfig({ tracks });
  if (!r.ok) {
    toast(r.error || '保存失败', 'warn');
    return;
  }
  state.config = r.config;
  renderTrackList();
  if (state.lastResult && state.lastResult.entry) renderResult();
  if (msg) toast(msg);
}

function bindTracks() {
  if (!el.trackList) return;

  el.btnAddTrack.addEventListener('click', async () => {
    const name = el.trackName.value.trim();
    if (!name) {
      toast('先写个方向名');
      el.trackName.focus();
      return;
    }
    const tracks = state.config?.tracks || [];
    if (tracks.some((t) => t.name === name)) {
      toast('已经有这个方向了', 'warn');
      return;
    }
    tracks.push({ id: 't' + Date.now().toString(36), name, desc: '' });
    el.trackName.value = '';
    await saveTracks(tracks, `已添加方向「${name}」`);
  });

  el.trackName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      el.btnAddTrack.click();
    }
  });

  el.trackList.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-track-del]');
    if (!btn) return;
    const id = btn.dataset.trackDel;
    const tracks = (state.config?.tracks || []).filter((t) => t.id !== id);
    // 方向被移除后，属于它的词条回到「无方向」
    for (const entry of Object.values(state.entries)) {
      if (entry.track === id) {
        entry.track = '';
        window.api.setEntryTrack(entry.key, '');
      }
    }
    await saveTracks(tracks, '已移除方向，相关词条回到无方向');
  });

  el.trackPresets.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-preset]');
    if (!btn) return;
    el.trackName.value = btn.dataset.preset;
    el.btnAddTrack.click();
  });
}

async function saveSettings(showFeedback = true) {
  const patch = {
    apiKey: el.cfgKey.value.trim(),
    baseUrl: el.cfgBase.value.trim(),
    model: el.cfgModel.value.trim(),
    hotThreshold: Number(el.cfgThreshold.value) || 3,
    hotLimit: Number(el.cfgLimit.value) || 15,
    reviewDaily: Number(el.cfgReviewDaily.value) || 5,
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
  let holdTimer = 0;
  let wilding = false;

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
    wilding = false;
    window.api.dragStart(e.screenX, e.screenY);
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      holdTimer = 0;
      if (!dragging || moved) return;
      // 长按：原地发疯 + 说一句俏皮话，不拖动
      wilding = true;
      dragging = null;
      window.api.dragEnd();
      startPetWild();
      showQuip(PET_QUIPS[Math.floor(Math.random() * PET_QUIPS.length)], 2200);
    }, 480);
  });

  window.addEventListener('mousemove', (e) => {
    if (wilding) return;
    if (!dragging) return;
    if (e.buttons === 0) {
      endDrag(false);
      return;
    }
    const dx = e.screenX - dragging.sx;
    const dy = e.screenY - dragging.sy;
    if (!moved && Math.abs(dx) + Math.abs(dy) > 4) {
      moved = true;
      clearTimeout(holdTimer);
      holdTimer = 0;
      document.body.classList.add('dragging');
    }
    if (!moved) return;
    pending = { x: e.screenX, y: e.screenY };
    if (!frame) frame = requestAnimationFrame(flush);
  });

  window.addEventListener('mouseup', () => {
    clearTimeout(holdTimer);
    holdTimer = 0;
    if (wilding) {
      wilding = false;
      stopPetWild();
      return;
    }
    endDrag(true);
  });
  window.addEventListener('blur', () => {
    clearTimeout(holdTimer);
    holdTimer = 0;
    if (wilding) {
      wilding = false;
      stopPetWild();
      return;
    }
    endDrag(false);
  });

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
  bindReview();
  bindTracks();

  if (el.statsArea) {
    el.statsArea.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.range) {
        if (btn.dataset.range !== state.statsRange) {
          state.statsRange = btn.dataset.range;
          renderStatsView();
        }
        return;
      }
      if (btn.dataset.weekly !== undefined) {
        generateWeekly();
        return;
      }
      const action = btn.dataset.suggestAction;
      if (action === 'review') switchTab('review');
      else if (action === 'settings-tracks') switchTab('settings');
      else if (action === 'search-weak' && btn.dataset.suggestWord) {
        switchTab('jot');
        state.lastResult = null;
        el.input.value = btn.dataset.suggestWord;
        autoGrow();
        parse(btn.dataset.suggestWord);
      } else {
        switchTab('jot');
        setTimeout(() => el.input.focus(), 40);
      }
    });
  }

  if (el.agentChips) {
    el.agentChips.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-agent-prompt]');
      if (!btn) return;
      switchTab('agent');
      runAgentPrompt(btn.dataset.agentPrompt);
    });
  }

  if (el.btnAgentSend) el.btnAgentSend.addEventListener('click', () => runAgentPrompt());
  if (el.agentInput) {
    el.agentInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        runAgentPrompt();
      }
    });
  }

  // 剪贴板监听提示：气泡变成「收 xxx」，点一下才收录
  if (el.bubble) {
    el.bubble.addEventListener('mousedown', (e) => e.stopPropagation());
    el.bubble.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = state.clipWatchText;
      if (!text) return;
      state.clipWatchText = '';
      el.bubble.classList.remove('clipwatch');
      clearTimeout(state.clipWatchTimer);
      state.clipWatchTimer = 0;
      window.api.expand();
      setTimeout(() => {
        switchTab('jot');
        state.lastResult = null;
        el.input.value = text;
        autoGrow();
        parse(text);
      }, 220);
    });
  }

  el.pet.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!state.expanded) window.api.petMenu();
  });

  el.btnCollapse.addEventListener('click', () => window.api.collapse());
  el.btnOpenNote.addEventListener('click', openNote);

  el.btnParse.addEventListener('click', () => parse());

  if (el.modeSeg) {
    el.modeSeg.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-mode]');
      if (!btn) return;
      state.captureMode = btn.dataset.mode;
      for (const b of el.modeSeg.querySelectorAll('button')) b.classList.toggle('active', b === btn);
      const ph = {
        auto: '粘贴英文单词 / 句子，或一个网页链接…',
        lookup: '想表达什么？输入中文，给出英文说法…',
        note: '随手记一段想法或摘录，AI 只整理不改写…'
      }[state.captureMode];
      el.input.placeholder = ph;
      el.input.focus();
    });
  }

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

    if (btn.dataset.openUrl !== undefined) {
      window.api.openUrl(btn.dataset.openUrl);
      return;
    }

    if (btn.dataset.collectTerm !== undefined) {
      const word = btn.dataset.collectTerm;
      if (state.busy) return;
      btn.disabled = true;
      window.api.collectTerm(word).then((r) => {
        btn.disabled = false;
        if (!r.ok) {
          toast(r.error || '收录失败', 'warn');
          return;
        }
        state.entries[r.entry.key] = r.entry;
        renderAll();
        btn.textContent = '已收录 ✓';
        toast(r.isNew ? `「${word}」已收进复习` : `「${word}」已累计到第 ${r.entry.count} 次`);
      });
      return;
    }

    if (btn.dataset.collectAll !== undefined) {
      const key = btn.dataset.collectAll;
      if (btn.disabled) return;
      btn.disabled = true;
      const label = btn.innerHTML;
      btn.innerHTML = `${icon('i-spark')}准备收录…`;
      window.api.collectClipTerms(key).then((r) => {
        btn.disabled = false;
        if (!r.ok) {
          btn.innerHTML = label;
          toast(r.error || '收录失败', 'warn');
          return;
        }
        btn.innerHTML = `${icon('i-check')}已收 ${r.collected}/${r.total} 个术语`;
        toast(`已把 ${r.collected} 个术语收进复习`);
        reloadEntries();
      }).catch((err) => {
        btn.disabled = false;
        btn.innerHTML = label;
        toast('收录失败：' + (err && err.message ? err.message : err), 'warn');
      });
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

  // 词头的方向下拉：一键改归属，笔记同步更新
  el.result.addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-track-select]');
    if (!sel) return;
    const entry = state.lastResult && state.lastResult.entry;
    if (!entry) return;
    const r = await window.api.setEntryTrack(entry.key, sel.value);
    if (!r.ok) {
      toast(r.error || '设置失败', 'warn');
      return;
    }
    state.entries[entry.key] = r.entry;
    if (state.lastResult) state.lastResult.entry = r.entry;
    renderResult();
    toast('已更新学习方向');
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

  el.cfgClipWatch.addEventListener('change', async () => {
    const on = el.cfgClipWatch.checked;
    const r = await window.api.saveConfig({ clipWatch: on });
    if (!r.ok) {
      el.cfgClipWatch.checked = !on;
      toast(r.error || '保存失败', 'warn');
      return;
    }
    state.config = r.config;
    el.clipPauseRow.classList.toggle('hidden', !on);
    toast(on ? '已开启剪贴板监听：复制的词会出现在机器人头顶' : '已关闭剪贴板监听');
  });

  el.cfgClipPause.addEventListener('change', async () => {
    const paused = el.cfgClipPause.checked;
    const r = await window.api.saveConfig({ clipWatchPaused: paused });
    if (!r.ok) {
      el.cfgClipPause.checked = !paused;
      toast(r.error || '保存失败', 'warn');
      return;
    }
    state.config = r.config;
    toast(paused ? '已暂停监听' : '已恢复监听');
  });

  el.cfgRecommend.addEventListener('change', async () => {
    const on = el.cfgRecommend.checked;
    const r = await window.api.saveConfig({ recommendSlot: on });
    if (!r.ok) {
      el.cfgRecommend.checked = !on;
      toast(r.error || '保存失败', 'warn');
      return;
    }
    state.config = r.config;
    toast(on ? '已开启本地建议' : '已关闭本地建议');
  });

  el.cfgWeeklyAuto.addEventListener('change', async () => {
    const on = el.cfgWeeklyAuto.checked;
    const r = await window.api.saveConfig({ weeklyAuto: on });
    if (!r.ok) {
      el.cfgWeeklyAuto.checked = !on;
      toast(r.error || '保存失败', 'warn');
      return;
    }
    state.config = r.config;
    if (on && !state.config.obsidianEnabled) {
      toast('已开启自动周报；需要同时开启「写入 Obsidian 笔记」才会执行', 'warn');
    } else {
      toast(on ? '已开启自动周报：每满 7 天生成一次' : '已关闭自动周报');
    }
  });

  el.cfgVideoCookies.addEventListener('change', async () => {
    const value = el.cfgVideoCookies.value;
    const r = await window.api.saveConfig({ videoCookies: value });
    if (!r.ok) {
      el.cfgVideoCookies.value = state.config.videoCookies || '';
      toast(r.error || '保存失败', 'warn');
      return;
    }
    state.config = r.config;
    toast(value ? '已开启：受限视频失败时会读取该浏览器的登录状态重试' : '已关闭：只抓取公开内容');
  });

  el.btnSaveArticleCookies.addEventListener('click', async () => {
    const host = el.cfgArticleHost.value.trim();
    const cookies = el.cfgArticleCookies.value.trim();
    if (!host) {
      toast('先填站点域名，例如 zhihu.com', 'warn');
      el.cfgArticleHost.focus();
      return;
    }
    if (!cookies && !state.config.hasArticleCookies) {
      toast('把浏览器里的 Cookie 整段粘贴进来', 'warn');
      el.cfgArticleCookies.focus();
      return;
    }
    const patch = { articleCookiesHost: host };
    if (cookies) patch.articleCookies = cookies;
    const r = await window.api.saveConfig(patch);
    if (!r.ok) {
      toast(r.error || '保存失败', 'warn');
      return;
    }
    state.config = r.config;
    fillSettings();
    toast(cookies ? `已保存：抓取 ${host} 时会带上登录 Cookie` : `已更新域名：${host}`);
  });

  el.btnClearArticleCookies.addEventListener('click', async () => {
    const r = await window.api.saveConfig({ articleCookies: '', articleCookiesHost: '' });
    if (!r.ok) {
      toast(r.error || '清除失败', 'warn');
      return;
    }
    state.config = r.config;
    fillSettings();
    toast('已清除受限站点的 Cookie');
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

  let updateUrl = '';
  el.btnCheckUpdate.addEventListener('click', async () => {
    el.btnCheckUpdate.disabled = true;
    el.updateNote.textContent = '正在查询最新版本…';
    el.btnOpenRelease.classList.add('hidden');
    const r = await window.api.checkUpdate();
    el.btnCheckUpdate.disabled = false;
    if (!r.ok) {
      el.updateNote.textContent = '检查失败：' + (r.error || '未知错误');
      return;
    }
    if (r.hasUpdate) {
      updateUrl = r.url || '';
      el.updateNote.textContent = `发现新版本 ${r.latest}（当前 v${r.current}）。下载安装包后直接覆盖安装即可，数据不会丢失。`;
      el.btnOpenRelease.classList.toggle('hidden', !updateUrl);
    } else {
      updateUrl = '';
      el.updateNote.textContent = `已是最新版本 v${r.current}。`;
    }
  });
  el.btnOpenRelease.addEventListener('click', () => {
    if (updateUrl) window.api.openUrl(updateUrl);
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
  window.api.on('ui:capture', (payload) => {
    if (!payload || !payload.text) return;
    switchTab('jot');
    el.input.value = payload.text;
    autoGrow();
    document.body.classList.remove('result-view');
    el.composerWrap.classList.remove('hidden');
    parse(payload.text);
  });
  window.api.on('ui:pipeline-progress', (p) => {
    if (!p) return;
    $$('[data-collect-all]').forEach((btn) => {
      btn.innerHTML = `${icon('i-spark')}正在收录 ${esc(p.word || '')}（${(p.index || 0) + 1}/${p.total || 0}）`;
    });
  });
  window.api.on('ui:clipwatch', (payload) => {
    if (!payload || !payload.text || state.expanded) return;
    state.clipWatchText = payload.text;
    if (!el.bubble) return;
    el.petCount.textContent = '收 ' + truncate(payload.text, 7);
    el.bubble.classList.add('clipwatch');
    el.bubble.classList.remove('hidden');
    setPetMode('surprised', 900);
    clearTimeout(state.clipWatchTimer);
    state.clipWatchTimer = setTimeout(() => {
      state.clipWatchTimer = 0;
      if (state.clipWatchText === payload.text) {
        state.clipWatchText = '';
        el.bubble.classList.remove('clipwatch');
        renderStats();
      }
    }, 12000);
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
    state.version = data.version || '';
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
