const NOW   = new Date();
const DAYS  = ['일','월','화','수','목','금','토'];
const DAYKO = ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'];
const TOD   = DAYS[NOW.getDay()];

document.getElementById('dtxt').textContent =
  `${NOW.getFullYear()}년 ${NOW.getMonth()+1}월 ${NOW.getDate()}일 (${TOD}) ✨`;
document.getElementById('dpill').textContent = `🔔 오늘은 ${DAYKO[NOW.getDay()]}`;

// ── 탭 전환 ──
function goTab(el, id) {
  const pageMap = {
    home: 'index.html', menu1: 'shop.html', menu2: 'house.html',
    menu4: 'jinwoo.html', menu5: 'invest.html', menu3: 'recipe.html'
  };
  if (pageMap[id]) window.location.href = pageMap[id];
}

function setMobileSubActive(el) {
  document.querySelectorAll('.msub-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
}

// ── 현재 페이지 새로고침 ──
function reloadCurrentPage() {
  localStorage.setItem('ws5_curtab', localStorage.getItem('ws5_curtab') || 'home');
  location.reload();
}

// ── 탭 복원 ──
const savedTab = localStorage.getItem('ws5_curtab') || 'home';
const savedTabEl = document.querySelector(`.tab[onclick*="${savedTab}"]`);
if (savedTab !== 'home' && savedTabEl) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  savedTabEl.classList.add('active');
  document.getElementById(savedTab).classList.add('active');
}

// ── 토스트 ──
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'), 1700);
}

function hk(e, fn) { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();fn();} }
function esc(t) { return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── Firebase Realtime Database 연동 ──
const FB_URL = 'https://my-workspace-b1b7a-default-rtdb.firebaseio.com/ws5';

function load(k) {
  try {
    const v = localStorage.getItem('ws5_'+k);
    if (v === null) return [];
    const parsed = JSON.parse(v);
    return parsed;
  } catch { return []; }
}
function loadObj(k) {
  try { return JSON.parse(localStorage.getItem('ws5_'+k)||'{}'); } catch { return {}; }
}

// Firebase에 PUT 저장 + 로컬캐시
function stor(k, v) {
  localStorage.setItem('ws5_'+k, JSON.stringify(v));
  fetch(FB_URL + '/' + k + '.json', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(v)
  }).then(r => r.json())
    .then(() => console.log('✅ 저장:', k))
    .catch(e => console.log('❌ 저장 실패:', k, e));
}

// Firebase에서 전체 데이터 불러오기
async function syncFromSheet() {
  const fixedKeys = ['boss_flow','basic_flow','design_flow','week','todo','sched','memo','eun','jin','app','order_list','shortcuts','shortcuts2','recipe','exp_fixed','fridge_ingredient','fridge_side','tax-2026-vat','tax-2025-vat','tax-2026-income','tax-2025-income','tax-memo'];
  toast('🔄 동기화 중...');
  try {
    const res = await fetch(FB_URL + '.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) {
      const errText = await res.text();
      console.log('Firebase error:', res.status, errText);
      toast('❌ Firebase ' + res.status + ': ' + errText.slice(0, 40));
      return;
    }
    const all = await res.json();
    if (!all) { toast('🎀 최신 데이터예요!'); return; }
    // 고정 키 + sales_ 로 시작하는 키 모두 저장
    const allKeys = [...fixedKeys, ...Object.keys(all).filter(k => k.startsWith('sales_'))];
    for (const k of allKeys) {
      if (all[k] !== undefined && all[k] !== null) {
        localStorage.setItem('ws5_'+k, JSON.stringify(all[k]));
      }
    }
    // 메모리 데이터 갱신
    ['boss','basic','design'].forEach(t => { flowData[t] = load(t+'_flow'); });
    const wd = loadObj('week');
    WEEKDAYS.forEach(d => { weekData[d] = wd[d] || []; });
    Object.keys(DBS).forEach(k => { DBS[k].data = load(k); });
    recipeDB.data = load('recipe');
    // 전체 렌더
    ['boss','basic','design'].forEach(renderFlow);
    renderWeek();
    Object.keys(renderCfg).forEach(rerender);
    renderRecipe();
    renderOrder();
    renderExp();
    TAX_KEYS.forEach(renderTaxList);
    renderTaxMemoList();
    renderFridgeMemo();
    renderSalesTable();
    const sc = load('shortcuts'); if (sc && sc.length) renderShortcuts(sc);
    const sc2 = load('shortcuts2'); if (sc2 && sc2.length) renderShortcuts2(sc2);
    toast('✅ 동기화 완료!');
  } catch(e) {
    console.log('sync err', e);
    toast('❌ ' + (e.message || '동기화 실패'));
  }
}

// ── FLOW 데이터 ──
const flowData = {
  boss:   load('boss_flow'),
  basic:  load('basic_flow'),
  design: load('design_flow'),
};

function saveFlow(type) { stor(type+'_flow', flowData[type]); }

function renderFlow(type) {
  const wrap = document.getElementById(type+'-flow');
  if (!wrap) return;
  const isMint = type==='basic';
  const isLav  = type==='design';
  const cls    = isMint ? 'mint' : (isLav ? 'lav-flow' : '');
  const arrCls = isMint ? 'mint' : '';

  let html = '';
  flowData[type].forEach((item, i) => {
    if (i > 0) html += `<span class="flow-arrow ${arrCls}">→</span>`;
    html += `<div class="flow-item ${cls}" id="fi_${type}_${item.id}">
      <span class="flow-txt" contenteditable="true"
        onblur="editFlow('${type}',${item.id},this.textContent)"
        onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}"
      >${esc(item.text)}</span>
      <button class="fi-del" onclick="delFlow('${type}',${item.id})">✕</button>
    </div>`;
  });

  const addCls = isMint ? 'mint' : '';
  html += `<span class="flow-arrow ${arrCls}" ${flowData[type].length===0?'style="display:none"':''}>→</span>
    <div class="flow-add ${addCls}" onclick="addFlow('${type}')">＋ 추가</div>`;

  wrap.innerHTML = html;
}

function addFlow(type) {
  const text = prompt('항목 이름을 입력하세요');
  if (!text || !text.trim()) return;
  flowData[type].push({ id: Date.now(), text: text.trim(), done: false });
  saveFlow(type); renderFlow(type); toast('🎀 추가됐어요!');
}

function delFlow(type, id) {
  flowData[type] = flowData[type].filter(i=>i.id!==id);
  saveFlow(type); renderFlow(type); toast('🗑️ 삭제했어요');
}

function toggleFlow(type, id) {
  const item = flowData[type].find(i=>i.id===id);
  if (item) { item.done=!item.done; saveFlow(type); renderFlow(type); }
}

function editFlow(type, id, val) {
  const item = flowData[type].find(i=>i.id===id);
  if (item && val.trim()) { item.text=val.trim(); saveFlow(type); }
}

// ── 요일 박스 ──
const WEEKDAYS = ['월','화','수','목','금'];
const weekData = loadObj('week');
// weekData 구조: { 월:[{id,text,done},...], 화:... }
WEEKDAYS.forEach(d => { if (!weekData[d]) weekData[d] = []; });

function saveWeek() { stor('week', weekData); }

function renderWeek() {
  const row = document.getElementById('week-row');
  if (!row) return;
  row.innerHTML = WEEKDAYS.map(day => {
    const isToday = day === TOD;
    const tasks = weekData[day] || [];
    const taskHtml = tasks.map(t => `
      <div class="day-task ${isToday?'today-task':''}" id="dt_${day}_${t.id}">
        <div class="dt-txt" contenteditable="true"
          onblur="editDayTask('${day}',${t.id},this.textContent)"
          onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}"
        >${esc(t.text)}</div>
        <button class="dt-del" onclick="delDayTask('${day}',${t.id})">✕</button>
      </div>`).join('');

    return `<div class="day-col">
      <div class="day-label ${isToday?'today':''}">
        ${day} ${isToday?'<span class="today-badge">오늘!</span>':''}
      </div>
      <div class="day-tasks">${taskHtml}</div>
      <div class="day-add" onclick="addDayTask('${day}')">＋ 추가</div>
    </div>`;
  }).join('');
}

function addDayTask(day) {
  const text = prompt(`${day}요일 할 일을 입력하세요`);
  if (!text || !text.trim()) return;
  weekData[day].push({ id: Date.now(), text: text.trim(), done: false });
  saveWeek(); renderWeek(); toast('📅 추가됐어요!');
}

function delDayTask(day, id) {
  weekData[day] = weekData[day].filter(t=>t.id!==id);
  saveWeek(); renderWeek(); toast('🗑️ 삭제했어요');
}

function toggleDayTask(day, id) {
  const t = weekData[day].find(t=>t.id===id);
  if (t) { t.done=!t.done; saveWeek(); renderWeek(); }
}

function editDayTask(day, id, val) {
  const t = weekData[day].find(t=>t.id===id);
  if (t && val.trim()) { t.text=val.trim(); saveWeek(); }
}

// ── 일반 리스트 ──
function makeListDB(key) {
  const db = load(key);
  return {
    data: db,
    save() { stor(key, this.data); },
    add(item) { this.data.unshift(item); this.save(); },
    del(id)   { this.data=this.data.filter(i=>i.id!==id); this.save(); },
    toggle(id){ const i=this.data.find(i=>i.id===id); if(i){i.done=!i.done;this.save();} },
    edit(id,v){ const i=this.data.find(i=>i.id===id); if(i&&v.trim()){i.text=v.trim();this.save();} },
  };
}

const DBS = {
  todo:  makeListDB('todo'),
  sched: makeListDB('sched'),
  memo:  makeListDB('memo'),
  eun:   makeListDB('eun'),
  jin:   makeListDB('jin'),
  app:   makeListDB('app'),
};

function renderList(key, elId, clsName, emptyMsg) {
  const el = document.getElementById(elId);
  const items = DBS[key].data;
  if (!items.length) { el.innerHTML=`<div class="empty">${emptyMsg}</div>`; return; }
  const noChk = ['memo','app'];
  el.innerHTML = items.map(item => {
    const dateBadge = item.date ? `<span class="ibadge badge-date">📅 ${item.date.slice(5).replace('-','/')}</span>` : '';
    const timeBadge = item.time ? `<span class="ibadge badge-time">⏰ ${item.time}</span>` : '';
    const hideChk = noChk.includes(key);
    return `<div class="it ${clsName} ${item.done?'done':''}" id="it_${key}_${item.id}" draggable="true" data-id="${item.id}" data-key="${key}">
      <div class="drag-handle" title="드래그해서 순서 변경">⠿</div>
      ${hideChk ? '' : `<div class="ichk" onclick="${key}Toggle(${item.id})">${item.done?'✓':''}</div>`}
      ${(()=>{
        const txt = item.text || '';
        const lines = txt.split('\n');
        const isLong = lines.length > 8;
        const shortText = isLong ? lines.slice(0,8).join('\n') : txt;
        const uid = key+'_'+item.id;
        return `<div class="itxt-wrap">
          <div class="itxt" id="itxt_${uid}" contenteditable="false"
            ondblclick="this.contentEditable='true';this.focus()"
            onblur="${key}Edit(${item.id},this.textContent);this.contentEditable='false'"
            onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}"
            data-full="${encodeURIComponent(txt)}"
            data-short="${encodeURIComponent(shortText)}"
            data-expanded="false"
          >${isLong ? linkify(shortText) : linkify(txt)}</div>
          ${isLong ? `<button class="more-btn" onclick="toggleMore('${uid}')">▼ 더보기</button>` : ''}
        </div>`;
      })()}
      ${dateBadge}${timeBadge}
      <div class="iacts">
        <button onclick="navigator.clipboard.writeText('${item.text.replace(/'/g,"\\'").replace(/\n/g,'\\n')}').then(()=>toast('📋 복사됐어요!'))" title="복사">📋</button>
        <button onclick="this.closest('.it').querySelector('.itxt').contentEditable='true';this.closest('.it').querySelector('.itxt').focus()">✏️</button>
        <button onclick="${key}Del(${item.id})">🗑️</button>
      </div>
      ${item.createdAt ? `<div class="cat-badge">${formatCreatedAt(item.createdAt)}</div>` : ''}
    </div>`;
  }).join('');

  // 드래그앤드롭 이벤트
  initDrag(el, key);
}


// ── 더보기/접기 ──
function toggleMore(uid) {
  const el = document.getElementById('itxt_' + uid);
  const btn = el.nextElementSibling;
  if (!el || !btn) return;
  const expanded = el.dataset.expanded === 'true';
  if (expanded) {
    el.innerHTML = linkify(decodeURIComponent(el.dataset.short));
    el.dataset.expanded = 'false';
    btn.textContent = '▼ 더보기';
  } else {
    el.innerHTML = linkify(decodeURIComponent(el.dataset.full));
    el.dataset.expanded = 'true';
    btn.textContent = '▲ 접기';
  }
}



// ── 사이드바 스크롤 ──
function sbScrollTo(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - 80;
  window.scrollTo({ top, behavior: 'smooth' });
  // active 표시
  document.querySelectorAll('.sb-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(i => {
    if (i.getAttribute('onclick') && i.getAttribute('onclick').includes(id)) i.classList.add('active');
  });
}

// 스크롤 시 사이드바 활성 메뉴 자동 변경
(function() {
  const anchors = ['sb-shortcuts','sb-boss-flow','sb-design-flow','sb-week','sb-todo','sb-order','sb-memo','sb-basic-flow','sb-sched','sb-eun','sb-jin','sb-app'];
  window.addEventListener('scroll', () => {
    if (document.getElementById('home') && !document.getElementById('home').classList.contains('active')) return;
    let current = anchors[0];
    for (const id of anchors) {
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top < 120) current = id;
    }
    document.querySelectorAll('.sb-item').forEach(i => {
      const oc = i.getAttribute('onclick') || '';
      i.classList.toggle('active', oc.includes(current));
    });
  }, { passive: true });
})();


// ── 글로벌 네비 활성화 ──

function toggleGnav() {
  const nav = document.getElementById('gnav');
  nav.classList.toggle('collapsed');
  localStorage.setItem('ws5_gnavcollapsed', nav.classList.contains('collapsed') ? '1' : '0');
}
(function() {
  if (localStorage.getItem('ws5_gnavcollapsed') === '1') {
    document.getElementById('gnav').classList.add('collapsed');
  }
})();

function gnavActivate(pageId) {
  document.querySelectorAll('.gnav-main').forEach(el => el.classList.remove('active'));
  const mainEl = document.getElementById('gnav-' + pageId);
  if (mainEl) mainEl.classList.add('active');
  document.querySelectorAll('.gnav-subs').forEach(s => s.classList.remove('open'));
  const subsEl = document.getElementById('gnav-subs-' + pageId);
  if (subsEl) subsEl.classList.add('open');
}

// ── 등록일 표시 ──
function formatCreatedAt(ts) {
  if (!ts) return '';
  const now = new Date();
  const d = new Date(ts);
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tDay  = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff  = Math.round((nowDay - tDay) / 86400000);
  const week  = ['일','월','화','수','목','금','토'];
  if (diff === 0) return '<span class="cat-today">오늘</span>';
  if (diff === 1) return '<span class="cat-yesterday">어제</span>';
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  const wd = week[d.getDay()];
  return `<span class="cat-old">${mm}.${dd}(${wd})</span>`;
}

// ── 드래그앤드롭 (PC + 모바일 터치) ──
let dragSrc = null;

function initDrag(container, key) {
  const items = container.querySelectorAll('.it[draggable]');

  items.forEach(item => {
    // PC 드래그
    item.addEventListener('dragstart', e => {
      dragSrc = item;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      container.querySelectorAll('.it').forEach(i => i.classList.remove('drag-over'));
    });
    item.addEventListener('dragover', e => {
      e.preventDefault();
      if (item !== dragSrc) {
        container.querySelectorAll('.it').forEach(i => i.classList.remove('drag-over'));
        item.classList.add('drag-over');
      }
    });
    item.addEventListener('drop', e => {
      e.preventDefault();
      if (dragSrc && dragSrc !== item) {
        const srcId = parseInt(dragSrc.dataset.id);
        const tgtId = parseInt(item.dataset.id);
        const data = DBS[key].data;
        const si = data.findIndex(d => d.id === srcId);
        const ti = data.findIndex(d => d.id === tgtId);
        if (si !== -1 && ti !== -1) {
          const [moved] = data.splice(si, 1);
          data.splice(ti, 0, moved);
          DBS[key].save();
          rerender(key);
        }
      }
    });

    // 모바일 터치
    const handle = item.querySelector('.drag-handle');
    let touchStartY = 0, touchItem = null;

    handle.addEventListener('touchstart', e => {
      touchItem = item;
      touchStartY = e.touches[0].clientY;
      item.classList.add('dragging');
    }, { passive: true });

    handle.addEventListener('touchmove', e => {
      e.preventDefault();
      const y = e.touches[0].clientY;
      const els = [...container.querySelectorAll('.it:not(.dragging)')];
      const target = els.find(el => {
        const r = el.getBoundingClientRect();
        return y > r.top && y < r.bottom;
      });
      els.forEach(e => e.classList.remove('drag-over'));
      if (target) target.classList.add('drag-over');
    }, { passive: false });

    handle.addEventListener('touchend', e => {
      item.classList.remove('dragging');
      const els = [...container.querySelectorAll('.it')];
      const target = els.find(el => el.classList.contains('drag-over'));
      if (target && target !== item) {
        const srcId = parseInt(item.dataset.id);
        const tgtId = parseInt(target.dataset.id);
        const data = DBS[key].data;
        const si = data.findIndex(d => d.id === srcId);
        const ti = data.findIndex(d => d.id === tgtId);
        if (si !== -1 && ti !== -1) {
          const [moved] = data.splice(si, 1);
          data.splice(ti, 0, moved);
          DBS[key].save();
          rerender(key);
        }
      }
      container.querySelectorAll('.it').forEach(i => i.classList.remove('drag-over'));
    });
  });
}

// 각 리스트 함수 생성
['todo','sched','memo','eun','jin','app'].forEach(key => {
  window[key+'Toggle'] = (id) => { DBS[key].toggle(id); rerender(key); };
  window[key+'Del']    = (id) => { DBS[key].del(id); rerender(key); toast('🗑️ 삭제했어요'); };
  window[key+'Edit']   = (id,v) => { DBS[key].edit(id,v); rerender(key); };
});

const renderCfg = {
  todo:  ['todo-list',  '',        '할 일을 추가해요 🌸'],
  sched: ['sched-list', 'mint-it', '일정을 추가해요 🗓️'],
  memo:  ['memo-list',  'ylw-it',  '메모를 추가해요 📝'],
  eun:   ['eun-list',   'lav-it',  '할 일을 추가해요 🌸'],
  jin:   ['jin-list',   'pch-it',  '할 일을 추가해요 🐣'],
  app:   ['app-list',   '',        '개선 아이디어를 적어요 💡'],
};

function rerender(key) {
  const [elId, cls, msg] = renderCfg[key];
  renderList(key, elId, cls, msg);

}

// ── 추가 함수 ──
function addTodo() {
  const v = document.getElementById('todo-inp').value.trim();
  if (!v) return;
  DBS.todo.add({ id:Date.now(), text:v, done:false, createdAt:Date.now() });
  document.getElementById('todo-inp').value='';
  rerender('todo'); toast('🎀 저장됐어요!');
}

function addApp() {
  const v = document.getElementById('app-inp').value.trim();
  if (!v) return;
  DBS['app'].add({ id:Date.now(), text:v, done:false, createdAt:Date.now() });
  document.getElementById('app-inp').value='';
  rerender('app');
  toast('💡 메모됐어요!');
}

function addSched() {
  const v = document.getElementById('sched-inp').value.trim();
  if (!v) return;
  DBS.sched.add({ id:Date.now(), text:v, done:false, createdAt:Date.now(),
    date: document.getElementById('sched-date').value||'',
    time: '' });
  document.getElementById('sched-inp').value='';
  rerender('sched'); toast('🎀 저장됐어요!');
}

function addMemo() {
  const v = document.getElementById('memo-inp').value.trim();
  if (!v) return;
  DBS.memo.add({ id:Date.now(), text:v, done:false, createdAt:Date.now() });
  document.getElementById('memo-inp').value='';
  rerender('memo'); toast('🎀 저장됐어요!');
}

// ── 주문제작요청 ──
function loadOrder() { return load('order_list'); }
function saveOrder(data) { stor('order_list', data); }

// ── 바로가기 편집 ──

function editShortcuts2() {
  const icons = document.querySelectorAll('#app-icons-grid2 .app-icon');
  const modal = document.createElement('div');
  modal.id = 'shortcuts-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px;';
  const items = [...icons].map(el => ({
    label: el.querySelector('.app-icon-label').textContent,
    href: el.href,
    emoji: el.querySelector('.app-icon-img').textContent.trim(),
  }));
  modal.innerHTML = `
    <div style="background:white;border-radius:20px;padding:20px;width:100%;max-width:480px;max-height:85vh;overflow-y:auto;font-family:'Pretendard',sans-serif">
      <div style="font-size:1rem;font-weight:700;color:#888;margin-bottom:10px">✏️ 2줄 바로가기 편집</div>
      <div style="background:#f8f8f8;border-radius:12px;padding:10px 12px;margin-bottom:14px">
        <div style="font-size:.72rem;color:#aaa;margin-bottom:7px;font-weight:700">이모지 클릭하면 복사돼요 👆</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;line-height:1">
          ${['🛍️','🏪','💬','🎧','📦','🚚','💰','📊','📈','📉','🔍','🔗','🌐','📱','💻','🖥️','✉️','📧','📝','📋','📌','📅','📆','⏰','⏱️','🎨','🎭','🎬','📸','🎵','💳','💵','💸','🏠','🏢','🏬','⭐','🌟','✨','🔥','❤️','💜','🤖','▶️','🔎','☁️','📂','💾','🖨️','⌨️'].map(e => `<span onclick="navigator.clipboard.writeText('${e}').then(()=>toast('${e} 복사!'))" style="cursor:pointer;font-size:1.3rem;padding:3px;border-radius:6px" onmouseover="this.style.background='#eee'" onmouseout="this.style.background=''">${e}</span>`).join('')}
        </div>
      </div>
      <div id="sc2-list">
        ${items.map(it => `
          <div class="sc2-row" draggable="true" style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
            <span style="cursor:grab;color:#ccc;font-size:1.1rem;padding:0 2px;user-select:none">⠿</span>
            <input value="${it.emoji}" style="width:42px;text-align:center;border:1px solid #eee;border-radius:8px;padding:6px;font-size:1.1rem">
            <input value="${it.label}" placeholder="이름" style="flex:1;border:1px solid #eee;border-radius:8px;padding:6px;font-size:.82rem">
            <input value="${it.href}" placeholder="URL" style="flex:2;border:1px solid #eee;border-radius:8px;padding:6px;font-size:.75rem">
            <button onclick="this.closest('.sc2-row').remove()" style="background:#fee;border:none;border-radius:8px;padding:6px 8px;cursor:pointer;font-size:.8rem">🗑️</button>
          </div>`).join('')}
      </div>
      <button onclick="
        const row=document.createElement('div');row.className='sc2-row';row.draggable=true;
        row.style.cssText='display:flex;gap:8px;align-items:center;margin-bottom:8px';
        row.innerHTML=\`<span style='cursor:grab;color:#ccc;font-size:1.1rem;padding:0 2px'>⠿</span><input value='🔗' style='width:42px;text-align:center;border:1px solid #eee;border-radius:8px;padding:6px;font-size:1.1rem'><input placeholder='이름' style='flex:1;border:1px solid #eee;border-radius:8px;padding:6px;font-size:.82rem'><input placeholder='https://' style='flex:2;border:1px solid #eee;border-radius:8px;padding:6px;font-size:.75rem'><button onclick='this.closest(&quot;.sc2-row&quot;).remove()' style='background:#fee;border:none;border-radius:8px;padding:6px 8px;cursor:pointer;font-size:.8rem'>🗑️</button>\`;
        document.getElementById('sc2-list').appendChild(row);
      " style="width:100%;padding:8px;background:#f5f5f5;border:2px dashed #ccc;border-radius:10px;cursor:pointer;font-size:.82rem;color:#888;margin-bottom:12px">+ 추가</button>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button onclick="document.getElementById('shortcuts-modal').remove()" style="padding:8px 16px;border:none;border-radius:10px;background:#eee;cursor:pointer;font-size:.82rem">취소</button>
        <button onclick="saveShortcuts2()" style="padding:8px 16px;border:none;border-radius:10px;background:linear-gradient(135deg,#ddd,#aaa);color:white;cursor:pointer;font-size:.82rem;font-weight:700">저장</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function saveShortcuts2() {
  const rows = document.querySelectorAll('#sc2-list .sc2-row');
  const data = [...rows].map(row => {
    const inputs = row.querySelectorAll('input');
    return { emoji: inputs[0].value||'🔗', label: inputs[1].value||'링크', href: inputs[2].value||'#' };
  }).filter(d => d.label && d.href !== '#');
  stor('shortcuts2', data);
  renderShortcuts2(data);
  document.getElementById('shortcuts-modal').remove();
  toast('🔗 저장됐어요!');
}

function renderShortcuts2(data) {
  if (!data || !data.length) return;
  const grid = document.getElementById('app-icons-grid2');
  if (!grid) return;
  grid.innerHTML = data.map(d => `
    <a class="app-icon" href="${d.href}" target="_blank">
      <div class="app-icon-img app-icon-gray">${d.emoji}</div>
      <div class="app-icon-label">${d.label}</div>
    </a>`).join('');
}

(function() {
  const saved2 = load('shortcuts2');
  if (saved2 && saved2.length) renderShortcuts2(saved2);
})();

function editShortcuts() {
  const icons = document.querySelectorAll('#app-icons-grid .app-icon');
  const modal = document.createElement('div');
  modal.id = 'shortcuts-modal';
  modal.style.cssText = `
    position:fixed;inset:0;z-index:9999;
    background:rgba(0,0,0,.5);
    display:flex;align-items:center;justify-content:center;
    padding:16px;
  `;
  const items = [...icons].map(el => ({
    label: el.querySelector('.app-icon-label').textContent,
    href: el.href,
    emoji: el.querySelector('.app-icon-img').textContent.trim(),
    bg: el.querySelector('.app-icon-img').style.background,
  }));
  modal.innerHTML = `
    <div style="background:white;border-radius:20px;padding:20px;width:100%;max-width:480px;max-height:85vh;overflow-y:auto;font-family:'Pretendard',sans-serif">
      <div style="font-size:1rem;font-weight:700;color:var(--rose);margin-bottom:10px">✏️ 바로가기 편집</div>

      <!-- 이모지 모음 -->
      <div style="background:#fff5f8;border-radius:12px;padding:10px 12px;margin-bottom:14px">
        <div style="font-size:.72rem;color:#aaa;margin-bottom:7px;font-weight:700">이모지 클릭하면 복사돼요 👆</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;line-height:1">
          ${[
            '🛍️','🏪','💬','🎧','📦','🚚','💰','📊','📈','📉',
            '🔍','🔗','🌐','📱','💻','🖥️','⌨️','🖨️','📷','📸',
            '✉️','📧','📨','📩','📬','📮','📝','📋','📌','📍',
            '🗂️','📁','📂','🗃️','🗄️','💾','💿','📀','🖱️','⌚',
            '🏠','🏢','🏬','🏭','🏗️','🏡','🏨','🏦','🏥','🏫',
            '🛒','🎁','🎀','🎪','🎨','🎭','🎬','🎤','🎵','🎶',
            '💳','💵','💴','💶','💷','💸','🏧','💹','🤑','💱',
            '⭐','🌟','✨','💫','🔥','❤️','🧡','💛','💚','💙',
            '💜','🖤','🤍','🩷','🩵','🟥','🟧','🟨','🟩','🟦',
            '📅','📆','🗓️','⏰','⏱️','⏲️','🕐','🕑','🕒','🕓',
          ].map(e => `<span onclick="navigator.clipboard.writeText('${e}').then(()=>toast('${e} 복사!'))" style="cursor:pointer;font-size:1.3rem;padding:3px;border-radius:6px;transition:background .1s" onmouseover="this.style.background='#ffe0ec'" onmouseout="this.style.background=''">${e}</span>`).join('')}
        </div>
      </div>

      <div id="sc-list">
        ${items.map((it,i) => `
          <div class="sc-row" draggable="true" style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
            <span class="sc-drag" style="cursor:grab;color:#ccc;font-size:1.1rem;padding:0 2px;user-select:none" title="드래그해서 순서 변경">⠿</span>
            <input value="${it.emoji}" style="width:42px;text-align:center;border:1px solid #eee;border-radius:8px;padding:6px;font-size:1.1rem">
            <input value="${it.label}" placeholder="이름" style="flex:1;border:1px solid #eee;border-radius:8px;padding:6px;font-size:.82rem">
            <input value="${it.href}" placeholder="URL" style="flex:2;border:1px solid #eee;border-radius:8px;padding:6px;font-size:.75rem">
            <button onclick="this.closest('.sc-row').remove()" style="background:#fee;border:none;border-radius:8px;padding:6px 8px;cursor:pointer;font-size:.8rem">🗑️</button>
          </div>
        `).join('')}
      </div>
      <button onclick="
        const scList = document.getElementById('sc-list');
        const row = document.createElement('div');
        row.className = 'sc-row';
        row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px';
        row.innerHTML = \`<span class='sc-drag' style='cursor:grab;color:#ccc;font-size:1.1rem;padding:0 2px;user-select:none'>⠿</span><input value='🔗' style='width:42px;text-align:center;border:1px solid #eee;border-radius:8px;padding:6px;font-size:1.1rem'><input placeholder='이름' style='flex:1;border:1px solid #eee;border-radius:8px;padding:6px;font-size:.82rem'><input placeholder='https://' style='flex:2;border:1px solid #eee;border-radius:8px;padding:6px;font-size:.75rem'><button onclick='this.closest(&quot;.sc-row&quot;).remove()' style='background:#fee;border:none;border-radius:8px;padding:6px 8px;cursor:pointer;font-size:.8rem'>🗑️</button>\`;
        scList.appendChild(row);
      " style="width:100%;padding:8px;background:#f9f0ff;border:2px dashed #b0a0f8;border-radius:10px;cursor:pointer;font-size:.82rem;color:#8060e0;margin-bottom:12px">+ 추가</button>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button onclick="document.getElementById('shortcuts-modal').remove()" style="padding:8px 16px;border:none;border-radius:10px;background:#eee;cursor:pointer;font-size:.82rem">취소</button>
        <button onclick="saveShortcuts()" style="padding:8px 16px;border:none;border-radius:10px;background:linear-gradient(135deg,var(--pink),var(--pink-dark));color:white;cursor:pointer;font-size:.82rem;font-weight:700">저장</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  initScDrag();
}

function initScDrag() {
  const list = document.getElementById('sc-list');
  if (!list) return;
  let dragEl = null;

  list.querySelectorAll('.sc-row').forEach(row => {
    row.addEventListener('dragstart', e => {
      dragEl = row;
      setTimeout(() => row.style.opacity = '.4', 0);
    });
    row.addEventListener('dragend', () => {
      row.style.opacity = '';
      list.querySelectorAll('.sc-row').forEach(r => r.style.background = '');
    });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      if (row === dragEl) return;
      list.querySelectorAll('.sc-row').forEach(r => r.style.background = '');
      row.style.background = '#fff0f5';
    });
    row.addEventListener('drop', e => {
      e.preventDefault();
      if (dragEl && dragEl !== row) {
        const rows = [...list.querySelectorAll('.sc-row')];
        const si = rows.indexOf(dragEl);
        const ti = rows.indexOf(row);
        if (si < ti) row.after(dragEl);
        else row.before(dragEl);
        initScDrag();
      }
      list.querySelectorAll('.sc-row').forEach(r => r.style.background = '');
    });
  });
}

function saveShortcuts() {
  const rows = document.querySelectorAll('#sc-list .sc-row');
  const data = [...rows].map(row => {
    const inputs = row.querySelectorAll('input');
    return { emoji: inputs[0].value||'🔗', label: inputs[1].value||'링크', href: inputs[2].value||'#' };
  }).filter(d => d.label && d.href !== '#');
  stor('shortcuts', data);
  renderShortcuts(data);
  document.getElementById('shortcuts-modal').remove();
  toast('🔗 저장됐어요!');
}

function renderShortcuts(data) {
  if (!data || !data.length) return;
  const grid = document.getElementById('app-icons-grid');
  if (!grid) return;
  grid.innerHTML = data.map(d => `
    <a class="app-icon" href="${d.href}" target="_blank">
      <div class="app-icon-img" style="background:linear-gradient(135deg,var(--pink),var(--pink-dark))">${d.emoji}</div>
      <div class="app-icon-label">${d.label}</div>
    </a>
  `).join('');
}

// 저장된 바로가기 불러오기
(function() {
  const saved = load('shortcuts');
  if (saved && saved.length) renderShortcuts(saved);
})();

function renderOrder() {
  const data = loadOrder();
  const el = document.getElementById('order-list');
  if (!el) return;
  if (!data.length) {
    el.innerHTML = '<div class="empty">주문제작 요청을 등록해요 📦</div>'; return;
  }
  el.innerHTML = data.map(row => {
    const dateStr = row.date ? `📅 ${row.date.replace(/-/g,'.')}` : '📅 날짜 미정';
    return `<div class="order-item" id="order-${row.id}">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
        <span class="order-item-date" id="order-date-view-${row.id}" style="flex:1;cursor:pointer" ondblclick="orderEditMode(${row.id})">${dateStr}</span>
        <input id="order-date-edit-${row.id}" type="date" value="${row.date||''}" style="display:none;flex:1;border:1.5px solid #b0a0f8;border-radius:8px;padding:4px 8px;font-family:'Pretendard',sans-serif;font-size:.82rem">
      </div>
      <div class="order-item-memo" id="order-memo-view-${row.id}" style="cursor:pointer;white-space:pre-wrap;word-break:break-all" ondblclick="orderEditMode(${row.id})">${linkify(row.memo||'')}</div>
      <textarea id="order-memo-edit-${row.id}" style="display:none;width:100%;border:1.5px solid #b0a0f8;border-radius:8px;padding:8px 10px;font-family:'Pretendard',sans-serif;font-size:.85rem;resize:vertical;min-height:80px;line-height:1.6;box-sizing:border-box">${esc(row.memo||'')}</textarea>
      <div class="order-item-acts" id="order-acts-${row.id}">
        <button class="abtn" style="font-size:.72rem;padding:3px 10px;background:linear-gradient(135deg,#b0a0f8,#8060e0)" onclick="orderEditMode(${row.id})">✏️ 편집</button>
        <button class="abtn" style="font-size:.72rem;padding:3px 10px;background:linear-gradient(135deg,#f08080,#d04040)" onclick="delOrder(${row.id})">🗑️ 삭제</button>
      </div>
      <div id="order-edit-acts-${row.id}" style="display:none;display:none;justify-content:flex-end;gap:6px;margin-top:6px">
        <button class="abtn" style="font-size:.72rem;padding:3px 10px;background:linear-gradient(135deg,#aaa,#888)" onclick="orderCancelEdit(${row.id})">취소</button>
        <button class="abtn" style="font-size:.72rem;padding:3px 10px;background:linear-gradient(135deg,#b0a0f8,#8060e0)" onclick="orderSaveEdit(${row.id})">💾 저장</button>
      </div>
    </div>`;
  }).join('');
}

function orderEditMode(id) {
  document.getElementById('order-memo-view-'+id).style.display = 'none';
  document.getElementById('order-memo-edit-'+id).style.display = 'block';
  document.getElementById('order-date-view-'+id).style.display = 'none';
  document.getElementById('order-date-edit-'+id).style.display = 'block';
  document.getElementById('order-acts-'+id).style.display = 'none';
  document.getElementById('order-edit-acts-'+id).style.display = 'flex';
  document.getElementById('order-memo-edit-'+id).focus();
}

function orderCancelEdit(id) {
  document.getElementById('order-memo-view-'+id).style.display = 'block';
  document.getElementById('order-memo-edit-'+id).style.display = 'none';
  document.getElementById('order-date-view-'+id).style.display = 'flex';
  document.getElementById('order-date-edit-'+id).style.display = 'none';
  document.getElementById('order-acts-'+id).style.display = 'flex';
  document.getElementById('order-edit-acts-'+id).style.display = 'none';
}

function orderSaveEdit(id) {
  const memo = document.getElementById('order-memo-edit-'+id).value.trim();
  const date = document.getElementById('order-date-edit-'+id).value;
  const data = loadOrder();
  const idx = data.findIndex(r => r.id === id);
  if (idx !== -1) { data[idx].memo = memo; data[idx].date = date; }
  saveOrder(data);
  renderOrder();
  toast('📦 수정됐어요!');
}

function addOrder() {
  const date = document.getElementById('order-date').value;
  const memo = document.getElementById('order-memo').value.trim();
  if (!memo) { toast('요청 내용을 입력해줘요 📦'); return; }
  const data = loadOrder();
  data.unshift({ id: Date.now(), date, memo });
  saveOrder(data);
  document.getElementById('order-date').value = '';
  document.getElementById('order-memo').value = '';
  renderOrder();
  toast('📦 요청 등록됐어요!');
}

function delOrder(id) {
  if (!confirm('삭제할까요?')) return;
  saveOrder(loadOrder().filter(r => r.id !== id));
  renderOrder(); toast('🗑️ 삭제됐어요');
}



function addEun() {
  const v = document.getElementById('eun-inp').value.trim();
  if (!v) return;
  DBS.eun.add({ id:Date.now(), text:v, done:false, createdAt:Date.now() });
  document.getElementById('eun-inp').value='';
  rerender('eun'); toast('🎀 저장됐어요!');
}

function addJin() {
  const v = document.getElementById('jin-inp').value.trim();
  if (!v) return;
  DBS.jin.add({ id:Date.now(), text:v, done:false, createdAt:Date.now() });
  document.getElementById('jin-inp').value='';
  rerender('jin'); toast('🎀 저장됐어요!');
}

// ── PC/모바일 뷰 전환 ──
function setView(mode) {
  const body = document.body;
  const btnPc     = document.getElementById('btn-pc');
  const btnMobile = document.getElementById('btn-mobile');
  if (mode === 'mobile') {
    body.classList.add('mobile-view');
    btnMobile.classList.add('active-view');
    btnPc.classList.remove('active-view');
  } else {
    body.classList.remove('mobile-view');
    btnPc.classList.add('active-view');
    btnMobile.classList.remove('active-view');
  }
  localStorage.setItem('ws5_viewmode', mode);
}

// 저장된 뷰모드 복원
const savedView = localStorage.getItem('ws5_viewmode') || 'pc';
setView(savedView);

// ── 사이드 메뉴 전환 ──
function switchSub(pageId, num, el) {
  document.querySelectorAll(`#${pageId} .subpage`).forEach(p => p.classList.remove('active'));
  const target = document.getElementById(`${pageId}-sub-${num}`);
  if (target) target.classList.add('active');
  // gnav-sub 활성화
  document.querySelectorAll('.gnav-sub').forEach(m => m.classList.remove('active'));
  if (el) el.classList.add('active');
}

// ── 레시피 ──
const recipeDB = { data: load('recipe') };
function saveRecipe() { stor('recipe', recipeDB.data); }

let editingRecipeId = null;
let currentCatFilter = '전체';


// ── 냉장고 메모 ──
let fridgeMemoType = 'ingredient';
function renderFridgeMemo() {
  const t1 = load('fridge_ingredient') || '';
  const t2 = load('fridge_side') || '';
  const el1 = document.getElementById('fridge-bar-text');
  const el2 = document.getElementById('fridge-bar-text2');
  if (el1) {
    if (t1.trim()) { el1.textContent = t1; el1.classList.remove('empty'); }
    else { el1.textContent = '재료 남은거 메모... (클릭해서 편집)'; el1.classList.add('empty'); }
  }
  if (el2) {
    if (t2.trim()) { el2.textContent = t2; el2.classList.remove('empty'); }
    else { el2.textContent = '반찬 남은거 메모... (클릭해서 편집)'; el2.classList.add('empty'); }
  }
}
function openFridgeMemo(type) {
  fridgeMemoType = type;
  const isIngredient = type === 'ingredient';
  document.getElementById('fridge-modal-title').textContent = isIngredient ? '🧊 재료 남은거' : '🍱 반찬 남은거';
  const key = isIngredient ? 'fridge_ingredient' : 'fridge_side';
  document.getElementById('fridge-textarea').value = load(key) || '';
  document.getElementById('fridge-textarea').placeholder = isIngredient
    ? '예) 두부, 계란 3개, 파, 된장...'
    : '예) 김치찌개, 계란말이, 멸치볶음...';
  document.getElementById('fridge-overlay').classList.add('show');
  document.getElementById('fridge-modal').classList.add('show');
  setTimeout(() => document.getElementById('fridge-textarea').focus(), 100);
}
function closeFridgeMemo() {
  document.getElementById('fridge-overlay').classList.remove('show');
  document.getElementById('fridge-modal').classList.remove('show');
}
function saveFridgeMemo() {
  const key = fridgeMemoType === 'ingredient' ? 'fridge_ingredient' : 'fridge_side';
  stor(key, document.getElementById('fridge-textarea').value);
  renderFridgeMemo();
  closeFridgeMemo();
  toast(fridgeMemoType === 'ingredient' ? '재료 메모 저장됐어요! 🧊' : '반찬 메모 저장됐어요! 🍱');
}

function linkify(text) {
  const escaped = escHtml(text).replace(/\n/g, '<br>');
  const urlRegex = /(https?:\/\/[^\s<]+)|(www\.[^\s<]+\.[^\s<]+)/g;
  return escaped.replace(urlRegex, (match, http, www) => {
    const href = http ? http : 'https://' + www;
    const display = (http || www).replace(/\/+$/, '');
    const isImg = /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?[^\s<]*)?$/i.test(href);
    if (isImg) {
      const safeHref = href.replace(/"/g, '&quot;');
      return `<span style="cursor:pointer;display:inline-block;margin:4px 0" onclick="openImgModal(this.dataset.src)" data-src="${safeHref}">
        <img src="${safeHref}" style="max-width:160px;max-height:120px;border-radius:8px;border:2px solid var(--pink-mid);object-fit:cover;vertical-align:middle;transition:transform .15s" onmouseover="this.style.transform='scale(1.04)'" onmouseout="this.style.transform=''" onerror="this.style.display='none';this.nextElementSibling.style.display='inline'">
        <a href="${safeHref}" target="_blank" rel="noopener" style="display:none;color:#e8648a;text-decoration:underline;word-break:break-all">${display}</a>
      </span>`;
    }
    return `<a href="${href}" target="_blank" rel="noopener" style="color:#e8648a;text-decoration:underline;word-break:break-all">${display}</a>`;
  });
}

function openImgModal(src) {
  const overlay = document.getElementById('img-modal-overlay');
  const img = document.getElementById('img-modal-img');
  img.src = src;
  overlay.style.display = 'flex';
}
function closeImgModal() {
  document.getElementById('img-modal-overlay').style.display = 'none';
  document.getElementById('img-modal-img').src = '';
}
function escHtml(t) { return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function highlightText(text, keyword) {
  if (!keyword) return escHtml(text);
  const escaped = escHtml(text);
  const kEsc = escHtml(keyword);
  const safeKw = kEsc.replace(/[-[\]{}()*+?.,\\^$|#]/g, '\\$&');
  const regex = new RegExp('(' + safeKw + ')', 'gi');
  return escaped.replace(regex, '<mark>$1</mark>');
}

function filterRecipe(cat, el) {
  currentCatFilter = cat;
  document.querySelectorAll('.rct').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderRecipe(document.getElementById('recipe-search').value);
}

function renderRecipe(keyword='') {
  const grid = document.getElementById('recipe-grid');
  if (!grid) return;
  const kw = keyword.trim().toLowerCase();

  let items = recipeDB.data;
  if (currentCatFilter !== '전체') {
    items = items.filter(i => (i.cat || '기타') === currentCatFilter);
  }

  if (!items.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1;padding:40px 0">${currentCatFilter !== '전체' ? currentCatFilter + ' 레시피가 없어요 🍳' : '레시피를 등록해요 🍳'}</div>`;
    document.getElementById('search-result-count').textContent = '';
    return;
  }

  let shown = 0;
  grid.innerHTML = items.map(item => {
    const matchTitle = item.title.toLowerCase().includes(kw);
    const matchMemo  = (item.memo||'').toLowerCase().includes(kw);
    const hidden = kw && !matchTitle && !matchMemo;
    if (!hidden) shown++;

    const titleHtml = kw ? highlightText(item.title, kw) : escHtml(item.title);
    const memoHtml  = kw ? linkifyHighlight(item.memo||'', kw) : linkify(item.memo||'');
    const catLabel  = item.cat ? `<span class="rc-cat-badge">${item.cat}</span>` : '';

    return `<div class="recipe-card ${hidden ? 'hidden' : ''}" id="rc_${item.id}">
      <div class="rc-top">
        <div class="rc-title">${titleHtml}</div>
        ${catLabel}
      </div>
      ${item.memo ? `<div class="rc-memo">${memoHtml}</div>` : ''}
      <div class="rc-acts">
        <button class="rc-btn" onclick="editRecipe(${item.id})">✏️ 수정</button>
        <button class="rc-btn del" onclick="deleteRecipe(${item.id})">🗑️ 삭제</button>
      </div>
    </div>`;
  }).join('');

  const countEl = document.getElementById('search-result-count');
  if (kw) {
    countEl.textContent = `🔍 "${keyword}" 검색 결과: ${shown}개`;
  } else {
    countEl.textContent = `총 ${items.length}개`;
  }
}

function linkifyHighlight(text, keyword) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map(part => {
    if (urlRegex.test(part)) {
      return `<a href="${part}" target="_blank" rel="noopener">${part}</a>`;
    }
    return keyword ? highlightText(part, keyword) : escHtml(part);
  }).join('');
}

function addRecipe() {
  const title = document.getElementById('recipe-title-inp').value.trim();
  const memo  = document.getElementById('recipe-memo-inp').value.trim();
  const cat   = document.getElementById('recipe-cat-inp').value;
  if (!title) { toast('제목을 입력해요 🍽️'); return; }

  if (editingRecipeId) {
    const item = recipeDB.data.find(i => i.id === editingRecipeId);
    if (item) { item.title=title; item.memo=memo; item.cat=cat; }
    editingRecipeId = null;
    document.getElementById('recipe-cancel-btn').style.display = 'none';
    toast('✏️ 수정됐어요!');
  } else {
    recipeDB.data.unshift({ id: Date.now(), title, memo, cat });
    toast('🍳 레시피 등록됐어요!');
  }

  saveRecipe();
  document.getElementById('recipe-title-inp').value = '';
  document.getElementById('recipe-memo-inp').value = '';
  document.getElementById('recipe-cat-inp').value = '국';
  renderRecipe(document.getElementById('recipe-search').value);
}

function editRecipe(id) {
  const item = recipeDB.data.find(i => i.id === id);
  if (!item) return;
  editingRecipeId = id;
  document.getElementById('recipe-title-inp').value = item.title;
  document.getElementById('recipe-memo-inp').value  = item.memo || '';
  document.getElementById('recipe-cat-inp').value   = item.cat || '국';

  document.getElementById('recipe-cancel-btn').style.display = 'inline-block';
  document.getElementById('recipe-title-inp').focus();
  document.getElementById('recipe-add-form').scrollIntoView({ behavior:'smooth' });
  toast('✏️ 수정 모드예요!');
}

function cancelEditRecipe() {
  editingRecipeId = null;
  document.getElementById('recipe-title-inp').value = '';
  document.getElementById('recipe-memo-inp').value  = '';
  document.getElementById('recipe-cat-inp').value   = '';
  document.getElementById('recipe-cancel-btn').style.display = 'none';
}

function deleteRecipe(id) {
  if (!confirm('이 레시피를 삭제할까요?')) return;
  recipeDB.data = recipeDB.data.filter(i => i.id !== id);
  saveRecipe();
  renderRecipe(document.getElementById('recipe-search').value);
  toast('🗑️ 삭제됐어요');
}

function searchRecipe() {
  const kw = document.getElementById('recipe-search').value;
  document.getElementById('rs-clear-btn').style.display = kw ? 'block' : 'none';
  renderRecipe(kw);
}

function clearSearch() {
  document.getElementById('recipe-search').value = '';
  document.getElementById('rs-clear-btn').style.display = 'none';
  renderRecipe();
}

let editingExpId = null;
let memoTargetId = null;
let currentBankFilter = '전체';

// ── 세금 메모 아코디언 ──
function addTaxMemoItem() {
  const title = document.getElementById('tax-memo-title-inp').value.trim();
  const content = document.getElementById('tax-memo-inp').value.trim();
  if (!title) { toast('제목을 입력해요 📝'); return; }
  const data = loadTaxList('tax-memo');
  data.unshift({ id: Date.now(), title, content, createdAt: Date.now() });
  saveTaxList('tax-memo', data);
  document.getElementById('tax-memo-title-inp').value = '';
  document.getElementById('tax-memo-inp').value = '';
  renderTaxMemoList();
  toast('🎀 저장됐어요!');
}

function toggleTaxMemo(id) {
  const body = document.getElementById('tax-memo-body-' + id);
  const arrow = document.getElementById('tax-memo-arrow-' + id);
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  arrow.textContent = isOpen ? '▶' : '▼';
}

function delTaxMemoItem(id) {
  saveTaxList('tax-memo', loadTaxList('tax-memo').filter(i => i.id !== id));
  renderTaxMemoList();
  toast('🗑️ 삭제했어요');
}

function editTaxMemoContent(id, field, val) {
  const data = loadTaxList('tax-memo');
  const item = data.find(i => i.id === id);
  if (item && val.trim()) { item[field] = val.trim(); saveTaxList('tax-memo', data); }
}

function renderTaxMemoList() {
  const el = document.getElementById('tax-memo-list');
  if (!el) return;
  const data = loadTaxList('tax-memo');
  if (!data.length) { el.innerHTML = '<div class="empty">메모를 추가해요 📝</div>'; return; }
  el.innerHTML = data.map(item => `
    <div id="txit_taxmemo_${item.id}" draggable="true" data-id="${item.id}" data-key="tax-memo" style="background:#f0fff8;border:1.5px solid var(--mint);border-radius:11px;overflow:hidden;margin-bottom:6px">
      <div style="display:flex;align-items:center;gap:8px;padding:10px 12px">
        <div class="drag-handle" title="드래그해서 순서 변경" onclick="event.stopPropagation()">⠿</div>
        <span id="tax-memo-arrow-${item.id}" style="color:var(--mint-dark);font-size:.8rem;flex-shrink:0;cursor:pointer" onclick="toggleTaxMemo(${item.id})">▶</span>
        <div style="flex:1;font-size:.88rem;font-weight:700;color:#2a6a4a;outline:none;cursor:pointer"
          onclick="toggleTaxMemo(${item.id})"
          contenteditable="false"
          ondblclick="event.stopPropagation();this.contentEditable='true';this.focus()"
          onblur="editTaxMemoContent(${item.id},'title',this.textContent);this.contentEditable='false'"
          onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}"
        >${esc(item.title)}</div>
        <button onclick="event.stopPropagation();editTaxMemoOpen(${item.id})" style="background:none;border:none;cursor:pointer;color:var(--mint-dark);font-size:.85rem;padding:2px 4px;flex-shrink:0" title="편집">✏️</button>
        <button onclick="event.stopPropagation();delTaxMemoItem(${item.id})" style="background:none;border:none;cursor:pointer;color:#ccc;font-size:.85rem;padding:2px 4px;flex-shrink:0" title="삭제">🗑️</button>
      </div>
      <div id="tax-memo-body-${item.id}" style="display:none;border-top:1px dashed var(--mint);padding:10px 14px 12px">
        <div style="font-size:.85rem;color:#3a6a4a;line-height:1.8;white-space:pre-wrap;word-break:break-all">${linkify(item.content||'내용 없음')}</div>
        <div style="text-align:right;margin-top:8px">
          <span onclick="toggleTaxMemo(${item.id})" style="font-size:.75rem;color:var(--mint-dark);cursor:pointer;padding:3px 12px;border:1px solid var(--mint);border-radius:10px">▲ 닫기</span>
        </div>
      </div>
    </div>`).join('');
  initTaxMemoDrag(el);
}

function initTaxMemoDrag(container) {
  let dragSrcTax = null;
  container.querySelectorAll('.it[draggable]').forEach(item => {
    item.addEventListener('dragstart', e => {
      dragSrcTax = item;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      container.querySelectorAll('.it').forEach(i => i.classList.remove('drag-over'));
    });
    item.addEventListener('dragover', e => {
      e.preventDefault();
      if (item !== dragSrcTax) {
        container.querySelectorAll('.it').forEach(i => i.classList.remove('drag-over'));
        item.classList.add('drag-over');
      }
    });
    item.addEventListener('drop', e => {
      e.preventDefault();
      if (dragSrcTax && dragSrcTax !== item) {
        const srcId = parseInt(dragSrcTax.dataset.id);
        const tgtId = parseInt(item.dataset.id);
        const data = loadTaxList('tax-memo');
        const si = data.findIndex(d => d.id === srcId);
        const ti = data.findIndex(d => d.id === tgtId);
        if (si !== -1 && ti !== -1) {
          const [moved] = data.splice(si, 1);
          data.splice(ti, 0, moved);
          saveTaxList('tax-memo', data);
          renderTaxMemoList();
        }
      }
    });
    // 모바일 터치
    const handle = item.querySelector('.drag-handle');
    if (!handle) return;
    handle.addEventListener('touchstart', e => {
      dragSrcTax = item;
      item.classList.add('dragging');
    }, { passive: true });
    handle.addEventListener('touchmove', e => {
      e.preventDefault();
      const y = e.touches[0].clientY;
      const els = [...container.querySelectorAll('.it:not(.dragging)')];
      const target = els.find(el => { const r = el.getBoundingClientRect(); return y > r.top && y < r.bottom; });
      els.forEach(e => e.classList.remove('drag-over'));
      if (target) target.classList.add('drag-over');
    }, { passive: false });
    handle.addEventListener('touchend', e => {
      item.classList.remove('dragging');
      const target = container.querySelector('.it.drag-over');
      if (target && dragSrcTax && target !== dragSrcTax) {
        const srcId = parseInt(dragSrcTax.dataset.id);
        const tgtId = parseInt(target.dataset.id);
        const data = loadTaxList('tax-memo');
        const si = data.findIndex(d => d.id === srcId);
        const ti = data.findIndex(d => d.id === tgtId);
        if (si !== -1 && ti !== -1) {
          const [moved] = data.splice(si, 1);
          data.splice(ti, 0, moved);
          saveTaxList('tax-memo', data);
          renderTaxMemoList();
        }
      }
      container.querySelectorAll('.it').forEach(i => i.classList.remove('drag-over', 'dragging'));
      dragSrcTax = null;
    });
  });
}

const TAX_KEYS = ['tax-2026-vat','tax-2025-vat','tax-2026-income','tax-2025-income'];

function loadTaxList(key) {
  try { return JSON.parse(localStorage.getItem('ws5_'+key)||'[]'); } catch { return []; }
}
function saveTaxList(key, data) {
  localStorage.setItem('ws5_'+key, JSON.stringify(data));
  fetch(FB_URL + '/' + key + '.json', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).catch(e => console.log('❌ tax 저장 실패:', key, e));
}

function addTaxItem(key) {
  const inp = document.getElementById(key+'-inp');
  const v = inp.value.trim();
  if (!v) return;
  const data = loadTaxList(key);
  data.unshift({ id: Date.now(), text: v, createdAt: Date.now() });
  saveTaxList(key, data);
  inp.value = '';
  renderTaxList(key);
  toast('🎀 저장됐어요!');
}

function delTaxItem(key, id) {
  saveTaxList(key, loadTaxList(key).filter(i => i.id !== id));
  renderTaxList(key);
  toast('🗑️ 삭제했어요');
}

function editTaxItem(key, id, v) {
  const data = loadTaxList(key);
  const item = data.find(i => i.id === id);
  if (item && v.trim()) { item.text = v.trim(); saveTaxList(key, data); }
}

function renderTaxList(key) {
  const el = document.getElementById(key+'-list');
  if (!el) return;
  const data = loadTaxList(key);
  if (!data.length) { el.innerHTML = '<div class="empty">내용을 추가해요 🌸</div>'; return; }
  const clsMap = { 'tax-2026-vat':'ylw-it', 'tax-2025-vat':'ylw-it', 'tax-2026-income':'lav-it', 'tax-2025-income':'lav-it' };
  const cls = clsMap[key] || '';
  el.innerHTML = data.map(item => `
    <div class="it ${cls}" id="txit_${key}_${item.id}" draggable="true" data-id="${item.id}" data-key="${key}">
      <div class="drag-handle" title="드래그해서 순서 변경">⠿</div>
      <div class="itxt" id="taxitxt_${key}_${item.id}" contenteditable="false"
        ondblclick="this.contentEditable='true';this.focus()"
        onblur="editTaxItem('${key}',${item.id},this.textContent);this.contentEditable='false'"
        onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}"
      >${linkify(item.text)}</div>
      <div class="iacts">
        <button onclick="navigator.clipboard.writeText('${item.text.replace(/'/g,"\\'")}').then(()=>toast('📋 복사됐어요!'))">📋</button>
        <button onclick="document.getElementById('taxitxt_${key}_${item.id}').contentEditable='true';document.getElementById('taxitxt_${key}_${item.id}').focus()">✏️</button>
        <button onclick="delTaxItem('${key}',${item.id})">🗑️</button>
      </div>
      ${item.createdAt ? `<div class="cat-badge">${formatCreatedAt(item.createdAt)}</div>` : ''}
    </div>`).join('');
  initTaxDrag(el, key);
}

function editTaxMemoOpen(id) {
  const data = loadTaxList('tax-memo');
  const item = data.find(i => i.id === id);
  if (!item) return;
  const overlay = document.createElement('div');
  overlay.id = 'tax-edit-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:18px;padding:22px;width:100%;max-width:480px;box-shadow:0 8px 40px rgba(0,0,0,.2)">
      <div style="font-size:1rem;font-weight:800;color:var(--mint-dark);margin-bottom:14px">📝 메모 편집</div>
      <input id="tax-edit-title" value="${esc(item.title)}" class="ra-inp" style="margin-bottom:10px">
      <textarea id="tax-edit-content" class="ra-inp" style="min-height:140px;resize:vertical" placeholder="내용...">${esc(item.content||'')}</textarea>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
        <button onclick="document.getElementById('tax-edit-overlay').remove()" style="padding:8px 18px;border:1.5px solid #ddd;border-radius:10px;background:#fff;cursor:pointer;font-size:.88rem">취소</button>
        <button onclick="
          const d=loadTaxList('tax-memo');
          const it=d.find(i=>i.id===${id});
          if(it){it.title=document.getElementById('tax-edit-title').value.trim()||it.title;it.content=document.getElementById('tax-edit-content').value;}
          saveTaxList('tax-memo',d);
          renderTaxMemoList();
          document.getElementById('tax-edit-overlay').remove();
          toast('✅ 수정됐어요!');
        " style="padding:8px 18px;background:var(--mint-dark);border:none;border-radius:10px;color:#fff;cursor:pointer;font-size:.88rem;font-weight:700">저장</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if(e.target===overlay) overlay.remove(); });
}


// ── 초기 렌더 ──
// initRender는 파일 맨 끝으로 이동

function loadExp() { return load('exp_fixed'); }
function saveExp(data) { stor('exp_fixed', data); }

// 기타 직접입력 토글
function toggleBankEtc(sel) {
  const etc = document.getElementById('exp-bank-etc');
  etc.style.display = sel.value === '기타' ? 'block' : 'none';
  if (sel.value !== '기타') etc.value = '';
}

// 통장 필터
function filterExpBank(bank, el) {
  currentBankFilter = bank;
  document.querySelectorAll('.ebt').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderExp();
}

function renderExp() {
  const _tbody = document.getElementById('exp-tbody');
  if (!_tbody) return;
  let data = loadExp();
  // 날짜 오름차순 정렬 — "10일", "2일", "10" 등 숫자만 추출해서 정수 비교
  data = [...data].sort((a,b) => {
    const na = parseInt((a.day||'').match(/\d+/)?.[0] || '0');
    const nb = parseInt((b.day||'').match(/\d+/)?.[0] || '0');
    return na - nb;
  });
  const filtered = currentBankFilter !== '전체'
    ? data.filter(r => (r.bank||'') === currentBankFilter)
    : data;

  const tbody = _tbody;
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--soft)">${currentBankFilter !== '전체' ? currentBankFilter+' 항목이 없어요' : '지출 항목을 등록해요 💳'}</td></tr>`;
    document.getElementById('exp-total').textContent = currentBankFilter !== '전체' ? currentBankFilter+' 합계: 0원' : '합계: 0원';
    return;
  }

  let total = 0;
  tbody.innerHTML = filtered.map(row => {
    const amt = parseInt((row.amt||'0').replace(/[^0-9]/g,'')) || 0;
    total += amt;
    const amtDisp = amt ? amt.toLocaleString() : (row.amt||'-');
    const hasMemo = row.memo && row.memo.trim();
    return `<tr id="exp-row-${row.id}">
      <td class="exp-td-day">${esc(row.day||'')}</td>
      <td>${esc(row.item||'')}</td>
      <td class="exp-td-amt">${amtDisp}</td>
      <td>${esc(row.bank||'')}</td>
      <td>${esc(row.note||'')}</td>
      <td style="text-align:left;min-width:90px">
        ${hasMemo
          ? `<div class="exp-memo-preview" onclick="openExpMemo(${row.id})">${esc(row.memo.length>20 ? row.memo.slice(0,20)+'…' : row.memo)}</div>`
          : `<button class="exp-memo-add-btn" onclick="openExpMemo(${row.id})">+ 메모</button>`
        }
      </td>
      <td><div class="exp-td-acts">
        <button onclick="editExpItem(${row.id})">✏️</button>
        <button class="del" onclick="delExpItem(${row.id})">🗑️</button>
      </div></td>
    </tr>`;
  }).join('');

  const label = currentBankFilter !== '전체' ? currentBankFilter+' 합계' : '합계';
  document.getElementById('exp-total').textContent = `${label}: ${total.toLocaleString()}원`;
}

function addExpItem() {
  const day  = document.getElementById('exp-day').value.trim();
  const item = document.getElementById('exp-item').value.trim();
  const amt  = document.getElementById('exp-amt').value.trim();
  const bankSel = document.getElementById('exp-bank').value;
  const bankEtc = document.getElementById('exp-bank-etc').value.trim();
  const bank = bankSel === '기타' ? (bankEtc || '기타') : bankSel;
  const note = document.getElementById('exp-note').value.trim();
  if (!item) { toast('항목명을 입력해요 💳'); return; }

  const data = loadExp();
  if (editingExpId) {
    const idx = data.findIndex(r => r.id === editingExpId);
    if (idx !== -1) data[idx] = { ...data[idx], day, item, amt, bank, note };
    editingExpId = null;
    document.getElementById('exp-cancel-btn').style.display = 'none';
    toast('✏️ 수정됐어요!');
  } else {
    data.push({ id: Date.now(), day, item, amt, bank, note, memo: '' });
    toast('💳 등록됐어요!');
  }
  saveExp(data);
  clearExpForm();
  renderExp();
}

function editExpItem(id) {
  const row = loadExp().find(r => r.id === id);
  if (!row) return;
  editingExpId = id;
  document.getElementById('exp-day').value  = row.day||'';
  document.getElementById('exp-item').value = row.item||'';
  document.getElementById('exp-amt').value  = row.amt||'';
  // bank 값이 select 옵션에 있으면 선택, 없으면 기타+직접입력
  const bankSel = document.getElementById('exp-bank');
  const opts = Array.from(bankSel.options).map(o => o.value);
  if (opts.includes(row.bank)) {
    bankSel.value = row.bank;
    document.getElementById('exp-bank-etc').style.display = 'none';
  } else {
    bankSel.value = '기타';
    document.getElementById('exp-bank-etc').value = row.bank||'';
    document.getElementById('exp-bank-etc').style.display = 'block';
  }
  document.getElementById('exp-note').value = row.note||'';
  document.getElementById('exp-cancel-btn').style.display = 'inline-block';
  document.getElementById('exp-add-form').scrollIntoView({ behavior: 'smooth' });
  toast('✏️ 수정 모드예요!');
}

function delExpItem(id) {
  if (!confirm('이 항목을 삭제할까요?')) return;
  saveExp(loadExp().filter(r => r.id !== id));
  renderExp(); toast('🗑️ 삭제됐어요');
}

function cancelExpEdit() {
  editingExpId = null; clearExpForm();
  document.getElementById('exp-cancel-btn').style.display = 'none';
}

function clearExpForm() {
  ['exp-day','exp-item','exp-amt','exp-note'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('exp-bank').value = '';
  document.getElementById('exp-bank-etc').value = '';
  document.getElementById('exp-bank-etc').style.display = 'none';
}

function openExpMemo(id) {
  memoTargetId = id;
  const row = loadExp().find(r => r.id === id);
  document.getElementById('exp-memo-text').value = row ? (row.memo||'') : '';
  document.getElementById('exp-memo-overlay').classList.add('show');
  document.getElementById('exp-memo-popup').classList.add('show');
  setTimeout(() => document.getElementById('exp-memo-text').focus(), 100);
}

function closeExpMemo() {
  document.getElementById('exp-memo-overlay').classList.remove('show');
  document.getElementById('exp-memo-popup').classList.remove('show');
  memoTargetId = null;
}

function saveExpMemo() {
  const memo = document.getElementById('exp-memo-text').value.trim();
  const data = loadExp();
  const idx  = data.findIndex(r => r.id === memoTargetId);
  if (idx !== -1) { data[idx].memo = memo; saveExp(data); }
  closeExpMemo(); renderExp();
  toast(memo ? '📝 메모 저장됐어요!' : '메모를 지웠어요');
}

function deleteExpMemo() {
  if (!confirm('메모를 삭제할까요?')) return;
  const data = loadExp();
  const idx  = data.findIndex(r => r.id === memoTargetId);
  if (idx !== -1) { data[idx].memo = ''; saveExp(data); }
  closeExpMemo(); renderExp();
  toast('🗑️ 메모 삭제됐어요');
}


function initTaxDrag(container, key) {
  let dragSrcEl = null;
  container.querySelectorAll('.it[draggable]').forEach(item => {
    item.addEventListener('dragstart', e => { dragSrcEl = item; item.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; });
    item.addEventListener('dragend', () => { item.classList.remove('dragging'); container.querySelectorAll('.it').forEach(i=>i.classList.remove('drag-over')); });
    item.addEventListener('dragover', e => { e.preventDefault(); if(item!==dragSrcEl){container.querySelectorAll('.it').forEach(i=>i.classList.remove('drag-over'));item.classList.add('drag-over');} });
    item.addEventListener('drop', e => {
      e.preventDefault();
      if (dragSrcEl && dragSrcEl !== item) {
        const si = parseInt(dragSrcEl.dataset.id), ti = parseInt(item.dataset.id);
        const data = loadTaxList(key);
        const a = data.findIndex(d=>d.id===si), b = data.findIndex(d=>d.id===ti);
        if (a!==-1 && b!==-1) { const [m]=data.splice(a,1); data.splice(b,0,m); saveTaxList(key,data); renderTaxList(key); }
      }
    });
    const handle = item.querySelector('.drag-handle');
    if (!handle) return;
    handle.addEventListener('touchstart', e=>{ dragSrcEl=item; item.classList.add('dragging'); },{passive:true});
    handle.addEventListener('touchmove', e=>{ e.preventDefault(); const y=e.touches[0].clientY; const els=[...container.querySelectorAll('.it:not(.dragging)')]; const tgt=els.find(el=>{const r=el.getBoundingClientRect();return y>r.top&&y<r.bottom;}); els.forEach(e=>e.classList.remove('drag-over')); if(tgt)tgt.classList.add('drag-over'); },{passive:false});
    handle.addEventListener('touchend', e=>{
      item.classList.remove('dragging');
      const tgt=container.querySelector('.it.drag-over');
      if(tgt&&dragSrcEl&&tgt!==dragSrcEl){
        const si=parseInt(dragSrcEl.dataset.id),ti=parseInt(tgt.dataset.id);
        const data=loadTaxList(key);
        const a=data.findIndex(d=>d.id===si),b=data.findIndex(d=>d.id===ti);
        if(a!==-1&&b!==-1){const[m]=data.splice(a,1);data.splice(b,0,m);saveTaxList(key,data);renderTaxList(key);}
      }
      container.querySelectorAll('.it').forEach(i=>i.classList.remove('drag-over','dragging'));
      dragSrcEl=null;
    });
  });
}


// ── 사이드 메뉴 초기 활성화 ──
document.getElementById('m1-sm-1') && document.getElementById('m1-sm-1').classList.add('active');
document.getElementById('m4-sm-1') && document.getElementById('m4-sm-1').classList.add('active');
document.getElementById('m5-sm-1') && document.getElementById('m5-sm-1').classList.add('active');
document.getElementById('m2-sm-0') && document.getElementById('m2-sm-0').classList.add('active');

// ── Firebase 동기화 (🔄 버튼으로 수동) ──

// ── PWA 서비스워커 등록 ──
// ── 매출/광고비 ──
const SALES_MONTHS = ['3월','4월','5월','6월','7월','8월','9월','10월','11월','12월','1월','2월'];
const SALES_MONTH_NUMS = [3,4,5,6,7,8,9,10,11,12,1,2];
const WEEK_KO = ['일','월','화','수','목','금','토'];
let salesCurrentMonth = 3;
let salesCurrentYear = 2026;

function salesKey(year, month) { return `sales_${year}_${month}`; }
function loadSales(year, month) {
  try { return JSON.parse(localStorage.getItem('ws5_' + salesKey(year, month)) || '{}'); } catch { return {}; }
}
function saveSales(year, month, data) {
  const k = salesKey(year, month);
  localStorage.setItem('ws5_' + k, JSON.stringify(data));
  fetch(FB_URL + '/' + k + '.json', {
    method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
  }).catch(e => console.log('sales save err', e));
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

// 숫자 → 콤마 표시, 콤마 → 숫자
function fmtNum(v) { return v ? Number(v).toLocaleString() : ''; }
function parseNum(s) { return Number(String(s).replace(/,/g, '')) || 0; }

// 포커스 시 숫자만, 블러 시 콤마 포맷
function salesInpFocus(el) {
  const raw = el.dataset.raw || '';
  el.value = raw;
  el.style.borderColor = '#3dbb8f';
  el.style.background = '#f0fff8';
}
function salesInpBlur(el, year, month, day, field) {
  const raw = String(el.value).replace(/,/g, '');
  const num = raw === '' ? '' : Number(raw);
  el.dataset.raw = raw;
  el.value = raw === '' ? '' : Number(raw).toLocaleString();
  el.style.borderColor = '#d0f0e0';
  el.style.background = 'transparent';
  // 저장
  const data = loadSales(year, month);
  const key = `d${day}`;
  if (!data[key]) data[key] = {};
  data[key][field] = num;
  saveSales(year, month, data);
  // 해당 행 총매출 + 요약만 갱신
  updateSalesRowTotal(year, month, day, data);
  updateSalesSummary(year, month);
}

function updateSalesRowTotal(year, month, day, data) {
  const r = (data || loadSales(year, month))[`d${day}`] || {};
  const coupangTotal = parseNum(r.gross) + parseNum(r.seller);
  const total = coupangTotal + parseNum(r.naver);
  const adTotal = parseNum(r.coupangAd) + parseNum(r.naverSearch) + parseNum(r.naverAi);
  const cCell = document.getElementById(`sales-ctotal-${day}`);
  const tCell = document.getElementById(`sales-total-${day}`);
  const aCell = document.getElementById(`sales-adtotal-${day}`);
  if (cCell) cCell.textContent = coupangTotal > 0 ? coupangTotal.toLocaleString() : '-';
  if (tCell) tCell.textContent = total > 0 ? total.toLocaleString() : '-';
  if (aCell) aCell.textContent = adTotal > 0 ? adTotal.toLocaleString() : '-';
}

function updateSalesSummary(year, month) {
  const data = loadSales(year, month);
  const days = getDaysInMonth(year, month);
  let tg=0, ts=0, tca=0, tn=0, tns=0, tna=0;
  for (let d=1; d<=days; d++) {
    const r = data[`d${d}`] || {};
    tg  += parseNum(r.gross);
    ts  += parseNum(r.seller);
    tca += parseNum(r.coupangAd);
    tn  += parseNum(r.naver);
    tns += parseNum(r.naverSearch);
    tna += parseNum(r.naverAi);
  }
  const tc = tg + ts;
  const summary = document.getElementById('sales-summary');
  if (!summary) return;
  const cards = [
    { label:'쿠팡 그로스',     val: tg,       color:'#3dbb8f', bg:'#f0fff8' },
    { label:'쿠팡 판매자배송', val: ts,       color:'#3dbb8f', bg:'#f0fff8' },
    { label:'쿠팡 총매출',     val: tc,       color:'#2a9a6a', bg:'#e8fff4' },
    { label:'쿠팡 광고비',     val: tca,      color:'#e03c6e', bg:'#fff0f5' },
    { label:'네이버 총매출',   val: tn,       color:'#3dbb8f', bg:'#f0fff8' },
    { label:'검색광고',        val: tns,      color:'#e8648a', bg:'#fff0f5' },
    { label:'AI광고',          val: tna,      color:'#e8648a', bg:'#fff0f5' },
    { label:'전체 총광고비',   val: tca+tns+tna, color:'#e03c6e', bg:'#fff0f5' },
    { label:'전체 총매출',     val: tc+tn,    color:'#8b60d0', bg:'#f8f4ff' },
  ];
  summary.style.gridTemplateColumns = 'repeat(3,1fr)';
  summary.innerHTML = cards.map(c => `
    <div style="background:${c.bg};border:1.5px solid ${c.color}30;border-radius:12px;padding:12px 14px">
      <div style="font-size:.75rem;color:#888;margin-bottom:4px">${c.label}</div>
      <div style="font-size:1rem;font-weight:800;color:${c.color}">${c.val.toLocaleString()}원</div>
    </div>`).join('');
  const sr = document.getElementById('sales-sum-row');
  if (sr) {
    sr.cells[1].textContent = tg.toLocaleString();
    sr.cells[2].textContent = ts.toLocaleString();
    sr.cells[3].textContent = tc.toLocaleString();
    sr.cells[4].textContent = tca.toLocaleString();
    sr.cells[5].textContent = tn.toLocaleString();
    sr.cells[6].textContent = tns.toLocaleString();
    sr.cells[7].textContent = tna.toLocaleString();
    sr.cells[8].textContent = (tc+tn).toLocaleString();
    sr.cells[9].textContent = (tca+tns+tna).toLocaleString();
  }
}

function clearSalesRow(year, month, day, tdEl) {
  const data = loadSales(year, month);
  const key = `d${day}`;
  if (!data[key] || Object.values(data[key]).every(v => v === '' || v === 0 || !v)) return;
  if (!confirm(`${month}/${day} 입력값을 모두 삭제할까요?`)) return;
  data[key] = {};
  saveSales(year, month, data);
  // 해당 행 input 초기화
  const tr = tdEl.closest('tr');
  tr.querySelectorAll('input').forEach(inp => { inp.value = ''; inp.dataset.raw = ''; });
  updateSalesRowTotal(year, month, day, data);
  updateSalesSummary(year, month);
  toast(`🗑️ ${month}/${day} 데이터 삭제했어요`);
}

function renderSalesMonthTabs() {
  const el = document.getElementById('sales-month-tabs');
  if (!el) return;
  el.innerHTML = SALES_MONTHS.map((m, i) => {
    const mn = SALES_MONTH_NUMS[i];
    const yr = mn >= 3 ? 2026 : 2027;
    const active = (mn === salesCurrentMonth && yr === salesCurrentYear);
    return `<button onclick="switchSalesMonth(${yr},${mn})" style="padding:7px 16px;border-radius:20px;border:1.5px solid ${active?'#3dbb8f':'#d0f0e0'};background:${active?'#3dbb8f':'#fff'};color:${active?'#fff':'#3a7a4a'};font-size:.85rem;font-weight:${active?700:500};cursor:pointer;transition:all .15s">${yr}년 ${m}</button>`;
  }).join('');
}

function switchSalesMonth(year, month) {
  salesCurrentYear = year;
  salesCurrentMonth = month;
  renderSalesMonthTabs();
  renderSalesTable();
}

function renderSalesTable() {
  const tbody = document.getElementById('sales-tbody');
  if (!tbody) return;  // 매출 탭 아닐 때 스킵

  const year = salesCurrentYear;
  const month = salesCurrentMonth;
  const days = getDaysInMonth(year, month);
  const data = loadSales(year, month);

  const INP_STYLE = `border:1px solid #d0f0e0;border-radius:7px;padding:5px 6px;font-size:.8rem;text-align:right;background:transparent;outline:none;color:#2a7a4a;width:88px;font-family:inherit`;

  const mkInp = (year, month, d, field, val) => {
    const fmt = val ? Number(val).toLocaleString() : '';
    return `<input type="text" inputmode="numeric"
      data-raw="${val||''}"
      value="${fmt}"
      style="${INP_STYLE}"
      onfocus="salesInpFocus(this)"
      onblur="salesInpBlur(this,${year},${month},${d},'${field}')"
      onkeydown="if(event.key==='Enter')this.blur()">`;
  };

  let rows = '';
  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month - 1, d);
    const dow = WEEK_KO[date.getDay()];
    const isSun = date.getDay() === 0;
    const isSat = date.getDay() === 6;
    const rowColor = isSun ? '#fff5f5' : isSat ? '#f5f0ff' : (d % 2 === 0 ? '#f8fffe' : '#fff');
    const textColor = isSun ? '#e03c6e' : isSat ? '#8060d0' : '#333';
    const r = data[`d${d}`] || {};
    const coupangTotal = parseNum(r.gross) + parseNum(r.seller);
    const total = coupangTotal + parseNum(r.naver);

    rows += `<tr style="background:${rowColor}">
      <td ondblclick="clearSalesRow(${year},${month},${d},this)" style="padding:6px 10px;text-align:center;color:${textColor};font-weight:600;white-space:nowrap;cursor:pointer;user-select:none" title="두번 클릭하면 이 줄 초기화">${month}/${d}</td>
      <td style="padding:6px 8px;text-align:center;color:${textColor};font-weight:700">${dow}</td>
      <td style="padding:4px 5px;text-align:center;background:${rowColor === '#fff' ? '#fafffe' : ''}">${mkInp(year,month,d,'gross',r.gross)}</td>
      <td style="padding:4px 5px;text-align:center;background:${rowColor === '#fff' ? '#fafffe' : ''}">${mkInp(year,month,d,'seller',r.seller)}</td>
      <td id="sales-ctotal-${d}" style="padding:6px 8px;text-align:right;font-weight:700;color:#2a9a6a;white-space:nowrap;background:#f0fff8">${coupangTotal > 0 ? coupangTotal.toLocaleString() : '-'}</td>
      <td style="padding:4px 5px;text-align:center">${mkInp(year,month,d,'coupangAd',r.coupangAd)}</td>
      <td style="padding:4px 5px;text-align:center">${mkInp(year,month,d,'naver',r.naver)}</td>
      <td style="padding:4px 5px;text-align:center">${mkInp(year,month,d,'naverSearch',r.naverSearch)}</td>
      <td style="padding:4px 5px;text-align:center">${mkInp(year,month,d,'naverAi',r.naverAi)}</td>
      <td id="sales-total-${d}" style="padding:6px 10px;text-align:right;font-weight:800;color:#8b60d0;white-space:nowrap">${total > 0 ? total.toLocaleString() : '-'}</td>
      <td id="sales-adtotal-${d}" style="padding:6px 10px;text-align:right;font-weight:700;color:#e03c6e;white-space:nowrap">${(parseNum(r.coupangAd)+parseNum(r.naverSearch)+parseNum(r.naverAi)) > 0 ? (parseNum(r.coupangAd)+parseNum(r.naverSearch)+parseNum(r.naverAi)).toLocaleString() : '-'}</td>
    </tr>`;
  }

  // 합계 행
  rows += `<tr id="sales-sum-row" style="background:linear-gradient(135deg,#e0f8ee,#d0f4e0);font-weight:800">
    <td colspan="2" style="padding:10px;text-align:center;color:#2a7a4a">합계</td>
    <td style="padding:10px;text-align:right;color:#2a7a4a">-</td>
    <td style="padding:10px;text-align:right;color:#2a7a4a">-</td>
    <td style="padding:10px;text-align:right;color:#2a9a6a">-</td>
    <td style="padding:10px;text-align:right;color:#e03c6e">-</td>
    <td style="padding:10px;text-align:right;color:#2a7a4a">-</td>
    <td style="padding:10px;text-align:right;color:#e03c6e">-</td>
    <td style="padding:10px;text-align:right;color:#e03c6e">-</td>
    <td style="padding:10px;text-align:right;color:#8b60d0">-</td>
    <td style="padding:10px;text-align:right;color:#e03c6e">-</td>
  </tr>`;

  tbody.innerHTML = rows;
  updateSalesSummary(year, month);
}

function renderSales() {
  renderSalesMonthTabs();
  renderSalesTable();
}

// ── 퀵 바로가기 FAB ──
function renderFabIcons() {
  const sc1 = load('shortcuts');
  const sc2 = load('shortcuts2');
  const el1 = document.getElementById('fab-icons-1');
  const el2 = document.getElementById('fab-icons-2');
  const mkIcon = d => `<a href="${d.href}" target="_blank" onclick="closeFabMenu()" style="
    display:flex;flex-direction:column;align-items:center;gap:3px;text-decoration:none;
    width:52px">
    <div style="width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;
      font-size:1.4rem;background:linear-gradient(135deg,#ffe0ee,#ffc0d8);
      box-shadow:0 2px 6px rgba(232,100,138,.2)">${d.emoji}</div>
    <div style="font-size:.62rem;color:#888;text-align:center;line-height:1.2;word-break:keep-all;max-width:52px">${d.label}</div>
  </a>`;
  if (el1) el1.innerHTML = sc1 && sc1.length ? sc1.map(mkIcon).join('') : '';
  if (el2) el2.innerHTML = sc2 && sc2.length ? sc2.map(mkIcon).join('') : '';
  // 바로가기 없으면 FAB 숨김
  const hasAny = (sc1 && sc1.length) || (sc2 && sc2.length);
  const btn = document.getElementById('fab-btn');
  if (btn) btn.style.display = hasAny ? 'flex' : 'none';
  // PC뷰에서는 숨기기
  updateFabVisibility();
}

function updateFabVisibility() {
  const btn = document.getElementById('fab-btn');
  if (!btn) return;
  const sc1 = load('shortcuts');
  const sc2 = load('shortcuts2');
  const hasAny = (sc1 && sc1.length) || (sc2 && sc2.length);
  const isHome = document.getElementById('home-tab')?.classList.contains('active')
    || document.querySelector('.tab.active')?.getAttribute('onclick')?.includes('home');
  // 홈탭이면 숨기기 (이미 홈에 있으니까), 바로가기 없으면 숨기기
  btn.style.display = (!hasAny) ? 'none' : 'flex';
  btn.style.alignItems = 'center';
  btn.style.justifyContent = 'center';
}

function toggleFabMenu() {
  const popup = document.getElementById('fab-popup');
  const overlay = document.getElementById('fab-overlay');
  const btn = document.getElementById('fab-btn');
  const isOpen = popup.style.display !== 'none';
  if (isOpen) {
    closeFabMenu();
  } else {
    renderFabIcons();
    // 버튼 위치 기준으로 팝업 위치 계산
    const rect = btn.getBoundingClientRect();
    popup.style.top = (rect.bottom + 8) + 'px';
    popup.style.right = (window.innerWidth - rect.right) + 'px';
    popup.style.display = 'block';
    overlay.style.display = 'block';
    btn.style.background = 'linear-gradient(135deg,var(--pink-dark),var(--rose))';
    btn.style.color = 'white';
  }
}

function closeFabMenu() {
  document.getElementById('fab-popup').style.display = 'none';
  document.getElementById('fab-overlay').style.display = 'none';
  const btn = document.getElementById('fab-btn');
  btn.style.background = '';
  btn.style.color = '';
}

// ── 초기 렌더 (모든 함수 정의 후 실행) ──
['boss','basic','design'].forEach(renderFlow);
renderWeek();
Object.keys(renderCfg).forEach(rerender);
renderOrder();
renderRecipe();
TAX_KEYS.forEach(renderTaxList);
renderTaxMemoList();
renderExp();
renderFridgeMemo();
renderSales();
(function(){ const sc=load('shortcuts'); if(sc&&sc.length) renderShortcuts(sc); })();
(function(){ const sc2=load('shortcuts2'); if(sc2&&sc2.length) renderShortcuts2(sc2); })();
renderFabIcons();

// 페이지 로드 시 Firebase 자동 동기화
syncFromSheet();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(() => {
    console.log('✅ SW 등록됨');
  }).catch(e => console.log('SW 오류:', e));
}



// ────────────────────────────────
// 페이지 초기화 (각 HTML에서 호출)
// ────────────────────────────────
function initPage(pageId) {
  // 탭 active
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const fileMap = {home:'index', menu1:'shop', menu2:'house', menu4:'jinwoo', menu5:'invest', menu3:'recipe'};
  const at = document.querySelector(`.tab[href*="${fileMap[pageId]}"]`);
  if (at) at.classList.add('active');

  // page div active (콘텐츠 표시)
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById(pageId);
  if (pg) pg.classList.add('active');

  // gnav active
  document.querySelectorAll('.gnav-main').forEach(g => g.classList.remove('active'));
  const ag = document.getElementById('gnav-' + pageId);
  if (ag) ag.classList.add('active');

  // gnav subs — open 클래스로 토글
  document.querySelectorAll('.gnav-subs').forEach(s => s.classList.remove('open'));
  const subs = document.getElementById('gnav-subs-' + pageId);
  if (subs) subs.classList.add('open');

  // 뷰모드 복원
  const vm = localStorage.getItem('ws5_viewmode') || 'pc';
  setView(vm, true);
  // gnav 접힘 복원
  const collapsed = localStorage.getItem('ws5_gnavcollapsed') === 'true';
  if (collapsed) collapseGnav(true);
  // 날짜
  updateDate();
  setInterval(updateDate, 60000);
  // 데이터 렌더
  initRender(pageId);
  // Firebase sync
  syncFromSheet();
}

function initRender(pageId) {
  if (pageId === 'home') {
    ['boss','basic','design'].forEach(renderFlow);
    renderWeek();
    Object.keys(renderCfg).forEach(rerender);
    renderOrder();
    renderExp && renderExp();
    renderFridgeMemo && renderFridgeMemo();
    (function(){ const sc=load('shortcuts'); if(sc&&sc.length) renderShortcuts(sc); })();
    (function(){ const sc2=load('shortcuts2'); if(sc2&&sc2.length) renderShortcuts2(sc2); })();
    renderFabIcons && renderFabIcons();
  } else if (pageId === 'menu1') {
    TAX_KEYS.forEach(renderTaxList);
    renderTaxMemoList();
    renderSales && renderSales();
    renderFabIcons && renderFabIcons();
  } else if (pageId === 'menu2') {
    renderExp && renderExp();
    renderFridgeMemo && renderFridgeMemo();
    renderFabIcons && renderFabIcons();
  } else if (pageId === 'menu3') {
    renderRecipe && renderRecipe();
    renderFabIcons && renderFabIcons();
  } else {
    renderFabIcons && renderFabIcons();
  }
}
