// Study Reward (3 pages) - localStorage only
const LS_KEY = "study_reward_v2";

const $ = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));

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
if(!u || u.type!=="log") return toast("取り消せる記録がありません");
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
const y
