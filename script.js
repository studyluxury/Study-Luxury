// Study Reward (3 pages) - localStorage only
const LS_KEY = "study_reward_v2";

const $ = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));
//Analytics(グラフ用）
const timeBarCanvas=$("#timeBarChart");

const SUBJECTS = [
  "簿記1級","FP2級","FP1級","簿記論","財務諸表論","基本情報","大学院勉強","投資","応用情報","TOEIC"
];
const MINUTES = [25,30,45,60,75,90,120,180,240];
const PAGE_STEPS = [1,5,10,50,100];

const STAMP_SHAPES = [
  { id:"round", label:"まる" },
  { id:"squircle", label:"角丸" },
  { id:"diamond", label:"ひし形" },
  { id:"star", label:"スター" },
];
const STAMP_COLORS = [
  { id:"p1", label:"パステルブルー", color:"#b6d5ff" },
  { id:"p2", label:"パステルピンク", color:"#ffd6e7" },
  { id:"p3", label:"ミント", color:"#d8ffe8" },
  { id:"p4", label:"レモン", color:"#fff2b6" },
  { id:"p5", label:"ラベンダー", color:"#e6d7ff" },
];

function todayKey(d=new Date()){
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,"0");
  const day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function monthKey(y,m0){ // m0: 0-11
  return `${y}-${String(m0+1).padStart(2,"0")}`;
}
function clamp(n,min,max){ return Math.max(min, Math.min(max,n)); }

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
    points: 0,
    settings: { goalPoint: 1500, dailyCap: 20000, multiplier: 1.2 },
    logs: [], // {id, date, subject, minutes, pages, memo, pointsEarned}
    rewards: [], // {id, text, cost}
    stamps: {}, // "YYYY-MM": { "YYYY-MM-DD": {shape,color} }
    lastUndo: null,
    rangeDays: 7
  };
}

let state = loadState() || defaultState();

/* ===== UI refs ===== */
const pointsView = $("#pointsView");

// Home form
const subjectSelect = $("#subjectSelect");
const minutesSelect = $("#minutesSelect");
const pagesSelect = $("#pagesSelect");
const memoInput = $("#memoInput");
const saveLogBtn = $("#saveLog");
const undoLogBtn = $("#undoLog");
const add25 = $("#add25");
const add50 = $("#add50");
const add100 = $("#add100");

// Calendar
const calTitle = $("#calTitle");
const monthLabel = $("#monthLabel");
const calendarEl = $("#calendar");
const prevMonth = $("#prevMonth");
const nextMonth = $("#nextMonth");
const stampTodayBtn = $("#stampToday");
const clearMonthBtn = $("#clearMonth");
const stampShape = $("#stampShape");
const stampColor = $("#stampColor");
const stampLegend = $("#stampLegend");

// Log list
const logList = $("#logList");
// Stars UI
const starTitleEl = $("#starTitle");
const starRowEl = $("#starRow");
const starHintEl = $("#starHint");

// Analytics
const statsEl = $("#stats");
const lineCanvas = $("#lineChart");
const barCanvas = $("#barChart");

// Rewards
const goalPoint = $("#goalPoint");
const dailyCap = $("#dailyCap");
const multiplier = $("#multiplier");
const saveSettingsBtn = $("#saveSettings");
const resetAllBtn = $("#resetAll");

const rewardText = $("#rewardText");
const rewardCost = $("#rewardCost");
const addRewardBtn = $("#addReward");
const rewardList = $("#rewardList");
const spinGachaBtn = $("#spinGacha");

// Modal + confetti
const modal = $("#modal");
const resultText = $("#resultText");
const resultHint = $("#resultHint");
const closeModal = $("#closeModal");
const confetti = $("#confetti");

/* ===== Tabs / Pages ===== */
$$(".tab").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    const page = btn.dataset.page;
    $$(".tab").forEach(b=>b.classList.toggle("isActive", b===btn));
    $$(".page").forEach(p=>p.classList.toggle("isShow", p.id === `page-${page}`));
    // refresh charts when open analytics
    if(page==="analytics") drawAnalytics();
  });
});

/* ===== Init selects ===== */
function fillSelect(el, items, mapper){
  el.innerHTML = "";
  items.forEach((it)=>{
    const opt = document.createElement("option");
    const {value,label} = mapper(it);
    opt.value = value;
    opt.textContent = label;
    el.appendChild(opt);
  });
}
fillSelect(subjectSelect, SUBJECTS, (s)=>({value:s,label:s}));
fillSelect(minutesSelect, MINUTES, (m)=>({value:String(m),label:`${m}分`}));
fillSelect(pagesSelect, ["なし", ...PAGE_STEPS], (p)=>{
  if(p==="なし") return {value:"", label:"なし"};
  return {value:String(p), label:`+${p}`};
});
fillSelect(stampShape, STAMP_SHAPES, (s)=>({value:s.id,label:s.label}));
fillSelect(stampColor, STAMP_COLORS, (c)=>({value:c.id,label:c.label}));

/* ===== Points + settings UI ===== */
function updatePoints(){
  pointsView.textContent = String(state.points);
}
function loadSettingsUI(){
  goalPoint.value = state.settings.goalPoint;
  dailyCap.value = state.settings.dailyCap;
  multiplier.value = state.settings.multiplier;
}
saveSettingsBtn.addEventListener("click", ()=>{
  state.settings.goalPoint = Math.max(0, Number(goalPoint.value||0));
  state.settings.dailyCap = Math.max(0, Number(dailyCap.value||0));
  state.settings.multiplier = clamp(Number(multiplier.value||1.2), 0.5, 3);
  saveState(state);
  toast("設定を保存しました ✅");
});
resetAllBtn.addEventListener("click", ()=>{
  if(!confirm("全データを削除します。よろしいですか？（元に戻せません）")) return;
  state = defaultState();
  saveState(state);
  renderAll();
  toast("全データを削除しました");
});

/* ===== Logs ===== */
function computeEarnedPoints(minutes, pages){
  // 基本：分×倍率（やりすぎ防止で上限は dailyCap 側で）
  const base = Math.round(minutes * 10 * state.settings.multiplier); // 25分 → 250pt*倍率
  const pageBonus = pages ? Math.round(pages * 8) : 0;
  return base + pageBonus;
}
function todayEarnedTotal(){
  const t = todayKey();
  return state.logs
    .filter(l=>l.date===t)
    .reduce((a,b)=>a+b.pointsEarned, 0);
}
function addPointsSafely(pts){
  const cap = state.settings.dailyCap;
  const already = todayEarnedTotal();
  const allowed = Math.max(0, cap - already);
  const add = Math.min(allowed, pts);
  state.points += add;
  return {added:add, blocked: pts-add};
}

saveLogBtn.addEventListener("click", ()=>{
  const subject = subjectSelect.value;
  const minutes = Number(minutesSelect.value);
  const pages = pagesSelect.value ? Number(pagesSelect.value) : 0;
  const memo = memoInput.value.trim();

  const earned = computeEarnedPoints(minutes, pages);
  const {added, blocked} = addPointsSafely(earned);

  const log = {
    id: crypto.randomUUID(),
    date: todayKey(),
    subject,
    minutes,
    pages,
    memo,
    pointsEarned: added
  };
  state.logs.unshift(log);
  state.logs = state.logs.slice(0, 2000);
  state.lastUndo = { type:"log", log };

  saveState(state);
  memoInput.value = "";
  renderHome();
  updatePoints();
  if(blocked>0) toast(`記録OK！ +${added}pt（上限で ${blocked}pt は加算なし）`);
  else toast(`記録OK！ +${added}pt`);
});

undoLogBtn.addEventListener("click", ()=>{
  const u = state.lastUndo;
  if(!u || u.type!=="log") return toast("取り消せるfff記録がありません");
  const id = u.log.id;
  const idx = state.logs.findIndex(l=>l.id===id);
  if(idx>=0){
    state.points = Math.max(0, state.points - state.logs[idx].pointsEarned);
    state.logs.splice(idx,1);
    state.lastUndo = null;
    saveState(state);
    renderHome();
    updatePoints();
    toast("直前の記録を取り消しました");
  }
});

function manualAdd(pts){
  const {added, blocked} = addPointsSafely(pts);
  state.lastUndo = null;
  saveState(state);
  updatePoints();
  if(blocked>0) toast(`+${added}pt（上限で ${blocked}pt は加算なし）`);
  else toast(`+${added}pt`);
}
add25.addEventListener("click", ()=>manualAdd(25));
add50.addEventListener("click", ()=>manualAdd(50));
add100.addEventListener("click", ()=>manualAdd(100));

function renderLogs(){
  const logs = state.logs.slice(0,50);
  logList.innerHTML = "";
  if(logs.length===0){
    logList.innerHTML = `<div class="small dim">まだ記録がありません。</div>`;
    return;
  }
  logs.forEach(l=>{
    const el = document.createElement("div");
    el.className = "logItem";
    const sub = `${l.date} / ${l.subject} / ${l.minutes}分` + (l.pages?` / +${l.pages}p`:"") + (l.memo?` / ${escapeHtml(l.memo)}`:"");
    el.innerHTML = `
      <div class="logMain">
        <div class="logTop">${l.subject} ・ ${l.minutes}分</div>
        <div class="logSub">${sub}</div>
      </div>
      <div class="logRight">+${l.pointsEarned}pt</div>
    `;
    logList.appendChild(el);
  });
}

/* ===== Calendar + stamps ===== */
let viewDate = new Date();
function renderStampLegend(){
  stampLegend.innerHTML = "";
  STAMP_COLORS.forEach(c=>{
    const item = document.createElement("div");
    item.className = "legendItem";
    item.innerHTML = `<span class="stamp round" style="background:${c.color}; width:18px; height:18px;"></span>${c.label}`;
    stampLegend.appendChild(item);
  });
}
function setMonthLabel(){
  monthLabel.textContent = monthKey(viewDate.getFullYear(), viewDate.getMonth());
  calTitle.textContent = `${viewDate.getFullYear()}年${viewDate.getMonth()+1}月`;
}
function getStampForDay(ym, ymd){
  return state.stamps?.[ym]?.[ymd] || null;
}
function renderCalendar(){
  setMonthLabel();
  calendarEl.innerHTML = "";

  const y = viewDate.getFullYear();
  const m0 = viewDate.getMonth();
  const ym = monthKey(y,m0);

  const first = new Date(y,m0,1);
  const startDow = first.getDay(); // 0 Sun
  const start = new Date(y,m0,1 - startDow);

  const days = 42; // 6 weeks
  for(let i=0;i<days;i++){
    const d = new Date(start);
    d.setDate(start.getDate()+i);
    const isOther = d.getMonth()!==m0;
    const ymd = todayKey(d);

    const day = document.createElement("div");
    day.className = "day" + (isOther?" isOther":"");
    day.innerHTML = `<div class="dayNum">${d.getDate()}</div>`;

    const stamp = getStampForDay(ym, ymd);
    if(stamp){
      const colorObj = STAMP_COLORS.find(c=>c.id===stamp.color) || STAMP_COLORS[0];
      const shape = stamp.shape || "round";
      const st = document.createElement("div");
      st.className = `stamp ${shape}`;
      st.style.background = colorObj.color;
      if(shape==="diamond"){
        st.innerHTML = `<span>✓</span>`;
      }else{
        st.textContent = "✓";
      }
      day.appendChild(st);
    }

    calendarEl.appendChild(day);
  }
}

function setStampOnDay(ymd){
  const y = viewDate.getFullYear();
  const m0 = viewDate.getMonth();
  const ym = monthKey(y,m0);
  state.stamps[ym] = state.stamps[ym] || {};
  state.stamps[ym][ymd] = {
    shape: stampShape.value,
    color: stampColor.value
  };
  saveState(state);
  renderCalendar();
}

stampTodayBtn.addEventListener("click", ()=>{
  // stamp "today" only if today is in the shown month
  const t = new Date();
  if(t.getFullYear()!==viewDate.getFullYear() || t.getMonth()!==viewDate.getMonth()){
    toast("今月表示にしてから押してね");
    return;
  }
  setStampOnDay(todayKey(t));
  toast("今日にスタンプしました ✅");
});
clearMonthBtn.addEventListener("click", ()=>{
  const ym = monthKey(viewDate.getFullYear(), viewDate.getMonth());
  if(!confirm(`${ym} のスタンプを削除しますか？`)) return;
  state.stamps[ym] = {};
  saveState(state);
  renderCalendar();
  toast("今月のスタンプを削除しました");
});
prevMonth.addEventListener("click", ()=>{
  viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth()-1, 1);
  renderCalendar();
});
nextMonth.addEventListener("click", ()=>{
  viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth()+1, 1);
  renderCalendar();
});

/* ===== Analytics ===== */
$$(".segBtn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    $$(".segBtn").forEach(b=>b.classList.toggle("isOn", b===btn));
    state.rangeDays = Number(btn.dataset.range);
    saveState(state);
    drawAnalytics();
  });
});

function rangeKeys(days){
  const keys = [];
  const now = new Date();
  for(let i=days-1;i>=0;i--){
    const d = new Date(now);
    d.setDate(now.getDate()-i);
    keys.push(todayKey(d));
  }
  return keys;
}

function drawAnalytics(){
  // stats
  const days = state.rangeDays || 7;
  const keys = rangeKeys(days);

  const logs = state.logs.filter(l=>keys.includes(l.date));
  const totalMin = logs.reduce((a,b)=>a+b.minutes, 0);
  const totalPt = logs.reduce((a,b)=>a+b.pointsEarned, 0);
  const avgMin = logs.length ? Math.round(totalMin / days) : 0;

  // streak
  let streak = 0;
  for(let i=0;i<365;i++){
    const d = new Date();
    d.setDate(d.getDate()-i);
    const k = todayKey(d);
    const has = state.logs.some(l=>l.date===k);
    if(has) streak++;
    else break;
  }

  statsEl.innerHTML = "";
  const statItems = [
    {name:"合計（分）", val:`${totalMin}`},
    {name:"合計（pt）", val:`${totalPt}`},
    {name:"平均/日（分）", val:`${avgMin}`},
    {name:"連続記録（日）", val:`${streak}`},
  ];
  statItems.forEach(s=>{
    const el = document.createElement("div");
    el.className = "stat";
    el.innerHTML = `<div class="statName">${s.name}</div><div class="statVal">${s.val}</div>`;
    statsEl.appendChild(el);
  });

  // line data (minutes per day)
  const perDay = keys.map(k=>{
    const m = state.logs.filter(l=>l.date===k).reduce((a,b)=>a+b.minutes,0);
    return m;
  });
  // bar data (minutes per subject)
  const perSubject = {};
  logs.forEach(l=>{
    perSubject[l.subject] = (perSubject[l.subject]||0) + l.minutes;
  });
  const subjPairs = Object.entries(perSubject).sort((a,b)=>b[1]-a[1]).slice(0,10);

  drawLine(lineCanvas, keys.map(k=>k.slice(5)), perDay);
  drawBar(barCanvas, subjPairs.map(x=>x[0]), subjPairs.map(x=>x[1]));
}

function clearCanvas(ctx, w, h){
  ctx.clearRect(0,0,w,h);
}
function drawLine(canvas, labels, values){
  const ctx = canvas.getContext("2d");
  const w = canvas.width = canvas.parentElement.clientWidth * devicePixelRatio;
  const h = canvas.height = 160 * devicePixelRatio;
  canvas.style.height = "160px";
  clearCanvas(ctx,w,h);

  const pad = 28 * devicePixelRatio;
  const maxV = Math.max(60, ...values);
  const minV = 0;

  // grid
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(30,35,60,.12)";
  ctx.lineWidth = 1 * devicePixelRatio;
  for(let i=0;i<=4;i++){
    const y = pad + (h-pad*2) * (i/4);
    ctx.beginPath();
    ctx.moveTo(pad,y);
    ctx.lineTo(w-pad,y);
    ctx.stroke();
  }

  const xStep = (w - pad*2) / Math.max(1, values.length-1);
  const yOf = (v)=> pad + (h-pad*2) * (1 - (v-minV)/(maxV-minV));

  // line
  ctx.strokeStyle = "rgba(91,124,250,.95)";
  ctx.lineWidth = 3 * devicePixelRatio;
  ctx.beginPath();
  values.forEach((v,i)=>{
    const x = pad + xStep*i;
    const y = yOf(v);
    if(i===0) ctx.moveTo(x,y);
    else ctx.lineTo(x,y);
  });
  ctx.stroke();

  // points
  ctx.fillStyle = "rgba(255,214,231,.95)";
  values.forEach((v,i)=>{
    const x = pad + xStep*i;
    const y = yOf(v);
    ctx.beginPath();
    ctx.arc(x,y,4*devicePixelRatio,0,Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.06)";
    ctx.stroke();
  });

  // labels (simple)
  ctx.fillStyle = "rgba(30,35,60,.65)";
  ctx.font = `${11*devicePixelRatio}px system-ui`;
  const step = Math.ceil(labels.length/7);
  labels.forEach((t,i)=>{
    if(i%step!==0 && i!==labels.length-1) return;
    ctx.fillText(t, pad + xStep*i - 8*devicePixelRatio, h - 10*devicePixelRatio);
  });
}

function drawBar(canvas, labels, values){
  const ctx = canvas.getContext("2d");
  const w = canvas.width = canvas.parentElement.clientWidth * devicePixelRatio;
  const h = canvas.height = 190 * devicePixelRatio;
  canvas.style.height = "190px";
  clearCanvas(ctx,w,h);

  const pad = 28 * devicePixelRatio;
  const maxV = Math.max(60, ...values);

  // grid
  ctx.strokeStyle = "rgba(30,35,60,.12)";
  ctx.lineWidth = 1 * devicePixelRatio;
  for(let i=0;i<=4;i++){
    const y = pad + (h-pad*2) * (i/4);
    ctx.beginPath();
    ctx.moveTo(pad,y);
    ctx.lineTo(w-pad,y);
    ctx.stroke();
  }

  const n = Math.max(1, values.length);
  const barW = (w - pad*2) / n * 0.7;
  const gap = (w - pad*2) / n * 0.3;

  const yOf = (v)=> pad + (h-pad*2) * (1 - v/maxV);

  values.forEach((v,i)=>{
    const x = pad + i*(barW+gap) + gap/2;
    const y = yOf(v);
    const bh = (h-pad) - y;

    // pastel gradient bars
    const g = ctx.createLinearGradient(0,y,0,y+bh);
    g.addColorStop(0, "rgba(182,213,255,.95)");
    g.addColorStop(1, "rgba(216,255,232,.95)");
    ctx.fillStyle = g;

    roundRect(ctx, x, y, barW, bh, 10*devicePixelRatio);
    ctx.fill();

    ctx.strokeStyle = "rgba(0,0,0,.06)";
    ctx.stroke();

    // label
    ctx.save();
    ctx.fillStyle = "rgba(30,35,60,.65)";
    ctx.font = `${11*devicePixelRatio}px system-ui`;
    const txt = labels[i].length>6 ? labels[i].slice(0,6)+"…" : labels[i];
    ctx.fillText(txt, x, h - 10*devicePixelRatio);
    ctx.restore();
  });
}

function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

/* ===== Rewards + Gacha ===== */
function renderRewards(){
  rewardList.innerHTML = "";
  if(state.rewards.length===0){
    rewardList.innerHTML = `<div class="small dim">まだご褒美がありません。上で追加してね。</div>`;
    return;
  }
  state.rewards.forEach(r=>{
    const el = document.createElement("div");
    el.className = "rewardItem";
    el.innerHTML = `
      <div>
        <div><b>${escapeHtml(r.text)}</b></div>
        <div class="rewardMeta">目安：${r.cost}pt</div>
      </div>
      <button class="iconBtn" data-del="${r.id}">削除</button>
    `;
    rewardList.appendChild(el);
  });
  $$("[data-del]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.dataset.del;
      state.rewards = state.rewards.filter(r=>r.id!==id);
      saveState(state);
      renderRewards();
    });
  });
}

addRewardBtn.addEventListener("click", ()=>{
  const text = rewardText.value.trim();
  const cost = Math.max(0, Number(rewardCost.value||0));
  if(!text) return toast("ご褒美内容を入力してね");
  state.rewards.unshift({ id: crypto.randomUUID(), text, cost });
  rewardText.value = "";
  saveState(state);
  renderRewards();
  toast("ご褒美を追加しました ✅");
});

spinGachaBtn.addEventListener("click", ()=>{
  if(state.rewards.length===0) return toast("先にご褒美を追加してね");
  const pick = state.rewards[Math.floor(Math.random()*state.rewards.length)];
  // cost: use pick.cost (if 0 then free)
  const cost = Math.max(0, pick.cost||0);
  if(state.points < cost) return toast(`ポイント不足（必要：${cost}pt）`);
  state.points -= cost;
  saveState(state);
  updatePoints();

  showModal(`🎉 ${pick.text}`, `消費：${cost}pt / 残り：${state.points}pt`);
  popConfetti();
});

/* ===== Modal ===== */
function showModal(text, hint){
  resultText.textContent = text;
  resultHint.textContent = hint;
  modal.classList.add("isShow");
  modal.setAttribute("aria-hidden","false");
}
function hideModal(){
  modal.classList.remove("isShow");
  modal.setAttribute("aria-hidden","true");
}
closeModal.addEventListener("click", hideModal);
modal.addEventListener("click", (e)=>{ if(e.target===modal) hideModal(); });

/* ===== Confetti (simple) ===== */
function popConfetti(){
  confetti.innerHTML = "";
  const colors = STAMP_COLORS.map(c=>c.color);
  const n = 36;
  for(let i=0;i<n;i++){
    const p = document.createElement("i");
    const x = Math.random()*100;
    const delay = Math.random()*0.15;
    const size = 6 + Math.random()*8;
    p.style.left = `${x}vw`;
    p.style.top = `${-10 - Math.random()*20}px`;
    p.style.width = `${size}px`;
    p.style.height = `${size}px`;
    p.style.background = colors[Math.floor(Math.random()*colors.length)];
    p.style.animationDelay = `${delay}s`;
    confetti.appendChild(p);
  }
  setTimeout(()=>{ confetti.innerHTML=""; }, 1400);
}

/* ===== Render all ===== */
function renderHome(){
  renderLogs();
  renderStampLegend();
  renderCalendar();
}
function renderAll(){
  updatePoints();
  loadSettingsUI();
  renderHome();
  renderRewards();

  // restore range button
  $$(".segBtn").forEach(b=>b.classList.toggle("isOn", Number(b.dataset.range)===state.rangeDays));
}
renderAll();

/* ===== Helpers ===== */
function toast(msg){
  // super simple toast using alert-style (but not blocking)
  let t = $("#_toast");
  if(!t){
    t = document.createElement("div");
    t.id = "_toast";
    t.style.position = "fixed";
    t.style.left = "50%";
    t.style.bottom = "18px";
    t.style.transform = "translateX(-50%)";
    t.style.padding = "10px 14px";
    t.style.borderRadius = "14px";
    t.style.background = "rgba(255,255,255,.88)";
    t.style.border = "1px solid rgba(0,0,0,.10)";
    t.style.boxShadow = "0 18px 50px rgba(10,10,25,.12)";
    t.style.fontWeight = "900";
    t.style.zIndex = "999";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = "1";
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=>{ t.style.opacity="0"; }, 1800);
}
/* =========================================================
   ⭐ Stars (0〜7) + がんばり文章（まとめ版）
   ルール：
   ★0：0分のみ
   ★1：1〜25分
   ★2：26〜60分
   ★3：61〜75分
   ★4：76〜90分
   ★5：91〜120分
   ★6：121〜239分（181〜239も★6扱い）
   ★7：240分以上
   ========================================================= */

/* ===== Stars 定義（必要ならタイトルも使う） ===== */
const STAR_LEVELS = [
  { id:0, min:0,   max:0,    title:"これから始まり" },
  { id:1, min:1,   max:25,   title:"ウォームアップ" },
  { id:2, min:26,  max:60,   title:"エンジンON" },
  { id:3, min:61,  max:75,   title:"集中モード" },
  { id:4, min:76,  max:90,   title:"かなり良い" },
  { id:5, min:91,  max:120,  title:"絶好調" },
  { id:6, min:121, max:239,  title:"超集中" },
  { id:7, min:240, max:9999, title:"神集中" },
];

/* ===== がんばり文章（星レベルごと） ===== */
const STAR_MESSAGES = {
  0: "今日はこれから。まずは1分でもOK 🌱",
  1: "いいスタート！エンジンかかってきたね 🔥",
  2: "集中できてる！この調子でいこう 💪",
  3: "かなり集中できてる。すごい！ ✨",
  4: "今日は本気モードだね 👏",
  5: "絶好調！努力が数字に出てる 🌟",
  6: "超集中状態。自分を誇っていい 🔥🔥",
  7: "神集中…今日は伝説の日 👑"
};

/* ===== 今日の合計勉強時間（分） ===== */
function totalMinutesByDate(dateKey){
  return state.logs
    .filter(l => l.date === dateKey)
    .reduce((a,b) => a + b.minutes, 0);
}

/* ===== 星判定 ===== */
function calcStarLevelByMinutes(mins){
  // ★7：240分以上
  if(mins >= 240) return 7;

  // ★0：0分のみ
  if(mins === 0) return 0;

  // ★1：1〜25分
  if(mins >= 1 && mins <= 25) return 1;

  // ★2：26〜60分
  if(mins >= 26 && mins <= 60) return 2;

  // ★3：61〜75分
  if(mins >= 61 && mins <= 75) return 3;

  // ★4：76〜90分
  if(mins >= 76 && mins <= 90) return 4;

  // ★5：91〜120分
  if(mins >= 91 && mins <= 120) return 5;

  // ★6：121〜180分
  if(mins >= 121 && mins <= 180) return 6;

  // ★6：181〜239分も★6扱い
  return 6;
}

/* ===== がんばり文章取得 ===== */
function getStarMessage(starLevel){
  return STAR_MESSAGES[starLevel] || "";
}

/* ===== 画面の星＋文章を更新（#starTitle #starHint #starRow を使う） ===== */
function updateTodayStar(){
  const today = todayKey();
  const totalMin = totalMinutesByDate(today);
  const starLevel = calcStarLevelByMinutes(totalMin);

  const titleEl = document.getElementById("starTitle");
  const hintEl  = document.getElementById("starHint");
  const rowEl   = document.getElementById("starRow");

  // まだHTML側に starTitle/starHint/starRow が無い場合は何もしない
  if(!titleEl || !hintEl || !rowEl) return;

  // がんばり文章
  titleEl.textContent = getStarMessage(starLevel);

  // 今日の合計分
  hintEl.textContent = `今日の合計勉強時間：${totalMin}分`;

  // 星表示（最大7個）
  rowEl.innerHTML = "";
  for(let i=1; i<=7; i++){
    const star = document.createElement("span");
    star.textContent = "★";
    star.style.fontSize = "20px";
    star.style.marginRight = "4px";
    // starLevel が0なら全部灰色、1なら1個だけ黄色…のイメージ
    star.style.color = (i <= starLevel) ? "#f5b301" : "#ddd";
    rowEl.appendChild(star);
  }
}

/* =========================================================
   ✅ あとは「1行追加」だけ（ここも同じブロックにまとめて書く）
   ========================================================= */

/*
  [A] renderHome() の最後に 1行追加する

  いまの renderHome がこうなら：
    function renderHome(){
      renderLogs();
      renderStampLegend();
      renderCalendar();
    }

  ↓ 最後に updateTodayStar(); を追加してこう：
    function renderHome(){
      renderLogs();
      renderStampLegend();
      renderCalendar();
      updateTodayStar(); // ← 追加
    }
*/

/*
  [B] 勉強を記録した直後（saveLogBtn の click内）に 1行追加する

  いまの saveLogBtn 内で
    renderHome();
    updatePoints();

  となっている直後に、これを追加：
    updateTodayStar(); // ← 追加
*/
function escapeHtml(s){
  return s.replace(/[&<>"']/g, (m)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}
