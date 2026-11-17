'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const DOWNLOAD_URL = 'https://obsidian.md/download';

function appDataDir() {
  return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
}

function vaultConfigFile() {
  return path.join(appDataDir(), 'obsidian', 'obsidian.json');
}

function readVaults() {
  const file = vaultConfigFile();
  const vaults = [];
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const v of Object.values(data.vaults || {})) {
      if (!v || !v.path) continue;
      if (!fs.existsSync(v.path)) continue;
      vaults.push({ path: v.path, open: Boolean(v.open) });
    }
  } catch {
    /* 没装或还没有库 */
  }
  vaults.sort((a, b) => Number(b.open) - Number(a.open) || a.path.localeCompare(b.path));
  return { vaults, file, exists: fs.existsSync(file) };
}

function readProtocolExe() {
  try {
    const out = execFileSync(
      'reg',
      ['query', 'HKCU\\Software\\Classes\\obsidian\\shell\\open\\command'],
      { encoding: 'utf8', windowsHide: true, timeout: 3000 }
    );
    const m = out.match(/"([^"]*Obsidian\.exe)"/i) || out.match(/([A-Za-z]:\\[^\r\n"]*Obsidian\.exe)/i);
    return m ? m[1] : '';
  } catch {
    return '';
  }
}

function candidateExes() {
  const local = process.env.LOCALAPPDATA || '';
  const pf = process.env.ProgramFiles || '';
  const pf86 = process.env['ProgramFiles(x86)'] || '';
  return [
    local && path.join(local, 'Obsidian', 'Obsidian.exe'),
    pf && path.join(pf, 'Obsidian', 'Obsidian.exe'),
    pf86 && path.join(pf86, 'Obsidian', 'Obsidian.exe')
  ].filter(Boolean);
}

function detectObsidian() {
  if (process.env.MIAOJI_OBSIDIAN_MOCK === 'none') {
    return { installed: false, exe: '', vaults: [], configFile: vaultConfigFile(), configExists: false, downloadUrl: DOWNLOAD_URL };
  }
  const { vaults, file, exists } = readVaults();
  const protocolExe = readProtocolExe();
  const exe = [protocolExe, ...candidateExes()].find((p) => p && fs.existsSync(p)) || protocolExe;
  return {
    installed: Boolean(exe || vaults.length || exists),
    exe,
    vaults,
    configFile: file,
    configExists: exists,
    downloadUrl: DOWNLOAD_URL
  };
}

module.exports = { detectObsidian, DOWNLOAD_URL };
