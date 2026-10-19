/* Class planner presentation; engine, candidate rules and history policy are separate. */
(() => {
  'use strict';
  const E = window.CanteenSim,
    R = window.DiningResearch,
    P = window.DiningPlanner;
  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  const f = (n, digits = 1) => (Number.isFinite(n) ? n.toFixed(digits) : '—');
  const ROLES = [
    ['balanced', '均衡安排', '优先缩短最慢年级用时'],
    ['efficiency', '用时最短', '优先缩短全体平均用时'],
    ['lowPeak', '队伍更短', '优先降低排队峰值']
  ];
  const WORK_LIMIT = 1500000;
  function mount(host) {
    let data = null,
      selected = 'balanced';
    let configKeys = new Set();
    const readOptions = () => ({
      meanAllowance: Number($('planner-mean').value),
      peakAllowance: Number($('planner-peak').value),
      slots: $('planner-slots').value,
      reallocate: false
    });
    const period = window.DiningRotationView.mount({
      ...host,
      loadConfig: (config, original) => {
        configKeys.add(P.configKey(config));
        host.loadConfig(config, original);
      },
      getPlan: () => data && data.rows.find((x) => x.id === data.selection[selected]),
      isCurrent: current,
      esc,
      f,
      workLimit: WORK_LIMIT
    });
    function current() {
      if (!data) return false;
      if (JSON.stringify(readOptions()) !== JSON.stringify(data.options)) return false;
      const key = P.configKey(host.getConfig());
      return configKeys.has(key) || period.ownsConfig(key);
    }
    function onConfigChange() {
      $('planner-stale').hidden = !data || current();
      if (data && !$('planner-stale').hidden)
        $('planner-stale').textContent =
          JSON.stringify(readOptions()) !== JSON.stringify(data.options)
            ? '排程偏好已改变，下方仍是上次结果。请重新生成。'
            : '当前参数已改变，请重新生成放行方案。';
      updateDisabled(host.isBusy());
    }
    function updateDisabled(value) {
      for (const el of document.querySelectorAll('#page-search [id^="planner-"]'))
        if (el.matches('button, input, select'))
          el.disabled =
            value ||
            (!['planner-run', 'planner-export', 'planner-csv', 'planner-period-export'].includes(el.id) &&
              el.closest('#planner-output') &&
              !current());
      document.querySelectorAll('.planner-choice').forEach((card) => (card.disabled = value || !current()));
      period.updateDisabled(value || !current());
    }
    const chosen = () => data.rows.find((x) => x.id === data.selection[selected]);
    function renderTimetable() {
      const plan = chosen();
      $('planner-plan-label').textContent = plan.label;
      $('planner-timetable').innerHTML =
        '<thead><tr><th>放行时刻</th><th>年级</th><th>班级</th><th>人数</th></tr></thead><tbody>' +
        P.timetable(plan.config)
          .map(
            (b) =>
              `<tr><td class="schedule-time">${R.clockLabel(b.release)}</td><td><span class="grade-chip grade-${b.grade}">${esc(b.gradeName)}</span></td><td>第 ${b.classIndex + 1} 班</td><td>${b.students} 人</td></tr>`
          )
          .join('') +
        '</tbody>';
      $('planner-load').textContent = plan.id === 'reference' ? '载入原安排' : '载入仿真';
      document.querySelectorAll('.planner-choice').forEach((card) => {
        const active = card.dataset.role === selected;
        card.classList.toggle('selected', active);
        card.setAttribute('aria-pressed', String(active));
      });
      period.reset(plan.kind === 'interleaved');
      updateDisabled(false);
    }
    function render() {
      const base = data.verification.rows.find((x) => x.id === 'reference');
      $('planner-output').className = 'planner-results';
      $('planner-output').innerHTML =
        `<div class="planner-result-heading"><h2>选择一个目标</h2><span>${data.rows.length} 个安排 · 独立复核 30 轮</span></div><div class="planner-choices">` +
        ROLES.map(([role, title, description]) => {
          const row = data.verification.rows.find((x) => x.id === data.selection[role]),
            m = row.summary;
          const main =
            role === 'efficiency'
              ? [m.meanTotal, '分 · 全体平均']
              : role === 'lowPeak'
                ? [m.peakQueue, '人 · 排队峰值']
                : [m.worstGrade, '分 · 最慢年级'];
          const sub =
            role === 'efficiency'
              ? [`最慢年级 ${f(m.worstGrade)} 分`, `峰值 ${f(m.peakQueue, 0)} 人`]
              : role === 'lowPeak'
                ? [`全体 ${f(m.meanTotal)} 分`, `最慢年级 ${f(m.worstGrade)} 分`]
                : [`全体 ${f(m.meanTotal)} 分`, `峰值 ${f(m.peakQueue, 0)} 人`];
          const over =
            role === 'balanced' &&
            (m.meanTotal > base.summary.meanTotal + data.criteria.meanAllowance + 1e-9 ||
              m.peakQueue > base.summary.peakQueue * (1 + data.criteria.peakAllowance) + 1e-9);
          const key = role === 'efficiency' ? 'meanTotal' : role === 'lowPeak' ? 'peakQueue' : 'worstGrade';
          const delta = m[key] - base.summary[key];
          const difference =
            Math.abs(delta) < 1e-9
              ? '与原安排均值相同'
              : `均值比原安排${delta < 0 ? '少' : '多'} ${f(Math.abs(delta), role === 'lowPeak' ? 0 : 1)} ${role === 'lowPeak' ? '人' : '分'}`;
          return `<button class="planner-choice" data-role="${role}" aria-description="${description}" aria-pressed="${role === selected}"><span class="choice-top"><b>${title}</b><i aria-hidden="true">✓</i></span><span class="choice-purpose">${difference}</span><span class="choice-main">${f(main[0], role === 'lowPeak' ? 0 : 1)}<small>${main[1]}</small></span><span class="choice-metrics">${sub.map((s) => `<span>${s}</span>`).join('')}</span>${over ? '<span class="choice-check">复核均值超出所选余量</span>' : ''}</button>`;
        }).join('') +
        `</div><article class="panel planner-schedule"><div class="planner-schedule-heading"><div><h2>班级放行表</h2><p id="planner-plan-label"></p></div><div class="actions"><button id="planner-csv" class="button">导出表格</button><button id="planner-load" class="button primary">载入仿真</button></div></div><div class="table-scroll"><table id="planner-timetable"></table></div></article><details id="planner-period-section" class="panel planner-period"><summary>连续几餐，怎样轮换更均衡？</summary><p>前一餐用时较长的年级，在下一餐争取更靠前的位置。比较固定、循环和用时补偿三种安排。</p><div class="actions"><label for="planner-days">观察餐次</label><select id="planner-days"><option value="3">连续三餐</option><option value="5">连续五餐</option></select><button id="planner-period-run" class="button">比较轮换方式</button></div><div id="planner-period-output"></div></details><details class="panel planner-record"><summary>计算记录与复核结果</summary><p>先用 10 轮筛选，再固定三种选择，使用另外 30 轮复核。均衡选择的筛选余量为全体平均 +${f(data.criteria.meanAllowance, 2)} 分钟、峰值 +${f(data.criteria.peakAllowance * 100, 0)}%。</p><p>原安排复核：全体平均 ${f(base.summary.meanTotal, 2)} 分钟，最慢年级 ${f(base.summary.worstGrade, 2)} 分钟，峰值 ${f(base.summary.peakQueue, 1)} 人。上方卡片显示复核均值，区间与逐轮记录随实验导出。</p><div class="table-scroll"><table><thead><tr><th>选择</th><th>全体用时变化</th><th>最慢年级变化</th><th>峰值变化</th></tr></thead><tbody>` +
        ROLES.map(([role, title]) => {
          const row = data.verification.rows.find((x) => x.id === data.selection[role]);
          return (
            `<tr><th>${title}</th>` +
            ['meanTotal', 'worstGrade', 'peakQueue']
              .map((k) => {
                const d = R.paired(
                  base.rounds.map((x) => x[k]),
                  row.rounds.map((x) => x[k])
                );
                return `<td>${d.mean > 0 ? '+' : ''}${f(d.mean, 2)} [${f(d.low, 2)}, ${f(d.high, 2)}] ${k === 'peakQueue' ? '人' : '分'}</td>`;
              })
              .join('') +
            '</tr>'
          );
        }).join('') +
        `</tbody></table></div><p>变化为候选减原安排，方括号为各指标的 95% 配对区间。均衡条件依据筛选批次，复核用来检查其稳定性。</p><button id="planner-export" class="button">导出完整实验</button></details>`;
      document.querySelectorAll('.planner-choice').forEach(
        (card) =>
          (card.onclick = () => {
            selected = card.dataset.role;
            renderTimetable();
          })
      );
      $('planner-load').onclick = () => host.loadConfig(chosen().config, data.input);
      $('planner-csv').onclick = () =>
        host.download(
          '班级放行表_合成排程.csv',
          R.csv(
            P.timetable(chosen().config).map((b) => ({
              放行时刻: R.clockLabel(b.release),
              年级: b.gradeName,
              班级: `第${b.classIndex + 1}班`,
              人数: b.students
            }))
          ),
          'text/csv;charset=utf-8'
        );
      $('planner-export').onclick = () =>
        host.json('班级排程_完整实验.json', { ...data, selectedRole: selected, period: period.data() });
      period.bind();
      renderTimetable();
    }
    async function generate() {
      if (host.isBusy()) return;
      const input = R.clone(host.getConfig()),
        options = readOptions(),
        criteria = { meanAllowance: options.meanAllowance, peakAllowance: options.peakAllowance };
      let set;
      try {
        set = P.candidates(input, {
          slots: $('planner-slots').value === 'coarse' ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1],
          reallocate: false
        });
        if ((set.accepted.length * 10 + 120) * input.students > WORK_LIMIT)
          throw new RangeError('这组参数计算量较大。请在“排程偏好”选择 0 / 30 / 60 秒后再运行。');
      } catch (error) {
        host.message('调整排程范围', error.message);
        return;
      }
      data = null;
      period.reset(false);
      host.setBusy(true);
      $('planner-output').className = 'panel';
      $('planner-output').innerHTML =
        '<div class="progress-wrap"><h2>正在安排班级…</h2><p id="planner-progress-label">逐个比较不同顺序与班级间隔</p><progress id="planner-progress" max="' +
        (set.accepted.length * 10 + 120) +
        '" value="0"></progress></div>';
      host.addCancel('planner-progress');
      const seeds = R.seedSets((input.seed + 100003) >>> 0, 10, 30),
        rows = [];
      let done = 0;
      async function evaluate(plan, selectedSeeds) {
        const rounds = [];
        for (const seed of selectedSeeds) {
          rounds.push(R.metrics(E.simulateSchool({ ...plan.config, seed })));
          $('planner-progress').value = ++done;
          if (done % 4 === 0) await host.yieldUI();
        }
        return { ...plan, rounds, summary: R.summarize(rounds) };
      }
      try {
        for (const plan of set.accepted) rows.push(await evaluate(plan, seeds.screening));
        const choice = P.choose(
          rows,
          rows.find((x) => x.id === 'reference'),
          criteria
        );
        const selection = Object.fromEntries(ROLES.map(([role]) => [role, choice[role].id]));
        const frozenAt = new Date().toISOString();
        $('planner-progress-label').textContent = '选择已固定，正在用新一批随机需求复核';
        const verification = { seeds: seeds.verification, rows: [] };
        const ids = [...new Set(['reference', ...Object.values(selection)])];
        $('planner-progress').max = set.accepted.length * 10 + ids.length * 30;
        for (const id of ids)
          verification.rows.push(
            await evaluate(
              rows.find((x) => x.id === id),
              seeds.verification
            )
          );
        data = {
          schema: 'dining-planner/1',
          evidence: 'synthetic',
          build: window.DiningLabBuild || null,
          plannerVersion: P.VERSION,
          rotationVersion: window.DiningRotation.VERSION,
          input,
          options,
          criteria,
          scope: set.scope,
          rejected: set.rejected,
          screeningSeeds: seeds.screening,
          rows,
          selection,
          frozenAt,
          verification,
          modelExecutions: done
        };
        selected = 'balanced';
        configKeys = new Set([P.configKey(input), ...rows.map((row) => P.configKey(row.config))]);
        render();
        host.status(`已生成 ${rows.length} 个安排，三种目标已独立复核`);
      } catch (error) {
        $('planner-output').innerHTML =
          '<h2>' +
          (error.name === 'AbortError' ? '本轮计算已取消' : '排程尚未完成') +
          '</h2><p>调整参数后可以重新生成。</p>';
        if (error.name !== 'AbortError') host.message('排程尚未完成', error.message);
      } finally {
        host.setBusy(false);
        onConfigChange();
      }
    }
    $('planner-run').onclick = generate;
    for (const id of ['planner-mean', 'planner-peak', 'planner-slots']) $(id).onchange = onConfigChange;
    return {
      onConfigChange,
      updateDisabled,
      snapshot: () =>
        data
          ? {
              candidateCount: data.rows.length,
              selection: data.selection,
              selectedRole: selected,
              screeningSeeds: data.screeningSeeds,
              verification: data.verification,
              period: period.snapshot()
            }
          : null
    };
  }
  window.DiningPlannerView = { mount };
})();
