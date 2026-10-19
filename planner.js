/* Explainable class-level scheduling; numerical events stay in the audited engine. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports)
    module.exports = factory(require('./school-engine.js'), require('./research.js'));
  else root.DiningPlanner = factory(root.CanteenSim, root.DiningResearch);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (E, R) {
  'use strict';
  const EPS = 1e-9;
  function permutations(values) {
    if (!values.length) return [[]];
    return values.flatMap((value, index) =>
      permutations(values.filter((_, i) => i !== index)).map((rest) => [value, ...rest])
    );
  }
  function activeGrades(config) {
    return config.grades.filter((g) => g.students > 0).map((g) => g.id);
  }
  function configKey(input) {
    const c = E.normalizeSchoolConfig(input);
    c.sourceProfile = null;
    return JSON.stringify(c);
  }
  function timetable(input) {
    const c = E.normalizeSchoolConfig(input),
      rows = [];
    for (const g of c.grades) {
      if (!g.students) continue;
      for (let index = 0; index < g.classes; index++) {
        const students =
          g.classSizes === null
            ? Math.ceil(((index + 1) * g.students) / g.classes) - Math.ceil((index * g.students) / g.classes)
            : g.classSizes[index];
        if (students)
          rows.push({
            classId: `${g.id}-${index}`,
            grade: g.id,
            gradeName: g.name,
            classIndex: index,
            students,
            release: g.releaseTime + index * g.classInterval
          });
      }
    }
    return rows.sort((a, b) => a.release - b.release || a.grade - b.grade || a.classIndex - b.classIndex);
  }
  function makePlan(input, options = {}) {
    const c = E.normalizeSchoolConfig(input),
      active = activeGrades(c),
      order = options.order;
    if (!active.length) throw new RangeError('需要至少一个有就餐学生的年级');
    if (
      !Array.isArray(order) ||
      order.length !== active.length ||
      new Set(order).size !== order.length ||
      order.some((id) => !active.includes(id))
    )
      throw new RangeError('年级顺序须包含每个有学生年级且不重复');
    const slot = options.slot;
    if (typeof slot !== 'number' || !Number.isFinite(slot) || slot < 0 || slot > 10)
      throw new RangeError('班级槽间隔须为0至10分钟');
    const earliest = Math.max(...order.map((id, index) => c.grades[id].readyTime - index * slot));
    const anchors = order.flatMap((id, index) =>
      c.grades[id].releaseLocked ? [c.grades[id].releaseTime - index * slot] : []
    );
    if (anchors.some((value) => Math.abs(value - anchors[0]) > EPS))
      throw new RangeError('锁定首班时刻与所选顺序、间隔不一致');
    const anchor = anchors.length ? anchors[0] : earliest;
    if (anchor < earliest - EPS) throw new RangeError('锁定首班使其他年级早于允许放行时刻');
    order.forEach((id, index) => {
      c.grades[id].releaseTime = anchor + index * slot;
      c.grades[id].classInterval = order.length * slot;
    });
    let aWindows = options.aWindows ?? null;
    if (aWindows !== null) {
      if (c.serviceZones?.length !== 2) throw new RangeError('重新分配窗口需要两个餐品区');
      if (!Number.isInteger(aWindows) || aWindows < 1 || aWindows >= c.windows)
        throw new RangeError('A/B餐品各需至少一个窗口');
      c.windowZones = c.windowZones.map((_, index) => (index < aWindows ? 0 : 1));
    }
    c.sourceProfile = {
      id: 'class-planner',
      title: '按班交错排程 · 教学场景',
      asOf: '2026-10-19',
      status: 'modified',
      observedSchoolData: false
    };
    const config = E.normalizeSchoolConfig(c);
    if (aWindows === null && c.serviceZones?.length === 2)
      aWindows = c.windowZones.filter((zone) => zone === 0).length;
    return {
      id: `p${order.join('')}-s${slot}-a${aWindows ?? 'fixed'}`,
      kind: 'interleaved',
      order: order.slice(),
      slot,
      aWindows,
      label: `${order.map((id) => c.grades[id].name).join('→')} · 相邻班级${slot * 60}秒${aWindows === null ? '' : ` · A/B ${aWindows}/${c.windows - aWindows}窗`}`,
      config,
      batches: timetable(config),
      changes: R.changes(input, config)
    };
  }
  function reference(input) {
    const config = E.normalizeSchoolConfig(input);
    return {
      id: 'reference',
      kind: 'reference',
      label: '原放行安排',
      order: activeGrades(config).sort(
        (a, b) => config.grades[a].releaseTime - config.grades[b].releaseTime || a - b
      ),
      slot: null,
      aWindows: config.serviceZones?.length === 2 ? config.windowZones.filter((x) => x === 0).length : null,
      config,
      batches: timetable(config),
      changes: []
    };
  }
  function candidates(input, options = {}) {
    const config = E.normalizeSchoolConfig(input),
      active = activeGrades(config);
    if (!active.length) throw new RangeError('需要至少一个有就餐学生的年级');
    const slots = options.slots ?? [0, 0.25, 0.5, 0.75, 1];
    if (
      !Array.isArray(slots) ||
      !slots.length ||
      slots.length > 20 ||
      slots.some((s) => !Number.isFinite(s) || s < 0 || s > 10)
    )
      throw new RangeError('请提供1至20个合法班级槽间隔');
    const accepted = [],
      rejected = [],
      seen = new Set();
    const add = (plan) => {
      const key = configKey(plan.config);
      if (!seen.has(key)) {
        seen.add(key);
        accepted.push(plan);
      }
    };
    add(reference(config));
    const counts =
      options.reallocate !== false && config.serviceZones?.length === 2 && config.windows > 1
        ? Array.from({ length: config.windows - 1 }, (_, i) => i + 1)
        : [null];
    for (const slot of [...new Set(slots)])
      for (const order of permutations(active))
        for (const aWindows of counts) {
          try {
            add(makePlan(config, { slot, order, aWindows }));
          } catch (error) {
            rejected.push({ slot, order: order.slice(), aWindows, reason: error.message });
          }
        }
    return {
      accepted,
      rejected,
      scope: {
        slots: slots.slice(),
        orders: permutations(active),
        windowReallocation: options.reallocate !== false
      },
      workUnits: accepted.length * config.students
    };
  }
  function choose(rows, referenceRow, options = {}) {
    const meanAllowance = options.meanAllowance ?? 0.5,
      peakAllowance = options.peakAllowance ?? 0;
    if (
      !Number.isFinite(meanAllowance) ||
      meanAllowance < 0 ||
      meanAllowance > 10 ||
      !Number.isFinite(peakAllowance) ||
      peakAllowance < 0 ||
      peakAllowance > 1
    )
      throw new RangeError('用时余量须为0至10分钟，峰值余量须为0至100%');
    if (!rows.length || !referenceRow) throw new RangeError('需要候选与原方案结果');
    const summary = (row) => row.summary || row;
    for (const row of [...rows, referenceRow])
      for (const key of ['meanTotal', 'worstGrade', 'peakQueue'])
        if (!Number.isFinite(summary(row)[key]))
          throw new RangeError('候选结果必须含有限完整用时、最慢年级和排队峰值');
    const tie = (a, b) =>
      Number(b.id === 'reference') - Number(a.id === 'reference') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const best = (list, keys) =>
      list.slice().sort((a, b) => {
        for (const key of keys) {
          const difference = summary(a)[key] - summary(b)[key];
          if (Math.abs(difference) > EPS) return difference;
        }
        return tie(a, b);
      })[0];
    const base = summary(referenceRow),
      eligible = rows.filter(
        (row) =>
          summary(row).meanTotal <= base.meanTotal + meanAllowance + EPS &&
          summary(row).peakQueue <= base.peakQueue * (1 + peakAllowance) + EPS
      );
    if (!eligible.length) throw new RangeError('原方案必须保留为可行参照');
    return {
      efficiency: best(rows, ['meanTotal', 'worstGrade', 'peakQueue']),
      lowPeak: best(rows, ['peakQueue', 'meanTotal', 'worstGrade']),
      balanced: best(eligible, ['worstGrade', 'meanTotal', 'peakQueue']),
      eligibleIds: eligible.map((x) => x.id),
      criteria: { meanAllowance, peakAllowance }
    };
  }
  return {
    VERSION: '2.2.0',
    permutations,
    activeGrades,
    configKey,
    timetable,
    makePlan,
    reference,
    candidates,
    choose
  };
});
