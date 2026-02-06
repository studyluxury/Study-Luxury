// Study Reward - localStorage保存 / グラフ / カレンダースタンプ / ランダムご褒美
const LS_KEY = "study_reward_v1";

const $ = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));

function todayKey(d = new Date()){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function monthKey(y, m0){ // m0: 0-11
  return `${y}-${String(m0+1).padStart(2,"0")}`;
}
function clamp(n,min,max){ return Math.max(min, Math.min(max,n)); }
function round(n){ return Math.round(n); }

function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return null;
    return JSON.parse(raw);
  }catch(e){ return null; }
}
function saveState(state){
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

function defaultState(){
  return {
    balance: 0,
    settings: {
      hourlyYen: 1500,
      multiplier: 1.5,
      dailyCap: 20000
    },
    // logs: {id, dateKey, subject, minutes, pages, memo, points}
    logs: [],
    // rewards: [{id,text}]
    rewards: [],
    // stamps: {"YYYY-MM-DD": true}
    stamps: {},
    // dailyEarned: {"YYYY-MM-DD": number}
    dailyEarned: {}
  };
}

let state = loadState() || defaultState();

// ---------- UI refs ----------
const ptBalance = $("#ptBalance");

const subjectEl = $("#subject");
const minutesEl = $("#minutes");
const pagesEl = $("#pages");
const memoEl = $("#memo");

const saveLogBtn = $("#saveLog");
const undoLastBtn = $("#undoLast");

const hourlyEl = $("#hourlyYen");
const multEl = $("#multiplier");
const capEl = $("#dailyCap");
const saveSettingsBtn = $("#saveSettings");
const resetAllBtn = $("#resetAll");

const rewardTextEl = $("#rewardText");
const rewardCostEl = $("#rewardCost");
const addRewardBtn = $("#addReward");
const drawRewardBtn = $("#drawReward");
const rewardListEl = $("#rewardList");
const rewardResultEl = $("#rewardResult");

const bar7 = $("#bar7");
const pie30 = $("#pie30");

const calTitle = $("#calTitle");
const calendar = $("#calendar");
const prevMonthBtn = $("#prevMonth");
const nextMonthBtn = $("#nextMonth");
const stampTodayBtn = $("#stampToday");
const clearStampsMonthBtn = $("#clearStampsMonth");

const logListEl = $("#logList");

// calendar cursor
let calY = new Date().getFullYear();
let calM0 = new Date().getMonth();

// ---------- Sound (pon) ----------
function playPon(){
  // WebAudioで簡単な「ポン」
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if(!AudioCtx) return;

  const ctx = new AudioCtx();
  const o = ctx.createOscillator();
  const g = ctx.createGain();

  o.type = "sine";
  o.frequency.setValueAtTime(660, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(330, ctx.currentTime + 0.08);

  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);

  o.connect(g);
  g.connect(ctx.destination);

  o.start();
  o.stop(ctx.currentTime + 0.13);

  setTimeout(()=>ctx.close(), 250);
}

// ---------- Points ----------
function pointsForMinutes(minutes){
  const hourly = Number(state.settings.hourlyYen || 0);
  const mul = Number(state.settings.multiplier || 1.5);
  // 1分あたり = 時給/60, それを倍率、四捨五入でpt化
  const perMin = (hourly / 60) * mul;
  return Math.max(0, round(perMin * minutes));
}

function addPointsWithDailyCap(dateKey, points){
  const cap = Number(state.settings.dailyCap || 0);
  if(cap <= 0){
    state.balance += points;
    return {added: points, capped: false};
  }
  const earned = Number(state.dailyEarned[dateKey] || 0);
  const remain = Math.max(0, cap - earned);
  const add = Math.min(points, remain);
  state.dailyEarned[dateKey] = earned + add;
  state.balance += add;
  return {added: add, capped: add < points};
}

// ---------- Render ----------
function renderTop(){
  ptBalance.textContent = String(state.balance || 0);
}
function renderSettings(){
  hourlyEl.value = state.settings.hourlyYen ?? 1500;
  multEl.value = String(state.settings.multiplier ?? 1.5);
  capEl.value = state.settings.dailyCap ?? 20000;
}

function renderRewards(){
  rewardListEl.innerHTML = "";
  const arr = state.rewards || [];
  if(arr.length === 0){
    const li = document.createElement("li");
    li.innerHTML = `<span class="tag">まだご褒美がありません。上の欄で追加してね。</span>`;
    rewardListEl.appendChild(li);
    return;
  }
  for(const r of arr){
    const li = document.createElement("li");
    li.innerHTML = `
      <div>
        <div>${escapeHtml(r.text)}</div>
        <div class="tag">ID: ${r.id}</div>
      </div>
      <button class="xbtn" data-del="${r.id}">削除</button>
    `;
    rewardListEl.appendChild(li);
  }

  $$("[data-del]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-del");
      state.rewards = state.rewards.filter(x => String(x.id) !== String(id));
      saveState(state);
      renderRewards();
    });
  });
}

function renderLogs(){
  const logs = (state.logs || []).slice().reverse().slice(0,50);
  logListEl.innerHTML = "";
  if(logs.length === 0){
    logListEl.innerHTML = `<div class="hint">まだ記録がありません。</div>`;
    return;
  }
  for(const l of logs){
    const div = document.createElement("div");
    div.className = "logItem";
    div.innerHTML = `
      <div class="logTop">
        <div><b>${escapeHtml(l.subject || "（科目なし）")}</b> / ${l.minutes}分 / ${l.points}pt</div>
        <div class="tag">${l.dateKey}</div>
      </div>
      <div class="logSub">
        ページ：${l.pages ?? 0} / メモ：${escapeHtml(l.memo || "")}
      </div>
    `;
    logListEl.appendChild(div);
  }
}

// ---------- Charts ----------
function drawBar7(){
  const ctx = bar7.getContext("2d");
  const W = bar7.width, H = bar7.height;
  ctx.clearRect(0,0,W,H);

  // background
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.fillRect(0,0,W,H);

  const days = [];
  const now = new Date();
  for(let i=6; i>=0; i--){
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push(d);
  }

  const sums = days.map(d=>{
    const k = todayKey(d);
    const mins = (state.logs || []).filter(x=>x.dateKey===k).reduce((a,b)=>a+Number(b.minutes||0),0);
    return mins;
  });

  const maxMin = Math.max(30, ...sums);
  const pad = 18;
  const chartW = W - pad*2;
  const chartH = H - pad*2;

  // axis labels
  ctx.fillStyle = "rgba(229,231,235,0.85)";
  ctx.font = "12px system-ui";
  ctx.fillText("h", 6, 14);

  // bars
  const gap = 10;
  const bw = (chartW - gap*6) / 7;

  for(let i=0;i<7;i++){
    const x = pad + i*(bw+gap);
    const hours = sums[i] / 60;
    const bh = (sums[i] / maxMin) * (chartH - 28);
    const y = pad + (chartH - 28) - bh;

    // bar
    ctx.fillStyle = "rgba(124,58,237,0.85)";
    roundRect(ctx, x, y, bw, bh, 10, true);

    // label date
    const d = days[i];
    const label = `${d.getMonth()+1}/${d.getDate()}`;
    ctx.fillStyle = "rgba(156,163,175,0.9)";
    ctx.fillText(label, x, pad + chartH - 10);

    // value
    ctx.fillStyle = "rgba(229,231,235,0.9)";
    ctx.fillText(hours.toFixed(1), x, y - 6);
  }
}

function drawPie30(){
  const ctx = pie30.getContext("2d");
  const W = pie30.width, H = pie30.height;
  ctx.clearRect(0,0,W,H);

  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.fillRect(0,0,W,H);

  const now = new Date();
  const since = new Date(now);
  since.setDate(now.getDate() - 29);

  // subject -> minutes
  const map = new Map();
  for(const l of (state.logs||[])){
    const d = parseDateKey(l.dateKey);
    if(!d) continue;
    if(d < since) continue;

    const s = (l.subject || "その他").trim() || "その他";
    map.set(s, (map.get(s) || 0) + Number(l.minutes||0));
  }

  const entries = Array.from(map.entries()).sort((a,b)=>b[1]-a[1]);
  const total = entries.reduce((a,b)=>a+b[1],0);

  if(total <= 0){
    ctx.fillStyle = "rgba(156,163,175,0.9)";
    ctx.font = "14px system-ui";
    ctx.fillText("まだデータがありません", 18, 40);
    return;
  }

  // center / radius
  const cx = 120, cy = H/2;
  const r = 78;

  let start = -Math.PI/2;

  // 5色くらいを回す（派手すぎない）
  const colors = [
    "rgba(124,58,237,0.90)",
    "rgba(34,197,94,0.80)",
    "rgba(59,130,246,0.80)",
    "rgba(245,158,11,0.80)",
    "rgba(236,72,153,0.75)",
    "rgba(148,163,184,0.70)",
  ];

  for(let i=0;i<entries.length;i++){
    const [label, mins] = entries[i];
    const frac = mins / total;
    const ang = frac * Math.PI*2;
    const end = start + ang;

    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,r,start,end);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();

    start = end;
  }

  // hole (donut)
  ctx.beginPath();
  ctx.arc(cx,cy,38,0,Math.PI*2);
  ctx.fillStyle = "rgba(15,23,42,0.95)";
  ctx.fill();

  ctx.fillStyle = "rgba(229,231,235,0.9)";
  ctx.font = "12px system-ui";
  ctx.fillText("30日", cx-14, cy-2);

  // legend right
  const lx = 230;
  let ly = 30;
  ctx.font = "12px system-ui";

  for(let i=0;i<Math.min(entries.length, 10);i++){
    const [label, mins] = entries[i];
    const pct = Math.round((mins/total)*100);
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(lx, ly-10, 10, 10);

    ctx.fillStyle = "rgba(229,231,235,0.9)";
    ctx.fillText(`${label}  ${pct}%  (${Math.round(mins/60*10)/10}h)`, lx+16, ly);
    ly += 18;
  }
}

// ---------- Calendar ----------
function renderCalendar(){
  calTitle.textContent = `${calY}年${calM0+1}月`;

  calendar.innerHTML = "";
  const first = new Date(calY, calM0, 1);
  const last = new Date(calY, calM0+1, 0);
  const startDow = first.getDay(); // 0 Sun

  // empty cells
  for(let i=0;i<startDow;i++){
    const ph = document.createElement("div");
    ph.className = "day";
    ph.style.opacity = "0";
    ph.style.pointerEvents = "none";
    calendar.appendChild(ph);
  }

  for(let d=1; d<=last.getDate(); d++){
    const cellDate = new Date(calY, calM0, d);
    const k = todayKey(cellDate);
    const stamped = !!state.stamps[k];

    const div = document.createElement("div");
    div.className = "day" + (stamped ? " stamped" : "");
    div.innerHTML = `<div class="n">${d}</div>` + (stamped ? `<div class="stamp"></div>` : "");

    div.addEventListener("click", ()=>{
      toggleStamp(k);
    });

    calendar.appendChild(div);
  }
}

function toggleStamp(dateKey){
  if(state.stamps[dateKey]){
    delete state.stamps[dateKey];
  }else{
    state.stamps[dateKey] = true;
    playPon();
  }
  saveState(state);
  renderCalendar();
}

// ---------- Helpers ----------
function parseDateKey(k){
  // "YYYY-MM-DD"
  if(!k || !/^\d{4}-\d{2}-\d{2}$/.test(k)) return null;
  const [y,m,d] = k.split("-").map(Number);
  return new Date(y, m-1, d);
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function roundRect(ctx, x, y, w, h, r, fill){
  const rr = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr, y);
  ctx.arcTo(x+w, y, x+w, y+h, rr);
  ctx.arcTo(x+w, y+h, x, y+h, rr);
  ctx.arcTo(x, y+h, x, y, rr);
  ctx.arcTo(x, y, x+w, y, rr);
  if(fill) ctx.fill();
}

// ---------- Actions ----------
function bindQuickButtons(){
  $$("[data-add-min]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const add = Number(btn.getAttribute("data-add-min") || 0);
      minutesEl.value = String((Number(minutesEl.value||0) + add));
      minutesEl.focus();
    });
  });

  $$("[data-add-page]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const add = Number(btn.getAttribute("data-add-page") || 0);
      pagesEl.value = String((Number(pagesEl.value||0) + add));
      pagesEl.focus();
    });
  });
}

saveLogBtn.addEventListener("click", ()=>{
  const subject = (subjectEl.value || "").trim();
  const minutes = clamp(Number(minutesEl.value || 0), 0, 24*60);
  const pages = clamp(Number(pagesEl.value || 0), 0, 999999);
  const memo = (memoEl.value || "").trim();

  if(minutes <= 0){
    alert("勉強時間（分）を入力してね（例：25）");
    minutesEl.focus();
    return;
  }

  const dateKey = todayKey();
  const rawPoints = pointsForMinutes(minutes);
  const {added, capped} = addPointsWithDailyCap(dateKey, rawPoints);

  const log = {
    id: String(Date.now()),
    dateKey,
    subject: subject || "その他",
    minutes,
    pages,
    memo,
    points: added
  };
  state.logs.push(log);

  saveState(state);
  renderAll();

  // 入力を少し楽に：科目は残す、分とページだけクリア
  minutesEl.value = "";
  pagesEl.value = "";
  memoEl.value = "";

  if(capped){
    toast(`上限により ${added}pt だけ加算（上限到達）`);
  }else{
    toast(`+${added}pt 加算しました`);
  }
});

undoLastBtn.addEventListener("click", ()=>{
  const last = state.logs.pop();
  if(!last){
    toast("取り消せる記録がありません");
    return;
  }
  // 取り消し：当日の獲得ptも戻す（可能な範囲）
  state.balance = Math.max(0, Number(state.balance||0) - Number(last.points||0));
  if(state.dailyEarned[last.dateKey] != null){
    state.dailyEarned[last.dateKey] = Math.max(0, Number(state.dailyEarned[last.dateKey]) - Number(last.points||0));
  }
  saveState(state);
  renderAll();
  toast("直前の記録を取り消しました");
});

saveSettingsBtn.addEventListener("click", ()=>{
  state.settings.hourlyYen = clamp(Number(hourlyEl.value || 0), 0, 999999);
  state.settings.multiplier = clamp(Number(multEl.value || 1.5), 1.0, 5.0);
  state.settings.dailyCap = clamp(Number(capEl.value || 0), 0, 9999999);
  saveState(state);
  toast("設定を保存しました");
});

resetAllBtn.addEventListener("click", ()=>{
  const ok = confirm("全データを削除します。戻せません。OK？");
  if(!ok) return;
  state = defaultState();
  saveState(state);
  renderAll();
  toast("全データを削除しました");
});

addRewardBtn.addEventListener("click", ()=>{
  const text = (rewardTextEl.value || "").trim();
  if(!text){
    rewardTextEl.focus();
    return;
  }
  state.rewards.push({ id: String(Date.now()), text });
  rewardTextEl.value = "";
  saveState(state);
  renderRewards();
  toast("ご褒美を追加しました");
});

drawRewardBtn.addEventListener("click", ()=>{
  const cost = clamp(Number(rewardCostEl.value || 0), 0, 99999999);
  const list = state.rewards || [];
  if(list.length === 0){
    toast("ご褒美がありません。先に追加してね");
    return;
  }
  if(cost > 0 && state.balance < cost){
    toast("ポイントが足りません");
    return;
  }

  // ランダム
  const pick = list[Math.floor(Math.random() * list.length)];
  if(cost > 0){
    state.balance = Math.max(0, state.balance - cost);
    saveState(state);
    renderTop();
  }

  rewardResultEl.textContent = `🎁 ${pick.text}` + (cost>0 ? `（-${cost}pt）` : "");
  toast("ランダムで選びました");
});

prevMonthBtn.addEventListener("click", ()=>{
  calM0--;
  if(calM0 < 0){ calM0 = 11; calY--; }
  renderCalendar();
});
nextMonthBtn.addEventListener("click", ()=>{
  calM0++;
  if(calM0 > 11){ calM0 = 0; calY++; }
  renderCalendar();
});

stampTodayBtn.addEventListener("click", ()=>{
  const k = todayKey();
  state.stamps[k] = true;
  saveState(state);
  playPon();
  renderCalendar();
  toast("今日にスタンプしました");
});

clearStampsMonthBtn.addEventListener("click", ()=>{
  const mk = monthKey(calY, calM0);
  const ok = confirm(`${mk} のスタンプを削除しますか？`);
  if(!ok) return;

  for(const key of Object.keys(state.stamps)){
    if(key.startsWith(mk + "-")) delete state.stamps[key];
  }
  saveState(state);
  renderCalendar();
  toast("今月のスタンプを削除しました");
});

// ---------- Toast ----------
let toastTimer = null;
function toast(msg){
  let el = document.getElementById("toast");
  if(!el){
    el = document.createElement("div");
    el.id = "toast";
    el.style.position = "fixed";
    el.style.left = "50%";
    el.style.bottom = "18px";
    el.style.transform = "translateX(-50%)";
    el.style.padding = "10px 12px";
    el.style.borderRadius = "14px";
    el.style.border = "1px solid rgba(255,255,255,.12)";
    el.style.background = "rgba(15,23,42,.92)";
    el.style.color = "rgba(229,231,235,.95)";
    el.style.fontSize = "13px";
    el.style.zIndex = "9999";
    el.style.boxShadow = "0 20px 60px rgba(0,0,0,.45)";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = "1";

  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ el.style.opacity = "0"; }, 1800);
}

// ---------- Render all ----------
function renderAll(){
  renderTop();
  renderSettings();
  renderRewards();
  renderLogs();
  renderCalendar();
  drawBar7();
  drawPie30();
}

// init
bindQuickButtons();
renderAll();
