'use strict';

/**
 * 视频链接提取引擎：yt-dlp（https://github.com/yt-dlp/yt-dlp，Unlicense 公共领域）。
 * 打包时带 bin/yt-dlp.exe，全部在本机运行：
 * 取标题、简介、作者、时长；字幕（含 YouTube 自动字幕）按语言优先级解析成纯文本。
 * 平台没给字幕的视频，诚实降级为「简介」，不编造文案。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ALLOW_LOCAL_FETCH = process.env.MIAOJI_ALLOW_LOCAL_FETCH === '1';
const MAX_TRANSCRIPT = 60000;

const VIDEO_HOSTS = [
  'youtube.com', 'youtu.be', 'music.youtube.com',
  'bilibili.com', 'b23.tv',
  'douyin.com', 'iesdouyin.com',
  'tiktok.com',
  'vimeo.com',
  'ixigua.com',
  'kuaishou.com',
  'x.com', 'twitter.com'
];

const PROVIDER_NAMES = {
  'youtube.com': 'YouTube',
  'youtu.be': 'YouTube',
  'music.youtube.com': 'YouTube',
  'bilibili.com': 'B站',
  'b23.tv': 'B站',
  'douyin.com': '抖音',
  'iesdouyin.com': '抖音',
  'tiktok.com': 'TikTok',
  'vimeo.com': 'Vimeo',
  'ixigua.com': '西瓜视频',
  'kuaishou.com': '快手',
  'x.com': 'X',
  'twitter.com': 'X'
};

/** 识别视频链接；不是视频平台返回 null */
function detect(rawUrl) {
  let u;
  try {
    u = new URL(String(rawUrl || '').trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.toLowerCase();
  const hit = VIDEO_HOSTS.find((h) => host === h || host.endsWith('.' + h));
  if (!hit) return null;
  return { provider: PROVIDER_NAMES[hit] || hit, url: u.toString(), host };
}

/** 定位 yt-dlp 二进制：打包后在 app.asar.unpacked/bin，开发在项目 bin/ */
function binaryPath() {
  const name = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  const candidates = [];
  try {
    const electron = require('electron');
    const app = electron && electron.app;
    if (app && typeof app.getAppPath === 'function') {
      const base = app.getAppPath();
      candidates.push(path.join(base.replace('app.asar', 'app.asar.unpacked'), 'bin', name));
      candidates.push(path.join(base, 'bin', name));
    }
  } catch {
    /* 普通 node 环境（测试）走下一行 */
  }
  candidates.push(path.join(__dirname, '..', 'bin', name));
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return '';
}

function cleanError(stderr) {
  const s = String(stderr || '');
  const lines = s.split(/\r?\n/).filter((l) => l.includes('ERROR'));
  const msg = (lines.length ? lines[lines.length - 1] : s).replace(/^.*?ERROR:\s*/i, '').trim();
  if (/unsupported url/i.test(msg)) return '暂不支持这个链接';
  if (/sign in|login|cookies|confirm you/i.test(msg)) return '这个视频需要登录或被平台限制，取不到内容';
  if (/private video|members-only/i.test(msg)) return '这是私密或会员视频，取不到内容';
  if (/video unavailable|removed/i.test(msg)) return '视频不存在或已被删除';
  if (/geo|country|not available in/i.test(msg)) return '这个视频有地区限制';
  if (/is not a valid url|invalid/i.test(msg)) return '链接格式不对';
  return msg.slice(0, 160) || '视频信息获取失败';
}

function runYtDlp(args, timeoutMs) {
  const bin = binaryPath();
  if (!bin) {
    return Promise.reject(new Error('视频提取组件缺失（bin/yt-dlp.exe），请重新安装秒记'));
  }
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
      reject(new Error('视频信息获取超时，平台可能限流或网络不通'));
    }, timeoutMs);
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { err += c; });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error('无法启动视频提取组件：' + (e && e.message ? e.message : e)));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && out.trim()) resolve(out);
      else reject(new Error(cleanError(err)));
    });
  });
}

/** 从 yt-dlp 的 JSON 里挑一个视频条目（防歌单/合集） */
function pickEntry(info) {
  if (!info) return null;
  if (info._type === 'playlist' && Array.isArray(info.entries) && info.entries.length) {
    return info.entries[0];
  }
  return info;
}

/** 语言优先级：官方中文 > 官方英文 > 自动中文 > 自动英文 */
function pickSubtitleLang(subs, autos) {
  const has = (map, prefix) => Object.keys(map || {}).find((k) => k.toLowerCase().startsWith(prefix));
  const candidates = [
    { map: subs, prefix: 'zh', source: '官方字幕' },
    { map: subs, prefix: 'en', source: '官方字幕' },
    { map: autos, prefix: 'zh', source: '自动字幕' },
    { map: autos, prefix: 'en', source: '自动字幕' }
  ];
  for (const c of candidates) {
    const lang = has(c.map, c.prefix);
    if (lang) return { lang, source: c.source };
  }
  return null;
}

/** json3 / vtt / srt 字幕 → 纯文本 */
function parseSubtitleFile(file) {
  let raw = '';
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
  if (/^\s*\{/.test(raw)) {
    // json3
    try {
      const data = JSON.parse(raw);
      let text = '';
      for (const ev of data.events || []) {
        for (const seg of ev.segs || []) text += seg.utf8 || '';
        text += '\n';
      }
      return text;
    } catch {
      return '';
    }
  }
  // vtt / srt：去掉时间轴和序号行
  const lines = raw.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || /^WEBVTT|^NOTE|^Kind:|^Language:|^\d+$|-->/.test(t)) continue;
    out.push(t.replace(/<[^>]+>/g, ''));
  }
  return out.join('\n');
}

function collectSubtitles(dir, langs) {
  try {
    const files = fs.readdirSync(dir)
      .filter((f) => /\.(json3|vtt|srt)$/i.test(f))
      .map((f) => {
        const full = path.join(dir, f);
        return { file: full, mtime: fs.statSync(full).mtimeMs, langs };
      });
    if (!files.length) return '';
    files.sort((a, b) => b.mtime - a.mtime);
    for (const f of files) {
      const text = parseSubtitleFile(f.file).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      if (text && text.length > 40) return text;
    }
    return '';
  } catch {
    return '';
  }
}

function fmtDuration(sec) {
  const n = Math.round(Number(sec) || 0);
  if (!n) return '';
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${m}分${String(s).padStart(2, '0')}秒`;
}

function uploadDate(iso) {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(String(iso || ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

/**
 * 抓取视频信息与字幕。
 * 返回 { ok, provider, url, title, site, author, duration, durationText,
 *        publishedAt, description, transcript, transcriptSource, text }
 */
async function fetchVideo(rawUrl, opts = {}) {
  const det = detect(rawUrl);
  if (!det) throw new Error('不是支持的视频链接');
  if (!ALLOW_LOCAL_FETCH) {
    const { assertPublicHost } = require('./extract');
    await assertPublicHost(det.host);
  }

  const timeout = Math.max(20000, Number(opts.timeout) || 90000);
  // 可选：读取本机浏览器登录状态（默认关闭，只在失败后重试时使用）
  const browser = ['edge', 'chrome', 'firefox', 'brave'].includes(String(opts.cookiesFromBrowser || ''))
    ? String(opts.cookiesFromBrowser)
    : '';
  const cookieArgs = browser ? ['--cookies-from-browser', browser] : [];

  const infoArgs = ['--dump-single-json', '--skip-download', '--no-warnings', '--no-playlist'];
  let raw;
  let usedCookies = false;
  try {
    raw = await runYtDlp([...infoArgs, det.url], timeout);
  } catch (err) {
    if (!browser) throw err;
    // 第一次失败后才尝试带登录状态，减少对浏览器 cookie 的读取
    raw = await runYtDlp([...infoArgs, ...cookieArgs, det.url], timeout);
    usedCookies = true;
  }

  let info;
  try {
    info = pickEntry(JSON.parse(raw));
  } catch {
    throw new Error('视频信息解析失败');
  }
  if (!info) throw new Error('没有取到视频信息');

  const title = String(info.title || '').slice(0, 160);
  const description = String(info.description || '').trim();
  const author = String(info.uploader || info.channel || info.uploader_id || '').slice(0, 80);
  const duration = Math.round(Number(info.duration) || 0);
  const host = det.host.replace(/^www\./, '');

  // 第二步：按语言优先级拉字幕文件（有才拉，没有就诚实降级）
  let transcript = '';
  let transcriptSource = '';
  const pick = pickSubtitleLang(info.subtitles, info.automatic_captions);
  if (pick) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'miaoji-sub-'));
    try {
      await runYtDlp([
        '--skip-download', '--no-warnings', '--no-playlist',
        '--write-subs', '--write-auto-subs',
        '--sub-langs', pick.lang,
        '--sub-format', 'json3/vtt/srt/best',
        ...(usedCookies ? cookieArgs : []),
        '-o', path.join(dir, 'sub'),
        det.url
      ], timeout);
      transcript = collectSubtitles(dir, [pick.lang]);
      if (transcript) transcriptSource = pick.source;
    } catch {
      /* 字幕拉取失败不阻塞主流程 */
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  const text = (transcript || description).slice(0, MAX_TRANSCRIPT);
  return {
    ok: true,
    isVideo: true,
    provider: det.provider,
    url: String(info.webpage_url || det.url),
    title,
    site: host,
    author,
    duration,
    durationText: fmtDuration(duration),
    publishedAt: uploadDate(info.upload_date || info.timestamp),
    description,
    transcript,
    transcriptSource,
    text
  };
}

function mockVideo(rawUrl) {
  const det = detect(rawUrl) || { provider: 'B站', url: rawUrl, host: 'bilibili.com' };
  return {
    ok: true,
    isVideo: true,
    provider: det.provider,
    url: det.url,
    title: '（测试视频）用幂等键驯服重试风暴',
    site: det.host.replace(/^www\./, ''),
    author: '测试UP主',
    duration: 312,
    durationText: '5分12秒',
    publishedAt: '2026-11-10',
    description: '网络超时并不代表请求没有到达。这期讲清楚幂等键怎么设计，重试风暴怎么防。',
    transcript: '大家好。今天聊一个支付系统里最经典的问题：超时重试。\n\n网络超时并不代表请求没有到达。客户端重试时，同一笔支付可能被扣两次。\n\n解决办法是让写操作幂等。客户端生成 idempotency key，服务端把它和结果一起存起来，重复请求直接返回第一次的结果。\n\n最后总结：凡是会写数据库的操作，都要想清楚「执行两次会怎样」。',
    transcriptSource: '自动字幕',
    text: '大家好。今天聊一个支付系统里最经典的问题：超时重试。\n\n网络超时并不代表请求没有到达。客户端重试时，同一笔支付可能被扣两次。\n\n解决办法是让写操作幂等。客户端生成 idempotency key，服务端把它和结果一起存起来，重复请求直接返回第一次的结果。\n\n最后总结：凡是会写数据库的操作，都要想清楚「执行两次会怎样」。'
  };
}

async function fetchVideoSafe(rawUrl, opts) {
  if (process.env.MIAOJI_MOCK === '1') {
    await new Promise((r) => setTimeout(r, 600));
    return mockVideo(rawUrl);
  }
  return fetchVideo(rawUrl, opts);
}

module.exports = { detect, fetchVideo: fetchVideoSafe, binaryPath };
