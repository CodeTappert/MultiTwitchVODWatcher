(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VodUtil = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function uid() {
    return Math.random().toString(36).slice(2, 9);
  }

  function parseUrls(text) {
    const tokens = String(text).match(/https?:\/\/\S+/g) || [];
    const out = [];
    for (const token of tokens) {
      for (let part of token.split(/(?=https?:\/\/)/)) {
        part = part.replace(/[),;'"]+$/, '').trim();
        if (/^https?:\/\/\S+$/.test(part)) out.push(part);
      }
    }
    return [...new Set(out)];
  }

  function fmtTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    seconds = Math.floor(seconds);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  }

  function parseOffset(text) {
    text = String(text).trim();
    if (!text) return 0;
    let sign = 1;
    if (text[0] === '-') {
      sign = -1;
      text = text.slice(1);
    } else if (text[0] === '+') {
      text = text.slice(1);
    }
    const parts = text.replace(/s$/, '').split(':').map((p) => Number(p) || 0);
    let sec = 0;
    if (parts.length === 1) sec = parts[0];
    else if (parts.length === 2) sec = parts[0] * 60 + parts[1];
    else sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
    return sign * sec;
  }

  function formatOffset(seconds) {
    if (seconds === 0) return '+0:00';
    const sign = seconds < 0 ? '-' : '+';
    seconds = Math.abs(seconds);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const sStr = Number.isInteger(s) ? String(s).padStart(2, '0') : s.toFixed(1).padStart(4, '0');
    return h
      ? `${sign}${h}:${String(m).padStart(2, '0')}:${sStr}`
      : `${sign}${m}:${sStr}`;
  }

  function flatten(obj, prefix, out) {
    out = out || {};
    for (const k of Object.keys(obj)) {
      const val = obj[k];
      const key = prefix ? prefix + '.' + k : k;
      if (val && typeof val === 'object') flatten(val, key, out);
      else out[key] = val;
    }
    return out;
  }

  function pickLang(system, list) {
    const sys = String(system || 'en');
    const base = sys.split('-')[0].toLowerCase();
    if (list.some((l) => l.id === sys)) return sys;
    const byCode = list.find((l) => (l.code || '').toLowerCase() === sys.toLowerCase());
    if (byCode) return byCode.id;
    const byBase = list.find((l) => (l.code || '').toLowerCase().startsWith(base));
    if (byBase) return byBase.id;
    const en = list.find((l) => (l.code || '').toLowerCase().startsWith('en'));
    return (en || list[0]).id;
  }

  return { uid, parseUrls, fmtTime, parseOffset, formatOffset, flatten, pickLang };
});
