'use strict';

(function () {
const api = window.api;
const { uid, parseUrls, fmtTime, parseOffset, formatOffset, flatten, pickLang } = window.VodUtil;

let videos = [];
let playing = false;
let globalMuted = false;
let suppressRange = false;
let userSeeking = false;
let saveDebounce = null;
let tickInterval = null;
let downloadDir = '';
let position = 0;
let anchorPos = 0;
let anchorWall = 0;
let library = [];
let draggedVideo = null;
let rulerPlayhead = null;
let rulerLo = 0;
let rulerHi = 1;
let strings = {};
let fallbackStrings = {};
let fallbackId = 'en-GB';
let currentLang = 'en-GB';
let availableLangs = [{ id: 'en-GB', code: 'en-GB', name: 'English' }];
let ytdlpAvailable = false;
let ytdlpCommand = '';

const els = {
  grid: document.getElementById('grid'),
  empty: document.getElementById('empty'),
  add: document.getElementById('add'),
  addUrl: document.getElementById('addUrl'),
  play: document.getElementById('play'),
  back10: document.getElementById('back10'),
  fwd10: document.getElementById('fwd10'),
  resync: document.getElementById('resync'),
  muteAll: document.getElementById('muteAll'),
  lang: document.getElementById('lang'),
  exportSession: document.getElementById('exportSession'),
  importSession: document.getElementById('importSession'),
  ytdlpUpdate: document.getElementById('ytdlpUpdate'),
  toasts: document.getElementById('toasts'),
  timeLabel: document.getElementById('timeLabel'),
  range: document.getElementById('timeline'),
  ruler: document.getElementById('ruler'),
  toggleRuler: document.getElementById('toggleRuler'),
  fullscreen: document.getElementById('fullscreen'),
  urlPanel: document.getElementById('urlPanel'),
  urls: document.getElementById('urls'),
  quality: document.getElementById('quality'),
  dlDir: document.getElementById('dlDir'),
  pickDir: document.getElementById('pickDir'),
  ytdlpStatus: document.getElementById('ytdlpStatus'),
  ffmpegHint: document.getElementById('ffmpegHint'),
  startDl: document.getElementById('startDl'),
  closePanel: document.getElementById('closePanel'),
  jobs: document.getElementById('jobs'),
};

function t(key, params) {
  let s = strings[key];
  if (s === undefined) s = fallbackStrings[key];
  if (s === undefined) s = key;
  if (params) {
    for (const k of Object.keys(params)) s = s.split('{' + k + '}').join(String(params[k]));
  }
  return s;
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
  });
  document.title = t('app.title');
  document.documentElement.lang = currentLang;
}

async function setLanguage(id, save) {
  if (!availableLangs.some((l) => l.id === id)) id = (availableLangs[0] || { id: 'en-GB' }).id;
  currentLang = id;
  strings = id === fallbackId ? fallbackStrings : flatten((await api.loadLocale(id)) || {});
  applyTranslations();
  refreshDynamicText();
  if (save) saveSession();
}

async function setupI18n(session) {
  const list = await api.listLocales();
  if (Array.isArray(list) && list.length) availableLangs = list;
  const en = availableLangs.find((l) => (l.code || '').toLowerCase().startsWith('en')) || availableLangs[0];
  fallbackId = en.id;
  fallbackStrings = flatten((await api.loadLocale(fallbackId)) || {});
  let lang = session && session.language;
  if (!lang || !availableLangs.some((l) => l.id === lang)) {
    lang = pickLang(await api.systemLocale(), availableLangs);
  }
  await setLanguage(lang, false);
  populateLangSelect();
}

function populateLangSelect() {
  els.lang.innerHTML = '';
  for (const l of availableLangs) {
    const opt = document.createElement('option');
    opt.value = l.id;
    opt.textContent = l.name || l.code || l.id;
    if (l.id === currentLang) opt.selected = true;
    els.lang.appendChild(opt);
  }
}

function updateYtdlpStatusText() {
  els.ytdlpStatus.textContent = ytdlpAvailable
    ? t('urlPanel.ytdlpFound', { command: ytdlpCommand })
    : t('urlPanel.ytdlpMissing');
}

function refreshDynamicText() {
  updatePlayButton();
  els.muteAll.textContent = globalMuted ? t('toolbar.muteAllMuted') : t('toolbar.muteAll');
  updateYtdlpStatusText();
  els.fullscreen.title = document.body.classList.contains('cinema')
    ? t('controls.fullscreenExitTitle')
    : t('controls.fullscreenTitle');
  buildRuler();
}

function toast(message, type) {
  if (!els.toasts) return;
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = message;
  els.toasts.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 250);
  }, 4000);
}

function desktopNotify(title, body) {
  try {
    if (typeof Notification === 'function' && Notification.permission !== 'denied') {
      new Notification(title, { body });
    }
  } catch {
    /* ignore */
  }
}

function master() {
  return videos[0];
}

function displayName(v) {
  return v.streamer ? v.streamer + ' - ' + v.name : v.name;
}

function currentT() {
  if (playing) return anchorPos + (Date.now() - anchorWall) / 1000;
  return position;
}

function startInfoText(v) {
  if (!v.startTime) return '';
  const t = new Date(v.startTime * 1000).toLocaleTimeString();
  const m = master();
  if (m && m.startTime) return t + '  ' + formatOffset(v.startTime - m.startTime);
  return t;
}

function autoOffset(v) {
  const m = master();
  if (!m || v === m || !v.startTime || !m.startTime) return 0;
  return v.startTime - m.startTime;
}

function effOffset(v) {
  return autoOffset(v) + (v.manual || 0);
}

function recalcOffsets() {
  for (const v of videos) {
    v.offset = effOffset(v);
    if (v.offInput) v.offInput.value = formatOffset(v.offset);
  }
  updateTimeline();
  buildRuler();
}

function bounds() {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of videos) {
    if (!v.duration) continue;
    lo = Math.min(lo, v.offset);
    hi = Math.max(hi, v.offset + v.duration);
  }
  if (!isFinite(lo)) { lo = 0; hi = 0; }
  return { lo, hi };
}

function waitMeta(el) {
  return new Promise((resolve) => {
    if (el.readyState >= 1 && isFinite(el.duration)) return resolve();
    const done = () => {
      el.removeEventListener('loadedmetadata', done);
      el.removeEventListener('error', done);
      resolve();
    };
    el.addEventListener('loadedmetadata', done);
    el.addEventListener('error', done);
    setTimeout(done, 8000);
  });
}

function updateTimeline(t) {
  const { lo, hi } = bounds();
  const span = hi - lo;
  els.range.min = 0;
  els.range.max = span > 0 ? span : 1;
  if (t === undefined) t = currentT();
  const pos = span > 0 ? Math.min(span, Math.max(0, t - lo)) : 0;
  suppressRange = true;
  els.range.value = pos;
  suppressRange = false;
  els.timeLabel.textContent = `${fmtTime(pos)} / ${fmtTime(span)}`;
  updateRulerPlayhead(t);
}

function buildRuler() {
  if (els.ruler.classList.contains('hidden')) return;
  const { lo, hi } = bounds();
  rulerLo = lo;
  rulerHi = hi;
  const span = hi - lo || 1;

  els.ruler.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'ruler-rows';

  videos.forEach((v) => {
    const row = document.createElement('div');
    row.className = 'ruler-row';

    const label = document.createElement('span');
    label.className = 'ruler-label';
    const labelName = document.createElement('span');
    labelName.className = 'ruler-name';
    labelName.textContent = displayName(v);
    const labelSub = document.createElement('span');
    labelSub.className = 'ruler-sub';
    labelSub.textContent = startInfoText(v);
    label.append(labelName, labelSub);
    label.title = displayName(v);

    const track = document.createElement('div');
    track.className = 'ruler-track';

    const bar = document.createElement('div');
    bar.className = 'ruler-bar' + (v === videos[0] ? ' master' : '');
    const left = ((v.offset - lo) / span) * 100;
    const width = (v.duration / span) * 100;
    bar.style.left = Math.max(0, left) + '%';
    bar.style.width = Math.max(0.5, width) + '%';
    bar.title =
      displayName(v) +
      '\n' + t('ruler.offsetLine', { offset: formatOffset(v.offset) }) +
      '\n' + t('ruler.lengthLine', { length: fmtTime(v.duration), ends: formatOffset(v.offset + v.duration) }) +
      '\n' + (v.startTime
        ? t('ruler.streamStart', {
            start: new Date(v.startTime * 1000).toLocaleString(),
            delta: videos[0] && videos[0].startTime ? formatOffset(v.startTime - videos[0].startTime) : '?',
          })
        : t('ruler.streamStartUnknown'));

    track.appendChild(bar);
    row.append(label, track);
    wrap.appendChild(row);
  });

  rulerPlayhead = document.createElement('div');
  rulerPlayhead.className = 'playhead';
  wrap.appendChild(rulerPlayhead);

  els.ruler.appendChild(wrap);
  updateRulerPlayhead();
}

function updateRulerPlayhead(t) {
  if (!rulerPlayhead) return;
  if (t === undefined) t = currentT();
  const span = rulerHi - rulerLo || 1;
  const p = Math.max(0, Math.min(1, (t - rulerLo) / span));
  rulerPlayhead.style.setProperty('--p', p);
}

function seekTo(t) {
  position = t;
  if (playing) {
    anchorPos = t;
    anchorWall = Date.now();
  }
  for (const v of videos) {
    if (!v.el || !v.duration) continue;
    const local = t - v.offset;
    if (local < 0) {
      v.el.pause();
      v.el.currentTime = 0;
    } else if (local >= v.duration) {
      v.el.pause();
      v.el.currentTime = Math.max(0, v.duration - 0.05);
    } else {
      v.el.currentTime = local;
    }
  }
  updateTimeline(t);
}

function seekAndWait(v, time) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      v.el.removeEventListener('seeked', finish);
      resolve();
    };
    v.el.addEventListener('seeked', finish);
    try { v.el.currentTime = time; } catch { /* ignore */ }
    setTimeout(finish, 1200);
  });
}

async function synchronize(t, shouldPlay) {
  if (!videos.length) return;
  if (!isFinite(t)) t = 0;
  if (shouldPlay) {
    position = t;
    anchorPos = t;
    anchorWall = Date.now();
  }
  const waits = [];
  const toPlay = [];
  for (const v of videos) {
    if (!v.el || !v.duration) continue;
    const local = t - v.offset;
    if (local < 0) {
      v.el.pause();
      if (v.el.currentTime !== 0) waits.push(seekAndWait(v, 0));
    } else if (local >= v.duration) {
      v.el.pause();
      waits.push(seekAndWait(v, Math.max(0, v.duration - 0.05)));
    } else {
      waits.push(seekAndWait(v, local));
      toPlay.push(v);
    }
  }
  await Promise.all(waits);
  if (shouldPlay) {
    for (const v of toPlay) v.el.play().catch(() => {});
  }
}

function updatePlayButton() {
  els.play.textContent = playing ? t('controls.pause') : t('controls.play');
  els.play.disabled = videos.length === 0 || !videos.some((v) => v.duration);
  els.resync.disabled = els.play.disabled;
  updateMediaSession();
}

function startTick() {
  stopTick();
  tickInterval = setInterval(tick, 250);
}

function stopTick() {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}

function tick() {
  if (!playing) return;
  const t = currentT();
  position = t;
  for (const v of videos) {
    if (!v.el || !v.duration) continue;
    const local = t - v.offset;
    if (local < 0 || local >= v.duration) {
      if (!v.el.paused) v.el.pause();
    } else if (v.el.paused) {
      v.el.currentTime = local;
      v.el.play().catch(() => {});
    }
  }
  if (!userSeeking) updateTimeline(t);
  const { hi } = bounds();
  if (videos.length && t >= hi) pause();
}

async function play() {
  if (!videos.length || !videos.some((v) => v.duration)) return;
  playing = true;
  updatePlayButton();
  await synchronize(position, true);
  startTick();
}

function pause() {
  if (playing) position = currentT();
  playing = false;
  for (const v of videos) if (v.el) v.el.pause();
  stopTick();
  updatePlayButton();
  updateTimeline();
  saveSession();
}

function togglePlay() {
  if (playing) pause();
  else play();
}

async function resync() {
  if (!videos.length) return;
  recalcOffsets();
  const t = currentT();
  await synchronize(t, playing);
  updateTimeline(t);
}

async function skip(delta) {
  if (!videos.length) return;
  const target = currentT() + delta;
  if (playing) await synchronize(target, true);
  else seekTo(target);
  updateTimeline(target);
  saveSession();
}

function pathKey(p) {
  return String(p).replace(/\\/g, '/').toLowerCase();
}

async function ensureStartTimes() {
  let changed = false;
  for (const v of videos) {
    if (v.startTime) continue;
    const key = pathKey(v.path);
    const lib =
      library.find((e) => pathKey(e.path) === key) ||
      library.find((e) => e.id && v.name.includes(e.id));
    if (!lib) continue;
    if (!lib.startTime && lib.url) {
      try {
        const info = await api.ytdlpInfo(lib.url);
        lib.startTime = info.startTime || 0;
        if (!lib.streamer) lib.streamer = info.uploader || '';
      } catch (err) {
        console.error(err);
      }
    }
    if (lib.startTime) { v.startTime = lib.startTime; changed = true; }
    if (!v.streamer && lib.streamer) {
      v.streamer = lib.streamer;
      if (v.nameEl) v.nameEl.textContent = displayName(v);
    }
  }
  if (changed) {
    recalcOffsets();
    saveSession();
  }
}

function makeMaster(v) {
  if (videos[0] === v) return;
  const wasPlaying = playing;
  if (playing) pause();
  const loBefore = bounds().lo;
  videos = [v, ...videos.filter((x) => x !== v)];
  for (const x of videos) els.grid.appendChild(x.tile);
  videos[0].manual = 0;
  recalcOffsets();
  position = position - loBefore + bounds().lo;
  refreshMasterBadges();
  updateTimeline();
  saveSession();
  if (wasPlaying) play();
}

function reorderVideos(dragged, target) {
  if (!dragged || !target || dragged === target) return;
  const from = videos.indexOf(dragged);
  const to = videos.indexOf(target);
  if (from < 0 || to < 0) return;
  const wasMaster = videos[0];
  const wasPlaying = playing;
  if (playing) pause();
  const loBefore = bounds().lo;
  const arr = videos.slice();
  arr.splice(from, 1);
  arr.splice(from < to ? to - 1 : to, 0, dragged);
  videos = arr;
  for (const x of videos) els.grid.appendChild(x.tile);
  if (videos[0] !== wasMaster) videos[0].manual = 0;
  recalcOffsets();
  position = position - loBefore + bounds().lo;
  refreshMasterBadges();
  updateTimeline();
  saveSession();
  if (wasPlaying) play();
}

function removeVideo(v) {
  const wasMaster = videos[0] === v;
  if (v.el) {
    v.el.pause();
    v.el.removeAttribute('src');
    v.el.load();
  }
  v.removed = true;
  videos = videos.filter((x) => x !== v);
  if (v.tile) v.tile.remove();
  if (!videos.length) {
    if (playing) pause();
    playing = false;
    stopTick();
    els.empty.style.display = '';
    els.range.disabled = true;
    updatePlayButton();
    updateTimeline();
    buildRuler();
    saveSession();
    return;
  }
  if (wasMaster) videos[0].manual = 0;
  recalcOffsets();
  refreshMasterBadges();
  applyGridLayout();
  updatePlayButton();
  saveSession();
  if (playing) play();
}

function onOffsetChanged(v) {
  if (!v.el || !v.duration) {
    updateTimeline();
    buildRuler();
    saveSession();
    return;
  }
  const t = currentT();
  const local = t - v.offset;
  if (playing) {
    if (local >= 0 && local < v.duration) {
      v.el.currentTime = local;
      v.el.play().catch(() => {});
    } else {
      v.el.pause();
    }
  } else {
    v.el.currentTime = Math.max(0, Math.min(local, v.duration - 0.05));
  }
  updateTimeline();
  buildRuler();
  saveSession();
}

function nudge(v, delta) {
  if (v === master()) return;
  v.manual = Math.round(((v.manual || 0) + delta) * 10) / 10;
  v.offset = autoOffset(v) + v.manual;
  if (v.offInput) v.offInput.value = formatOffset(v.offset);
  onOffsetChanged(v);
}

function miniButton(label, cls, onClick) {
  const b = document.createElement('button');
  b.className = 'mini ' + (cls || '');
  b.textContent = label;
  b.onclick = onClick;
  return b;
}

function applyGridLayout() {
  const n = videos.length;
  let cols = 1;
  if (n >= 7) cols = 4;
  else if (n >= 5) cols = 3;
  else if (n >= 2) cols = 2;
  els.grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
}

function refreshMasterBadges() {  videos.forEach((v, i) => {
    if (!v.tile) return;
    const badge = v.tile.querySelector('.master-badge');
    if (badge) badge.style.display = i === 0 ? '' : 'none';
    if (v.offInput) {
      if (i === 0) {
        v.offInput.value = formatOffset(0);
        v.offInput.disabled = true;
      } else {
        v.offInput.disabled = false;
      }
    }
  });
}

async function locateFile(v) {
  const picked = await api.openOne();
  if (!picked) return;
  v.path = picked;
  v.name = picked.split(/[\\/]/).pop();
  v.el.src = api.toFileURL(picked);
  await waitMeta(v.el);
  v.duration = isFinite(v.el.duration) ? v.el.duration : 0;
  v.missing = !v.duration;
  if (v.missingOverlay) v.missingOverlay.remove();
  v.missingOverlay = null;
  if (v.nameEl) v.nameEl.textContent = displayName(v);
  updateTimeline();
  updatePlayButton();
  saveSession();
}

function buildTile(v) {
  const tile = document.createElement('div');
  tile.className = 'tile';

  const holder = document.createElement('div');
  holder.className = 'video-holder';
  holder.appendChild(v.el);

  if (v.missing) {
    const overlay = document.createElement('div');
    overlay.className = 'missing-overlay';
    const msg = document.createElement('div');
    msg.setAttribute('data-i18n', 'tile.fileNotFound');
    msg.textContent = t('tile.fileNotFound');
    const pth = document.createElement('div');
    pth.className = 'note';
    pth.textContent = v.path;
    const btn = miniButton(t('tile.locateFile'), '', () => locateFile(v));
    btn.setAttribute('data-i18n', 'tile.locateFile');
    overlay.append(msg, pth, btn);
    holder.appendChild(overlay);
    v.missingOverlay = overlay;
  }

  const hover = document.createElement('div');
  hover.className = 'tile-hover';

  const nameRow = document.createElement('div');
  nameRow.className = 'hv-row';

  const nameEl = document.createElement('span');
  nameEl.className = 'tile-name';
  nameEl.textContent = displayName(v);
  nameEl.title = v.streamer ? v.streamer + ' - ' + v.path : v.path;

  const badge = document.createElement('span');
  badge.className = 'badge master-badge';
  badge.textContent = 'MASTER';

  const spacer = document.createElement('span');
  spacer.className = 'spacer';

  const makeMasterBtn = miniButton(t('tile.makeMaster'), '', () => makeMaster(v));
  makeMasterBtn.setAttribute('data-i18n', 'tile.makeMaster');
  const removeBtn = miniButton('✕', 'danger', () => removeVideo(v));
  removeBtn.title = t('tile.removeTitle');
  removeBtn.setAttribute('data-i18n-title', 'tile.removeTitle');

  const handle = document.createElement('span');
  handle.className = 'drag-handle';
  handle.textContent = '⠿';
  handle.title = t('tile.dragTitle');
  handle.setAttribute('data-i18n-title', 'tile.dragTitle');
  handle.draggable = true;
  handle.addEventListener('dragstart', (e) => {
    draggedVideo = v;
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', v.id); } catch { /* ignore */ }
  });
  handle.addEventListener('dragend', () => { draggedVideo = null; });

  nameRow.append(handle, nameEl, badge, spacer, makeMasterBtn, removeBtn);

  const controls = document.createElement('div');
  controls.className = 'hv-row';

  const offWrap = document.createElement('label');
  offWrap.className = 'offset';
  const syncLabel = document.createElement('span');
  syncLabel.setAttribute('data-i18n', 'tile.sync');
  syncLabel.textContent = t('tile.sync');
  offWrap.append(syncLabel);

  const offInput = document.createElement('input');
  offInput.type = 'text';
  offInput.size = 7;
  offInput.className = 'offset-input';
  offInput.value = formatOffset(v.offset);
  const applyOffset = () => {
    const val = parseOffset(offInput.value);
    v.manual = val - autoOffset(v);
    v.offset = val;
    offInput.value = formatOffset(v.offset);
    onOffsetChanged(v);
  };
  offInput.addEventListener('change', applyOffset);
  offInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); applyOffset(); }
  });

  offWrap.append(
    miniButton('-1', '', () => nudge(v, -1)),
    miniButton('-0.1', '', () => nudge(v, -0.1)),
    offInput,
    miniButton('+0.1', '', () => nudge(v, 0.1)),
    miniButton('+1', '', () => nudge(v, 1))
  );

  const resyncBtn = miniButton(t('tile.resync'), '', () => {
    const t0 = currentT();
    v.el.currentTime = Math.max(0, t0 - v.offset);
    if (playing) v.el.play().catch(() => {});
  });
  resyncBtn.setAttribute('data-i18n', 'tile.resync');

  const muteBtn = miniButton(v.muted ? '🔇' : '🔊', 'vol-mute', () => {
    v.muted = !v.muted;
    v.el.muted = v.muted;
    muteBtn.textContent = v.muted ? '🔇' : '🔊';
    saveSession();
  });

  const vol = document.createElement('input');
  vol.type = 'range';
  vol.min = 0;
  vol.max = 1;
  vol.step = 0.01;
  vol.value = v.volume;
  vol.className = 'vol';
  vol.title = t('tile.volume');
  vol.setAttribute('data-i18n-title', 'tile.volume');
  vol.oninput = () => {
    v.volume = parseFloat(vol.value);
    v.el.volume = v.volume;
    if (v.volume > 0 && v.muted) {
      v.muted = false;
      v.el.muted = false;
      muteBtn.textContent = '🔊';
    }
    saveSession();
  };

  controls.append(offWrap, resyncBtn, muteBtn, vol);

  hover.append(nameRow, controls);
  holder.appendChild(hover);

  tile.addEventListener('dragover', (e) => {
    if (!draggedVideo) return;
    e.preventDefault();
    tile.classList.add('drag-over');
  });
  tile.addEventListener('dragleave', () => tile.classList.remove('drag-over'));
  tile.addEventListener('drop', (e) => {
    e.preventDefault();
    tile.classList.remove('drag-over');
    const d = draggedVideo;
    draggedVideo = null;
    reorderVideos(d, v);
  });

  tile.append(holder);
  els.grid.appendChild(tile);

  v.tile = tile;
  v.nameEl = nameEl;
  v.offInput = offInput;
}

async function addVideo(filePath, opts = {}) {
  const existing = videos.find((x) => x.path === filePath);
  if (existing) {
    let changed = false;
    if (opts.streamer && !existing.streamer) { existing.streamer = opts.streamer; changed = true; }
    if (opts.startTime && !existing.startTime) { existing.startTime = opts.startTime; changed = true; }
    if (changed) {
      if (existing.nameEl) existing.nameEl.textContent = displayName(existing);
      buildRuler();
      saveSession();
    }
    return existing;
  }

  const el = document.createElement('video');
  el.preload = 'metadata';
  el.playsInline = true;
  el.src = api.toFileURL(filePath);
  el.volume = opts.volume != null ? opts.volume : 1;
  const defaultMuted = videos.length === 0 ? globalMuted : true;
  el.muted = opts.muted != null ? opts.muted : defaultMuted;

  const v = {
    id: uid(),
    path: filePath,
    name: opts.name || filePath.split(/[\\/]/).pop(),
    streamer: opts.streamer || '',
    startTime: opts.startTime || 0,
    offset: opts.offset || 0,
    manual: opts.manual || 0,
    volume: el.volume,
    muted: el.muted,
    el,
    duration: 0,
    missing: !!opts.missing,
    removed: false,
  };
  videos.push(v);

  await waitMeta(el);
  v.duration = isFinite(el.duration) ? el.duration : 0;
  if (!v.duration && !opts.missing) v.missing = false;

  buildTile(v);
  applyGridLayout();
  recalcOffsets();
  refreshMasterBadges();
  els.empty.style.display = 'none';
  els.range.disabled = false;
  updatePlayButton();
  saveSession();
  return v;
}

function serialize() {
  return {
    version: 1,
    globalMuted,
    language: currentLang,
    downloadDir,
    position: currentT(),
    library: library.map((e) => ({ url: e.url, id: e.id, path: e.path, title: e.title, streamer: e.streamer, startTime: e.startTime })),
    videos: videos.map((v) => ({
      path: v.path,
      name: v.name,
      streamer: v.streamer,
      startTime: v.startTime,
      offset: v.offset,
      manual: v.manual,
      volume: v.volume,
      muted: v.muted,
    })),
  };
}

function saveSession() {
  clearTimeout(saveDebounce);
  saveDebounce = setTimeout(() => { api.saveSession(serialize()); }, 300);
}

function saveNow() {
  api.saveSession(serialize());
}

async function init() {
  const session = await api.loadSession();
  await setupI18n(session);

  downloadDir = await api.defaultDownloadDir();
  els.dlDir.textContent = downloadDir;

  const status = await api.ytdlpStatus();
  ytdlpAvailable = !!status.available;
  ytdlpCommand = status.command || '';
  updateYtdlpStatusText();

  const ff = await api.ffmpegStatus();
  els.ffmpegHint.classList.toggle('hidden', !!ff.available);

  if (session && Array.isArray(session.library)) library = session.library;
  if (session && Array.isArray(session.videos) && session.videos.length) {
    globalMuted = !!session.globalMuted;
    if (session.downloadDir) {
      downloadDir = session.downloadDir;
      els.dlDir.textContent = downloadDir;
    }
    let missingCount = 0;
    for (const item of session.videos) {
      const exists = await api.fileExists(item.path);
      if (!exists) missingCount++;
      await addVideo(item.path, {
        name: item.name,
        streamer: item.streamer,
        startTime: item.startTime,
        offset: item.offset,
        manual: item.manual,
        volume: item.volume,
        muted: item.muted,
        missing: !exists,
      });
    }
    if (missingCount) toast(t('toast.missingFiles', { count: missingCount }), 'error');
    const m = master();
    if (m && m.el) {
      await waitMeta(m.el);
      await ensureStartTimes();
      position = session.position || 0;
      seekTo(position);
    } else {
      await ensureStartTimes();
    }
    suppressRange = true;
    updateTimeline();
  }

  applyGridLayout();
  buildRuler();
  updatePlayButton();
  els.muteAll.textContent = globalMuted ? t('toolbar.muteAllMuted') : t('toolbar.muteAll');
}

async function applySession(data) {
  if (!data || !Array.isArray(data.videos)) return;
  if (playing) pause();
  for (const v of videos.slice()) {
    if (v.el) {
      v.el.pause();
      v.el.removeAttribute('src');
      v.el.load();
    }
    if (v.tile) v.tile.remove();
    v.removed = true;
  }
  videos = [];
  globalMuted = !!data.globalMuted;
  if (Array.isArray(data.library)) library = data.library;
  if (data.language && availableLangs.some((l) => l.id === data.language)) {
    await setLanguage(data.language, false);
    populateLangSelect();
  }
  downloadDir = await api.defaultDownloadDir();
  if (data.downloadDir) downloadDir = data.downloadDir;
  els.dlDir.textContent = downloadDir;
  els.empty.style.display = data.videos.length ? 'none' : '';
  els.range.disabled = data.videos.length === 0;

  let missingCount = 0;
  for (const item of data.videos) {
    const exists = await api.fileExists(item.path);
    if (!exists) missingCount++;
    await addVideo(item.path, {
      name: item.name,
      streamer: item.streamer,
      startTime: item.startTime,
      offset: item.offset,
      manual: item.manual,
      volume: item.volume,
      muted: item.muted,
      missing: !exists,
    });
  }
  const m = master();
  if (m && m.el) {
    await waitMeta(m.el);
    await ensureStartTimes();
    position = data.position || 0;
    seekTo(position);
  }
  suppressRange = true;
  updateTimeline();
  applyGridLayout();
  buildRuler();
  updatePlayButton();
  els.muteAll.textContent = globalMuted ? t('toolbar.muteAllMuted') : t('toolbar.muteAll');
  if (missingCount) toast(t('toast.missingFiles', { count: missingCount }), 'error');
  toast(t('toast.sessionImported'), 'success');
  saveSession();
}

const jobsUi = new Map();

function createJobRow(url) {
  const row = document.createElement('div');
  row.className = 'job';
  const title = document.createElement('span');
  title.className = 'job-title';
  title.textContent = url;
  const bar = document.createElement('div');
  bar.className = 'job-bar';
  const fill = document.createElement('div');
  bar.appendChild(fill);
  const status = document.createElement('span');
  status.className = 'job-status';
  status.textContent = t('dl.queued');
  const cancel = miniButton('✕', 'danger', () => {
    const id = row.dataset.jobId;
    if (id) api.ytdlpCancel(id);
  });
  row.append(title, bar, status, cancel);
  els.jobs.appendChild(row);
  return { row, title, fill, status, cancel, bar };
}

function handleProgress(data) {
  const ui = jobsUi.get(data.uid);
  if (!ui) return;
  const line = data.line;
  const dm = /\[download\]\s+([\d.]+)%/.exec(line);
  if (dm) {
    const pct = parseFloat(dm[1]);
    ui.bar.classList.remove('indeterminate');
    ui.status.classList.remove('finalizing');
    ui.fill.style.width = pct + '%';
    ui.status.textContent = line.replace(/^\[download\]\s+/, '').replace(/\s+/g, ' ').trim();
    return;
  }
  if (/\[(Merger|ffmpeg|VideoRemuxer|ExtractAudio|Fixup)/.test(line)) {
    ui.bar.classList.add('indeterminate');
    ui.status.classList.add('finalizing');
    ui.status.textContent = t('dl.finalizing');
    return;
  }
  if (line.includes('Destination')) {
    ui.status.textContent = t('dl.downloading');
    return;
  }
  if (line.includes('ERROR')) {
    ui.bar.classList.remove('indeterminate');
    ui.fill.style.background = 'var(--danger)';
    ui.status.textContent = t('dl.error');
  }
}

function jobLabel(streamer, title) {
  return streamer ? streamer + ' - ' + title : title;
}

async function downloadOne(url, ui) {
  const cached = library.find((e) => e.url === url);
  if (cached && (await api.fileExists(cached.path))) {
    if (!cached.streamer || !cached.startTime) {
      try {
        const info = await api.ytdlpInfo(url);
        cached.streamer = info.uploader || cached.streamer;
        cached.title = info.title || cached.title;
        cached.startTime = info.startTime || cached.startTime;
      } catch (err) {
        console.error(err);
      }
    }
    const label = jobLabel(cached.streamer, cached.title || cached.path);
    ui.title.textContent = label;
    ui.title.title = label;
    ui.fill.style.width = '100%';
    ui.status.textContent = t('dl.alreadyDownloaded');
    ui.cancel.remove();
    saveSession();
    return { file: cached.path, streamer: cached.streamer || '', startTime: cached.startTime || 0 };
  }

  let info;
  try {
    ui.status.textContent = t('dl.metadata');
    info = await api.ytdlpInfo(url);
    const label = jobLabel(info.uploader, info.title);
    ui.title.textContent = label;
    ui.title.title = label;
  } catch (err) {
    ui.status.textContent = t('dl.failed');
    ui.fill.style.background = 'var(--danger)';
    console.error(err);
    toast(t('toast.downloadFailed', { name: url }), 'error');
    return null;
  }

  const knownById = library.find((e) => e.id === info.id);
  if (knownById && (await api.fileExists(knownById.path))) {
    knownById.url = url;
    if (!knownById.streamer && info.uploader) knownById.streamer = info.uploader;
    if (!knownById.startTime && info.startTime) knownById.startTime = info.startTime;
    ui.fill.style.width = '100%';
    ui.status.textContent = t('dl.alreadyDownloaded');
    ui.cancel.remove();
    saveSession();
    return { file: knownById.path, streamer: knownById.streamer || '', startTime: knownById.startTime || 0 };
  }

  try {
    const result = await api.ytdlpDownload({
      url,
      quality: els.quality.value,
      dir: downloadDir,
      id: info.id,
      uid: ui.uid,
    });
    ui.cancel.remove();
    ui.bar.classList.remove('indeterminate');
    ui.status.classList.remove('finalizing');
    if (!result.file) {
      ui.status.textContent = t('dl.doneFile');
      ui.fill.style.width = '100%';
      return null;
    }
    library = library.filter((e) => e.url !== url && e.id !== info.id);
    library.push({ url, id: info.id, path: result.file, title: info.title, streamer: info.uploader, startTime: info.startTime });
    saveSession();
    ui.status.textContent = t('dl.done');
    ui.fill.style.width = '100%';
    const doneLabel = jobLabel(info.uploader, info.title);
    toast(t('toast.downloadDone', { name: doneLabel }), 'success');
    if (!document.hasFocus()) desktopNotify(t('app.title'), t('toast.downloadDone', { name: doneLabel }));
    return { file: result.file, streamer: info.uploader, startTime: info.startTime };
  } catch (err) {
    ui.bar.classList.remove('indeterminate');
    ui.status.classList.remove('finalizing');
    ui.status.textContent = t('dl.failed');
    ui.fill.style.background = 'var(--danger)';
    console.error(err);
    toast(t('toast.downloadFailed', { name: info ? info.title : url }), 'error');
    return null;
  }
}

async function startDownloads() {
  const urls = parseUrls(els.urls.value);
  if (!urls.length) return;
  els.startDl.disabled = true;
  for (const url of urls) {
    const ui = createJobRow(url);
    ui.uid = uid();
    ui.row.dataset.jobId = ui.uid;
    jobsUi.set(ui.uid, ui);
    const result = await downloadOne(url, ui);
    jobsUi.delete(ui.uid);
    if (result && result.file) await addVideo(result.file, { streamer: result.streamer, startTime: result.startTime });
  }
  els.startDl.disabled = false;
  els.urls.value = '';
}

function setCinema(on) {
  document.body.classList.toggle('cinema', on);
  els.fullscreen.textContent = on ? '⤢' : '⛶';
  els.fullscreen.title = on ? t('controls.fullscreenExitTitle') : t('controls.fullscreenTitle');
}

function toggleFullscreen() {
  const on = !document.body.classList.contains('cinema');
  setCinema(on);
  if (on) {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  } else if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
}

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) setCinema(false);
});

function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const handlers = {
    play: () => { if (!playing) play(); },
    pause: () => { if (playing) pause(); },
    nexttrack: () => skip(10),
    previoustrack: () => skip(-10),
    seekforward: () => skip(10),
    seekbackward: () => skip(-10),
  };
  for (const action of Object.keys(handlers)) {
    try {
      navigator.mediaSession.setActionHandler(action, handlers[action]);
    } catch {
      /* action not supported on this platform */
    }
  }
}

function updateMediaSession() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  const m = master();
  if (m && typeof MediaMetadata === 'function') {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: displayName(m),
      artist: 'MultiTwitchVODWatcher',
    });
  }
}

function wireUi() {
  els.add.onclick = () => {
    api.openVideos().then((paths) => {
      if (paths && paths.length) paths.forEach((p) => addVideo(p, {}));
    });
  };

  els.play.onclick = togglePlay;
  els.resync.onclick = resync;
  els.back10.onclick = () => skip(-10);
  els.fwd10.onclick = () => skip(10);

  els.toggleRuler.onclick = () => {
    const hidden = els.ruler.classList.toggle('hidden');
    els.toggleRuler.textContent = hidden ? '▾' : '▴';
    if (!hidden) buildRuler();
  };

  els.fullscreen.onclick = toggleFullscreen;

  els.lang.onchange = async () => {
    await setLanguage(els.lang.value, false);
    populateLangSelect();
    saveSession();
  };

  els.ytdlpUpdate.onclick = async () => {
    els.ytdlpUpdate.disabled = true;
    try {
      const res = await api.ytdlpUpdate();
      const first = (res.output || '').split('\n').map((s) => s.trim()).filter(Boolean)[0] || '';
      toast(first ? t('toast.ytdlpUpdated') + ' — ' + first : t('toast.ytdlpUpdated'), 'success');
    } catch {
      toast(t('toast.ytdlpUpdateFailed'), 'error');
    } finally {
      els.ytdlpUpdate.disabled = false;
    }
  };

  els.exportSession.onclick = async () => {
    const path = await api.exportSession(serialize());
    if (path) toast(t('toast.sessionExported'), 'success');
  };

  els.importSession.onclick = async () => {
    if (!window.confirm(t('dialog.confirmImport'))) return;
    const data = await api.importSession();
    if (data) await applySession(data);
  };

  els.muteAll.onclick = () => {
    globalMuted = !globalMuted;
    for (const v of videos) {
      v.muted = globalMuted;
      v.el.muted = globalMuted;
      const btn = v.tile && v.tile.querySelector('.vol-mute');
      if (btn) btn.textContent = globalMuted ? '🔇' : '🔊';
    }
    els.muteAll.textContent = globalMuted ? t('toolbar.muteAllMuted') : t('toolbar.muteAll');
    saveSession();
  };

  els.addUrl.onclick = () => els.urlPanel.classList.toggle('hidden');

  els.closePanel.onclick = () => els.urlPanel.classList.add('hidden');

  els.pickDir.onclick = async () => {
    const dir = await api.openDirectory();
    if (dir) {
      downloadDir = dir;
      els.dlDir.textContent = dir;
      saveNow();
    }
  };

  els.startDl.onclick = startDownloads;

  els.range.addEventListener('input', () => {
    if (suppressRange) return;
    userSeeking = true;
    seekTo(parseFloat(els.range.value) + bounds().lo);
  });
  els.range.addEventListener('change', async () => {
    userSeeking = false;
    const t = parseFloat(els.range.value) + bounds().lo;
    if (playing) await synchronize(t, true);
    else seekTo(t);
    saveSession();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'MediaPlayPause') { e.preventDefault(); togglePlay(); return; }
    if (e.key === 'MediaTrackNext') { e.preventDefault(); skip(10); return; }
    if (e.key === 'MediaTrackPrevious') { e.preventDefault(); skip(-10); return; }
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
    if (e.code === 'Space' && !typing) {
      e.preventDefault();
      togglePlay();
    } else if (e.code === 'ArrowLeft' && !typing) {
      e.preventDefault();
      skip(-10);
    } else if (e.code === 'ArrowRight' && !typing) {
      e.preventDefault();
      skip(10);
    } else if (e.code === 'KeyF' && !typing) {
      e.preventDefault();
      toggleFullscreen();
    }
  });
}

api.onYtdlpProgress(handleProgress);

setInterval(() => { if (playing) saveNow(); }, 3000);
window.addEventListener('beforeunload', saveNow);
window.addEventListener('blur', saveNow);

setupMediaSession();
wireUi();
init();
})();
