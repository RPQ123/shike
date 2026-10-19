/* Conditional decision support: paired grade changes and finite input scenarios.
 * Scenario counts are not probabilities; no claim of school calibration. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports)
    module.exports = factory(require('./school-engine.js'), require('./research.js'));
  else root.DiningDecision = factory(root.CanteenSim, root.DiningResearch);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (E, R) {
  'use strict';
  const EPS = 1e-9;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const change = (d) =>
    Math.abs(d.low) <= EPS && Math.abs(d.high) <= EPS
      ? 'same'
      : d.high < -EPS
        ? 'decrease'
        : d.low > EPS
          ? 'increase'
          : 'unclear';

  function comparability(inputA, inputB) {
    const a = E.normalizeSchoolConfig(inputA),
      b = E.normalizeSchoolConfig(inputB),
      reasons = [];
    const add = (code, text) => reasons.push({ code, text });
    if (
      !same(
        a.grades.map((g) => g.students),
        b.grades.map((g) => g.students)
      )
    )
      add('population', '两方案的年级人数不同，不能把年级均值变化当作同一人群的受益或受损。');
    if (
      !same(
        a.grades.map((g) => g.readyTime),
        b.grades.map((g) => g.readyTime)
      )
    )
      add('ready-time', '两方案的最早允许放行时刻不同，完整用时的计时起点已改变。');
    if (a.returnDestination !== b.returnDestination || a.diningEnabled !== b.diningEnabled)
      add('endpoint', '两方案的终点或用餐流程不同，完整用时的含义已改变。');
    const comparable = reasons.length === 0;
    const resources = (c) => [
      c.windows,
      c.seats,
      c.windowMeans.slice().sort((x, y) => x - y),
      c.serviceCV,
      c.mealMean,
      c.mealCV,
      c.serviceStart,
      c.serviceEnd
    ];
    const fixedResources = same(resources(a), resources(b));
    if (!fixedResources)
      add('resources', '窗口、座位、服务速度、用餐时间或供餐时段同时变化，结果不能单独归因于安排调整。');
    if (
      !same(
        a.grades.map((g) => g.deadline),
        b.grades.map((g) => g.deadline)
      )
    )
      add('deadline', '截止时刻不同，按时完成率使用了不同标准。');
    return { comparable, fixedResources, reasons };
  }

  function assess(configA, configB, roundsA, roundsB, threshold = 0.5) {
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 10)
      throw new RangeError('年级增加用时阈值须为0至10分钟');
    const paired = (key, scale = 1, unit = 'minutes') => ({
      ...R.paired(
        roundsA.map((x) => x[key] * scale),
        roundsB.map((x) => x[key] * scale)
      ),
      unit
    });
    const scope = comparability(configA, configB);
    const total = paired('meanTotal'),
      queue = paired('meanWait'),
      seat = paired('seatWait');
    const grades = configA.grades.flatMap((g, id) => {
      if (!g.students && !configB.grades[id].students) return [];
      const delta = paired(`grade${id}Total`);
      return [
        {
          id,
          name: g.name,
          countA: g.students,
          countB: configB.grades[id].students,
          delta,
          change: change(delta)
        }
      ];
    });
    const mostAffected = grades.slice().sort((a, b) => b.delta.mean - a.delta.mean)[0] || null;
    const guard = !scope.comparable
      ? 'not-comparable'
      : grades.some((g) => g.delta.low > threshold + EPS)
        ? 'exceeded'
        : grades.some((g) => g.delta.high > threshold + EPS)
          ? 'uncertain'
          : 'within';
    return {
      threshold,
      comparability: scope,
      total,
      queue,
      seat,
      onTime: paired('onTime', 100, 'percentage-points'),
      totalChange: change(total),
      grades,
      mostAffected,
      guard,
      intervalScope: '各项配对t区间仅描述模型内随机波动；不作联合95%保证，不包含未知输入和结构误差。'
    };
  }

  function planScenarios(inputA, inputB, options = {}) {
    const a = E.normalizeSchoolConfig(inputA),
      b = E.normalizeSchoolConfig(inputB);
    const repeats = options.repeats ?? 10;
    if (![10, 30].includes(repeats)) throw new RangeError('情景检查请选择10轮或30轮');
    const seed = options.seed ?? (b.seed + 100003) >>> 0;
    const seeds = R.seedSets(seed, repeats, 2).screening;
    const zoned = [a, b].every((c) => c.serviceZones?.length === 2 && c.gradeZoneWeights);
    const accepted = [],
      rejected = [];
    for (const serviceFactor of [0.8, 1, 1.2])
      for (const preferenceShift of zoned ? [-0.1, 0, 0.1] : [0]) {
        const id = `s${serviceFactor}-p${preferenceShift}`;
        const label = `服务用时×${serviceFactor} · ${zoned ? `A餐比例${preferenceShift > 0 ? '+' : ''}${Math.round(preferenceShift * 100)}个百分点` : '餐品选择保持'}`;
        try {
          const apply = (input) => {
            const c = R.clone(input);
            c.serviceMean *= serviceFactor;
            c.windowMeans = c.windowMeans.map((x) => x * serviceFactor);
            if (zoned)
              c.gradeZoneWeights = c.gradeZoneWeights.map((weights, id) => {
                if (!c.grades[id].students) return weights;
                const sum = weights[0] + weights[1],
                  share = weights[0] / sum + preferenceShift;
                if (share < -EPS || share > 1 + EPS)
                  throw new RangeError('餐品比例变化超出0至100%，此情景未执行');
                return [Math.min(1, Math.max(0, share)), 1 - Math.min(1, Math.max(0, share))];
              });
            c.sourceProfile = {
              id: 'input-scenario',
              title: '输入变化检验 · 假设',
              asOf: '2026-10-18',
              status: 'modified',
              observedSchoolData: false
            };
            return E.normalizeSchoolConfig(c);
          };
          accepted.push({ id, label, serviceFactor, preferenceShift, configA: apply(a), configB: apply(b) });
        } catch (error) {
          rejected.push({ id, label, reason: error.message });
        }
      }
    const workUnits = accepted.length * repeats * (a.students + b.students),
      budget = 400000;
    return {
      accepted,
      rejected,
      seeds,
      repeats,
      workUnits,
      budget,
      executable: accepted.length > 0 && workUnits <= budget,
      scope: '有限假设网格；服务用时±20%与套餐比例±10个百分点为教学压力设置，不是学校参数置信范围或情景概率。'
    };
  }

  function summarizeScenarios(rows) {
    if (!rows.length) throw new RangeError('没有完成的情景结果');
    const assessments = rows.map((x) => x.assessment),
      deltas = assessments.map((x) => x.total.mean);
    if (deltas.some((x) => !Number.isFinite(x))) throw new TypeError('情景结果须为有限数值');
    return {
      scenarios: rows.length,
      meanImproved: deltas.filter((x) => x < -EPS).length,
      supportedImprovement: assessments.filter((x) => x.totalChange === 'decrease').length,
      guardWithin: assessments.filter((x) => x.guard === 'within').length,
      totalDeltaRange: [Math.min(...deltas), Math.max(...deltas)],
      interpretation: '场景计数和差值范围；不是胜出概率、综合置信区间或现实验证。'
    };
  }
  return { VERSION: '2.1.0', comparability, assess, planScenarios, summarizeScenarios };
});
