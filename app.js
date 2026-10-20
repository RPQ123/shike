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
    live: '过程展示',
    compare: '结果展示',
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
    if (state.comparison) renderComparison();
    renderGuide();
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
    $('scenario-name').textContent = (c.sourceProfile?.title || '自定义场景').replace(/\s*·\s*合成参数$/, '');
    $('scenario-detail').textContent = `${c.students} 人 · ${c.windows} 窗口 · ${c.seats} 座位`;
    $('current-detail').textContent = describe(c);
    const cards = [
      ['平均就餐排队时间', m.meanWait, '分'],
      ['平均完整用时', m.meanTotal, '分'],
      ['按时返回', m.onTime * 100, '%']
    ];
    $('kpis').innerHTML = cards
      .map(
        ([label, value, unit]) =>
          `<div class="kpi"><div class="label">${label}</div><strong>${f(value, 1)}</strong><span class="unit">${unit}</span></div>`
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
    $('live-counts').innerHTML = counts.map(([k, v]) => `<span>${k}<b>${v}</b></span>`).join('');
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
      title = `模拟学生 ${s.id + 1} · ${s.gradeName}`;
      rows = [
        ['放行', clock(s.release)],
        ['到达', clock(s.arrival)],
        ['开始取餐', clock(s.start)],
        ['排队', f(s.wait) + ' 分'],
        ['等座', f(s.seatWait) + ' 分'],
        ['端盘步行', f((s.indoorWalk || 0) * 60, 1) + ' 秒'],
        ['开始用餐', clock(s.seatStart)],
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
    $('play').textContent = state.playing ? 'Ⅱ' : '▶';
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
      max = Math.max(1, r.metrics.peakQueue, r.metrics.peakSeatWaiting),
      width = Math.max(270, $('queue-chart').clientWidth),
      height = 180,
      left = 38,
      right = width - 14,
      bottom = 148;
    const line = (items, key) =>
      items
        .map(
          (p, i) =>
            `${i ? 'L' : 'M'}${f(left + (p.time / end) * (right - left), 1)},${f(bottom - (p[key] / max) * 110, 1)}`
        )
        .join(' ');
    const q = r.timeline,
      seat = r.diningTimeline;
    $('chart-note').textContent =
      `人数，不含正在取餐者。曲线按 ${f(r.meta.timelineStepMinutes, 2)} 分钟采样连线；峰值统计按完整事件计算，可能位于采样点之间。`;
    $('queue-chart').innerHTML =
      `<svg viewBox="0 0 ${width} ${height}"><path d="M${left} 32V${bottom}H${right}" fill="none" stroke="#cddaca"/><path d="${line(q, 'waiting')}" fill="none" stroke="#28755b" stroke-width="2"/><path d="${line(seat, 'seatWaiting')}" fill="none" stroke="#c39953" stroke-width="2"/><text x="${left - 5}" y="38" text-anchor="end" class="chart-axis">${max}</text><text x="${left}" y="172" class="chart-axis">11:20</text><text x="${right}" y="172" text-anchor="end" class="chart-axis">${shortClock(end)}</text><text x="${left}" y="18" class="chart-axis">绿色：排队　金色：等座</text></svg>`;
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
  function setBaseline(c, label) {
    state.baseline = Common.normalize(c);
    $('baseline-name').textContent = label;
    $('baseline-detail').textContent = describe(c);
    if (state.comparison) renderComparison();
    renderGuide();
    status('已保存方案 A；后续修改不会改变它');
  }
  function renderGuide() {
    const finished =
      state.comparison &&
      state.baseline &&
      !R.changes(state.comparison.configA, state.baseline).length &&
      !R.changes(state.comparison.configB, state.config).length &&
      state.comparison.configB.seed === state.config.seed;
    const stage = finished ? 4 : !state.baseline ? 1 : R.changes(state.baseline, state.config).length ? 3 : 2;
    document.querySelectorAll('[data-experiment-step]').forEach((item) => {
      const step = Number(item.dataset.experimentStep);
      item.classList.toggle('complete', step < stage);
      if (step === stage) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
  }
  function comparisonIsCurrent() {
    const d = state.comparison;
    return !!(
      d &&
      state.baseline &&
      !R.changes(d.configA, state.baseline).length &&
      !R.changes(d.configB, state.config).length &&
      d.configB.seed === state.config.seed
    );
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
    for (const id of [
      'compare-run',
      'search-run',
      'parameters',
      'set-baseline',
      'sync-baseline',
      'example-reset',
      'import',
      'guided-compare',
      'try-gap',
      'try-window',
      'compare-edit',
      'scenario-run',
      'scenario-repeats',
      'grade-limit'
    ])
      $(id).disabled = value;
    if (!value) $('scenario-run').disabled = !comparisonIsCurrent();
    plannerUI?.updateDisabled(value);
  }
  async function pairedRun() {
    if (!state.baseline) {
      message('先保存方案 A', '点击“保存当前方案为 A”，再修改 B。');
      return;
    }
    const a = R.clone(state.baseline),
      b = R.clone(state.config),
      count = Number($('repeats').value),
      seeds = R.seedSets(b.seed, count, 2).screening;
    busy(true);
    state.comparison = null;
    state.scenarioCheck = null;
    $('scenario-output').replaceChildren();
    $('scenario-section').hidden = true;
    $('export-scenarios').disabled = true;
    renderGuide();
    $('export-compare').disabled = true;
    state.playing = false;
    updatePlay();
    $('compare-output').className = 'panel comparison-result';
    $('compare-output').innerHTML =
      '<div class="progress-wrap"><h2>正在比较两个方案…</h2><progress id="compare-progress" max="' +
      count +
      '" value="0"></progress></div>';
    addCancel('compare-progress');
    try {
      const ra = [],
        rb = [];
      for (let i = 0; i < count; i++) {
        ra.push(R.metrics(E.simulateSchool({ ...a, seed: seeds[i] })));
        rb.push(R.metrics(E.simulateSchool({ ...b, seed: seeds[i] })));
        $('compare-progress').value = i + 1;
        await yieldUI();
      }
      const differences = {};
      for (const key of ['meanWait', 'meanTotal', 'p95Wait', 'gradeGap'])
        differences[key] = R.paired(
          ra.map((x) => x[key]),
          rb.map((x) => x[key])
        );
      state.comparison = {
        schema: 'dining-comparison/2',
        build: window.DiningLabBuild || null,
        evidence: 'synthetic',
        configA: a,
        configB: b,
        seeds,
        A: { rounds: ra, ...R.summarize(ra) },
        B: { rounds: rb, ...R.summarize(rb) },
        differences
      };
      renderComparison();
      renderGuide();
      $('export-compare').disabled = false;
      status('比较完成 · ' + count + ' 轮');
    } catch (error) {
      experimentError('compare-output', '实验未完成', error);
    } finally {
      busy(false);
    }
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
  function renderComparison() {
    const d = state.comparison,
      rows = [
        ['平均排队', 'meanWait'],
        ['平均完整用时', 'meanTotal'],
        ['P95 排队', 'p95Wait'],
        ['年级完整用时差', 'gradeGap']
      ];
    d.decisionVersion = D.VERSION;
    d.decision = D.assess(d.configA, d.configB, d.A.rounds, d.B.rounds, Number($('grade-limit').value));
    let headline = d.differences.meanTotal.mean < 0 ? 'B 的平均完整用时更短' : 'B 的平均完整用时未缩短';
    if (d.differences.meanWait.mean < 0 && d.differences.meanTotal.mean > 0)
      headline = '排队减少，完整用时增加';
    if (d.differences.meanTotal.mean === 0) headline = '两方案的平均完整用时相同';
    const interval = d.differences.meanTotal,
      interpretation =
        interval.low === 0 && interval.high === 0
          ? '完整用时的逐轮配对差值均为零。'
          : interval.low <= 0 && interval.high >= 0
            ? '完整用时差值区间包含零，本次样本不足以明确区分两方案。'
            : interval.high < 0
              ? '完整用时差值区间整体小于零，本次模型样本支持均值下降。'
              : '完整用时差值区间整体大于零，本次模型样本显示均值增加。';
    const stale =
      R.changes(d.configB, state.config).length ||
      d.configB.seed !== state.config.seed ||
      !state.baseline ||
      R.changes(d.configA, state.baseline).length;
    $('compare-output').innerHTML =
      `<div class="result-heading"><span class="result-meta">${d.seeds.length} 轮配对比较</span><h2>${headline}</h2>${stale ? '<p class="notice">参数已改变，下方为上次结果，请重新比较。</p>' : ''}<p>${interpretation}</p><p>差值 = B − A；负数表示下降。</p></div>${decisionInsight(d)}<div class="result-table" tabindex="0" role="region" aria-label="结果表，窄屏可横向滚动"><table><thead><tr><th>指标 / 分钟</th><th>A 均值</th><th>B 均值</th><th>B − A</th><th>配对差值 95% 区间</th></tr></thead><tbody>${rows
        .map(([label, k]) => {
          const v = d.differences[k];
          return `<tr><td>${label}</td><td>${f(d.A[k])}</td><td>${f(d.B[k])}</td><td class="${v.mean < 0 ? 'good' : v.mean > 0 ? 'bad' : 'neutral'}">${v.mean > 0 ? '+' : ''}${f(v.mean)}</td><td>[${f(v.low)}, ${f(v.high)}]</td></tr>`;
        })
        .join(
          ''
        )}</tbody></table></div><details class="result-note"><summary>查看修改项（${R.changes(d.configA, d.configB).length}）</summary><ul>${
        R.changes(d.configA, d.configB)
          .map((p) => `<li>${escape(p)}</li>`)
          .join('') || '<li>没有参数差异，结果应完全一致。</li>'
      }</ul></details><div class="result-note">按时完成率：A ${f(d.A.onTime * 100, 1)}% → B ${f(d.B.onTime * 100, 1)}%。等座均值：A ${f(d.A.seatWait)} → B ${f(d.B.seatWait)} 分钟。</div><details class="result-note"><summary>结果怎么读</summary><p>95% 区间描述模型内随机波动，不包含学校参数不准确的误差。完整用时从各年级最早允许放行算起；改变允许时刻也会改变计时基准。年级差仅为描述指标，不能独立证明公平。</p></details>${gradeComparison(d.configA, d.configB, d.A, d.B)}`;
    $('scenario-section').hidden = false;
    $('scenario-stale').hidden = !stale;
    $('scenario-run').disabled = state.busy || !!stale;
  }
  async function scenarioRun() {
    const d = state.comparison;
    if (!d || !comparisonIsCurrent()) return;
    const threshold = Number($('grade-limit').value);
    const plan = D.planScenarios(d.configA, d.configB, { repeats: Number($('scenario-repeats').value) });
    if (!plan.executable) {
      message(
        '本次情景计算量较大',
        '请改为10轮，或减少场景人数后重新比较。当前人数×轮次数超过本地检查预算，尚未开始计算。'
      );
      return;
    }
    busy(true);
    state.scenarioCheck = null;
    $('export-scenarios').disabled = true;
    const out = $('scenario-output');
    out.innerHTML = `<div class="progress-wrap"><h3>正在检查${plan.accepted.length}个情景…</h3><progress id="scenario-progress" value="0" max="${plan.accepted.length * plan.repeats}"></progress></div>`;
    addCancel('scenario-progress');
    try {
      const cases = [];
      for (const cell of plan.accepted) {
        const a = [],
          b = [];
        for (const seed of plan.seeds) {
          a.push(R.metrics(E.simulateSchool({ ...cell.configA, seed })));
          b.push(R.metrics(E.simulateSchool({ ...cell.configB, seed })));
          $('scenario-progress').value++;
          await yieldUI();
        }
        cases.push({
          ...cell,
          roundsA: a,
          roundsB: b,
          assessment: D.assess(cell.configA, cell.configB, a, b, threshold)
        });
      }
      state.scenarioCheck = {
        schema: 'dining-scenarios/1',
        evidence: 'synthetic',
        build: window.DiningLabBuild || null,
        decisionVersion: D.VERSION,
        createdAt: new Date().toISOString(),
        configA: R.clone(d.configA),
        configB: R.clone(d.configB),
        threshold,
        seeds: plan.seeds,
        repeats: plan.repeats,
        scope: plan.scope,
        rejected: plan.rejected,
        cases,
        summary: D.summarizeScenarios(cases)
      };
      renderScenarios();
      $('export-scenarios').disabled = false;
      status(`情景检查完成 · ${cases.length}组假设，非现实成功概率`);
    } catch (error) {
      experimentError('scenario-output', '情景检查未完成', error);
    } finally {
      busy(false);
      renderComparison();
    }
  }
  function renderScenarios() {
    const s = state.scenarioCheck;
    if (!s) return;
    const summary = s.summary;
    const labels = {
      within: '阈值内',
      exceeded: '超过阈值',
      uncertain: '尚不确定',
      'not-comparable': '口径不同'
    };
    $('scenario-output').innerHTML =
      `<div class="scenario-result"><h3>${summary.scenarios}个情景中，${summary.meanImproved}个平均用时缩短</h3><p>其中${summary.supportedImprovement}个差值区间整体小于零；${summary.guardWithin}个通过本次年级阈值逐项检查。</p><p>平均完整用时变化范围：${f(summary.totalDeltaRange[0])}至${f(summary.totalDeltaRange[1])}分钟。以下数量不是现实发生概率。</p><div class="scenario-grid">${s.cases.map((cell) => `<article class="scenario-cell ${cell.assessment.guard === 'within' ? '' : 'caution'}"><span>服务用时×${cell.serviceFactor}</span><span>${escape(cell.label.split(' · ')[1])}</span><strong>${cell.assessment.total.mean > 0 ? '+' : ''}${f(cell.assessment.total.mean)}<small>分</small></strong><span>${labels[cell.assessment.guard]}</span></article>`).join('')}</div><p>数值为 B − A；负数表示B平均完整用时更短。</p><details><summary>查看各情景区间和年级变化</summary><div class="result-table" tabindex="0" role="region" aria-label="情景结果表，窄屏可横向滚动"><table><thead><tr><th>情景</th><th>完整用时变化 / 分</th><th>配对95%区间</th><th>最大年级平均变化 / 分</th><th>年级阈值检查</th></tr></thead><tbody>${s.cases
        .map((cell) => {
          const a = cell.assessment;
          return `<tr><td>${escape(cell.label)}</td><td>${f(a.total.mean)}</td><td>[${f(a.total.low)}, ${f(a.total.high)}]</td><td>${a.comparability.comparable && a.mostAffected ? escape(a.mostAffected.name) + ' ' + f(a.mostAffected.delta.mean) : '口径不同'}</td><td>${labels[a.guard]}</td></tr>`;
        })
        .join(
          ''
        )}</tbody></table></div><p>年级阈值为${f(s.threshold * 60, 0)}秒。阈值内表示所列年级的各项区间上限未超过阈值；尚不确定表示仍不能排除超出。这里没有联合95%保证。</p></details>${s.rejected.length ? `<details><summary>${s.rejected.length}个情景未执行</summary>${s.rejected.map((cell) => `<p>${escape(cell.label)}：${escape(cell.reason)}</p>`).join('')}</details>` : ''}</div>`;
    const selectedRepeats = Number($('scenario-repeats').value);
    $('scenario-output').insertAdjacentHTML(
      'afterbegin',
      selectedRepeats === s.repeats
        ? `<p>所示结果：每个情景${s.repeats}轮。</p>`
        : `<p class="notice">当前结果为每格${s.repeats}轮；设置已改为${selectedRepeats}轮，重新检查后更新。</p>`
    );
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
  $('compare-edit').onclick = parameters;
  $('guided-compare').onclick = () => {
    if (!state.baseline) setBaseline(state.config, '当前方案（A）');
    tab('compare');
    $('research-tools').open = true;
    renderGuide();
    $('compare-edit').focus();
  };
  function tryChange(kind) {
    try {
      if (!state.baseline) setBaseline(state.config, '当前方案（A）');
      let c = R.clone(state.config);
      if (kind === 'gap') c = E.makeSchoolGapConfig(c, 3);
      else {
        if (c.windows >= 16) throw new Error('当前已开放16个窗口，可在设置中调整打餐速度');
        c.windows += 1;
        c.windowOwners.push(0);
        if (c.windowMeans) c.windowMeans.push(c.serviceMean);
      }
      run(c);
      $(kind === 'gap' ? 'try-gap' : 'try-window').closest('details').open = false;
      status('已修改 B；点击开始比较查看影响');
      $('compare-run').focus();
    } catch (error) {
      message('无法应用此改动', error.message);
    }
  }
  $('try-gap').onclick = () => tryChange('gap');
  $('try-window').onclick = () => tryChange('window');
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
    renderFrame();
  };
  $('scene2d').onclick = (event) => {
    const button = event.target.closest('[data-window]');
    if (button) inspect({ type: 'window', id: Number(button.dataset.window) });
  };
  document
    .querySelectorAll('[data-camera]')
    .forEach((b) => (b.onclick = () => state.view?.setCamera(b.dataset.camera)));
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
  $('save').onclick = () => json('食堂场景_合成参数.json', R.session(state.config));
  $('import').onclick = () => $('file-input').click();
  $('file-input').onchange = async () => {
    try {
      const file = $('file-input').files[0];
      if (!file) return;
      if (state.busy) throw new Error('请等待本轮计算完成再导入场景');
      if (file.size > 2000000) throw new Error('参数文件不能超过 2 MB');
      const c = R.readSession(await file.text());
      if (!c.diningEnabled || !c.students) throw new Error('此工作台需要启用就餐流程，且就餐人数大于零');
      run(c);
      status('场景已导入，按全部窗口通用、预计取餐完成最早重新计算');
    } catch (error) {
      message('导入失败', error.message);
    } finally {
      $('file-input').value = '';
    }
  };
  $('example-reset').onclick = () => run(exampleConfig());
  $('set-baseline').onclick = () => setBaseline(state.config, '保存的当前方案');
  $('sync-baseline').onclick = () => {
    try {
      setBaseline(E.makeSchoolBaseline(state.config), '同步放行参照');
    } catch (error) {
      message('无法生成参照', error.message);
    }
  };
  $('compare-run').onclick = pairedRun;
  $('scenario-run').onclick = scenarioRun;
  $('scenario-repeats').onchange = renderScenarios;
  $('export-scenarios').onclick = () => json('参数情景检查_合成实验.json', state.scenarioCheck);
  $('grade-limit').onchange = () => {
    if (state.comparison) renderComparison();
    if (state.scenarioCheck) {
      const s = state.scenarioCheck;
      s.threshold = Number($('grade-limit').value);
      s.cases.forEach(
        (cell) =>
          (cell.assessment = D.assess(cell.configA, cell.configB, cell.roundsA, cell.roundsB, s.threshold))
      );
      s.summary = D.summarizeScenarios(s.cases);
      renderScenarios();
    }
  };
  $('export-compare').onclick = () => json('配对比较_合成实验.json', state.comparison);
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
      setBaseline(original, '生成排程前的安排');
      run(config);
      tab('live');
      status('放行表已载入，可回放或与原安排比较');
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
