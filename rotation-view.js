/* Cross-meal comparison UI; each decision only sees completed meals. */
(() => {
  'use strict';
  const E = window.CanteenSim,
    R = window.DiningResearch,
    P = window.DiningPlanner,
    T = window.DiningRotation;
  const $ = (id) => document.getElementById(id),
    MODES = [
      ['fixed', '固定顺序'],
      ['cyclic', '循环轮换'],
      ['feedback', '用时补偿']
    ];
  function mount(host) {
    let result = null;
    function updateDisabled(disabled) {
      const plan = host.getPlan();
      if ($('planner-period-run'))
        $('planner-period-run').disabled = disabled || plan?.kind !== 'interleaved';
    }
    function reset(enabled) {
      result = null;
      if ($('planner-period-output'))
        $('planner-period-output').innerHTML = enabled
          ? ''
          : '<p class="notice">当前选择是原年级安排。选择一个交错排程后，可比较跨餐轮换。</p>';
    }
    function ownsConfig(key) {
      return !!result?.modes.some((m) =>
        m.rounds.some((r) => r.days.some((d) => P.configKey(d.config) === key))
      );
    }
    function render() {
      const { f, esc } = host;
      $('planner-period-output').innerHTML =
        '<div class="table-scroll"><table><thead><tr><th>方式</th><th>周期最慢年级</th><th>周期年级差</th><th>全体平均用时</th></tr></thead><tbody>' +
        result.modes
          .map(
            (m) =>
              `<tr><th>${MODES.find((x) => x[0] === m.mode)[1]}</th><td>${f(m.summary.periodWorstGrade, 2)} 分</td><td>${f(m.summary.periodGradeGap, 2)} 分</td><td>${f(m.summary.meanTotal, 2)} 分</td></tr>`
          )
          .join('') +
        '</tbody></table></div><p>每个年级先计算整个周期的平均用时，再比较年级之间的差异。共 ' +
        result.repeats +
        ' 组独立周期，三种方式逐餐使用相同随机需求。</p><details><summary>逐餐安排与每日最慢年级</summary><div id="planner-rotation-detail"></div></details><div class="actions"><label for="planner-period-day">载入用时补偿的某一餐</label><select id="planner-period-day">' +
        Array.from({ length: result.days }, (_, i) => `<option value="${i}">第 ${i + 1} 餐</option>`).join(
          ''
        ) +
        '</select><button id="planner-period-load" class="button">载入这一餐</button><button id="planner-period-export" class="button">导出轮换实验</button></div>';
      $('planner-rotation-detail').innerHTML =
        result.modes
          .map(
            (m) =>
              `<p><b>${MODES.find((x) => x[0] === m.mode)[1]}</b>：每日最慢年级的周期均值 ${f(m.summary.meanDailyWorstGrade, 2)} 分钟。第一组安排：${m.rounds[0].days.map((d) => `第${d.day}餐 ${d.order.map((id) => esc(d.config.grades[id].name)).join('→')}`).join('；')}。</p>`
          )
          .join('') +
        '<p>用时补偿只读取已经结束餐次的年级平均完整用时；首餐沿用所选顺序，后续在可行顺序中优先补偿累计用时较长的年级。</p>';
      $('planner-period-export').onclick = () => host.json('跨餐轮换_完整实验.json', result);
      $('planner-period-load').onclick = () => {
        const d = result.modes.find((m) => m.mode === 'feedback').rounds[0].days[
          Number($('planner-period-day').value)
        ];
        host.loadConfig(d.config, result.input);
      };
    }
    async function run() {
      if (host.isBusy() || !host.isCurrent()) return;
      const plan = R.clone(host.getPlan()),
        days = Number($('planner-days').value),
        repeats = 30;
      if (plan.kind !== 'interleaved') return;
      if (plan.config.students * days * repeats * MODES.length > host.workLimit) {
        host.message('缩短观察周期', '当前人数较多，请选择连续三餐后再比较。');
        return;
      }
      result = null;
      host.setBusy(true);
      $('planner-period-output').innerHTML =
        '<div class="progress-wrap"><h3>正在逐餐比较…</h3><progress id="planner-period-progress" max="90" value="0"></progress></div>';
      host.addCancel('planner-period-progress');
      const cache = new Map(),
        modes = MODES.map(([mode]) => ({ mode, rounds: [] }));
      let done = 0;
      const evaluate = (c) => {
        const key = P.configKey(c);
        if (!cache.has(key)) cache.set(key, R.metrics(E.simulateSchool(c)));
        return cache.get(key);
      };
      const startedAt = new Date().toISOString();
      try {
        for (let rep = 0; rep < repeats; rep++) {
          const seeds = Array.from(
            { length: days },
            (_, day) => (plan.config.seed + 200003 + rep * days + day) >>> 0
          );
          for (const m of modes) {
            m.rounds.push(T.runPeriod(plan, { seeds, mode: m.mode, evaluate }));
            $('planner-period-progress').value = ++done;
            await host.yieldUI();
          }
        }
        for (const m of modes) m.summary = R.summarize(m.rounds.map((r) => r.summary));
        result = {
          schema: 'dining-rotation/1',
          build: window.DiningLabBuild || null,
          evidence: 'synthetic',
          rotationVersion: T.VERSION,
          input: R.clone(plan.config),
          plan,
          days,
          repeats,
          startedAt,
          modes,
          modelExecutions: cache.size
        };
        render();
        host.status('跨餐轮换比较已完成');
      } catch (error) {
        $('planner-period-output').innerHTML =
          '<p class="notice">' +
          (error.name === 'AbortError' ? '本轮比较已取消。' : '本轮比较尚未完成。') +
          '</p>';
        if (error.name !== 'AbortError') host.message('轮换比较尚未完成', error.message);
      } finally {
        host.setBusy(false);
        updateDisabled(!host.isCurrent());
      }
    }
    function bind() {
      if ($('planner-period-run')) $('planner-period-run').onclick = run;
      if ($('planner-days'))
        $('planner-days').onchange = () => {
          reset(host.getPlan()?.kind === 'interleaved');
          $('planner-period-output').textContent = '观察餐次已改变，点击比较生成新周期结果。';
        };
    }
    return {
      bind,
      reset,
      updateDisabled,
      ownsConfig,
      data: () => result,
      snapshot: () =>
        result
          ? {
              modes: result.modes.map((m) => ({ mode: m.mode, summary: m.summary })),
              days: result.days,
              repeats: result.repeats,
              modelExecutions: result.modelExecutions
            }
          : null
    };
  }
  window.DiningRotationView = { mount };
})();
