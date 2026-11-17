'use strict';

/**
 * 版本更新检查。
 * 只请求 GitHub 的公开 API（api.github.com），不发送任何本机数据。
 * 说明：秒记不做静默自动安装——安装包未签名，且部分网络环境下载
 * release 资产会被拦截，所以检测到新版本时给出「去下载」入口，由你决定。
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const store = require('./store');

const REPO = 'weitongxucc-dev/miaoji';
const STATE_FILE = path.join(store.DIR, 'update-state.json');
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

function currentVersion() {
  try {
    return String(require('../package.json').version || '0.0.0');
  } catch {
    return '0.0.0';
  }
}

function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(v || '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function isNewer(latest, current) {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

function readState() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function writeState(patch) {
  const next = Object.assign({}, readState(), patch, {});
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2), 'utf8');
  } catch {
    /* 写不了状态文件不影响检查本身 */
  }
}

function fetchLatest(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      `https://api.github.com/repos/${REPO}/releases?per_page=5`,
      {
        headers: {
          'User-Agent': 'miaoji-update-check',
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`版本服务返回 ${res.statusCode}`));
          return;
        }
        const chunks = [];
        let size = 0;
        res.on('data', (c) => {
          size += c.length;
          if (size > 512 * 1024) {
            res.destroy();
            reject(new Error('版本信息过大'));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => {
          try {
            const list = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (!Array.isArray(list)) throw new Error('bad');
            const rel = list.find((x) => x && !x.draft && !x.prerelease);
            if (!rel) reject(new Error('还没有正式版本'));
            else resolve(rel);
          } catch {
            reject(new Error('版本信息解析失败'));
          }
        });
        res.on('error', reject);
      }
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error('检查更新超时，请检查网络')));
    req.on('error', reject);
  });
}

/**
 * 检查更新。manual=true 时跳过 24 小时节流。
 * 返回 { ok, current, latest, hasUpdate, url, publishedAt, error? }
 */
async function check(manual) {
  const current = currentVersion();
  const state = readState();
  const last = Number(state.lastCheckAt) || 0;
  if (!manual && Date.now() - last < CHECK_INTERVAL_MS) {
    return {
      ok: true,
      skipped: true,
      current,
      latest: state.lastLatest || '',
      hasUpdate: state.lastHasUpdate === true,
      url: state.lastUrl || '',
      publishedAt: state.lastPublishedAt || ''
    };
  }
  try {
    const rel = await fetchLatest();
    const latest = String(rel.tag_name || '').trim();
    const hasUpdate = isNewer(latest, current);
    const result = {
      ok: true,
      current,
      latest,
      hasUpdate,
      url: String(rel.html_url || `https://github.com/${REPO}/releases/latest`),
      publishedAt: String(rel.published_at || '')
    };
    writeState({
      lastCheckAt: Date.now(),
      lastLatest: latest,
      lastHasUpdate: hasUpdate,
      lastUrl: result.url,
      lastPublishedAt: result.publishedAt
    });
    return result;
  } catch (err) {
    writeState({ lastCheckAt: Date.now() });
    return {
      ok: false,
      current,
      latest: '',
      hasUpdate: false,
      url: `https://github.com/${REPO}/releases/latest`,
      error: err && err.message ? err.message : String(err)
    };
  }
}

module.exports = { check, currentVersion };
