/* UI owns presentation and user choices. All numerical outcomes come from
 * the audited model and research module; scene geometry never changes them. */
(() => {
  'use strict';
  const E = window.CanteenSim,
    R = window.DiningResearch,
    Common = window.DiningCommonWindows,
    D = window.DiningDecision,
    $ = (id) => document.getElementById(id);
  function exampleConfig() {
    return window.DiningScheduleStudy.makeConfig(window.DiningBinheCohort.create(), 'combined', { slotSeconds: 70 });
  }
  const state = {
    config: exampleConfig(),
    result: null,
    baseline: null,
    comparison: null,
    scenarioCheck: null,
    search: null,
    time: 30,
    playing: false,
    view: null,
    mode: '3d',
    tab: 'live',
    busy: false,
    lastTick: 0
  };
  const names = {
    setup: '选择方案',
    live: '运行过程',
    compare: '仿真结果',
    search: '方案筛选',
    evidence: '使用说明',
    learn: '研究笔记'
  };
  let parameterOriginal = {};
  let plannerUI = null;
  let scheduleUI = null;
  let workflowUI = null;
  const escape = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  const f = (v, n = 2) => (Number.isFinite(v) ? v.toFixed(n) : '—');
  const clock = (t) => R.clockLabel(t),
    shortClock = (t) => R.clockLabel(t, false);
  function message(title, text) {
    $('message-title').textContent = title;
    $('message-body').textContent = text;
    $('message-dialog').showModal();
  }
  function status(text) {
    $('status').textContent = text;
  }
  function download(name, text, type = 'text/plain;charset=utf-8') {
    const u = URL.createObjectURL(new Blob([text], { type })),
      a = document.createElement('a');
    a.href = u;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
  function json(name, obj) {
    download(name, JSON.stringify(obj, null, 2), 'application/json;charset=utf-8');
  }
  function exportRun() {
    json('本轮仿真_合成数据.json', {
      schema: 'dining-run/2',
      evidence: 'synthetic',
      modelVersion: E.VERSION,
      build: window.DiningLabBuild || null,
      researchVersion: R.VERSION,
      createdAt: new Date().toISOString(),
      timeOrigin: '11:20',
      eventTimeUnit: 'minute',
      serviceParameterUnit: 'second',
      config: state.config,
      result: state.result
    });
  }
  function exportStudents() {
    const rows = state.result.students.map((s) => ({
      模拟编号: s.id + 1,
      年级: s.gradeName,
      班序: s.classIndex + 1,
      窗口: s.window + 1,
      允许放行_分钟: s.readyTime,
      实际放行_分钟: s.release,
      到达_分钟: s.arrival,
      服务开始_分钟: s.start,
      取餐结束_分钟: s.end,
      排队_分钟: s.wait,
      等座_分钟: s.seatWait,
      端盘步行_分钟: s.indoorWalk || 0,
      离开等座区_分钟: s.seatWalkStart,
      用餐开始_分钟: s.seatStart,
      用餐结束_分钟: s.mealEnd,
      终点完成_分钟: s.endpointTime,
      完整用时_分钟: s.readyToEndpoint,
      截止_分钟: s.deadline,
      超时: s.late ? '是' : '否',
      种子: state.config.seed,
      数据性质: '合成仿真；时刻以11:20为零点，非学校实测'
    }));
    download('逐人事件_合成数据.csv', R.csv(rows), 'text/csv;charset=utf-8');
  }
  function tab(name) {
    if (!names[name]) return;
    document.querySelectorAll('.utility-menu').forEach(menu => menu.open = false);
    state.tab = name;
    document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + name));
    document.querySelectorAll('.nav').forEach((b) => {
      const active = b.dataset.tab === name;
      b.classList.toggle('active', active);
      b.setAttribute('aria-current', active ? 'page' : 'false');
    });
    $('crumb').textContent = names[name];
    state.playing = false;
    updatePlay();
    state.view?.setActive(name === 'live' && state.mode === '3d');
    if (name === 'compare') requestAnimationFrame(renderChart);
    if (name === 'live')
      requestAnimationFrame(() => {
        renderFrame();
        renderChart();
      });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function describe(c) {
    return `${c.students} 人 · ${c.windows} 通用窗口 · ${c.seats} 座位 · 预计取餐完成最早`;
  }
  function run(config) {
    state.config = Common.normalize(config);
    state.result = E.simulateSchool(state.config);
    state.playing = false;
    state.time = Math.min(state.result.metrics.peakQueueTime, state.result.metrics.observationEnd);
    $('timeline').max = state.result.metrics.observationEnd;
    updatePlay();
    renderSummary();
    prepareScene();
    renderFrame();
    renderChart();
    scheduleUI?.onConfigChange();
    updateSearchState();
    plannerUI?.onConfigChange();
    workflowUI?.onConfigChange();
    status('仿真已完成');
  }
  function updateSearchState() {
    const previous = state.search?.original;
    $('search-stale').hidden =
      !previous || (!R.changes(previous, state.config).length && previous.seed === state.config.seed);
  }
  function renderSummary() {
    const m = R.metrics(state.result),
      c = state.config;
    $('scenario-name').innerHTML = '方案：<strong>'+escape((c.sourceProfile?.title || '自定义安排').replace(/\s*·\s*合成参数$/, ''))+'</strong>';
    $('scenario-detail').innerHTML = [['学生人数',c.students,'人'],['窗口数量',c.windows,'个'],['座位数量',c.seats,'个']].map(([label,value,unit])=>`<span class="scenario-field">${label}：<strong>${value}<small>${unit}</small></strong></span>`).join('');
    const cards = [
      ['平均就餐排队时间', m.meanWait, '分', 'clock'],
      ['平均完整用时', m.meanTotal, '分', 'walk'],
      ['按时返回', m.onTime * 100, '%', 'check']
    ];
    $('kpis').innerHTML = cards
      .map(
        ([label, value, unit, icon]) =>
          `<div class="kpi"><div class="label">${DiningIcons(icon)}${label}</div><strong>${f(value, 1)}</strong><span class="unit">${unit}</span></div>`
      )
      .join('');
    $('metric-details').innerHTML =
      `<dl><div><dt>P95 排队</dt><dd>${f(m.p95Wait, 1)} 分</dd></div><div><dt>平均等座</dt><dd>${f(m.seatWait, 1)} 分</dd></div></dl><p>平均排队：到达食堂至开始取餐。完整用时：从最早允许放行到完成返程，包含延后放行。按时完成：在各年级截止时刻前完成的比例。</p><p>P95 为排队时间的95%分位，反映较长等待。</p>`;
    $('grade-cards').innerHTML = c.grades
      .map(
        (g, i) =>
          `<div class="grade-row"><i class="g${i + 1}"></i><div><b>${escape(g.name)}</b><span>${g.students} 人</span></div><strong>${shortClock(g.releaseTime)}</strong></div>`
      )
      .join('');
    $('student-number').max=c.students;
    $('student-number').value=Math.min(Number($('student-number').value)||1,c.students);
    $('student-locate-status').textContent='';
    $('run-feedback').innerHTML=DiningIcons('check')+'本轮计算完成<span>共 '+c.students+' 名学生</span>';
    const warnings = state.result.validityWarnings;
    $('warning-count').textContent = warnings.length ? '· ' + warnings.length + ' 项' : '';
    $('warnings').innerHTML =
      warnings.map((w) => `<p>${escape(w.message)}</p>`).join('') ||
      '<p>没有触发已设置的容量警示。这不等于真实学校适用性已经验证。</p>';
    $('inspect-text').textContent = '点击窗口或学生，查看对应记录。';
    $('selection-details').open = false;
    $('inspect-detail').replaceChildren();
  }
  function prepareScene() {
    if (!window.Canteen3D || !window.THREE || new URLSearchParams(location.search).get('renderer') === '2d') {
      setMode('2d');
      return;
    }
    try {
      if (!state.view)
        state.view = new Canteen3D.View($('scene3d'), {
          onSelect: inspect,
          onError: () => {
            setMode('2d');
            status('3D暂不可用，已切换二维；仿真数据不受影响');
          }
        });
      state.view.setResult(state.result);
      state.view.setActive(state.tab === 'live' && state.mode === '3d');
    } catch (error) {
      setMode('2d');
      status('当前图形环境使用二维显示；模型正常运行');
    }
  }
  function setMode(mode) {
    state.mode = mode;
    $('scene3d').hidden = mode !== '3d';
    $('scene2d').hidden = mode !== '2d';
    $('view-3d').classList.toggle('selected', mode === '3d');
    $('view-2d').classList.toggle('selected', mode === '2d');
    $('view-3d').setAttribute('aria-pressed', String(mode === '3d'));
    $('view-2d').setAttribute('aria-pressed', String(mode === '2d'));
    document.querySelectorAll('[data-camera], #scene-labels').forEach((button) => {
      button.hidden = mode !== '3d';
    });
    state.view?.setActive(state.tab === 'live' && mode === '3d');
    renderFrame();
  }
  function renderFrame() {
    if (!state.result) return;
    const snap = E.snapshot(state.result, state.time);
    $('timeline').value = state.time;
    $('timeline').style.setProperty('--progress',(state.time/state.result.metrics.observationEnd*100).toFixed(2)+'%');
    $('clock').textContent = clock(state.time);
    const counts = [
      ['排队', snap.waiting],
      ['取餐', snap.inService],
      ['端盘步行', snap.walkingToSeat || 0],
      ['等座', snap.seatWaiting],
      ['用餐', snap.dining],
      ['返程', snap.returning],
      ['完成', snap.endpointCompleted]
    ];
    $('live-counts').innerHTML = counts.map(([k, v],i) => `<span>${DiningIcons(DiningCountIcons[i])}<span class="count-content">${k}<b>${v}<small>人</small></b></span></span>`).join('');
    if (state.mode === '3d' && state.view) {
      const frame = CanteenSceneState.frame(state.result, state.time, state.view.layout, snap);
      state.view.update(frame, { playing: state.playing, timeScale: Number($('speed').value) });
      $('scene-note').textContent =
        `人数统计使用全部 ${state.config.students} 人；人物与席位抽样展示。布局、尺寸及路线是示意，不代表学校实测。`;
    } else {
      $('scene2d').innerHTML =
        snap.windows
          .map(
            (w) =>
              `<div class="queue-row"><button class="queue-window" data-window="${w.id}" aria-label="查看窗口 ${w.id + 1}">${w.id + 1} 号窗口<br>${w.serving ? '取餐中' : '空闲'}</button><span class="queue-dots" aria-hidden="true">${'●'.repeat(Math.min(w.waiting, 16))}</span><span class="queue-count">排队 ${w.waiting} 人</span></div>`
          )
          .join('') +
        (state.config.strategy === 'pooled'
          ? `<p class="queue-pool">公共队列 ${snap.centralQueue} 人，不计入单窗口队列。</p>`
          : '');
      $('scene-note').textContent = '二维与三维使用同一份仿真记录。点状图标压缩显示，数字为全量统计。';
    }
  }
  function inspect(item) {
    let rows, title;
    if (item.type === 'student') {
      const s = state.result.students.find((x) => x.id === item.id);
      if (!s) return;
      state.playing = false;
      updatePlay();
      renderFrame();
      title = `模拟学生 ${s.id + 1} · ${s.gradeName}`;
      rows = [
        ['放行', clock(s.release)],
        ['到达', clock(s.arrival)],
        ['开始取餐', clock(s.start)],
        ['取餐结束', clock(s.end)],
        ['排队', f(s.wait) + ' 分'],
        ['等座', f(s.seatWait) + ' 分'],
        ['端盘步行', f((s.indoorWalk || 0) * 60, 1) + ' 秒'],
        ['开始用餐', clock(s.seatStart)],
        ['用餐结束', clock(s.mealEnd)],
        ['返回教室', clock(s.endpointTime)],
        ['完整用时', f(s.readyToEndpoint) + ' 分'],
        ['是否按时', s.late ? '超过设定截止' : '按时完成']
      ];
    } else {
      const w = state.result.windows[item.id];
      title = `${item.id + 1} 号通用窗口`;
      rows = [
        ['本轮服务', w.served + ' 人'],
        ['平均排队', f(w.meanWait) + ' 分'],
        ['实际平均服务', f(w.meanServiceActual * 60, 1) + ' 秒'],
        ['计划时段利用率', f(w.utilizationScheduled * 100, 1) + '%'],
        ['供餐加班', f(w.overtimeMinutes) + ' 分']
      ];
    }
    $('selection-details').open = true;
    $('inspect-text').textContent = title;
    $('inspect-detail').innerHTML =
      '<dl>' +
      rows.map(([k, v]) => `<div><dt>${escape(k)}</dt><dd>${escape(v)}</dd></div>`).join('') +
      '</dl>';
  }
  function updatePlay() {
    $('play').innerHTML = DiningIcons(state.playing ? 'pause' : 'play');
    $('play').setAttribute('aria-label', state.playing ? '暂停回放' : '播放回放');
  }
  function animate(now) {
    if (state.playing && state.result) {
      const dt = Math.min((now - state.lastTick) / 1000, 0.2);
      state.time = Math.min(state.result.metrics.observationEnd, state.time + dt * Number($('speed').value));
      renderFrame();
      if (state.time >= state.result.metrics.observationEnd) {
        state.playing = false;
        updatePlay();
      }
    }
    state.lastTick = now;
    requestAnimationFrame(animate);
  }
  function renderChart() {
    const r = state.result,
      end = r.metrics.observationEnd,
      max = Math.max(4, Math.ceil(Math.max(r.metrics.peakQueue, r.metrics.peakSeatWaiting) / 4) * 4),
      host = $('queue-chart'),
      width = Math.max(200, host.clientWidth),
      height = 248,
      left = 46,
      right = width - 14,
      top = 38,
      bottom = 210;
    const x = time => left + time / end * (right - left),
      y = count => bottom - count / max * (bottom - top);
    const line = (items, key) =>
      items
        .map(
          (p, i) =>
            `${i ? 'L' : 'M'}${f(x(p.time), 1)},${f(y(p[key]), 1)}`
        )
        .join(' ');
    const q = r.timeline,
      seat = r.diningTimeline;
    $('chart-note').textContent =
      `人数，不含正在取餐者。曲线按 ${f(r.meta.timelineStepMinutes, 2)} 分钟采样连线；峰值统计按完整事件计算，可能位于采样点之间。`;
    const tickStep = [1,2,5,10,15,20,30,60,120,180,360,720,1440].find(step => end / step <= Math.max(2, Math.floor((right-left)/76))) || Math.ceil(end/1440)*1440;
    const ticks = [];
    for(let t=0;t<=end;t+=tickStep) ticks.push(t);
    if(end-ticks[ticks.length-1] > tickStep*.8) ticks.push(end);
    const grid = Array.from({length:5},(_,i)=>{
      const count=max*i/4,py=y(count);
      return `<path d="M${left} ${py}H${right}" stroke="#e2e9e4"/><text x="${left-9}" y="${py+4}" text-anchor="end" class="chart-axis">${count}</text>`;
    }).join('');
    const axis=ticks.map(t=>`<g class="chart-time-tick"><path d="M${x(t)} ${bottom}v5" stroke="#a3b4aa"/><text x="${x(t)}" y="${bottom+25}" text-anchor="${t===0?'start':t===end?'end':'middle'}" class="chart-axis">${shortClock(t)}</text></g>`).join('');
    host.innerHTML =
      `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true">${grid}${axis}<path d="${line(q, 'waiting')}" fill="none" stroke="#28755b" stroke-width="2.5"/><path d="${line(seat, 'seatWaiting')}" fill="none" stroke="#a7792d" stroke-width="2"/><text x="${left}" y="18" class="chart-axis">排队人数</text><circle cx="${left+87}" cy="13" r="4" fill="#28755b"/><text x="${left+98}" y="18" class="chart-axis">排队</text><circle cx="${left+151}" cy="13" r="4" fill="#a7792d"/><text x="${left+162}" y="18" class="chart-axis">等座</text><g class="chart-cursor" visibility="hidden"><path stroke="#497a65" stroke-dasharray="4 4"/><circle r="4.5" fill="#28755b" stroke="white" stroke-width="2"/><circle r="4" fill="#a7792d" stroke="white" stroke-width="2"/></g></svg><div class="queue-tooltip" role="status" aria-live="polite" hidden></div>`;
    const cursor=host.querySelector('.chart-cursor'),tip=host.querySelector('.queue-tooltip');
    let index=0;
    const nearest=(items,t)=>{
      let lo=0,hi=items.length-1;
      while(lo<hi){const mid=(lo+hi)>>1;if(items[mid].time<t)lo=mid+1;else hi=mid;}
      return lo>0&&t-items[lo-1].time<items[lo].time-t?lo-1:lo;
    };
    function show(i){
      index=Math.max(0,Math.min(q.length-1,i));
      const point=q[index],waiting=seat[nearest(seat,point.time)].seatWaiting,px=x(point.time);
      cursor.setAttribute('visibility','visible');
      cursor.querySelector('path').setAttribute('d',`M${px} ${top}V${bottom}`);
      const dots=cursor.querySelectorAll('circle');
      [point.waiting,waiting].forEach((n,j)=>{dots[j].setAttribute('cx',px);dots[j].setAttribute('cy',y(n));});
      tip.hidden=false;
      tip.innerHTML=`<time>${clock(point.time)}</time><span>排队人数<strong>${point.waiting}人</strong></span><span>等座人数<strong>${waiting}人</strong></span>`;
      tip.dataset.time=point.time;
      tip.style.left=Math.max(0,Math.min(width-tip.offsetWidth,px+14>width-tip.offsetWidth?px-tip.offsetWidth-14:px+14))+'px';
    }
    function hide(){cursor.setAttribute('visibility','hidden');tip.hidden=true;}
    function pointAt(event){
      const rect=host.querySelector('svg').getBoundingClientRect(),px=(event.clientX-rect.left)*width/rect.width,py=(event.clientY-rect.top)*height/rect.height;
      if(px<left||px>right||py<top||py>bottom){hide();return;}
      show(nearest(q,(px-left)/(right-left)*end));
    }
    host.onpointermove=pointAt;host.onpointerdown=pointAt;host.onpointerleave=hide;host.onblur=hide;
    host.onkeydown=event=>{
      if(!['ArrowLeft','ArrowRight','Home','End','Escape'].includes(event.key))return;
      event.preventDefault();
      if(event.key==='Escape'){hide();return;}
      show(event.key==='Home'?0:event.key==='End'?q.length-1:index+(event.key==='ArrowRight'?1:-1));
    };
  }
  function field(key, label, value, options = {}) {
    const type = options.type || 'number',
      min = options.min ?? 0,
      max = options.max ?? 720,
      step = options.step ?? 'any';
    let day = 0;
    if (type === 'time' && String(value).includes('天 ')) {
      const parts = String(value).split('天 ');
      day = Number(parts[0]);
      value = parts[1];
      label += `（第 ${day + 1} 天）`;
    }
    return `<label class="field">${label}<input name="${key}" type="${type}" data-day="${day}" value="${escape(value)}" ${type === 'number' ? `min="${min}" max="${max}" step="${step}"` : ''} ${type === 'time' ? 'step="60"' : ''} ${options.optional ? '' : 'required'}>${options.note ? `<span class="caption">${options.note}</span>` : ''}</label>`;
  }
  function parameters() {
    if (state.busy) {
      message('实验正在计算', '请等待本轮实验结束后再修改参数。');
      return;
    }
    $('parameter-fields').innerHTML = window.DiningParameterView(state.config, field, escape, shortClock);
    parameterOriginal = Object.fromEntries(new FormData($('parameter-form')));
    $('parameter-error').textContent = '';
    $('parameter-dialog').showModal();
  }
  function readParameters() {
    const data = new FormData($('parameter-form'));
    const n = (k) => Number(data.get(k)),
      changed = (k) => String(data.get(k) ?? '') !== String(parameterOriginal[k] ?? '');
    const time = (k) => {
      const v = data.get(k);
      if (!v) return null;
      const [h, m] = v.split(':').map(Number);
      return h * 60 + m - 680 + 1440 * Number($('parameter-form').elements.namedItem(k).dataset.day || 0);
    };
    const c = R.clone(state.config);
    for (const g of c.grades) {
      for (const key of ['students', 'classes', 'classInterval', 'assemblyMax', 'walkMin', 'walkMax'])
        if (changed(`g${g.id}_${key}`)) g[key] = n(`g${g.id}_${key}`);
      for (const key of ['readyTime', 'releaseTime', 'deadline', 'latestReleaseTime'])
        if (changed(`g${g.id}_${key}`)) g[key] = time(`g${g.id}_${key}`);
      g.releaseLocked = data.get(`g${g.id}_releaseLocked`) === 'on';
      if (changed(`g${g.id}_classSizes`)) {
        const sizes = String(data.get(`g${g.id}_classSizes`)).trim();
        g.classSizes = sizes ? sizes.split(',').map((x) => Number(x.trim())) : null;
      }
    }
    c.students = c.grades.reduce((sum, g) => sum + g.students, 0);
    if (!c.students) throw new Error('请至少设置一名就餐学生，再进行比较。');
    if (changed('windows')) {
      c.windows = n('windows');
      c.windowOwners = Array.from(
        { length: c.windows },
        (_, i) => state.config.windowOwners[i] ?? Math.min(2, Math.floor((i * 3) / c.windows))
      );
      if (c.windowMeans)
        c.windowMeans = Array.from(
          { length: c.windows },
          (_, i) => state.config.windowMeans[i] ?? c.serviceMean
        );
    }
    if (changed('serviceMean')) {
      c.serviceMean = n('serviceMean');
      c.windowMeans = Array(c.windows).fill(c.serviceMean);
    }
    for (const key of ['serviceCV', 'mealMean', 'mealCV', 'indoorWalkSpeed', 'returnMinutes', 'seed', 'horizon'])
      if (changed(key)) c[key] = n(key);
    if (changed('seats')) c.seats = n('seats');
    if (changed('seatWaitingCapacity'))
      c.seatWaitingCapacity =
        String(data.get('seatWaitingCapacity')).trim() === '' ? null : n('seatWaitingCapacity');
    if (changed('windowMeans')) {
      const raw = String(data.get('windowMeans')).trim();
      c.windowMeans = raw ? raw.split(',').map((x) => Number(x.trim())) : null;
    }
    for (const key of ['serviceStart', 'serviceEnd']) if (changed(key)) c[key] = time(key);
    if (changed('returnDestination')) c.returnDestination = data.get('returnDestination');
    if (R.changes(state.config, c).length) {
      c.sourceProfile = {
        ...(c.sourceProfile || R.example().sourceProfile),
        status: 'modified',
        title: '自定义三年级场景 · 合成参数'
      };
    }
    return Common.normalize(c);
  }
  function decisionInsight(d) {
    const assessment = d.decision;
    const affected = assessment.mostAffected;
    let title = '各年级平均完整用时均未增加',
      text = '继续查看各年级结果与按时完成率。';
    if (!assessment.comparability.comparable) {
      title = '比较口径发生变化';
      text = '可查看描述结果，本次不作同一人群的年级受益或受损判断。';
    } else if (affected && affected.delta.mean > 1e-9) {
      title = assessment.total.mean < 0 ? '总体变快，也有年级变慢' : '有年级平均用时增加';
      const amount = affected.delta.mean < 0.01 ? '不足0.01' : f(affected.delta.mean);
      text = `${affected.name}的平均完整用时增加${amount}分钟。平均变化不代表每位学生的变化。`;
    }
    return `<div class="decision-insight${affected?.delta.mean > 1e-9 ? ' caution' : ''}"><h3>${title}</h3><p>${escape(text)}</p>${assessment.comparability.reasons.map((reason) => `<p class="notice">${escape(reason.text)}</p>`).join('')}</div>`;
  }
  // A message task yields to input/paint without background setTimeout clamping.
  const uiTasks = [],
    uiChannel = new MessageChannel();
  uiChannel.port1.onmessage = () => uiTasks.shift()?.();
  const yieldUI = async () => {
    await new Promise((resolve) => {
      uiTasks.push(resolve);
      uiChannel.port2.postMessage(null);
    });
    if (state.cancelRequested) throw new DOMException('本轮计算已取消', 'AbortError');
  };
  function addCancel(progressId) {
    const button = document.createElement('button');
    button.className = 'button';
    button.textContent = '取消本轮计算';
    button.onclick = () => {
      state.cancelRequested = true;
      button.disabled = true;
      button.textContent = '正在结束本轮…';
    };
    $(progressId).closest('.progress-wrap').append(button);
  }
  function experimentError(outputId, title, error) {
    const cancelled = error.name === 'AbortError';
    $(outputId).innerHTML =
      '<p class="notice">' +
      (cancelled ? '本轮已取消，没有生成不完整的比较或推荐。' : '本轮未完成，请检查参数后重试。') +
      '</p>';
    if (!cancelled) message(title, error.message);
    status(cancelled ? '计算已取消，可以继续调整参数' : title);
  }
  function busy(value) {
    state.busy = value;
    if (value) state.cancelRequested = false;
    for (const id of ['search-run','parameters','example-reset','guided-compare']) $(id).disabled = value;
    plannerUI?.updateDisabled(value);
  }
  function gradeComparison(configA, configB, a, b) {
    return `<div class="result-note"><h3>各年级结果</h3><p>各轮均值；无人年级显示“—”。</p></div><div class="result-table" tabindex="0" role="region" aria-label="结果表，窄屏可横向滚动"><table><thead><tr><th>年级</th><th>人数 A / B</th><th>完整用时 A → B / 分</th><th>按时完成 A → B</th></tr></thead><tbody>${configA.grades
      .map((g, i) => {
        const countA = a[`grade${i}Count`],
          countB = b[`grade${i}Count`];
        const value = (summary, key, count, percent = false) =>
          count ? f(summary[key] * (percent ? 100 : 1), percent ? 1 : 2) + (percent ? '%' : '') : '—';
        return `<tr><td>${escape(g.name)}${g.name !== configB.grades[i].name ? ' → ' + escape(configB.grades[i].name) : ''}</td><td>${countA} / ${countB}</td><td>${value(a, `grade${i}Total`, countA)} → ${value(b, `grade${i}Total`, countB)}</td><td>${value(a, `grade${i}OnTime`, countA, true)} → ${value(b, `grade${i}OnTime`, countB, true)}</td></tr>`;
      })
      .join('')}</tbody></table></div>`;
  }
  async function search() {
    busy(true);
    state.search = null;
    updateSearchState();
    state.playing = false;
    updatePlay();
    const original = R.clone(state.config),
      sets = R.seedSets(original.seed, 10, 30),
      set = R.candidates(original, { reallocate: false });
    $('search-output').className = '';
    $('search-output').innerHTML =
      '<div class="panel progress-wrap"><h2>逐个检查候选方案…</h2><progress id="search-progress" max="' +
      Math.max(1, set.accepted.length * 10) +
      '" value="0"></progress><p id="search-status" class="caption"></p></div>';
    addCancel('search-progress');
    try {
      const evaluated = [];
      for (const item of set.accepted) {
        const rounds = [];
        for (const seed of sets.screening) {
          rounds.push(R.metrics(E.simulateSchool({ ...item.config, seed })));
          $('search-progress').value++;
          await yieldUI();
        }
        evaluated.push({ ...item, ...R.summarize(rounds), rounds });
        $('search-status').textContent = `已检查 ${evaluated.length} / ${set.accepted.length} 个候选`;
      }
      const front = R.pareto(evaluated).sort(
        (a, b) => a.meanTotal - b.meanTotal || a.meanWait - b.meanWait || a.id.localeCompare(b.id)
      );
      state.search = {
        schema: 'dining-search/2',
        build: window.DiningLabBuild || null,
        evidence: 'synthetic',
        original,
        seedSets: sets,
        scope: set.scope,
        screened: evaluated,
        rejected: set.rejected,
        front: front.map((x) => x.id),
        verifications: []
      };
      renderSearch(front);
      status(`完成 ${evaluated.length} 个候选 × 10 轮筛选；尚未验证候选的独立表现`);
    } catch (error) {
      experimentError('search-output', '筛选未完成', error);
    } finally {
      busy(false);
    }
  }
  function renderSearch(front) {
    const s = state.search;
    const candidate = (x) =>
      `<article class="panel candidate-row"><div><h3>${escape(x.label)}</h3>${x.capacityExceeded ? '<p class="bad">等座容量超限</p>' : ''}</div><div class="candidate-metrics"><div><span>完整用时 / 分</span><strong>${f(x.meanTotal)}</strong></div><div><span>排队 / 分</span><strong>${f(x.meanWait)}</strong></div><div><span>年级差 / 分</span><strong>${f(x.gradeGap)}</strong></div></div><button class="button" data-verify="${x.id}">复核此方案</button></article>`;
    const visible = front.slice(0, 4),
      remaining = front.slice(4);
    $('search-output').innerHTML =
      `<div class="panel result-heading"><h2>${front.length ? `筛选出 ${front.length} 个候选方案` : '没有可行候选'}</h2><p>按完整用时排序，复核时还需检查每个年级的增加用时。</p><button id="export-search" class="text-button">导出全部结果</button></div><div class="search-list">${visible.map(candidate).join('')}</div>${remaining.length ? `<details class="more-candidates"><summary>展开其余 ${remaining.length} 个候选</summary><div class="search-list">${remaining.map(candidate).join('')}</div></details>` : ''}<div id="verification-output"></div>${s.rejected.length ? `<details class="panel prose" style="margin-top:18px"><summary>${s.rejected.length} 个候选因约束被排除</summary>${s.rejected.map((x) => `<p>${escape(x.id)}：${escape(x.reason)}</p>`).join('')}</details>` : ''}`;
    $('export-search').onclick = () => json('候选筛选_合成实验.json', state.search);
    document
      .querySelectorAll('[data-verify]')
      .forEach((b) => (b.onclick = () => verifyCandidate(b.dataset.verify)));
  }
  async function verifyCandidate(id) {
    if (state.busy) return;
    const s = state.search,
      item = s.screened.find((x) => x.id === id);
    if (!item) return;
    busy(true);
    const out = $('verification-output');
    out.innerHTML =
      '<div class="panel progress-wrap"><h2>独立种子复核中…</h2><progress id="verify-progress" value="0" max="30"></progress></div>';
    addCancel('verify-progress');
    try {
      const a = [],
        b = [];
      for (const seed of s.seedSets.verification) {
        a.push(R.metrics(E.simulateSchool({ ...s.original, seed })));
        b.push(R.metrics(E.simulateSchool({ ...item.config, seed })));
        $('verify-progress').value++;
        await yieldUI();
      }
      const delta = R.paired(
          a.map((x) => x.meanTotal),
          b.map((x) => x.meanTotal)
        ),
        record = {
          candidate: id,
          seeds: s.seedSets.verification,
          original: a,
          candidateRounds: b,
          meanTotalDifference: delta
        };
      record.differences = Object.fromEntries(
        ['meanWait', 'meanTotal', 'p95Wait', 'gradeGap'].map((key) => [
          key,
          R.paired(
            a.map((x) => x[key]),
            b.map((x) => x[key])
          )
        ])
      );
      record.decisionVersion = D.VERSION;
      record.decision = D.assess(s.original, item.config, a, b);
      s.verifications.push(record);
      out.innerHTML = `<article class="panel prose" style="margin-top:18px"><span class="tag">独立复核 · 30 轮</span><h2>${escape(item.label)}</h2><p>相对原始当前方案，完整用时平均变化 <b>${delta.mean > 0 ? '+' : ''}${f(delta.mean)} 分钟</b>，配对差值 95% 区间为 [${f(delta.low)}, ${f(delta.high)}]。</p><p>${delta.high < 0 ? '本次独立样本支持完整用时下降，仍需检查其他指标与现实适用性。' : delta.low > 0 ? '本次独立样本显示完整用时增加，不应把它称为更快。' : '区间包含零；本次样本不足以明确区分完整用时差异。'}</p><button id="apply-candidate" class="button">载入仿真</button><details><summary>复核使用说明</summary><p>若查看多个候选后再挑选，需另用新的随机种子作最终检验。</p></details></article>`;
      const originalSummary = R.summarize(a),
        candidateSummary = R.summarize(b);
      out.insertAdjacentHTML(
        'beforeend',
        `<article class="panel" style="margin-top:12px">${decisionInsight(record)}<div class="result-note"><h3>复核中的其他取舍</h3><p>原始方案 → 候选。完整差值及区间保存在筛选导出中。</p></div><div class="result-table" tabindex="0" role="region" aria-label="结果表，窄屏可横向滚动"><table><thead><tr><th>指标</th><th>原始方案</th><th>候选方案</th></tr></thead><tbody>${[
          ['取餐排队 / 分', 'meanWait'],
          ['P95排队 / 分', 'p95Wait'],
          ['等座 / 分', 'seatWait'],
          ['年级差 / 分', 'gradeGap'],
          ['最慢年级均值 / 分', 'worstGrade']
        ]
          .map(
            ([label, key]) =>
              `<tr><td>${label}</td><td>${f(originalSummary[key])}</td><td>${f(candidateSummary[key])}</td></tr>`
          )
          .join(
            ''
          )}</tbody></table></div>${gradeComparison(s.original, item.config, originalSummary, candidateSummary)}</article>`
      );
      $('apply-candidate').onclick = () => {
        run(item.config);
        tab('live');
      };
      status('独立复核完成；结果已加入本次筛选导出');
    } catch (error) {
      experimentError('verification-output', '复核未完成', error);
    } finally {
      busy(false);
    }
  }
  document.querySelector('.brand').onclick = (e) => {
    e.preventDefault();
    tab('live');
  };
  document.querySelectorAll('.nav').forEach((b) => (b.onclick = () => tab(b.dataset.tab)));
  $('help').onclick = () => tab('evidence');
  document.querySelectorAll('[data-open-tab]').forEach((button) => {
    button.onclick = () => {
      tab(button.dataset.openTab);
      if (button.dataset.openTab === 'live') parameters();
    };
  });
  $('parameters').onclick = parameters;
  $('edit-grades').onclick = parameters;
  $('guided-compare').onclick = () => { tab('compare'); $('research-tools').open = true; $('research-tools').querySelector('summary').focus(); };
  $('close-parameters').onclick = $('cancel-parameters').onclick = () => $('parameter-dialog').close();
  $('message-close').onclick = () => $('message-dialog').close();
  // Reveal a folded invalid input before the browser tries to focus it.
  $('parameter-form').addEventListener(
    'invalid',
    (event) => {
      let parent = event.target.parentElement;
      while (parent && parent !== $('parameter-form')) {
        if (parent.tagName === 'DETAILS') parent.open = true;
        parent = parent.parentElement;
      }
    },
    true
  );
  document.addEventListener('click', (event) => {
    document.querySelectorAll('.file-menu[open]').forEach((menu) => {
      if (!menu.contains(event.target) || event.target.closest('button')) menu.open = false;
    });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    document.querySelectorAll('.file-menu[open]').forEach((menu) => {
      if (menu.contains(document.activeElement)) menu.querySelector('summary').focus();
      menu.open = false;
    });
  });
  $('parameter-form').onsubmit = (e) => {
    e.preventDefault();
    try {
      run(readParameters());
      $('parameter-dialog').close();
    } catch (error) {
      $('parameter-error').textContent = error.message;
    }
  };
  $('view-3d').onclick = () => {
    if (state.view) setMode('3d');
    else message('3D 暂不可用', '当前图形环境使用二维显示，仿真计算和导出仍可正常使用。');
  };
  $('view-2d').onclick = () => setMode('2d');
  $('scene-labels').onclick = () => {
    const expanded = $('scene-labels').getAttribute('aria-pressed') !== 'true';
    $('scene-labels').setAttribute('aria-pressed', String(expanded));
    $('scene3d').classList.toggle('show-labels', expanded);
    $('scene-labels').innerHTML=DiningIcons('info')+(expanded?'隐藏场景信息':'显示场景信息');
    renderFrame();
  };
  $('scene2d').onclick = (event) => {
    const button = event.target.closest('[data-window]');
    if (button) inspect({ type: 'window', id: Number(button.dataset.window) });
  };
  document
    .querySelectorAll('[data-camera]')
    .forEach((b) => (b.onclick = () => {state.view?.setCamera(b.dataset.camera);document.querySelectorAll('[data-camera]').forEach(button=>button.setAttribute('aria-pressed',String(button===b)));}));
  $('student-locate-form').onsubmit=event=>{
    event.preventDefault();
    const id=Number($('student-number').value)-1,student=state.result.students.find(s=>s.id===id);
    if(!student) return;
    state.playing=false;
    state.time=student.seatRoute?.length?(student.seatWalkStart+student.seatStart)/2:(student.arrival+student.start)/2;
    state.view?.selectStudent(id);
    if(state.view&&state.mode!=='3d')setMode('3d');
    updatePlay();renderFrame();inspect({type:'student',id});
    $('student-locate-status').textContent='已定位 '+(id+1)+' 号学生'+(state.view?' · 就餐轨迹示意':'');
  };
  $('play').onclick = () => {
    if (state.time >= state.result.metrics.observationEnd) state.time = 0;
    state.playing = !state.playing;
    updatePlay();
    renderFrame();
  };
  $('timeline').oninput = () => {
    state.playing = false;
    state.time = Number($('timeline').value);
    updatePlay();
    renderFrame();
  };
  $('peak').onclick = () => {
    state.time = state.result.metrics.peakQueueTime;
    state.playing = false;
    updatePlay();
    renderFrame();
  };
  $('export-run').onclick = exportRun;
  $('export-students').onclick = exportStudents;
  $('example-reset').onclick = () => run(exampleConfig());
  $('search-run').onclick = search;
  $('learning-example').onclick = () => tab('live');
  $('download-observation').onclick = () =>
    download(
      '匿名观察记录_空白模板.csv',
      R.csv([
        {
          日期: '',
          餐次: '',
          学段: '',
          年级: '',
          匿名批次编号: '',
          到达时刻: '',
          开始取餐时刻: '',
          取餐结束时刻: '',
          开始用餐时刻: '',
          结束用餐时刻: '',
          开放窗口数: '',
          记录者: '',
          数据来源: '待真实记录；请勿填写姓名、学号或联系方式'
        }
      ]),
      'text/csv;charset=utf-8'
    );
  $('save-note').onclick = () => {
    try {
      localStorage.setItem(
        'dining-lab-research-note',
        JSON.stringify({
          savedAt: new Date().toISOString(),
          text: $('research-note').value,
          config: R.session(state.config)
        })
      );
      status('个人记录已保存到此浏览器，建议另外导出备份');
    } catch (error) {
      message('无法本地保存', '请点击导出记录保存为文件。');
    }
  };
  $('export-note').onclick = () =>
    json('我的真实研究记录.json', {
      savedAt: new Date().toISOString(),
      text: $('research-note').value,
      config: R.session(state.config),
      contribution: '本人填写，非软件代写'
    });
  try {
    const saved = JSON.parse(localStorage.getItem('dining-lab-research-note') || 'null');
    if (saved) $('research-note').value = saved.text || '';
  } catch (_) {}
  plannerUI = window.DiningPlannerView.mount({
    getConfig: () => state.config,
    isBusy: () => state.busy,
    setBusy: busy,
    yieldUI,
    addCancel,
    message,
    status,
    json,
    download,
    loadConfig: (config, original) => {
      run(config);
      tab('live');
      status('放行表已载入，可查看运行过程');
    }
  });
  scheduleUI = window.DiningScheduleView.mount({
    getConfig: () => state.config, isBusy: () => state.busy, setBusy: busy,
    yieldUI, message, status, json, download,
    loadConfig: (config) => { run(config); tab('live'); status('研究方案已载入，可观察就餐过程'); }
  });
  workflowUI = window.DiningWorkflow.mount({getConfig: () => state.config, getResult: () => state.result, isBusy: () => state.busy, run, tab, parameters, message});
  run(state.config);
  tab('setup');
  requestAnimationFrame(animate);
  new ResizeObserver(() => {
    if (state.tab === 'compare') renderChart();
  }).observe($('queue-chart'));
  // Read-only test visibility. Consumers must use UI actions for changes.
  Object.defineProperty(window, 'DiningLabSnapshot', {
    get: () => ({
      version: R.VERSION,
      build: window.DiningLabBuild ? R.clone(window.DiningLabBuild) : null,
      tab: state.tab,
      mode: state.mode,
      rendering: state.view ? {seatCount:state.view.layout.displaySeats.length,chairsDrawn:state.view.worldGroup.getObjectByName('日光食堂建筑')?.userData.chairsDrawn,tableCount:state.view.layout.tables.length,drawCalls: state.view.renderer.info.render.calls,triangles: state.view.renderer.info.render.triangles,geometries: state.view.renderer.info.memory.geometries,textures: state.view.renderer.info.memory.textures,visiblePeople: state.view.crowd?.items.length || 0,pickedStudent:state.view.selectedId,journeySegments:state.view.journeyTrace?.count||0,pickTargets:state.view.getPickTargets()} : null,
      busy: state.busy,
      config: R.clone(state.config),
      metrics: R.metrics(state.result),
      time: state.time,
      comparison: state.comparison ? R.clone(state.comparison) : null,
      scenarioCheck: state.scenarioCheck ? R.clone(state.scenarioCheck) : null,
      search: state.search ? R.clone(state.search) : null,
      scheduleStudy: R.clone(scheduleUI?.snapshot() || null),
      planner: R.clone(plannerUI?.snapshot() || null)
    })
  });
})();
