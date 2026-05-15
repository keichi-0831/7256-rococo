// app.js — 主逻辑

// ══ 常量 ══════════════════════════════════════════════════════
const ELEMENTS  = ['土','火','冰','幽','武','水','萌','恶','光','翼','机械','龙','幻','草','电','毒','虫','普通'];
const LOCATIONS = ['风眠省', '洛克里安'];

// ══ 全局状态 ══════════════════════════════════════════════════
const S = {
  user:               null,
  firstRun:           false,
  seasons:            [],
  sanctuaries:        [],
  spirits:            [],   // 全局精灵库
  users:              [],
  currentSeasonId:    null,
  sancStatuses:       [],
  sancFruits:         [],
  userFruits:         [],
  sancRatings:        [],
  showFruitFirst:     false,
  sortByRating:       false,
  collapsedLocations: new Set(),
  expandedComments:   new Set(),
  fruitFilter:        { elements: new Set(), mode: 'union' },
};

// 管理精灵弹窗当前系别筛选（跨 _renderSpiritsList 重绘保持状态）
let _spiritsListFilter = '';

// ══ 工具函数 ══════════════════════════════════════════════════
function el(id)  { return document.getElementById(id); }
function qs(sel) { return document.querySelector(sel); }

function spiritColor(name) {
  let h = 0;
  for (const c of name) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(h) % 360}, 60%, 48%)`;
}

function fmtDate(str) {
  const d = new Date(str + 'T00:00:00');
  return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
}

function daysUntil(str) {
  const now = new Date(); now.setHours(0,0,0,0);
  const end = new Date(str + 'T00:00:00');
  return Math.ceil((end - now) / 86400000);
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
}

function curSeason() { return S.seasons.find(s => s.id === S.currentSeasonId); }

// 从 seasons.spirits 的元素（可能是旧的字符串或 {name,element} 对象）取出精灵名
function sName(s) { return typeof s === 'string' ? s : (s?.name || ''); }

// 从全局精灵库查元素系别（返回逗号分隔字符串，如 "火" 或 "火,水"）
function sElement(name) { return S.spirits.find(sp => sp.name === name)?.element || ''; }

// 返回系别数组（最多2个），方便遍历显示
function sElements(name) {
  const e = sElement(name);
  return e ? e.split(',').filter(Boolean) : [];
}

// ══ 精灵勾选清单（用于赛季编辑） ══════════════════════════════
// container: DOM 元素；selectedNames: Set<string>（持久化）
function buildSpiritChecklist(container, selectedNames) {
  let filterElem = '';

  function render() {
    if (!S.spirits.length) {
      container.innerHTML = '<p style="color:var(--text-lt);font-size:12px;padding:8px 0">精灵库为空，请先到「管理精灵」中添加精灵~</p>';
      return;
    }

    const usedElems = [...new Set(S.spirits.flatMap(s => s.element ? s.element.split(',') : []))];
    const visible   = filterElem ? S.spirits.filter(s => (s.element || '').split(',').includes(filterElem)) : S.spirits;

    container.innerHTML = `
      <div class="sc-stats">已选 <b class="sc-count">${selectedNames.size}</b> 个精灵</div>
      <div class="element-filter sc-filter">
        <button type="button" class="elem-btn${!filterElem?' active':''}" data-elem="">全部</button>
        ${ELEMENTS.filter(e => usedElems.includes(e)).map(e =>
          `<button type="button" class="elem-btn${filterElem===e?' active':''}" data-elem="${e}">${e}</button>`
        ).join('')}
      </div>
      <div class="spirit-checklist-items">
        ${visible.length
          ? visible.map(sp => `
              <label class="spirit-check-item">
                <input type="checkbox" class="sp-chk" value="${sp.name}" ${selectedNames.has(sp.name)?'checked':''}>
                <span class="sc-name">${sp.name}</span>
                ${(sp.element||'').split(',').filter(Boolean).map(e=>`<span class="elem-badge">${e}</span>`).join('')}
              </label>`).join('')
          : '<p style="color:var(--text-lt);font-size:12px;padding:8px 0">暂无该系别精灵</p>'
        }
      </div>`;

    container.querySelectorAll('.sc-filter .elem-btn').forEach(btn => {
      btn.onclick = () => { filterElem = btn.dataset.elem; render(); };
    });

    container.querySelectorAll('.sp-chk').forEach(chk => {
      chk.onchange = () => {
        if (chk.checked) selectedNames.add(chk.value);
        else selectedNames.delete(chk.value);
        const cnt = container.querySelector('.sc-count');
        if (cnt) cnt.textContent = selectedNames.size;
      };
    });
  }

  render();
}

// ══ 弹窗系统 ══════════════════════════════════════════════════
function showModal(html) {
  el('modal-body').innerHTML = html;
  el('modal').classList.remove('hidden');
}

function closeModal() {
  el('modal').classList.add('hidden');
  el('modal-body').innerHTML = '';
}

// ══ 小地图弹窗 ════════════════════════════════════════════════
function showMapPopup(url, name) {
  el('map-popup-name').textContent = '📍 ' + name;
  el('map-popup-img').src = url;
  el('map-popup').classList.remove('hidden');
}

function closeMapPopup() {
  el('map-popup').classList.add('hidden');
  el('map-popup-img').src = '';
}

// ══ 数据加载 ══════════════════════════════════════════════════
async function loadAll() {
  [S.seasons, S.sanctuaries, S.spirits, S.users, S.sancStatuses, S.sancRatings] = await Promise.all([
    API.getSeasons(), API.getSanctuaries(), API.getSpirits(),
    API.getAllUsers(), API.getUserSanctuaryStatuses(),
    API.getSanctuaryRatings()
  ]);
  if (!S.currentSeasonId && S.seasons.length) {
    const today = new Date().toISOString().slice(0, 10);
    const active = S.seasons.find(s => s.start_date <= today && s.end_date >= today);
    S.currentSeasonId = (active || S.seasons[0]).id;
  }
  await loadSeasonData();
}

async function loadSeasonData() {
  if (!S.currentSeasonId) { S.sancFruits = []; S.userFruits = []; return; }
  [S.sancFruits, S.userFruits] = await Promise.all([
    API.getSanctuaryFruits(S.currentSeasonId),
    API.getUserFruits(S.currentSeasonId)
  ]);
}

// ══ 防抖式后台同步（操作后 30s 重新拉取全量数据） ═══════════════
let _refreshTimer = null;
function scheduleRefresh() {
  clearTimeout(_refreshTimer);
  _refreshTimer = setTimeout(async () => {
    await loadAll();
    renderAll();
  }, 30000);
}

// ══ 渲染入口 ══════════════════════════════════════════════════
function renderAll() {
  renderHeader();
  renderSeasonTabs();
  renderCard1();
  renderCard2();
}

// ══ 页头 ══════════════════════════════════════════════════════
function renderHeader() {
  el('hdr-uid').textContent = (S.user.role === 'admin' ? '🛡️ ' : '👤 ') + S.user.id;
  el('hdr-date').textContent = todayStr();
  const s = curSeason();
  if (s) {
    el('hdr-season').textContent = s.name;
    const d = daysUntil(s.end_date);
    el('hdr-days').textContent = d >= 0 ? `还剩 ${d} 天` : '赛季已结束';
  } else {
    el('hdr-season').textContent = '暂无赛季';
    el('hdr-days').textContent = '';
  }
}

// ══ 赛季切换标签 ══════════════════════════════════════════════
function renderSeasonTabs() {
  const c = el('season-tabs');
  c.innerHTML = '';
  if (!S.seasons.length) {
    el('no-season-tip').classList.remove('hidden');
    return;
  }
  el('no-season-tip').classList.add('hidden');
  S.seasons.forEach(s => {
    const b = document.createElement('button');
    b.className = 'season-tab' + (s.id === S.currentSeasonId ? ' active' : '');
    b.textContent = s.name;
    b.onclick = async () => {
      S.currentSeasonId = s.id;
      await loadSeasonData();
      renderAll();
    };
    c.appendChild(b);
  });
}

// ══ 卡片1：庇护所（按所处地分组，可收起） ════════════════════
function renderCard1() {
  const c = el('sanc-list');
  if (!S.sanctuaries.length) {
    c.innerHTML = '<p class="empty-msg">🏕️ 暂无庇护所，管理员请点上方「管理庇护所」添加</p>';
    return;
  }
  const spirits = curSeason()?.spirits || [];
  c.innerHTML = '';

  let displaySancs = [...S.sanctuaries];
  if (S.showFruitFirst || S.sortByRating) {
    const ratingScore = sanc => {
      const rs = S.sancRatings.filter(r => r.sanctuary_id === sanc.id);
      if (!rs.length) return -1;
      const grn = rs.filter(r => r.rating === 2).length;
      const red = rs.filter(r => r.rating === 0).length;
      return grn - red;
    };
    displaySancs.sort((a, b) => {
      if (S.showFruitFirst) {
        const aHas = S.sancFruits.some(f => f.sanctuary_id === a.id) ? 1 : 0;
        const bHas = S.sancFruits.some(f => f.sanctuary_id === b.id) ? 1 : 0;
        if (bHas !== aHas) return bHas - aHas;
      }
      if (S.sortByRating) return ratingScore(b) - ratingScore(a);
      return 0;
    });
  }

  const locOrder = [...new Set(displaySancs.map(s => s.location || '未分类'))];

  locOrder.forEach(loc => {
    const locSancs = displaySancs.filter(s => (s.location || '未分类') === loc);
    const isCollapsed = S.collapsedLocations.has(loc);

    const group = document.createElement('div');
    group.className = 'location-group';

    const groupHdr = document.createElement('div');
    groupHdr.className = 'location-group-header';
    groupHdr.innerHTML = `
      <span class="location-name">📍 ${loc}</span>
      <span class="location-count">${locSancs.length} 个庇护所</span>
      <span class="location-toggle">${isCollapsed ? '▶ 展开' : '▼ 收起'}</span>`;
    groupHdr.onclick = () => {
      if (S.collapsedLocations.has(loc)) S.collapsedLocations.delete(loc);
      else S.collapsedLocations.add(loc);
      renderCard1();
    };
    group.appendChild(groupHdr);

    if (!isCollapsed) {
      const groupBody = document.createElement('div');
      groupBody.className = 'location-group-body';

      locSancs.forEach(sanc => {
        const openIds    = S.sancStatuses.filter(s => s.sanctuary_id === sanc.id && s.is_open).map(s => s.user_id);
        const placements = S.sancFruits.filter(f => f.sanctuary_id === sanc.id);
        const allIds     = [...new Set([...openIds, ...placements.map(p => p.user_id)])];
        const myStatus   = S.sancStatuses.find(s => s.sanctuary_id === sanc.id && s.user_id === S.user.id);
        const isOpen     = myStatus?.is_open || false;

        const ratings = S.sancRatings.filter(r => r.sanctuary_id === sanc.id);
        const redCnt  = ratings.filter(r => r.rating === 0).length;
        const yelCnt  = ratings.filter(r => r.rating === 1).length;
        const grnCnt  = ratings.filter(r => r.rating === 2).length;

        const item = document.createElement('div');
        item.className = 'sanc-item';
        const bgCls = getRatingBgClass(redCnt, yelCnt, grnCnt);
        if (bgCls) item.classList.add(bgCls);

        const hdr = document.createElement('div');
        hdr.className = 'sanc-header';
        hdr.innerHTML = `
          <span class="sanc-name">🏕️ ${sanc.name}</span>
          <span class="sanc-meta">${openIds.length} 人已开启 · 每人最多 ${sanc.max_fruits} 个果实</span>`;
        if (sanc.map_image_url) {
          const mapBtn = document.createElement('button');
          mapBtn.className = 'map-view-btn';
          mapBtn.textContent = '查看位置';
          mapBtn.onclick = e => { e.stopPropagation(); showMapPopup(sanc.map_image_url, sanc.name); };
          hdr.appendChild(mapBtn);
        }
        item.appendChild(hdr);

        const body = document.createElement('div');
        body.className = 'sanc-body';
        body.appendChild(buildMyRow(sanc, isOpen, spirits));

        allIds.filter(uid => uid !== S.user.id).forEach(uid => {
          body.appendChild(buildOtherRow(uid, openIds.includes(uid), placements.filter(p => p.user_id === uid)));
        });

        body.appendChild(buildRatingBar(sanc, ratings, redCnt, yelCnt, grnCnt));
        item.appendChild(body);
        groupBody.appendChild(item);
      });

      group.appendChild(groupBody);
    }

    c.appendChild(group);
  });
}

function buildMyRow(sanc, isOpen, spirits) {
  const row = document.createElement('div');
  row.className = 'user-row';

  const idDiv = document.createElement('div');
  idDiv.className = 'user-row-id';
  idDiv.textContent = S.user.id;
  row.appendChild(idDiv);

  const content = document.createElement('div');
  content.className = 'row-content';

  const toggleBtn = document.createElement('button');
  toggleBtn.className = `toggle-btn ${isOpen ? 'btn-open' : 'btn-closed'}`;
  toggleBtn.textContent = isOpen ? '✅ 已开启' : '○ 未开启（点此开启）';
  toggleBtn.onclick = () => {
    const newOpen = !isOpen;
    const rec = S.sancStatuses.find(s => s.sanctuary_id === sanc.id && s.user_id === S.user.id);
    if (rec) rec.is_open = newOpen;
    else S.sancStatuses.push({ user_id: S.user.id, sanctuary_id: sanc.id, is_open: newOpen });
    renderCard1();
    API.upsertSanctuaryStatus(S.user.id, sanc.id, newOpen).catch(e => alert('同步失败：' + e.message));
    scheduleRefresh();
  };
  content.appendChild(toggleBtn);

  const myPlacements = S.sancFruits.filter(f => f.sanctuary_id === sanc.id && f.user_id === S.user.id);
  const slots = document.createElement('div');
  slots.className = 'slots';

  for (let slot = 1; slot <= sanc.max_fruits; slot++) {
    const p = myPlacements.find(x => x.slot === slot);
    if (p) {
      const tag = document.createElement('div');
      tag.className = 'spirit-tag mine';
      tag.style.background = spiritColor(p.spirit_name);
      tag.innerHTML = `${p.spirit_name}<span class="tag-user">${S.user.id}</span>`;
      tag.title = '点击修改或清除';
      tag.onclick = () => openSpiritPicker(sanc, slot, spirits, p.spirit_name);
      slots.appendChild(tag);
    } else {
      const empty = document.createElement('div');
      empty.className = 'slot-empty';
      empty.textContent = `+ 槽位${slot}`;
      empty.onclick = () => openSpiritPicker(sanc, slot, spirits, null);
      slots.appendChild(empty);
    }
  }
  content.appendChild(slots);
  row.appendChild(content);
  return row;
}

function buildOtherRow(uid, isOpen, placements) {
  const row = document.createElement('div');
  row.className = 'user-row';

  const idDiv = document.createElement('div');
  idDiv.className = 'user-row-id';
  idDiv.textContent = uid;
  row.appendChild(idDiv);

  const content = document.createElement('div');
  content.className = 'row-content';
  const badge = document.createElement('span');
  badge.className = isOpen ? 'badge-open' : 'badge-closed';
  badge.textContent = isOpen ? '已开启' : '未开启';
  content.appendChild(badge);

  if (placements.length) {
    const slots = document.createElement('div');
    slots.className = 'slots';
    placements.forEach(p => {
      const tag = document.createElement('div');
      tag.className = 'spirit-tag';
      tag.style.background = spiritColor(p.spirit_name);
      tag.innerHTML = `${p.spirit_name}<span class="tag-user">${uid}</span>`;
      slots.appendChild(tag);
    });
    content.appendChild(slots);
  }

  row.appendChild(content);
  return row;
}

// ══ 评价辅助 ══════════════════════════════════════════════════

function getRatingBgClass(red, yel, grn) {
  if (!red && !yel && !grn) return null;
  if (grn > red && grn > yel) return 'sanc-rated-good';
  if (red > grn && red > yel) return 'sanc-rated-bad';
  if (yel > 0)                return 'sanc-rated-ok';
  return null;
}

function getRatingLabel(red, yel, grn) {
  const total = red + yel + grn;
  if (!total) return null;
  const score = (grn - red) / total;
  if (score >=  0.65) return { text: '好评如潮', color: '#27ae60' };
  if (score >=  0.35) return { text: '特别好评', color: '#52be80' };
  if (score >=  0.1)  return { text: '多半好评', color: '#7dcea0' };
  if (score >  -0.1)  return { text: '褒贬不一', color: '#c4a200' };
  if (score >  -0.35) return { text: '多半差评', color: '#e59866' };
  if (score >  -0.65) return { text: '多半差评', color: '#cb4335' };
  return                     { text: '差评如潮', color: '#e74c3c' };
}

function buildRatingBar(sanc, ratings, redCnt, yelCnt, grnCnt) {
  const myRating = ratings.find(r => r.user_id === S.user.id);
  const CFGS = [
    { value: 0, label: '不要来',   emoji: '🔴', cls: 'rating-bad',  count: redCnt },
    { value: 1, label: '凑和吧',   emoji: '🟡', cls: 'rating-ok',   count: yelCnt },
    { value: 2, label: '风水宝地', emoji: '🟢', cls: 'rating-good', count: grnCnt },
  ];

  const wrapper = document.createElement('div');
  wrapper.className = 'rating-wrapper';

  // ── 评分栏 ──
  const bar = document.createElement('div');
  bar.className = 'rating-bar';

  CFGS.forEach(cfg => {
    const isActive = myRating?.rating === cfg.value;
    const btn = document.createElement('button');
    btn.className = `rating-btn ${cfg.cls}${isActive ? ' active' : ''}`;
    btn.innerHTML = `${cfg.emoji} ${cfg.label}${cfg.count ? ` <b>${cfg.count}</b>` : ''}`;
    btn.title = isActive ? '再次点击可取消评价' : '';
    btn.onclick = () => {
      const existingComment = myRating?.comment || '';
      if (isActive) {
        S.sancRatings = S.sancRatings.filter(r => !(r.user_id === S.user.id && r.sanctuary_id === sanc.id));
        API.deleteSanctuaryRating(S.user.id, sanc.id).catch(e => alert('同步失败：' + e.message));
      } else {
        const rec = S.sancRatings.find(r => r.user_id === S.user.id && r.sanctuary_id === sanc.id);
        if (rec) rec.rating = cfg.value;
        else S.sancRatings.push({ user_id: S.user.id, sanctuary_id: sanc.id, rating: cfg.value, comment: existingComment });
        API.upsertSanctuaryRating(S.user.id, sanc.id, cfg.value, existingComment).catch(e => alert('同步失败：' + e.message));
      }
      renderCard1();
      scheduleRefresh();
    };
    bar.appendChild(btn);
  });

  const label = getRatingLabel(redCnt, yelCnt, grnCnt);
  if (label) {
    const span = document.createElement('span');
    span.className = 'rating-label';
    span.style.color = label.color;
    span.textContent = '· ' + label.text;
    bar.appendChild(span);
  }

  // ── 评论切换按钮 ──
  const commentedRatings = ratings.filter(r => r.comment && r.comment.trim());
  const isExpanded = S.expandedComments.has(sanc.id);
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'comment-toggle-btn';
  toggleBtn.textContent = `${isExpanded ? '▲' : '▼'} 评论(${commentedRatings.length}条)`;
  bar.appendChild(toggleBtn);
  wrapper.appendChild(bar);

  // ── 评论区 ──
  const section = document.createElement('div');
  section.className = 'comment-section' + (isExpanded ? '' : ' hidden');

  // 已有评论列表
  if (commentedRatings.length) {
    const list = document.createElement('div');
    list.className = 'comment-list';
    commentedRatings.forEach(r => {
      const cfg = CFGS.find(c => c.value === r.rating);
      const item = document.createElement('div');
      item.className = 'comment-item';
      const meta = document.createElement('span');
      meta.className = 'comment-meta';
      meta.textContent = `${cfg?.emoji || ''} ${r.user_id}`;
      const text = document.createElement('span');
      text.className = 'comment-text';
      text.textContent = r.comment;
      item.appendChild(meta);
      item.appendChild(text);
      list.appendChild(item);
    });
    section.appendChild(list);
  } else {
    const empty = document.createElement('p');
    empty.className = 'comment-empty';
    empty.textContent = '还没有评论，快来第一个说说吧~';
    section.appendChild(empty);
  }

  // 我的评论表单
  const myArea = document.createElement('div');
  myArea.className = 'my-comment-area';
  if (myRating) {
    const cfg = CFGS.find(c => c.value === myRating.rating);
    const lbl = document.createElement('div');
    lbl.className = 'my-comment-label';
    lbl.textContent = `${cfg?.emoji || ''} 我的评论：`;
    const ta = document.createElement('textarea');
    ta.className = 'my-comment-ta';
    ta.placeholder = '说说你打分的理由~（可选）';
    ta.rows = 2;
    ta.value = myRating.comment || '';
    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn btn-primary btn-sm';
    submitBtn.textContent = '提交';
    submitBtn.onclick = () => {
      const comment = ta.value.trim();
      const rec = S.sancRatings.find(r => r.user_id === S.user.id && r.sanctuary_id === sanc.id);
      if (rec) rec.comment = comment;
      renderCard1();
      API.upsertSanctuaryRating(S.user.id, sanc.id, myRating.rating, comment).catch(e => alert('同步失败：' + e.message));
      scheduleRefresh();
    };
    myArea.appendChild(lbl);
    myArea.appendChild(ta);
    myArea.appendChild(submitBtn);
  } else {
    const hint = document.createElement('p');
    hint.className = 'comment-no-rating';
    hint.textContent = '先给庇护所打个分，再来说说原因吧~';
    myArea.appendChild(hint);
  }
  section.appendChild(myArea);

  toggleBtn.onclick = () => {
    const wasExpanded = S.expandedComments.has(sanc.id);
    if (wasExpanded) S.expandedComments.delete(sanc.id);
    else S.expandedComments.add(sanc.id);
    section.classList.toggle('hidden', wasExpanded);
    toggleBtn.textContent = `${wasExpanded ? '▼' : '▲'} 评论(${commentedRatings.length}条)`;
  };

  wrapper.appendChild(section);
  return wrapper;
}

// ══ 卡片2：精灵果实 ══════════════════════════════════════════
function renderCard2() {
  const c = el('fruit-list');

  if (!S.spirits.length) {
    c.innerHTML = '<p class="empty-msg">🍎 精灵库为空，管理员请先到「管理精灵」中添加精灵~</p>';
    return;
  }

  const seasonSpiritNames = new Set((curSeason()?.spirits || []).map(sName).filter(Boolean));
  const ff = S.fruitFilter;

  // 系别筛选
  let displaySpirits = S.spirits;
  if (ff.elements.size > 0) {
    const sel = [...ff.elements];
    displaySpirits = S.spirits.filter(sp => {
      const spElems = (sp.element || '').split(',').filter(Boolean);
      return ff.mode === 'union'
        ? sel.some(e => spElems.includes(e))
        : sel.every(e => spElems.includes(e));
    });
  }

  // 赛季精灵置顶
  displaySpirits = [
    ...displaySpirits.filter(sp =>  seasonSpiritNames.has(sp.name)),
    ...displaySpirits.filter(sp => !seasonSpiritNames.has(sp.name)),
  ];

  // 精灵库中实际出现的系别（保持 ELEMENTS 顺序）
  const allUsedElems = ELEMENTS.filter(e =>
    S.spirits.some(sp => (sp.element || '').split(',').includes(e))
  );

  const modeHtml = ff.elements.size >= 2 ? `
    <div class="filter-mode-toggle">
      <span class="filter-mode-label">多选：</span>
      <button type="button" class="mode-btn${ff.mode === 'union'        ? ' active' : ''}" data-mode="union">并集</button>
      <button type="button" class="mode-btn${ff.mode === 'intersection' ? ' active' : ''}" data-mode="intersection">交集</button>
    </div>` : '';

  c.innerHTML = `
    <div class="fruit-filter-bar">
      <div class="element-filter fruit-elem-wrap">
        <button type="button" class="elem-btn${ff.elements.size === 0 ? ' active' : ''}" data-action="clear-ef">全部</button>
        ${allUsedElems.map(e => `
          <button type="button" class="elem-btn${ff.elements.has(e) ? ' active' : ''}" data-elem="${e}">${e}</button>
        `).join('')}
      </div>
      ${modeHtml}
    </div>
    <div id="fruit-rows"></div>`;

  c.querySelector('[data-action="clear-ef"]').onclick = () => { ff.elements.clear(); renderCard2(); };
  c.querySelectorAll('.fruit-elem-wrap .elem-btn[data-elem]').forEach(btn => {
    btn.onclick = () => {
      const e = btn.dataset.elem;
      if (ff.elements.has(e)) ff.elements.delete(e); else ff.elements.add(e);
      renderCard2();
    };
  });
  c.querySelectorAll('.mode-btn').forEach(btn => {
    btn.onclick = () => { ff.mode = btn.dataset.mode; renderCard2(); };
  });

  const rowsEl = el('fruit-rows');
  if (!displaySpirits.length) {
    rowsEl.innerHTML = '<p class="empty-msg">没有符合筛选条件的精灵~</p>';
    return;
  }

  let prevWasSeason = null;
  displaySpirits.forEach((sp, i) => {
    const { name } = sp;
    const isSeason = seasonSpiritNames.has(name);
    const elems    = (sp.element || '').split(',').filter(Boolean);
    const holders  = S.userFruits.filter(f => f.spirit_name === name && f.obtained);
    const mine     = S.userFruits.find(f => f.spirit_name === name && f.user_id === S.user.id);
    const obtained = mine?.obtained || false;

    // 赛季组与普通组之间加分割线
    if (i > 0 && prevWasSeason && !isSeason) {
      const sep = document.createElement('div');
      sep.className = 'fruit-section-sep';
      rowsEl.appendChild(sep);
    }
    prevWasSeason = isSeason;

    const row = document.createElement('div');
    row.className = 'fruit-row' + (isSeason ? ' season-spirit' : '');

    const nameDiv = document.createElement('div');
    nameDiv.className = 'fruit-name';
    nameDiv.style.color = spiritColor(name);
    nameDiv.textContent = name;
    elems.forEach(e => {
      const badge = document.createElement('span');
      badge.className = 'elem-badge';
      badge.textContent = e;
      nameDiv.appendChild(badge);
    });
    if (isSeason) {
      const st = document.createElement('span');
      st.className = 'season-tag';
      st.textContent = '本季';
      nameDiv.appendChild(st);
    }
    row.appendChild(nameDiv);

    const holdersDiv = document.createElement('div');
    holdersDiv.className = 'fruit-holders';
    holders.forEach(h => {
      const tag = document.createElement('span');
      tag.className = `holder-tag${h.user_id === S.user.id ? ' holder-mine' : ''}`;
      tag.textContent = h.user_id;
      holdersDiv.appendChild(tag);
    });
    row.appendChild(holdersDiv);

    if (isSeason) {
      const btn = document.createElement('button');
      btn.className = `my-fruit-btn ${obtained ? 'fruit-yes' : 'fruit-no'}`;
      btn.textContent = obtained ? '✓ 已获取' : '+ 标记获取';
      btn.onclick = () => {
        const newObtained = !obtained;
        const rec = S.userFruits.find(f => f.spirit_name === name && f.user_id === S.user.id && f.season_id === S.currentSeasonId);
        if (rec) rec.obtained = newObtained;
        else S.userFruits.push({ user_id: S.user.id, season_id: S.currentSeasonId, spirit_name: name, obtained: newObtained });
        renderCard2();
        API.upsertUserFruit(S.user.id, S.currentSeasonId, name, newObtained).catch(e => alert('同步失败：' + e.message));
        scheduleRefresh();
      };
      row.appendChild(btn);
    }

    rowsEl.appendChild(row);
  });
}

// ══ 精灵选择弹窗（带系别筛选，全局精灵库，赛季精灵置顶闪光） ═══
function openSpiritPicker(sanc, slot, spirits, current) {
  if (!S.spirits.length) {
    alert('精灵库为空，管理员请先在「管理精灵」中添加精灵~');
    return;
  }

  const seasonNames = new Set((spirits || []).map(sName).filter(Boolean));

  // 所有精灵，赛季精灵置顶
  const allObjs = [
    ...S.spirits.filter(sp =>  seasonNames.has(sp.name)),
    ...S.spirits.filter(sp => !seasonNames.has(sp.name)),
  ];

  let activeElem = '';

  function renderPicker() {
    const usedElems = ELEMENTS.filter(e => allObjs.some(s => (s.element||'').split(',').includes(e)));

    const seasonFiltered    = (activeElem ? allObjs.filter(s => (s.element||'').split(',').includes(activeElem)) : allObjs)
                                .filter(s =>  seasonNames.has(s.name));
    const nonSeasonFiltered = (activeElem ? allObjs.filter(s => (s.element||'').split(',').includes(activeElem)) : allObjs)
                                .filter(s => !seasonNames.has(s.name));

    const pickBtn = (s, isSeason) => {
      const isCur = s.name === current;
      const border = isSeason
        ? (isCur ? '3px solid #fff'              : '2px solid rgba(255,220,50,0.85)')
        : (isCur ? '3px solid #333'              : '2px solid transparent');
      const shadow = isSeason
        ? '0 3px 8px rgba(0,0,0,.22),0 0 10px rgba(255,210,0,0.38)'
        : '0 3px 8px rgba(0,0,0,.2)';
      const extraStyle = isSeason ? 'position:relative;overflow:hidden;' : '';
      return `<button class="spirit-pick-btn${isSeason ? ' season-pick' : ''}" data-spirit="${s.name}"
        style="background:${spiritColor(s.name)};color:#fff;border:${border};
        border-radius:12px;padding:9px 18px;cursor:pointer;font-size:14px;
        font-weight:700;font-family:inherit;box-shadow:${shadow};
        transition:transform .15s;${extraStyle}"
        onmouseover="this.style.transform='translateY(-2px)'"
        onmouseout="this.style.transform=''">${s.name}</button>`;
    };

    let html = `<div class="modal-title">🍃 选择精灵 — ${sanc.name} 槽位${slot}</div>
      <div class="element-filter">
        <button class="elem-btn${!activeElem?' active':''}" data-elem="">全部</button>
        ${usedElems.map(e => `<button class="elem-btn${activeElem===e?' active':''}" data-elem="${e}">${e}</button>`).join('')}
      </div>`;

    if (!seasonFiltered.length && !nonSeasonFiltered.length) {
      html += `<p style="color:var(--text-lt);font-size:13px;padding:12px 0">暂无该系别的精灵</p>`;
    } else {
      if (seasonFiltered.length) {
        html += `<div class="pick-section-label">✨ 本赛季异色</div>
          <div class="flex-row spirit-picks" style="margin-bottom:${nonSeasonFiltered.length?'12px':'16px'};row-gap:10px">
          ${seasonFiltered.map(s => pickBtn(s, true)).join('')}</div>`;
      }
      if (nonSeasonFiltered.length) {
        html += `${seasonFiltered.length ? '<div class="pick-section-label" style="opacity:.6">其他精灵</div>' : ''}
          <div class="flex-row spirit-picks" style="margin-bottom:16px;row-gap:10px">
          ${nonSeasonFiltered.map(s => pickBtn(s, false)).join('')}</div>`;
      }
    }

    if (current) html += `<button id="btn-clear-slot" class="btn btn-danger btn-sm">🗑 清除此槽位</button>`;

    showModal(html);

    document.querySelectorAll('.elem-btn').forEach(btn => {
      btn.onclick = () => { activeElem = btn.dataset.elem; renderPicker(); };
    });

    document.querySelectorAll('.spirit-pick-btn').forEach(btn => {
      btn.onclick = () => {
        const spiritName = btn.dataset.spirit;
        const isSeason   = seasonNames.has(spiritName);
        S.sancFruits = S.sancFruits.filter(f => !(f.sanctuary_id === sanc.id && f.user_id === S.user.id && f.season_id === S.currentSeasonId && f.slot === slot));
        S.sancFruits.push({ user_id: S.user.id, sanctuary_id: sanc.id, season_id: S.currentSeasonId, spirit_name: spiritName, slot });
        const sRec = S.sancStatuses.find(s => s.sanctuary_id === sanc.id && s.user_id === S.user.id);
        if (sRec) sRec.is_open = true;
        else S.sancStatuses.push({ user_id: S.user.id, sanctuary_id: sanc.id, is_open: true });
        if (isSeason) {
          const fRec = S.userFruits.find(f => f.spirit_name === spiritName && f.user_id === S.user.id && f.season_id === S.currentSeasonId);
          if (fRec) fRec.obtained = true;
          else S.userFruits.push({ user_id: S.user.id, season_id: S.currentSeasonId, spirit_name: spiritName, obtained: true });
        }
        closeModal(); renderAll();
        const writes = [
          API.upsertSanctuaryFruit(S.user.id, sanc.id, S.currentSeasonId, spiritName, slot),
          API.upsertSanctuaryStatus(S.user.id, sanc.id, true),
        ];
        if (isSeason) writes.push(API.upsertUserFruit(S.user.id, S.currentSeasonId, spiritName, true));
        Promise.all(writes).catch(e => alert('同步失败：' + e.message));
        scheduleRefresh();
      };
    });

    const clearBtn = el('btn-clear-slot');
    if (clearBtn) {
      clearBtn.onclick = () => {
        S.sancFruits = S.sancFruits.filter(f => !(f.sanctuary_id === sanc.id && f.user_id === S.user.id && f.season_id === S.currentSeasonId && f.slot === slot));
        closeModal(); renderAll();
        API.deleteSanctuaryFruit(S.user.id, sanc.id, S.currentSeasonId, slot).catch(e => alert('同步失败：' + e.message));
        scheduleRefresh();
      };
    }
  }

  renderPicker();
}

// ══ 管理员弹窗：用户管理 ══════════════════════════════════════
function showManageUsers() {
  showModal(`
    <div class="modal-title">👥 管理用户</div>
    <div id="users-area"></div>
    <hr>
    <div class="modal-sub">新增用户</div>
    <div class="form-row"><label>玩家 ID（可中文）</label><input id="nu-id" type="text"></div>
    <div class="form-row"><label>密码</label><input id="nu-pw" type="password"></div>
    <div class="form-row"><label>角色</label>
      <select id="nu-role">
        <option value="user">👤 普通用户</option>
        <option value="admin">🛡️ 管理员</option>
      </select>
    </div>
    <button class="btn btn-primary" id="nu-ok">创建用户</button>
  `);
  _renderUsersList();
  el('nu-ok').onclick = async () => {
    const id = el('nu-id').value.trim();
    const pw = el('nu-pw').value;
    const role = el('nu-role').value;
    if (!id || !pw) { alert('ID 和密码不能为空'); return; }
    try {
      await API.createUser(id, Auth.hashPassword(pw), role);
      S.users = await API.getAllUsers();
      el('nu-id').value = ''; el('nu-pw').value = '';
      _renderUsersList();
    } catch (e) { alert('创建失败：' + e.message); }
  };
}

function _renderUsersList() {
  const a = el('users-area');
  if (!a) return;
  a.innerHTML = S.users.length
    ? S.users.map(u => `
        <div class="list-item">
          <div class="list-item-main"><b>${u.id}</b>
            <span class="list-item-meta"> ${u.role === 'admin' ? '🛡️ 管理员' : '👤 普通用户'}</span>
          </div>
          ${u.id !== S.user.id ? `
            <button class="btn btn-sm ${u.role === 'admin' ? 'btn-secondary' : 'btn-primary'}"
              onclick="adminToggleRole('${u.id}','${u.role}')">
              ${u.role === 'admin' ? '降为普通用户' : '升为管理员'}
            </button>
            <button class="btn btn-danger btn-sm" onclick="adminDelUser('${u.id}')">删除</button>`
            : '<span style="font-size:12px;color:#bbb">（当前账号）</span>'}
        </div>`).join('')
    : '<p class="empty-msg">暂无用户</p>';
}

async function adminToggleRole(id, currentRole) {
  const newRole = currentRole === 'admin' ? 'user' : 'admin';
  const label   = newRole === 'admin' ? '升为管理员' : '降为普通用户';
  if (!confirm(`确认将「${id}」${label}？`)) return;
  await API.updateUserRole(id, newRole);
  S.users = await API.getAllUsers();
  _renderUsersList();
}

async function adminDelUser(id) {
  if (!confirm(`确认删除用户「${id}」？`)) return;
  await API.deleteUser(id);
  S.users = await API.getAllUsers();
  _renderUsersList();
}

// ══ 管理员弹窗：赛季管理 ══════════════════════════════════════
function showManageSeasons() {
  showModal(`
    <div class="modal-title">📅 管理赛季</div>
    <div id="seasons-area"></div>
    <hr>
    <div class="modal-sub">新增赛季</div>
    <div class="form-row"><label>赛季名称</label><input id="ns-name" type="text" placeholder="例：2024 春季赛"></div>
    <div class="form-row"><label>开始日期</label><input id="ns-start" type="date"></div>
    <div class="form-row"><label>结束日期</label><input id="ns-end" type="date"></div>
    <div class="form-row">
      <label>异色精灵 <span class="hint">（从精灵库勾选，可按系别筛选）</span></label>
      <div id="ns-spirit-checklist"></div>
    </div>
    <button class="btn btn-primary" id="ns-ok">创建赛季</button>
    <details class="import-section">
      <summary>📥 JSON 批量导入赛季</summary>
      <div class="import-content">
        <code class="import-format-hint">[{"name":"第一赛季","start_date":"2024-01-01","end_date":"2024-03-31","spirits":["异色火焰犬","异色冰晶猫"]}]</code>
        <textarea id="seasons-import-ta" placeholder='[{"name":"...","start_date":"...","end_date":"...","spirits":["精灵名"]}]'></textarea>
        <div><button class="btn btn-secondary btn-sm" id="btn-import-seasons">✅ 导入</button></div>
      </div>
    </details>
  `);
  _renderSeasonsList();

  const selectedNames = new Set();
  buildSpiritChecklist(el('ns-spirit-checklist'), selectedNames);

  el('ns-ok').onclick = async () => {
    const name   = el('ns-name').value.trim();
    const start  = el('ns-start').value;
    const end    = el('ns-end').value;
    if (!name || !start || !end) { alert('请填写完整信息'); return; }
    try {
      await API.createSeason(name, start, end, [...selectedNames]);
      S.seasons = await API.getSeasons();
      el('ns-name').value = ''; el('ns-start').value = ''; el('ns-end').value = '';
      selectedNames.clear();
      buildSpiritChecklist(el('ns-spirit-checklist'), selectedNames);
      _renderSeasonsList(); renderSeasonTabs(); renderHeader();
    } catch (e) { alert('创建失败：' + e.message); }
  };

  el('btn-import-seasons').onclick = async () => {
    const text = el('seasons-import-ta').value.trim();
    if (!text) return;
    try {
      const list = JSON.parse(text);
      for (const s of list) {
        await API.createSeason(s.name, s.start_date, s.end_date, s.spirits || []);
      }
      S.seasons = await API.getSeasons();
      el('seasons-import-ta').value = '';
      _renderSeasonsList(); renderSeasonTabs(); renderHeader();
      alert(`🎉 成功导入 ${list.length} 个赛季！`);
    } catch (e) { alert('导入失败：' + e.message); }
  };
}

function _renderSeasonsList() {
  const a = el('seasons-area');
  if (!a) return;
  a.innerHTML = S.seasons.length
    ? S.seasons.map(s => {
        const names = (s.spirits || []).map(sName).filter(Boolean).join('、');
        return `
          <div class="list-item">
            <div class="list-item-main"><b>${s.name}</b>
              <div class="list-item-meta">${fmtDate(s.start_date)} — ${fmtDate(s.end_date)}
                &nbsp;·&nbsp; 精灵：${names || '无'}</div>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="adminEditSeason('${s.id}')">编辑</button>
            <button class="btn btn-danger btn-sm" onclick="adminDelSeason('${s.id}')">删除</button>
          </div>`;
      }).join('')
    : '<p class="empty-msg">暂无赛季</p>';
}

async function adminDelSeason(id) {
  if (!confirm('确认删除此赛季？该赛季所有用户数据也会被清除。')) return;
  await API.clearSeasonUserData(id);
  await API.deleteSeason(id);
  S.seasons = await API.getSeasons();
  if (S.currentSeasonId === id) {
    S.currentSeasonId = S.seasons[0]?.id || null;
    await loadSeasonData();
  }
  _renderSeasonsList(); renderAll();
}

function adminEditSeason(id) {
  const s = S.seasons.find(x => x.id === id);
  if (!s) return;
  showModal(`
    <div class="modal-title">✏️ 编辑赛季</div>
    <div class="form-row"><label>赛季名称</label><input id="es-name" type="text" value="${s.name}"></div>
    <div class="form-row"><label>开始日期</label><input id="es-start" type="date" value="${s.start_date}"></div>
    <div class="form-row"><label>结束日期</label><input id="es-end" type="date" value="${s.end_date}"></div>
    <div class="form-row">
      <label>异色精灵 <span class="hint">（从精灵库勾选，可按系别筛选）</span></label>
      <div id="es-spirit-checklist"></div>
    </div>
    <div class="flex-row">
      <button class="btn btn-primary" id="es-ok">保存修改</button>
      <button class="btn btn-secondary" id="es-back">← 返回列表</button>
    </div>
  `);

  const selectedNames = new Set((s.spirits || []).map(sName).filter(Boolean));
  buildSpiritChecklist(el('es-spirit-checklist'), selectedNames);

  el('es-back').onclick = () => showManageSeasons();
  el('es-ok').onclick = async () => {
    const name  = el('es-name').value.trim();
    const start = el('es-start').value;
    const end   = el('es-end').value;
    if (!name || !start || !end) { alert('请填写完整信息'); return; }
    try {
      await API.updateSeason(id, { name, start_date: start, end_date: end, spirits: [...selectedNames] });
      S.seasons = await API.getSeasons();
      renderSeasonTabs(); renderHeader(); renderCard2();
      showManageSeasons();
    } catch (e) { alert('保存失败：' + e.message); }
  };
}

// ══ 管理员弹窗：庇护所管理 ════════════════════════════════════
function showManageSanctuaries() {
  showModal(`
    <div class="modal-title">🏕️ 管理庇护所</div>
    <div id="sanc-bulk-bar" class="bulk-bar hidden">
      <span id="sanc-sel-count">已选 0 个</span>
      <select id="sanc-bulk-loc">
        <option value="">— 设置所处地 —</option>
        ${LOCATIONS.map(l => `<option value="${l}">${l}</option>`).join('')}
      </select>
      <button class="btn btn-sm btn-primary" id="sanc-bulk-set-loc">应用</button>
      <button class="btn btn-sm btn-danger" id="sanc-bulk-del">批量删除</button>
    </div>
    <div id="sancs-area"></div>
    <hr>
    <div class="modal-sub">新增庇护所</div>
    <div class="form-row"><label>庇护所名称</label><input id="nsanc-name" type="text" placeholder="例：北方雪峰庇护所"></div>
    <div class="form-row"><label>所处地</label>
      <select id="nsanc-loc">
        ${LOCATIONS.map(l => `<option value="${l}">${l}</option>`).join('')}
      </select>
    </div>
    <div class="form-row"><label>果实槽位数（每位玩家最多放几个）</label>
      <select id="nsanc-slots"><option value="2">2 个（默认）</option><option value="1">1 个</option></select>
    </div>
    <div class="form-row"><label>位置图片链接 <span class="hint">（可选，粘贴 GitHub Issue 图片地址）</span></label>
      <input id="nsanc-map" type="url" placeholder="https://...（可留空）">
    </div>
    <button class="btn btn-primary" id="nsanc-ok">创建庇护所</button>
    <details class="import-section">
      <summary>📥 JSON 批量导入庇护所</summary>
      <div class="import-content">
        <code class="import-format-hint">[{"name":"北方雪峰庇护所","max_fruits":2,"location":"风眠省"}]</code>
        <textarea id="sancs-import-ta" placeholder='[{"name":"...","max_fruits":2,"location":"风眠省"}]'></textarea>
        <div><button class="btn btn-secondary btn-sm" id="btn-import-sancs">✅ 导入</button></div>
      </div>
    </details>
  `);
  _renderSancsList();

  el('nsanc-ok').onclick = async () => {
    const name   = el('nsanc-name').value.trim();
    const slots  = parseInt(el('nsanc-slots').value);
    const loc    = el('nsanc-loc').value;
    const mapUrl = el('nsanc-map').value.trim();
    if (!name) { alert('请填写庇护所名称'); return; }
    try {
      await API.createSanctuary(name, slots, loc, mapUrl);
      S.sanctuaries = await API.getSanctuaries();
      el('nsanc-name').value = '';
      el('nsanc-map').value = '';
      _renderSancsList(); renderCard1();
    } catch (e) { alert('创建失败：' + e.message); }
  };

  el('btn-import-sancs').onclick = async () => {
    const text = el('sancs-import-ta').value.trim();
    if (!text) return;
    try {
      const list = JSON.parse(text);
      for (const s of list) {
        await API.createSanctuary(s.name, s.max_fruits || 2, s.location || '风眠省');
      }
      S.sanctuaries = await API.getSanctuaries();
      el('sancs-import-ta').value = '';
      _renderSancsList(); renderCard1();
      alert(`🎉 成功导入 ${list.length} 个庇护所！`);
    } catch (e) { alert('导入失败：' + e.message); }
  };
}

function _renderSancsList() {
  const a = el('sancs-area');
  if (!a) return;

  function getCheckedSancs() {
    return [...document.querySelectorAll('.sanc-check')].filter(c => c.checked);
  }

  function updateBulkBar() {
    const checked = getCheckedSancs();
    const bar = el('sanc-bulk-bar');
    if (!bar) return;
    bar.classList.toggle('hidden', checked.length === 0);
    const cnt = el('sanc-sel-count');
    if (cnt) cnt.textContent = `已选 ${checked.length} 个`;
  }

  if (!S.sanctuaries.length) {
    a.innerHTML = '<p class="empty-msg">暂无庇护所</p>';
    return;
  }

  a.innerHTML = `
    <div class="bulk-select-header">
      <label><input type="checkbox" id="sanc-check-all"> 全选 / 取消全选</label>
    </div>
    ${S.sanctuaries.map(s => `
      <div class="list-item">
        <input type="checkbox" class="sanc-check" data-id="${s.id}">
        <div class="list-item-main">
          <b>${s.name}</b>
          <span class="list-item-meta"> 📍 ${s.location || '未分类'} · 每人最多 ${s.max_fruits} 个果实</span>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="adminEditSanc('${s.id}')">编辑</button>
        <button class="btn btn-danger btn-sm" onclick="adminDelSanc('${s.id}')">删除</button>
      </div>`).join('')}
  `;

  const allCheck = el('sanc-check-all');
  if (allCheck) {
    allCheck.onchange = () => {
      document.querySelectorAll('.sanc-check').forEach(c => c.checked = allCheck.checked);
      updateBulkBar();
    };
  }
  document.querySelectorAll('.sanc-check').forEach(c => c.onchange = updateBulkBar);

  const bulkSetLoc = el('sanc-bulk-set-loc');
  if (bulkSetLoc) {
    bulkSetLoc.onclick = async () => {
      const loc = el('sanc-bulk-loc').value;
      if (!loc) { alert('请先选择所处地'); return; }
      const ids = getCheckedSancs().map(c => c.dataset.id);
      if (!ids.length) { alert('请先勾选庇护所'); return; }
      try {
        await Promise.all(ids.map(id => API.updateSanctuary(id, { location: loc })));
        S.sanctuaries = await API.getSanctuaries();
        _renderSancsList(); renderCard1();
      } catch (e) { alert('操作失败：' + e.message); }
    };
  }

  const bulkDel = el('sanc-bulk-del');
  if (bulkDel) {
    bulkDel.onclick = async () => {
      const ids = getCheckedSancs().map(c => c.dataset.id);
      if (!ids.length) { alert('请先勾选庇护所'); return; }
      if (!confirm(`确认删除选中的 ${ids.length} 个庇护所？`)) return;
      try {
        await Promise.all(ids.map(id => API.deleteSanctuary(id)));
        S.sanctuaries = await API.getSanctuaries();
        _renderSancsList(); renderCard1();
      } catch (e) { alert('操作失败：' + e.message); }
    };
  }
}

function adminEditSanc(id) {
  const s = S.sanctuaries.find(x => x.id === id);
  if (!s) return;
  showModal(`
    <div class="modal-title">✏️ 编辑庇护所</div>
    <div class="form-row"><label>庇护所名称</label><input id="es-name" type="text" value="${s.name}"></div>
    <div class="form-row"><label>所处地</label>
      <select id="es-loc">
        ${LOCATIONS.map(l => `<option value="${l}" ${(s.location||LOCATIONS[0])===l?'selected':''}>${l}</option>`).join('')}
      </select>
    </div>
    <div class="form-row"><label>果实槽位数</label>
      <select id="es-slots">
        <option value="2" ${s.max_fruits === 2 ? 'selected' : ''}>2 个（默认）</option>
        <option value="1" ${s.max_fruits === 1 ? 'selected' : ''}>1 个</option>
      </select>
    </div>
    <div class="form-row"><label>位置图片链接 <span class="hint">（粘贴 GitHub Issue 图片地址，留空则不显示"查看位置"）</span></label>
      <input id="es-map" type="url" value="${s.map_image_url || ''}" placeholder="https://...">
    </div>
    <div class="flex-row">
      <button class="btn btn-primary" id="es-ok">保存修改</button>
      <button class="btn btn-secondary" id="es-back">← 返回列表</button>
    </div>
  `);
  el('es-back').onclick = () => showManageSanctuaries();
  el('es-ok').onclick = async () => {
    const name        = el('es-name').value.trim();
    const maxFruits   = parseInt(el('es-slots').value);
    const location    = el('es-loc').value;
    const mapImageUrl = el('es-map').value.trim();
    if (!name) { alert('请填写庇护所名称'); return; }
    try {
      await API.updateSanctuary(id, { name, max_fruits: maxFruits, location, map_image_url: mapImageUrl });
      S.sanctuaries = await API.getSanctuaries();
      renderCard1();
      showManageSanctuaries();
    } catch (e) { alert('保存失败：' + e.message); }
  };
}

async function adminDelSanc(id) {
  if (!confirm('确认删除此庇护所？')) return;
  await API.deleteSanctuary(id);
  S.sanctuaries = await API.getSanctuaries();
  _renderSancsList(); renderCard1();
}

// ══ 管理员弹窗：精灵管理 ══════════════════════════════════════
function showManageSpirits() {
  showModal(`
    <div class="modal-title">🐾 管理精灵</div>
    <div id="spr-bulk-bar" class="bulk-bar hidden">
      <span id="spr-sel-count">已选 0 个</span>
      <select id="spr-bulk-elem">
        <option value="">— 设置系别 —</option>
        ${ELEMENTS.map(e => `<option value="${e}">${e}</option>`).join('')}
      </select>
      <button class="btn btn-sm btn-primary" id="spr-bulk-set-elem">应用</button>
      <button class="btn btn-sm btn-danger" id="spr-bulk-del">批量删除</button>
    </div>
    <div id="spirits-area"></div>
    <hr>
    <div class="modal-sub">新增精灵</div>
    <div class="add-spirit-form">
      <input id="nspr-name" type="text" placeholder="精灵名称（如：异色火焰犬）">
      <select id="nspr-elem1">
        <option value="">— 系别 —</option>
        ${ELEMENTS.map(e => `<option value="${e}">${e}</option>`).join('')}
      </select>
      <select id="nspr-elem2">
        <option value="">（第二系别）</option>
        ${ELEMENTS.map(e => `<option value="${e}">${e}</option>`).join('')}
      </select>
      <button class="btn btn-primary btn-sm" id="nspr-ok">添加</button>
    </div>
    <details class="import-section">
      <summary>📥 JSON 批量导入精灵</summary>
      <div class="import-content">
        <code class="import-format-hint">[{"name":"异色火焰犬","element":"火"}, {"name":"异色双系精灵","element":"火,水"}, ...]</code>
        <textarea id="spirits-import-ta" placeholder='[{"name":"异色火焰犬","element":"火"}]'></textarea>
        <div><button class="btn btn-secondary btn-sm" id="btn-import-spirits">✅ 导入</button></div>
      </div>
    </details>
  `);
  _spiritsListFilter = '';
  _renderSpiritsList();

  el('nspr-ok').onclick = async () => {
    const name  = el('nspr-name').value.trim();
    const elem1 = el('nspr-elem1').value;
    const elem2 = el('nspr-elem2').value;
    const elem  = [elem1, elem2].filter(Boolean).join(',');
    if (!name) { alert('请填写精灵名称'); return; }
    try {
      await API.createSpirit(name, elem);
      S.spirits = await API.getSpirits();
      el('nspr-name').value = '';
      el('nspr-elem1').value = '';
      el('nspr-elem2').value = '';
      _renderSpiritsList();
    } catch (e) { alert('添加失败：' + (e.message.includes('spirits_name_unique') ? '该精灵已存在' : e.message)); }
  };

  el('btn-import-spirits').onclick = async () => {
    const text = el('spirits-import-ta').value.trim();
    if (!text) return;
    try {
      const list = JSON.parse(text);
      await API.importSpirits(list);
      S.spirits = await API.getSpirits();
      el('spirits-import-ta').value = '';
      _renderSpiritsList();
      alert(`🎉 成功导入 ${list.length} 个精灵！`);
    } catch (e) { alert('导入失败：' + e.message); }
  };
}

function _renderSpiritsList() {
  const a = el('spirits-area');
  if (!a) return;

  function getCheckedSpirits() {
    return [...document.querySelectorAll('.spr-check')].filter(c => c.checked);
  }

  function updateBulkBar() {
    const checked = getCheckedSpirits();
    const bar = el('spr-bulk-bar');
    if (!bar) return;
    bar.classList.toggle('hidden', checked.length === 0);
    const cnt = el('spr-sel-count');
    if (cnt) cnt.textContent = `已选 ${checked.length} 个`;
  }

  if (!S.spirits.length) {
    a.innerHTML = '<p class="empty-msg">暂无精灵，请导入或手动添加</p>';
    return;
  }

  const usedElems = ELEMENTS.filter(e => S.spirits.some(sp => (sp.element || '').split(',').includes(e)));
  const visible   = _spiritsListFilter
    ? S.spirits.filter(sp => (sp.element || '').split(',').includes(_spiritsListFilter))
    : S.spirits;

  a.innerHTML = `
    <div class="element-filter spirits-mgr-filter">
      <button type="button" class="elem-btn${!_spiritsListFilter ? ' active' : ''}" data-elem="">全部 <span style="opacity:.6;font-size:10px">${S.spirits.length}</span></button>
      ${usedElems.map(e => {
        const cnt = S.spirits.filter(sp => (sp.element||'').split(',').includes(e)).length;
        return `<button type="button" class="elem-btn${_spiritsListFilter === e ? ' active' : ''}" data-elem="${e}">${e} <span style="opacity:.6;font-size:10px">${cnt}</span></button>`;
      }).join('')}
    </div>
    <div class="bulk-select-header">
      <label><input type="checkbox" id="spr-check-all"> 全选 / 取消全选</label>
      ${_spiritsListFilter ? `<span style="font-size:11px;color:var(--text-lt)">（当前筛选：${_spiritsListFilter}系，共 ${visible.length} 个）</span>` : ''}
    </div>
    ${visible.map(s => `
      <div class="list-item">
        <input type="checkbox" class="spr-check" data-id="${s.id}">
        <div class="list-item-main">
          <b>${s.name}</b>
          ${(s.element||'').split(',').filter(Boolean).map(e=>`<span class="elem-badge" style="margin-left:6px">${e}</span>`).join('')}
        </div>
        <button class="btn btn-danger btn-sm" onclick="adminDelSpirit('${s.id}','${s.name}')">删除</button>
      </div>`).join('')}
  `;

  a.querySelectorAll('.spirits-mgr-filter .elem-btn').forEach(btn => {
    btn.onclick = () => { _spiritsListFilter = btn.dataset.elem; _renderSpiritsList(); };
  });

  const allCheck = el('spr-check-all');
  if (allCheck) {
    allCheck.onchange = () => {
      document.querySelectorAll('.spr-check').forEach(c => c.checked = allCheck.checked);
      updateBulkBar();
    };
  }
  document.querySelectorAll('.spr-check').forEach(c => c.onchange = updateBulkBar);

  const bulkSetElem = el('spr-bulk-set-elem');
  if (bulkSetElem) {
    bulkSetElem.onclick = async () => {
      const elem = el('spr-bulk-elem').value;
      if (!elem) { alert('请选择系别'); return; }
      const ids = getCheckedSpirits().map(c => c.dataset.id);
      if (!ids.length) { alert('请先勾选精灵'); return; }
      try {
        await Promise.all(ids.map(id => API.updateSpirit(id, { element: elem })));
        S.spirits = await API.getSpirits();
        _renderSpiritsList();
      } catch (e) { alert('操作失败：' + e.message); }
    };
  }

  const bulkDel = el('spr-bulk-del');
  if (bulkDel) {
    bulkDel.onclick = async () => {
      const ids = getCheckedSpirits().map(c => c.dataset.id);
      if (!ids.length) { alert('请先勾选精灵'); return; }
      if (!confirm(`确认删除选中的 ${ids.length} 个精灵？\n注意：删除后不会自动从赛季精灵列表中移除。`)) return;
      try {
        await Promise.all(ids.map(id => API.deleteSpirit(id)));
        S.spirits = await API.getSpirits();
        _renderSpiritsList();
      } catch (e) { alert('操作失败：' + e.message); }
    };
  }
}

async function adminDelSpirit(id, name) {
  if (!confirm(`确认删除精灵「${name}」？\n注意：删除后不会自动从赛季精灵列表中移除。`)) return;
  await API.deleteSpirit(id);
  S.spirits = await API.getSpirits();
  _renderSpiritsList();
}

// ══ 管理员弹窗：清空数据 ══════════════════════════════════════
function showClearData() {
  const season = curSeason();
  showModal(`
    <div class="modal-title">⚠️ 批量清空用户数据</div>
    <p style="font-size:14px;color:#888;margin-bottom:20px">
      系统数据（赛季、庇护所名称）不会被删除，<br>
      只会清除所有玩家的开启状态、果实放置记录、精灵获取记录。
    </p>
    <div class="flex-row">
      ${season ? `<button class="btn btn-danger" id="btn-cs">仅清空「${season.name}」</button>` : ''}
      <button class="btn btn-danger" id="btn-ca">清空全部赛季数据</button>
    </div>
  `);
  el('btn-cs')?.addEventListener('click', async () => {
    if (!confirm(`确认清空「${season.name}」的全部用户数据？`)) return;
    await API.clearSeasonUserData(S.currentSeasonId);
    await loadSeasonData(); closeModal(); renderAll();
  });
  el('btn-ca').addEventListener('click', async () => {
    if (!confirm('确认清空所有赛季的全部用户数据？')) return;
    await API.clearAllUserData();
    S.sancStatuses = [];
    await loadSeasonData(); closeModal(); renderAll();
  });
}

// ══ 管理员弹窗：清空庇护所放置记录 ════════════════════════════
function showClearSancData() {
  const season = curSeason();
  showModal(`
    <div class="modal-title">🧹 清空庇护所放置记录</div>
    <p style="font-size:14px;color:#888;margin-bottom:20px">
      只清除「谁放了什么精灵」的记录，庇护所开启状态和精灵果实获取记录不受影响。
    </p>
    <div class="flex-row">
      ${season ? `<button class="btn btn-danger" id="btn-csc-season">仅清空「${season.name}」的放置</button>` : ''}
      <button class="btn btn-danger" id="btn-csc-all">清空全部赛季的放置</button>
    </div>
  `);
  el('btn-csc-season')?.addEventListener('click', async () => {
    if (!confirm(`确认清空「${season.name}」所有庇护所的果实放置记录？`)) return;
    await API.clearSanctuaryFruits(S.currentSeasonId);
    await loadSeasonData();
    closeModal(); renderAll();
  });
  el('btn-csc-all').addEventListener('click', async () => {
    if (!confirm('确认清空全部赛季的庇护所果实放置记录？')) return;
    await API.clearSanctuaryFruits(null);
    await loadSeasonData();
    closeModal(); renderAll();
  });
}

// ══ 启动 App（登录后） ════════════════════════════════════════
async function startApp(user) {
  S.user = { id: user.id, role: user.role };
  Auth.saveSession(user);
  el('entry-screen').classList.add('hidden');
  el('app-screen').classList.remove('hidden');
  if (S.user.role === 'admin') el('admin-bar').classList.remove('hidden');
  await loadAll();
  renderAll();
}

// ══ 事件绑定 ══════════════════════════════════════════════════
function wireEvents() {

  el('reg-form').onsubmit = async (e) => {
    e.preventDefault();
    const id  = el('reg-id').value.trim();
    const pw  = el('reg-pw').value;
    const pw2 = el('reg-pw2').value;
    el('reg-err').textContent = '';
    if (pw !== pw2) { el('reg-err').textContent = '两次密码不一致哦~'; return; }
    const role = S.firstRun ? 'admin' : 'user';
    try {
      const user = await Auth.register(id, pw, role);
      if (S.firstRun) alert('🎉 管理员账号创建成功！已自动登录~');
      await startApp(user);
    } catch (err) {
      el('reg-err').textContent = err.message;
    }
  };

  el('login-form').onsubmit = async (e) => {
    e.preventDefault();
    const id = el('inp-id').value.trim();
    const pw = el('inp-pw').value;
    el('login-err').textContent = '';
    const user = await Auth.login(id, pw);
    if (user) {
      await startApp(user);
    } else {
      el('login-err').textContent = 'ID 或密码不对，再试试~';
    }
  };

  el('chk-fruit-first').onchange = () => {
    S.showFruitFirst = el('chk-fruit-first').checked;
    renderCard1();
  };

  el('chk-rating-sort').onchange = () => {
    S.sortByRating = el('chk-rating-sort').checked;
    renderCard1();
  };

  el('btn-open-all').onclick = () => {
    if (!S.sanctuaries.length) return;
    S.sanctuaries.forEach(sanc => {
      const rec = S.sancStatuses.find(s => s.sanctuary_id === sanc.id && s.user_id === S.user.id);
      if (rec) rec.is_open = true;
      else S.sancStatuses.push({ user_id: S.user.id, sanctuary_id: sanc.id, is_open: true });
    });
    renderCard1();
    Promise.all(S.sanctuaries.map(s => API.upsertSanctuaryStatus(S.user.id, s.id, true)))
      .catch(e => alert('同步失败：' + e.message));
    scheduleRefresh();
  };

  el('btn-logout').onclick = () => { Auth.logout(); location.reload(); };

  el('modal-close').onclick = closeModal;
  el('modal').onclick = e => { if (e.target === el('modal')) closeModal(); };

  el('admin-bar').addEventListener('click', e => {
    const action = e.target.dataset.action;
    if (!action) return;
    if      (action === 'manage-users')       showManageUsers();
    else if (action === 'manage-seasons')     showManageSeasons();
    else if (action === 'manage-sanctuaries') showManageSanctuaries();
    else if (action === 'manage-spirits')     showManageSpirits();
    else if (action === 'clear-sanc')         showClearSancData();
    else if (action === 'clear-data')         showClearData();
  });
}

// ══ 初始化 ════════════════════════════════════════════════════
async function init() {
  wireEvents();

  if (SUPABASE_URL.includes('YOUR_PROJECT_ID')) {
    el('setup-guide').classList.remove('hidden');
    return;
  }

  try {
    const count = await API.getUsersCount();
    if (count === 0) {
      S.firstRun = true;
      el('first-run-banner').classList.remove('hidden');
      el('reg-card-title').textContent = '👑 创建管理员账号';
      el('login-hint').classList.remove('hidden');
      el('login-form').classList.add('hidden');
    }
  } catch {
    el('setup-guide').classList.remove('hidden');
    el('setup-guide').querySelector('.setup-title').textContent = '❌ 数据库连接失败，请检查：';
    el('setup-guide').querySelector('ol').innerHTML = `
      <li>config.js 里的 URL 和 Key 是否填写正确</li>
      <li>Supabase 项目是否还在运行（免费层会暂停）</li>
      <li><b>schema.sql 里的建表语句是否已在 Supabase SQL Editor 里运行过</b></li>`;
    return;
  }

  const session = Auth.loadSession();
  if (session) {
    await startApp(session);
  }
}

document.addEventListener('DOMContentLoaded', init);
