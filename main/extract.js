'use strict';

/**
 * 网页正文抓取：零依赖，只用 Node 内置模块。
 * 只做「取回 + 清洗成纯文本」，摘要与术语交给 AI。
 */

const http = require('http');
const https = require('https');
const zlib = require('zlib');
const dns = require('dns');
const net = require('net');
const fs = require('fs');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT = 15000;
// 仅开发/测试：允许抓本机页面（自动化测试用），正式运行不设置这个变量
const ALLOW_LOCAL_FETCH = process.env.MIAOJI_ALLOW_LOCAL_FETCH === '1';

const BLOCK_TAGS = 'p|div|section|article|main|li|ul|ol|h1|h2|h3|h4|h5|h6|blockquote|pre|tr|table|figure|figcaption';

/* ---------------- Readability 渲染解析（主路径） ----------------
 * 借 Electron 自带的 Chromium：隐藏窗口加载页面（含 JS 动态渲染），
 * 再在页面里跑 Mozilla Readability（Firefox 阅读模式同款算法）取正文。
 * 全部本地执行，不经过任何第三方服务。 */

let readabilitySource = null;
function loadReadability() {
  if (readabilitySource !== null) return readabilitySource;
  try {
    readabilitySource = fs.readFileSync(require.resolve('@mozilla/readability/Readability.js'), 'utf8');
  } catch {
    readabilitySource = '';
  }
  return readabilitySource;
}

function buildReaderScript(rdSource) {
  return `(function() {
  var module = { exports: {} };
${rdSource}
  var RD = module.exports;
  try {
    var doc = document.cloneNode(true);
    var article = new RD(doc).parse();
    if (!article || !article.textContent || String(article.textContent).trim().length < 40) {
      return { ok: false };
    }
    var holder = document.createElement('div');
    holder.innerHTML = article.content || '';
    var paras = [];
    holder.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre').forEach(function(el) {
      var t = String(el.textContent || '').replace(/[ \\t\\r\\n]+/g, ' ').trim();
      if (t) paras.push(t);
    });
    var text = paras.join('\\n\\n');
    if (!text || text.length < 40) text = String(article.textContent || '').trim();
    var metaPub = document.querySelector('meta[property="article:published_time"], meta[name="pubdate"], meta[name="date"], time[datetime]');
    var pub = metaPub ? (metaPub.getAttribute('content') || metaPub.getAttribute('datetime') || '') : (article.publishedTime || '');
    return {
      ok: true,
      title: String(article.title || document.title || ''),
      byline: String(article.byline || ''),
      siteName: String(article.siteName || ''),
      text: text,
      publishedAt: String(pub)
    };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
})()`;
}

function looksLocalHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (!h || h === 'localhost' || h.endsWith('.local')) return true;
  if (net.isIPv4(h)) return isPrivateIp(h);
  return false;
}

async function renderExtract(rawUrl, opts = {}) {
  let electron;
  try {
    electron = require('electron');
  } catch {
    return null;
  }
  if (!electron || !electron.BrowserWindow) return null; // 非 Electron 环境，走静态兜底
  const rdSource = loadReadability();
  if (!rdSource) return null;

  let startUrl = String(rawUrl || '').trim();
  try {
    const u = new URL(startUrl);
    if (!/^https?:$/.test(u.protocol)) return null;
    if (!ALLOW_LOCAL_FETCH) await assertPublicHost(u.hostname);
  } catch (err) {
    throw err;
  }

  const { BrowserWindow } = electron;
  const timeoutMs = Math.max(10000, Number(opts.timeout) || 20000);
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 1600,
    skipTaskbar: true,
    webPreferences: {
      partition: 'miaoji-extract', // 内存 session，不落盘、不带走 cookie
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
      images: false,
      javascript: true
    }
  });

  try {
    win.setMenuBarVisibility(false);
    const wc = win.webContents;
    wc.setUserAgent(UA);

    // 只放行主文档 / 脚本 / XHR / fetch，其余（图片、字体、样式、iframe、媒体）拦截
    wc.session.webRequest.onBeforeRequest((details, callback) => {
      const t = details.resourceType;
      const allow = t === 'mainFrame' || t === 'script' || t === 'xhr' || t === 'fetch';
      callback({ cancel: !allow });
    });
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    let navCount = 0;
    wc.on('will-navigate', (e, url) => {
      navCount += 1;
      let host = '';
      try {
        host = new URL(url).hostname;
      } catch {
        host = '';
      }
      if (navCount > 5 || !/^https?:/i.test(url) || (!ALLOW_LOCAL_FETCH && looksLocalHost(host))) {
        e.preventDefault();
      }
    });

    return await new Promise((resolve) => {
      let settled = false;
      const finish = (v) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(v);
      };
      const timer = setTimeout(() => finish(null), timeoutMs);

      const attempt = (retryAfterMs) => {
        wc.executeJavaScript(buildReaderScript(rdSource), true)
          .then((r) => {
            if (settled) return;
            if (r && r.ok && r.text && r.text.length >= 80) {
              finish(r);
              return;
            }
            if (retryAfterMs > 0) {
              // 页面可能还在懒加载，稍等再试一次
              setTimeout(() => {
                if (!settled) attempt(0);
              }, retryAfterMs);
            } else {
              finish(null);
            }
          })
          .catch(() => finish(null));
      };

      wc.on('did-finish-load', () => {
        setTimeout(() => {
          if (!settled) attempt(2500);
        }, 700);
      });
      wc.loadURL(startUrl, { userAgent: UA }).catch(() => {
        /* 加载失败留给超时/静态兜底 */
      });
    });
  } finally {
    try {
      win.destroy();
    } catch {
      /* ignore */
    }
  }
}

function isPrivateIp(ip) {
  if (!ip) return true;
  if (ip === '::1' || ip === '::') return true;
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // fc00::/7
  if (ip.startsWith('fe80')) return true;
  if (ip.startsWith('::ffff:')) return isPrivateIp(ip.slice(7));
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number);
    if (p[0] === 127 || p[0] === 10 || p[0] === 0) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
  }
  return false;
}

async function assertPublicHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.local')) {
    throw new Error('不支持抓取本机或局域网地址');
  }
  const addrs = await new Promise((resolve) => {
    dns.lookup(host, { all: true }, (err, list) => resolve(err ? [] : list || []));
  });
  if (!addrs.length) throw new Error('无法解析网址域名');
  if (addrs.some((a) => isPrivateIp(a.address))) {
    throw new Error('不支持抓取本机或局域网地址');
  }
}

function requestOnce(url, opts) {
  const mod = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.get(
      url,
      {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br'
        }
      },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            res.destroy();
            resolve({ res, body: Buffer.concat(chunks), truncated: true });
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => resolve({ res, body: Buffer.concat(chunks), truncated: false }));
        res.on('error', reject);
      }
    );
    req.setTimeout(opts.timeout, () => req.destroy(new Error('抓取超时，请检查网络或换一个链接')));
    req.on('error', reject);
  });
}

function decompress(body, encoding) {
  const enc = String(encoding || '').toLowerCase();
  try {
    if (enc.includes('br')) return zlib.brotliDecompressSync(body);
    if (enc.includes('gzip')) return zlib.gunzipSync(body);
    if (enc.includes('deflate')) return zlib.inflateSync(body);
  } catch {
    return body;
  }
  return body;
}

function detectCharset(buffer, contentType) {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(String(contentType || ''));
  if (fromHeader) return fromHeader[1].toLowerCase();
  const head = buffer.slice(0, 4096).toString('latin1');
  const meta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head);
  if (meta) return meta[1].toLowerCase();
  return 'utf-8';
}

function decodeBody(buffer, charset) {
  const label = /^gb2312|^gbk$/i.test(charset) ? 'gb18030' : charset;
  try {
    return new TextDecoder(label).decode(buffer);
  } catch {
    return buffer.toString('utf8');
  }
}

function decodeEntities(s) {
  const named = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", mdash: '—', ndash: '–', hellip: '…', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’' };
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => (named[name.toLowerCase()] !== undefined ? named[name.toLowerCase()] : m));
}

function pickContentHtml(html) {
  // 微信公众号
  const wx = /<div[^>]+id=["']js_content["'][^>]*>([\s\S]*?)<\/div>\s*<(?:script|div class=["']rich_media_tool)/i.exec(html);
  if (wx) return wx[1];
  const wxLoose = /<div[^>]+id=["']js_content["'][^>]*>([\s\S]*)/i.exec(html);
  if (wxLoose) return wxLoose[1].split(/<script[\s\S]*?<\/script>/i)[0];
  // 常见语义标签
  for (const re of [
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<div[^>]+role=["']main["'][^>]*>([\s\S]*?)<\/div>/i
  ]) {
    const m = re.exec(html);
    if (m && m[1] && m[1].replace(/<[^>]+>/g, '').trim().length > 200) return m[1];
  }
  return html;
}

function extractTextFromHtml(html) {
  let s = String(html || '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, ' ');
  s = s.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, ' ');
  s = s.replace(/<(script|style|noscript|svg|iframe|form|button)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<(nav|header|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(new RegExp(`</?(?:${BLOCK_TAGS})[^>]*>`, 'gi'), '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  s = s.replace(/[ \t\f\v ]+/g, ' ');
  s = s.replace(/ *\n */g, '\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

function metaContent(html, patterns) {
  for (const re of patterns) {
    const m = re.exec(html);
    if (m && m[1]) return decodeEntities(m[1]).trim();
  }
  return '';
}

function extractMeta(html) {
  const title =
    metaContent(html, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
      /<div[^>]+id=["']activity-name["'][^>]*>([\s\S]*?)<\/div>/i,
      /<title[^>]*>([\s\S]*?)<\/title>/i,
      /<h1[^>]*>([\s\S]*?)<\/h1>/i
    ]) || '';
  const publishedAt =
    metaContent(html, [
      /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
      /<time[^>]+datetime=["']([^"']+)["']/i
    ]) || '';
  return { title: extractTextFromHtml(title).slice(0, 160), publishedAt };
}

async function fetchHtml(rawUrl, opts = {}) {
  let current = new URL(String(rawUrl || '').trim());
  if (!/^https?:$/.test(current.protocol)) throw new Error('只支持 http/https 链接');
  if (!ALLOW_LOCAL_FETCH) await assertPublicHost(current.hostname);

  let redirects = 0;
  let timeout = Number(opts.timeout) || DEFAULT_TIMEOUT;

  for (;;) {
    const { res, body } = await requestOnce(current, { timeout });
    const status = res.statusCode || 0;
    if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
      redirects += 1;
      if (redirects > MAX_REDIRECTS) throw new Error('重定向次数过多');
      current = new URL(res.headers.location, current);
      if (!/^https?:$/.test(current.protocol)) throw new Error('只支持 http/https 链接');
      if (!ALLOW_LOCAL_FETCH) await assertPublicHost(current.hostname);
      continue;
    }
    if (status >= 400) throw new Error(`网页返回 ${status}，可能无法访问`);
    const buffer = decompress(body, res.headers['content-encoding']);
    const charset = detectCharset(buffer, res.headers['content-type']);
    return { url: current.toString(), html: decodeBody(buffer, charset) };
  }
}

/**
 * 抓取并清洗一个网页。
 * 主路径：隐藏窗口渲染 + Readability（能处理 JS 动态渲染的页面）；
 * 兜底：零依赖静态抓取（服务器直出 HTML 的页面）。
 * 返回 { ok, url, title, site, publishedAt, excerpt, text, extractor }
 */
async function extractFromUrl(rawUrl, opts = {}) {
  // 先试渲染解析
  let rendered = null;
  let renderError = null;
  try {
    rendered = await renderExtract(rawUrl, opts);
  } catch (err) {
    // 本机/局域网地址这类安全错误直接抛，不再走静态兜底
    renderError = err;
    if (err && /局域网|本机/.test(String(err.message))) throw err;
  }
  if (rendered && rendered.text && rendered.text.length >= 40) {
    let text = String(rendered.text).trim();
    const title = String(rendered.title || '').trim().slice(0, 160);
    // h1 往往和标题重复，去掉开头那一行，避免原文里出现两遍标题
    if (title) {
      const firstLine = text.split(/\n/)[0].trim();
      if (firstLine && (firstLine === title || firstLine.startsWith(title))) {
        text = text.slice(firstLine.length).trim();
      }
    }
    if (text && text.length >= 40) {
      const u = new URL(String(rawUrl).trim());
      return {
        ok: true,
        url: u.toString(),
        title: title || u.hostname,
        site: u.hostname.replace(/^www\./, ''),
        publishedAt: String(rendered.publishedAt || ''),
        excerpt: text.slice(0, 120),
        text: text.slice(0, 200000),
        extractor: 'render'
      };
    }
    // 渲染结果太薄，落到静态兜底
  }

  // 静态兜底
  const { url, html } = await fetchHtml(rawUrl, opts);
  const meta = extractMeta(html);
  let text = extractTextFromHtml(pickContentHtml(html));
  // h1 往往和标题重复，去掉开头那一行，避免原文里出现两遍标题
  if (meta.title) {
    const firstLine = text.split(/\n/)[0].trim();
    if (firstLine && (firstLine === meta.title || firstLine.startsWith(meta.title))) {
      text = text.slice(firstLine.length).trim();
    }
  }
  if (!text || text.length < 40) throw new Error('没有抓到正文，可能是不支持的页面（需要登录或由脚本渲染）');
  const u = new URL(url);
  return {
    ok: true,
    url,
    title: meta.title || u.hostname,
    site: u.hostname.replace(/^www\./, ''),
    publishedAt: meta.publishedAt,
    excerpt: text.slice(0, 120),
    text: text.slice(0, 200000),
    extractor: 'static'
  };
}

module.exports = { extractFromUrl, extractTextFromHtml, extractMeta, fetchHtml, assertPublicHost, isPrivateIp };
