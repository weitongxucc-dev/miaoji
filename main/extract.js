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

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT = 15000;
// 仅开发/测试：允许抓本机页面（自动化测试用），正式运行不设置这个变量
const ALLOW_LOCAL_FETCH = process.env.MIAOJI_ALLOW_LOCAL_FETCH === '1';

const BLOCK_TAGS = 'p|div|section|article|main|li|ul|ol|h1|h2|h3|h4|h5|h6|blockquote|pre|tr|table|figure|figcaption';

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
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
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
 * 返回 { ok, url, title, site, publishedAt, excerpt, text }
 */
async function extractFromUrl(rawUrl, opts = {}) {
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
    text: text.slice(0, 200000)
  };
}

module.exports = { extractFromUrl, extractTextFromHtml, extractMeta, isPrivateIp };
