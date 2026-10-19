/* Non-anticipating meal rotation: only completed meals inform today's order. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports)
    module.exports = factory(
      require('./school-engine.js'),
      require('./research.js'),
      require('./planner.js')
    );
  else root.DiningRotation = factory(root.CanteenSim, root.DiningResearch, root.DiningPlanner);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (E, R, P) {
  'use strict';
  const MODES = ['fixed', 'cyclic', 'feedback'],
    EPS = 1e-9;
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function historyTotals(history, active) {
    const totals = [0, 0, 0];
    for (const day of history) {
      if (!day.metrics) throw new TypeError('历史餐次需要完整用时指标');
      for (const id of active) {
        const value = day.metrics[`grade${id}Total`];
        if (!Number.isFinite(value) || value < 0) throw new TypeError('历史年级完整用时必须是非负有限数');
        totals[id] += value;
      }
    }
    return totals;
  }
  function orders(plan, input = plan.config) {
    if (plan.kind !== 'interleaved') return [];
    const config = E.normalizeSchoolConfig(input),
      valid = [];
    for (const order of P.permutations(P.activeGrades(config))) {
      try {
        // Rotation changes release order only; keep the current physical counter map.
        valid.push(P.makePlan(config, { order, slot: plan.slot }));
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
      }
    }
    return valid;
  }
  function nextOrder(plan, history, mode, input = plan.config) {
    if (!MODES.includes(mode)) throw new RangeError('请选择固定、循环或用时补偿轮换');
    if (!Array.isArray(history)) throw new TypeError('历史餐次须为数组');
    const config = E.normalizeSchoolConfig(input),
      active = P.activeGrades(config),
      totals = historyTotals(history, active);
    if (plan.kind === 'reference') {
      if (mode !== 'fixed') throw new RangeError('原年级安排未定义交错班级槽，请先选择交错方案');
      return { order: plan.order.slice(), config, historyTotals: totals, reason: '沿用原放行安排' };
    }
    const feasible = orders(plan, config);
    if (!feasible.length) throw new RangeError('当前首班锁定与末班条件没有可行轮换');
    const target =
      mode === 'cyclic'
        ? plan.order.map((_, i) => plan.order[(i + history.length) % plan.order.length])
        : plan.order;
    const distance = (order) =>
      order.reduce((sum, id, index) => sum + Math.abs(target.indexOf(id) - index), 0);
    const score = (order) =>
      mode === 'feedback' && history.length
        ? order.reduce((sum, id, index) => sum + totals[id] * (order.length - index - 1), 0)
        : 0;
    feasible.sort((a, b) => {
      const delta = score(b.order) - score(a.order);
      if (Math.abs(delta) > EPS) return delta;
      return distance(a.order) - distance(b.order) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
    const chosen = feasible[0];
    if (mode === 'fixed' && !equal(chosen.order, plan.order))
      throw new RangeError('固定顺序不满足本餐时刻约束');
    let reason =
      mode === 'fixed'
        ? '沿用选定的固定顺序'
        : mode === 'cyclic'
          ? '依次轮换各年级的先后位置'
          : '首餐沿用选定顺序';
    if (mode === 'feedback' && history.length) {
      const longest = active.slice().sort((a, b) => totals[b] - totals[a] || a - b)[0];
      reason = `${config.grades[longest].name}在前${history.length}餐累计完整用时较长，按既有结果补偿先后位置`;
    }
    if (mode === 'cyclic' && !equal(chosen.order, target)) reason += '，并遵守首班锁定条件';
    return { order: chosen.order.slice(), config: chosen.config, historyTotals: totals, reason };
  }
  function summarize(days, config) {
    const mean = (key) => days.reduce((sum, day) => sum + day.metrics[key], 0) / days.length;
    const summary = Object.fromEntries(
      ['meanTotal', 'meanWait', 'seatWait', 'onTime', 'peakQueue'].map((key) => [key, mean(key)])
    );
    const active = P.activeGrades(config),
      totals = active.map((id) => mean(`grade${id}Total`));
    for (const grade of config.grades) {
      summary[`grade${grade.id}Count`] = grade.students;
      summary[`grade${grade.id}Total`] = grade.students ? mean(`grade${grade.id}Total`) : 0;
    }
    return {
      ...summary,
      periodWorstGrade: Math.max(...totals),
      periodGradeGap: Math.max(...totals) - Math.min(...totals),
      meanDailyWorstGrade: mean('worstGrade'),
      maxDailyPeak: Math.max(...days.map((day) => day.metrics.peakQueue))
    };
  }
  function runPeriod(plan, options = {}) {
    const { seeds, mode = 'feedback', dayInputs = [] } = options;
    if (!MODES.includes(mode)) throw new RangeError('不支持的轮换方式');
    if (
      !Array.isArray(seeds) ||
      !seeds.length ||
      seeds.length > 10 ||
      seeds.some((s) => !Number.isInteger(s) || s < 0 || s > 4294967295)
    )
      throw new RangeError('请提供1至10个有效餐次种子');
    if (!Array.isArray(dayInputs)) throw new TypeError('每日输入应为数组');
    const base = E.normalizeSchoolConfig(plan.config),
      active = P.activeGrades(base);
    if (!active.length) throw new RangeError('轮换至少需要一个有学生的年级');
    const population = (c) => c.grades.map((g) => [g.students, g.classes, g.classSizes]);
    const evaluate = options.evaluate || ((config) => R.metrics(E.simulateSchool(config))),
      days = [];
    for (let index = 0; index < seeds.length; index++) {
      const input = E.normalizeSchoolConfig(dayInputs[index] ?? base);
      if (!equal(population(input), population(base)))
        throw new RangeError('轮换期间年级人数和班级构成须保持一致');
      const decision = nextOrder(plan, days, mode, input);
      const config = E.normalizeSchoolConfig({ ...decision.config, seed: seeds[index] });
      const metrics = evaluate(config, { day: index + 1, order: decision.order.slice() });
      for (const key of [
        'meanTotal',
        'meanWait',
        'seatWait',
        'onTime',
        'peakQueue',
        'worstGrade',
        ...active.map((id) => `grade${id}Total`)
      ])
        if (!Number.isFinite(metrics[key])) throw new TypeError('餐次结果缺少有效数值指标');
      days.push({
        day: index + 1,
        seed: seeds[index],
        order: decision.order,
        config,
        metrics: R.clone(metrics),
        historyBefore: { meals: days.length, totals: decision.historyTotals.slice() },
        decisionReason: decision.reason
      });
    }
    return { mode, seeds: seeds.slice(), days, summary: summarize(days, base) };
  }
  return { VERSION: '2.2.0', orders, nextOrder, runPeriod, summarize };
});
