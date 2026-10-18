/* ===== Utilities ===== */
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
};
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2800);
}
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/* ===== Page chrome: typed text, reveal, cursor glow, status badge ===== */
(function chrome() {
  const words = ['intelligent', 'real-time', 'beautiful', 'precise', 'useful'];
  let w = 0, c = 0, del = false;
  (function tick() {
    const el = $('typed'), word = words[w];
    el.textContent = word.slice(0, c);
    if (!del && c === word.length) { del = true; return setTimeout(tick, 1600); }
    if (del && c === 0) { del = false; w = (w + 1) % words.length; }
    c += del ? -1 : 1;
    setTimeout(tick, del ? 45 : 95);
  })();

  const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add('in')), { threshold: .12 });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  window.addEventListener('pointermove', (e) => {
    const g = $('cursorGlow'); g.style.left = e.clientX + 'px'; g.style.top = e.clientY + 'px';
  });

  document.querySelectorAll('[data-count]').forEach((el) => {
    const to = +el.dataset.count; let n = 0;
    const id = setInterval(() => { n++; el.textContent = n; if (n >= to) clearInterval(id); }, 90);
  });

  // Subtle card tilt on hover
  document.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      card.style.transform = `perspective(900px) rotateY(${x * 5}deg) rotateX(${-y * 5}deg)`;
    });
    card.addEventListener('pointerleave', () => (card.style.transform = ''));
  });

  // Live status badge
  window.setStatus = (txt) => { statusOverride = txt; update(); };
  let statusOverride = null;
  function update() {
    const now = new Date(), h = now.getHours();
    $('localTime').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' local';
    const base = h >= 9 && h < 19 ? 'Available for projects' : h >= 19 && h < 23 ? 'Online · building' : 'Offline · replies tomorrow';
    $('statusText').textContent = statusOverride || base;
  }
  update(); setInterval(update, 15000);
})();

/* ===== Pose helpers ===== */
const LM = { nose: 0, lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16, lHip: 23, rHip: 24, lKn: 25, rKn: 26, lAn: 27, rAn: 28 };
const CONNECTIONS = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];
let FRAME = { w: 16, h: 9 };
function angle(a, b, c) {
  const ab = [(a.x - b.x) * FRAME.w, (a.y - b.y) * FRAME.h];
  const cb = [(c.x - b.x) * FRAME.w, (c.y - b.y) * FRAME.h];
  const dot = ab[0] * cb[0] + ab[1] * cb[1];
  const m = Math.hypot(...ab) * Math.hypot(...cb) || 1;
  return Math.acos(clamp(dot / m, -1, 1)) * 180 / Math.PI;
}
const vis = (p) => (p?.visibility ?? 0) > 0.45;
// average the angle of whichever sides are visible
function sideAngle(lm, [a1, b1, c1], [a2, b2, c2], mode = 'avg') {
  const L = vis(lm[a1]) && vis(lm[b1]) && vis(lm[c1]) ? angle(lm[a1], lm[b1], lm[c1]) : null;
  const R = vis(lm[a2]) && vis(lm[b2]) && vis(lm[c2]) ? angle(lm[a2], lm[b2], lm[c2]) : null;
  if (L == null && R == null) return null;
  if (L == null) return R; if (R == null) return L;
  return mode === 'min' ? Math.min(L, R) : (L + R) / 2;
}
const elbow = (lm) => sideAngle(lm, [LM.lSh, LM.lEl, LM.lWr], [LM.rSh, LM.rEl, LM.rWr]);
const knee = (lm, m) => sideAngle(lm, [LM.lHip, LM.lKn, LM.lAn], [LM.rHip, LM.rKn, LM.rAn], m);
const body = (lm) => sideAngle(lm, [LM.lSh, LM.lHip, LM.lAn], [LM.rSh, LM.rHip, LM.rAn]);

/* ===== Exercise catalogue ===== */
const EXERCISES = {
  pushup: {
    name: 'Push-ups', unit: 'push-ups', kcal: 0.45, lo: 90, hi: 160,
    metric: elbow,
    form: (lm) => { const b = body(lm); return b != null && b < 150 ? 'Keep your body in a straight line' : null; },
    hints: { down: 'Good depth — push up!', up: 'Lower your chest' },
  },
  squat: {
    name: 'Squats', unit: 'squats', kcal: 0.32, lo: 100, hi: 160,
    metric: (lm) => knee(lm),
    form: (lm) => {
      const sh = lm[LM.lSh], hip = lm[LM.lHip];
      if (!vis(sh) || !vis(hip)) return null;
      const lean = Math.abs(Math.atan2((sh.x - hip.x) * FRAME.w, (hip.y - sh.y) * FRAME.h)) * 180 / Math.PI;
      return lean > 55 ? 'Chest up — avoid leaning forward' : null;
    },
    hints: { down: 'Drive through your heels', up: 'Sit back and down' },
  },
  lunge: {
    name: 'Lunges', unit: 'lunges', kcal: 0.3, lo: 100, hi: 160,
    metric: (lm) => knee(lm, 'min'),
    form: () => null,
    hints: { down: 'Push back up', up: 'Step and drop your back knee' },
  },
  curl: {
    name: 'Bicep curls', unit: 'curls', kcal: 0.15, lo: 55, hi: 150,
    metric: elbow,
    form: (lm) => {
      const sh = lm[LM.lSh], el = lm[LM.lEl];
      if (!vis(sh) || !vis(el)) return null;
      return Math.abs(el.x - sh.x) * FRAME.w > Math.abs(el.y - sh.y) * FRAME.h * 0.8 ? 'Keep your elbows by your sides' : null;
    },
    hints: { down: 'Squeeze, then lower slowly', up: 'Curl the weight up' },
  },
  press: {
    name: 'Shoulder press', unit: 'presses', kcal: 0.25, lo: 90, hi: 160,
    metric: elbow,
    form: () => null,
    hints: { down: 'Press overhead', up: 'Bring weights to shoulders' },
  },
  jack: {
    name: 'Jumping jacks', unit: 'jacks', kcal: 0.2, lo: 70, hi: 150,
    metric: (lm) => {
      const sh = lm[LM.lSh], rs = lm[LM.rSh], lw = lm[LM.lWr], rw = lm[LM.rWr], la = lm[LM.lAn], ra = lm[LM.rAn];
      if (![sh, rs, lw, rw, la, ra].every(vis)) return null;
      const shW = Math.abs(sh.x - rs.x) || .1;
      const arms = clamp(((sh.y - (lw.y + rw.y) / 2) / shW) * .6 + .5, 0, 1);
      const legs = clamp((Math.abs(la.x - ra.x) / shW - 1) / 1.2, 0, 1);
      return 150 - 90 * ((arms + legs) / 2); // open = low
    },
    form: () => null,
    hints: { down: 'Jump back together', up: 'Arms and legs out!' },
  },
  plank: {
    name: 'Plank (seconds)', unit: 'seconds', kcal: 0.08, timed: true,
    metric: body,
    form: (lm) => { const b = body(lm); return b != null && b < 155 ? 'Hips are sagging or piking — align your body' : null; },
    hints: {},
  },
};

/* ===== Session state ===== */
const S = {
  ex: 'pushup', reps: 0, setNum: 1, phase: 'up', seenLow: false, v: null,
  startTime: null, lastRepT: null, formFrames: 0, goodFrames: 0, cal: 0,
  camOn: false, manual: false, resting: false, restTimer: null,
};
let stream = null, pose = null, running = false, audioCtx = null;

/* ===== UI: tabs ===== */
const tabs = $('exTabs');
Object.entries(EXERCISES).forEach(([k, e]) => {
  const b = document.createElement('button');
  b.className = 'ex-tab' + (k === S.ex ? ' active' : ''); b.textContent = e.name; b.dataset.k = k;
  b.onclick = () => { selectExercise(k); };
  tabs.appendChild(b);
});
function selectExercise(k) {
  S.ex = k; resetSession();
  document.querySelectorAll('.ex-tab').forEach((t) => t.classList.toggle('active', t.dataset.k === k));
  $('repLabel').textContent = EXERCISES[k].unit;
  if (EXERCISES[k].timed) $('target').value = 30; else if (+$('target').value === 30) $('target').value = 10;
  updateHud();
}

/* ===== Sound / voice ===== */
function beep(freq = 880, dur = .09) {
  if (!$('beep').checked) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = freq; o.type = 'sine'; g.gain.value = .08;
    o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + dur);
  } catch { /* audio unavailable */ }
}
function say(t) {
  if (!$('voice').checked || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(String(t)); u.rate = 1.15; speechSynthesis.speak(u);
}

/* ===== Counting ===== */
function addRep(n = 1) {
  const ex = EXERCISES[S.ex];
  if (!S.startTime) S.startTime = Date.now();
  if (S.resting) return;
  S.reps = Math.max(0, S.reps + n);
  if (n > 0) {
    S.cal += ex.kcal * n;
    const now = Date.now();
    if (S.lastRepT) $('tempo').textContent = ((now - S.lastRepT) / 1000).toFixed(1) + 's';
    S.lastRepT = now;
    beep(); if (!ex.timed) say(S.reps);
    $('repCount').classList.remove('bump'); void $('repCount').offsetWidth; $('repCount').classList.add('bump');
  }
  updateHud();
  if (S.reps >= +$('target').value && n > 0) completeSet();
}
function updateHud() {
  const t = +$('target').value || 1;
  $('repCount').textContent = S.reps;
  $('setProgress').textContent = `${S.reps}/${t}`;
  $('ringFg').style.strokeDashoffset = 326.7 * (1 - clamp(S.reps / t, 0, 1));
  $('cal').textContent = S.cal.toFixed(1);
  $('formScore').textContent = (S.formFrames ? Math.round(100 * S.goodFrames / S.formFrames) : 100) + '%';
}
function saveSet() {
  if (S.reps <= 0) return null;
  const secs = S.startTime ? Math.round((Date.now() - S.startTime) / 1000) : 0;
  const form = S.formFrames ? Math.round(100 * S.goodFrames / S.formFrames) : 100;
  const log = store.get('pc_log', []);
  const entry = { ts: Date.now(), ex: S.ex, reps: S.reps, secs, cal: +S.cal.toFixed(1), form };
  log.push(entry); store.set('pc_log', log);
  renderStats();
  return entry;
}
function nextSetState() {
  S.reps = 0; S.cal = 0; S.startTime = null; S.lastRepT = null; S.formFrames = 0; S.goodFrames = 0;
  S.phase = 'up'; S.seenLow = false; updateHud();
}
function completeSet() {
  saveSet(); beep(1200, .3); say('Set complete');
  const sets = +$('setsTarget').value;
  if (S.setNum >= sets) {
    toast(`Workout complete — ${sets} sets of ${EXERCISES[S.ex].name} 🎉`); S.setNum = 1; nextSetState(); return;
  }
  S.setNum++; nextSetState(); toast(`Set done. Starting set ${S.setNum}/${sets} after rest`);
  startRest(+$('restSec').value);
}
function startRest(sec) {
  S.resting = true; let left = sec;
  $('restBanner').classList.add('on'); $('restLeft').textContent = left;
  clearInterval(S.restTimer);
  S.restTimer = setInterval(() => {
    left--; $('restLeft').textContent = left;
    if (left <= 3 && left > 0) beep(600, .06);
    if (left <= 0) endRest();
  }, 1000);
}
function endRest() {
  clearInterval(S.restTimer); S.resting = false; $('restBanner').classList.remove('on'); beep(1000, .2); say('Go');
}
function resetSession() {
  endRest(); nextSetState(); S.setNum = 1; $('tempo').textContent = '–'; $('timer').textContent = '00:00';
  $('feedback').textContent = 'Get in position'; $('phase').textContent = 'READY';
}

/* Per-frame logic from a pose result */
let ema = null, plankSince = null, plankAccum = 0;
function process(lm) {
  const ex = EXERCISES[S.ex];
  const raw = ex.metric(lm);
  if (raw == null) { setFeedback('Step back so your body is visible', 'bad'); return; }
  const v = ema == null ? raw : ema * .6 + raw * .4; ema = v; S.v = v;
  if (S.resting) { setFeedback('Resting…', ''); return; }

  const issue = ex.form(lm);
  if (issue) setFeedback(issue, 'bad'); else setFeedback('Form looks good', 'good');

  if (ex.timed) {
    const good = !issue;
    S.formFrames++; if (good) S.goodFrames++;
    $('phase').textContent = good ? 'HOLDING' : 'ADJUST';
    $('depthFill').style.height = (good ? 100 : 30) + '%';
    if (good) { plankSince ??= Date.now(); } else plankSince = null;
    if (good && plankSince && Date.now() - plankSince >= 1000) { plankSince = Date.now(); addRep(1); }
    return;
  }

  const depth = clamp((ex.hi - v) / (ex.hi - ex.lo), 0, 1);
  $('depthFill').style.height = depth * 100 + '%';
  if (S.startTime || v < ex.hi - 8) { S.formFrames++; if (!issue) S.goodFrames++; }

  if (v > ex.hi) {
    if (S.phase === 'down' && S.seenLow) { S.seenLow = false; addRep(1); }
    S.phase = 'up'; $('phase').textContent = 'TOP';
  } else if (v < ex.lo) {
    S.phase = 'down'; S.seenLow = true; $('phase').textContent = 'BOTTOM';
    if (!issue) setFeedback(ex.hints.down || '', 'good');
  } else {
    if (S.phase === 'up') S.phase = 'down'; // leaving the top
    $('phase').textContent = S.seenLow ? 'RISING' : 'LOWERING';
    if (!issue && !S.seenLow && ex.hints.up) setFeedback(ex.hints.up, '');
  }
}
function setFeedback(t, cls) {
  const f = $('feedback'); f.textContent = t; f.parentElement.className = 'formbar ' + cls;
}

/* ===== Camera + MediaPipe ===== */
const video = $('video'), canvas = $('overlay'), ctx = canvas.getContext('2d');
async function startCamera() {
  if (typeof Pose === 'undefined') { toast('Pose library failed to load (offline?) — use manual mode'); return startManual(); }
  try {
    toast('Loading pose model…');
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 960, height: 540, facingMode: 'user' }, audio: false });
    video.srcObject = stream; await video.play();
    pose = new Pose({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}` });
    pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: .5, minTrackingConfidence: .5 });
    pose.onResults(onResults);
    S.camOn = true; running = true; $('stageEmpty').classList.add('hidden');
    window.setStatus('Training live 💪');
    loop();
  } catch (e) {
    console.error(e); toast('Camera unavailable — switched to manual mode'); startManual();
  }
}
async function loop() {
  if (!running) return;
  if (video.readyState >= 2) { try { await pose.send({ image: video }); } catch (e) { console.error(e); } }
  requestAnimationFrame(loop);
}
function onResults(r) {
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  FRAME = { w: canvas.width, h: canvas.height };
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!r.poseLandmarks) { setFeedback('No person detected', 'bad'); return; }
  if ($('skeleton').checked) drawSkeleton(r.poseLandmarks);
  process(r.poseLandmarks);
}
function drawSkeleton(lm) {
  ctx.lineWidth = 4; ctx.lineCap = 'round';
  const g = ctx.createLinearGradient(0, 0, canvas.width, 0); g.addColorStop(0, '#A855FF'); g.addColorStop(1, '#22D3EE');
  ctx.strokeStyle = g; ctx.shadowColor = '#A855FF'; ctx.shadowBlur = 12;
  CONNECTIONS.forEach(([a, b]) => {
    if (!vis(lm[a]) || !vis(lm[b])) return;
    ctx.beginPath(); ctx.moveTo(lm[a].x * canvas.width, lm[a].y * canvas.height); ctx.lineTo(lm[b].x * canvas.width, lm[b].y * canvas.height); ctx.stroke();
  });
  ctx.fillStyle = '#fff';
  [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].forEach((i) => {
    if (!vis(lm[i])) return; ctx.beginPath(); ctx.arc(lm[i].x * canvas.width, lm[i].y * canvas.height, 5, 0, 7); ctx.fill();
  });
  ctx.shadowBlur = 0;
}
function startManual() {
  S.manual = true; $('stageEmpty').classList.add('hidden');
  setFeedback('Manual mode — press Space or +1 to count', ''); window.setStatus('Training live 💪');
}
function stopCamera() {
  running = false; S.camOn = false; S.manual = false;
  stream?.getTracks().forEach((t) => t.stop()); stream = null; video.srcObject = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  $('stageEmpty').classList.remove('hidden'); window.setStatus(null);
}

/* Timer */
setInterval(() => { if (S.startTime && !S.resting) $('timer').textContent = fmtTime((Date.now() - S.startTime) / 1000); }, 500);

/* ===== Controls ===== */
$('startCam').onclick = startCamera;
$('demoBtn').onclick = startManual;
$('stopCam').onclick = stopCamera;
$('plus').onclick = () => addRep(1);
$('minus').onclick = () => addRep(-1);
$('finish').onclick = () => { if (S.reps) { const e = saveSet(); toast(`Saved ${e.reps} ${EXERCISES[S.ex].unit}`); nextSetState(); } else toast('Nothing to save yet'); };
$('reset').onclick = resetSession;
$('skipRest').onclick = endRest;
$('target').onchange = updateHud;
$('mirror').onchange = () => document.querySelector('.stage').classList.toggle('mirror', $('mirror').checked);
document.querySelector('.stage').classList.add('mirror');
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName) && (S.manual || S.camOn)) { e.preventDefault(); addRep(1); }
});

/* ===== Stats ===== */
const ACH = [
  { id: 'first', t: '🌱 First rep', ok: (s) => s.life >= 1 },
  { id: 'c100', t: '💯 100 lifetime', ok: (s) => s.life >= 100 },
  { id: 'c500', t: '🔥 500 lifetime', ok: (s) => s.life >= 500 },
  { id: 'd50', t: '⚡ 50 in a day', ok: (s) => s.today >= 50 },
  { id: 'str3', t: '📆 3-day streak', ok: (s) => s.streak >= 3 },
  { id: 'str7', t: '🏆 7-day streak', ok: (s) => s.streak >= 7 },
  { id: 'var', t: '🎯 3 exercises tried', ok: (s) => s.kinds >= 3 },
  { id: 'form', t: '✨ Perfect form set', ok: (s) => s.perfect },
];
function challengeOfDay() {
  const keys = ['pushup', 'squat', 'curl', 'lunge', 'jack'];
  const d = Math.floor(Date.now() / 864e5);
  const ex = keys[d % keys.length];
  return { ex, goal: 20 + (d % 4) * 10 };
}
function renderStats() {
  const log = store.get('pc_log', []);
  const today = dayKey();
  const byDay = {};
  log.forEach((l) => { const k = dayKey(new Date(l.ts)); byDay[k] = (byDay[k] || 0) + l.reps; });
  const todayReps = byDay[today] || 0;
  let streak = 0; const d = new Date();
  if (!byDay[dayKey(d)]) d.setDate(d.getDate() - 1);
  while (byDay[dayKey(d)]) { streak++; d.setDate(d.getDate() - 1); }
  const life = log.reduce((a, l) => a + l.reps, 0);
  const best = log.reduce((a, l) => Math.max(a, l.reps), 0);
  const cal = log.reduce((a, l) => a + l.cal, 0);
  $('sToday').textContent = todayReps; $('sStreak').textContent = streak; $('sBest').textContent = best; $('sCal').textContent = Math.round(cal);
  $('heroReps').textContent = life;

  const stats = { life, today: todayReps, streak, kinds: new Set(log.map((l) => l.ex)).size, perfect: log.some((l) => l.form >= 95 && l.reps >= 10) };
  $('badges').innerHTML = ACH.map((a) => `<span class="ach ${a.ok(stats) ? 'on' : ''}">${a.t}</span>`).join('');

  $('history').innerHTML = log.slice(-8).reverse().map((l) =>
    `<li><b>${EXERCISES[l.ex]?.name || l.ex}</b><span>${l.reps} reps · ${l.form}% form · ${new Date(l.ts).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span></li>`
  ).join('') || '<li><span>No sets yet — start the coach above.</span></li>';

  const ch = challengeOfDay();
  const done = log.filter((l) => l.ex === ch.ex && dayKey(new Date(l.ts)) === today).reduce((a, l) => a + l.reps, 0);
  $('challengeText').textContent = `Do ${ch.goal} ${EXERCISES[ch.ex].unit} today — ${Math.min(done, ch.goal)}/${ch.goal}${done >= ch.goal ? ' ✅ done!' : ''}`;
  $('challengeBar').style.width = clamp(done / ch.goal * 100, 0, 100) + '%';

  drawChart(byDay);
}
function drawChart(byDay) {
  const c = $('chart'), g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
  const days = [...Array(14)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - (13 - i)); return d; });
  const vals = days.map((d) => byDay[dayKey(d)] || 0), max = Math.max(10, ...vals);
  const bw = c.width / 14, base = c.height - 30;
  g.font = '12px Inter'; g.textAlign = 'center';
  vals.forEach((v, i) => {
    const h = (v / max) * (base - 20), x = i * bw + bw * .2, w = bw * .6;
    const gr = g.createLinearGradient(0, base - h, 0, base); gr.addColorStop(0, '#22D3EE'); gr.addColorStop(1, '#A855FF');
    g.fillStyle = v ? gr : 'rgba(255,255,255,.06)';
    g.beginPath(); g.roundRect(x, v ? base - h : base - 4, w, v ? h : 4, 6); g.fill();
    g.fillStyle = '#8b8b99'; g.fillText(days[i].getDate(), x + w / 2, c.height - 8);
    if (v) { g.fillStyle = '#fff'; g.fillText(v, x + w / 2, base - h - 6); }
  });
}
$('exportBtn').onclick = () => {
  const log = store.get('pc_log', []);
  if (!log.length) return toast('No data to export');
  const csv = 'date,exercise,reps,seconds,calories,form\n' + log.map((l) => `${new Date(l.ts).toISOString()},${l.ex},${l.reps},${l.secs},${l.cal},${l.form}`).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'workouts.csv'; a.click();
};
$('clearBtn').onclick = () => { if (confirm('Delete all workout history?')) { store.set('pc_log', []); renderStats(); } };

/* ===== Contact form ===== */
$('contactForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const msgs = store.get('pc_msgs', []); msgs.push({ ...f, ts: Date.now() }); store.set('pc_msgs', msgs);
  e.target.reset(); toast(`Thanks ${f.name}! Message saved — I'll reply soon.`);
});

selectExercise('pushup');
renderStats();
