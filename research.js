/* Research layer v2: transparent finite candidate enumeration, paired samples,
 * independent verification seeds, and export. No claim of global optimization. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./school-engine.js'));
  else root.DiningResearch = factory(root.CanteenSim);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (E) {
  'use strict';
  const VERSION = '2.0.0';
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const sd = (a) =>
    a.length > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - avg(a)) ** 2, 0) / (a.length - 1)) : 0;
  function example() {
    return E.normalizeSchoolConfig({
      mode: 'school',
      students: 360,
      windows: 6,
      windowMeans: [20, 20, 20, 20, 20, 20],
      windowOwners: [0, 0, 1, 1, 2, 2],
      serviceMean: 20,
      serviceCV: 0.35,
      strategy: 'shortest',
      allocation: 'shared',
      serviceStart: 28,
      serviceEnd: 70,
      horizon: 90,
      diningEnabled: true,
      seats: 120,
      mealMean: 10,
      mealCV: 0.2,
      returnMinutes: 3,
      returnDestination: 'classroom',
      seed: 20261018,
      seatWaitingCapacity: null,
      serviceZones: [
        { id: 0, name: 'A类套餐（假设）', seats: 90, walkExtra: 0, returnExtra: 0 },
        { id: 1, name: 'B类套餐（假设）', seats: 30, walkExtra: 0, returnExtra: 0 }
      ],
      windowZones: [0, 0, 0, 1, 1, 1],
      gradeZoneWeights: [
        [0.75, 0.25],
        [0.75, 0.25],
        [0.75, 0.25]
      ],
      seatPoolByZone: [0, 0],
      sourceProfile: {
        id: 'learning-360',
        title: '三年级教学场景 · 合成参数',
        asOf: '2026-10-18',
        status: 'research-assumptions',
        observedSchoolData: false
      },
      grades: [0, 1, 2].map((id) => ({
        id,
        name: ['高一', '高二', '高三'][id],
        students: 120,
        classes: 3,
        readyTime: 30,
        releaseTime: 30 + id * 2,
        classInterval: 0.2,
        assemblyMax: 0.8,
        walkMin: 2,
        walkMax: 4,
        deadline: 70,
        classSizes: null,
        latestReleaseTime: 41,
        releaseLocked: false
      }))
    });
  }
  function metrics(r) {
    const gs = r.gradeMetrics.filter((g) => g.count),
      totals = gs.map((g) => g.meanReadyToEndpoint);
    return {
      meanWait: r.metrics.meanWait,
      meanTotal: r.metrics.meanReadyToEndpoint,
      p95Wait: r.metrics.p95Wait,
      p95Total: r.metrics.p95ReadyToEndpoint,
      seatWait: r.metrics.meanSeatWait,
      onTime: r.metrics.onTimeRate,
      gradeGap: totals.length ? Math.max(...totals) - Math.min(...totals) : 0,
      worstGrade: totals.length ? Math.max(...totals) : 0,
      peakQueue: r.metrics.peakQueue,
      peakOnSite: r.metrics.peakOnSite,
      capacityExceeded: r.metrics.seatBufferExceeded ? 1 : 0,
      overtime: r.metrics.overtimeMinutes,
      ...Object.fromEntries(
        r.gradeMetrics.flatMap((g) => [
          [`grade${g.id}Count`, g.count],
          [`grade${g.id}Total`, g.count ? g.meanReadyToEndpoint : 0],
          [`grade${g.id}Wait`, g.count ? g.meanWait : 0],
          [`grade${g.id}OnTime`, g.count ? g.onTimeRate : 0]
        ])
      )
    };
  }
  function seedSets(seed, screening = 10, verification = 30) {
    for (const n of [screening, verification])
      if (!Number.isInteger(n) || n < 2 || n > 100) throw new RangeError('每组重复次数须为2至100的整数');
    if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new RangeError('随机种子超出范围');
    return {
      screening: Array.from({ length: screening }, (_, i) => (seed + i) >>> 0),
      verification: Array.from({ length: verification }, (_, i) => (seed + screening + i) >>> 0)
    };
  }
  function candidates(input, options = {}) {
    const c = E.normalizeSchoolConfig(input),
      gaps = options.gaps || [0, 1, 2, 3, 4],
      accepted = [],
      rejected = [];
    if (
      !Array.isArray(gaps) ||
      !gaps.length ||
      gaps.length > 30 ||
      gaps.some((x) => !Number.isFinite(x) || x < 0 || x > 120)
    )
      throw new RangeError('请提供1至30个有效间隔');
    const zoned = c.serviceZones && c.serviceZones.length === 2;
    const counts =
      options.reallocate && zoned ? Array.from({ length: c.windows - 1 }, (_, i) => i + 1) : [null];
    for (const gap of [...new Set(gaps)])
      for (const aWindows of counts) {
        const id = `g${gap}-a${aWindows ?? 'fixed'}`;
        try {
          const config = E.makeSchoolGapConfig(c, gap);
          if (aWindows !== null)
            config.windowZones = config.windowZones.map((_, i) => (i < aWindows ? 0 : 1));
          accepted.push({
            id,
            gap,
            aWindows,
            config: E.normalizeSchoolConfig(config),
            label: `间隔${gap}分${aWindows === null ? ' · 原窗口配置' : ` · A/B ${aWindows}/${c.windows - aWindows}窗`}`
          });
        } catch (error) {
          rejected.push({ id, gap, aWindows, reason: error.message });
        }
      }
    return { accepted, rejected, scope: '仅当前年级顺序、指定间隔和窗口划分；不保证全局最优' };
  }
  function pareto(rows) {
    const keys = ['meanTotal', 'meanWait', 'gradeGap'];
    return rows.filter(
      (a) => !rows.some((b) => keys.every((k) => b[k] <= a[k] + 1e-9) && keys.some((k) => b[k] < a[k] - 1e-9))
    );
  }
  function summarize(rows) {
    if (!rows.length) throw new RangeError('没有重复实验记录');
    const result = {};
    for (const key of Object.keys(rows[0])) {
      result[key] = avg(rows.map((r) => r[key]));
      result[key + 'Sd'] = sd(rows.map((r) => r[key]));
    }
    return result;
  }
  function evaluate(config, seeds) {
    const rounds = seeds.map((seed) => metrics(E.simulateSchool({ ...config, seed })));
    return { rounds, ...summarize(rounds) };
  }
  // 95% Student-t critical values, df 1..30. For larger df use a series
  // approximation (up to df^-3); the interface offers n=10 or n=30.
  function critical(df) {
    const t = [
      0, 12.7062, 4.3027, 3.1824, 2.7764, 2.5706, 2.4469, 2.3646, 2.306, 2.2622, 2.2281, 2.201, 2.1788,
      2.1604, 2.1448, 2.1314, 2.1199, 2.1098, 2.1009, 2.093, 2.086, 2.0796, 2.0739, 2.0687, 2.0639, 2.0595,
      2.0555, 2.0518, 2.0484, 2.04523, 2.04227
    ];
    if (df <= 30) return t[df];
    const z = 1.95996398454;
    return (
      z +
      (z ** 3 + z) / (4 * df) +
      (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df ** 2) +
      (3 * z ** 7 + 19 * z ** 5 + 17 * z ** 3 - 15 * z) / (384 * df ** 3)
    );
  }
  function paired(a, b) {
    if (
      !Array.isArray(a) ||
      !Array.isArray(b) ||
      a.length !== b.length ||
      a.length < 2 ||
      [...a, ...b].some((x) => !Number.isFinite(x))
    )
      throw new RangeError('配对数据须等长、至少2组且为有限数值');
    const d = a.map((x, i) => b[i] - x),
      mean = avg(d),
      s = sd(d),
      half = (critical(d.length - 1) * s) / Math.sqrt(d.length);
    return {
      n: d.length,
      mean,
      sd: s,
      low: mean - half,
      high: mean + half,
      unit: 'minutes',
      method: 'paired-t-95',
      direction: 'B minus A'
    };
  }
  function compare(a, b, seeds) {
    const A = evaluate(a, seeds),
      B = evaluate(b, seeds),
      differences = {};
    for (const k of ['meanWait', 'meanTotal', 'p95Wait', 'gradeGap'])
      differences[k] = paired(
        A.rounds.map((r) => r[k]),
        B.rounds.map((r) => r[k])
      );
    return { A, B, differences, seeds: seeds.slice() };
  }
  function changes(a, b) {
    const paths = [];
    function walk(x, y, path) {
      if (JSON.stringify(x) === JSON.stringify(y)) return;
      if (x && y && typeof x === 'object' && typeof y === 'object' && Array.isArray(x) === Array.isArray(y)) {
        for (const key of new Set([...Object.keys(x), ...Object.keys(y)]))
          walk(x[key], y[key], path ? path + '.' + key : key);
      } else paths.push(path);
    }
    walk(a, b, '');
    return paths.filter((p) => p !== 'seed' && !p.startsWith('sourceProfile'));
  }
  function session(config) {
    return {
      schema: 'dining-lab/2',
      version: VERSION,
      evidence: 'synthetic',
      createdAt: new Date().toISOString(),
      config: E.normalizeSchoolConfig(config)
    };
  }
  function readSession(text) {
    if (text.length > 2_000_000) throw new RangeError('参数文件过大');
    const x = JSON.parse(text);
    if (x.schema !== 'dining-lab/2' || x.evidence !== 'synthetic')
      throw new RangeError('请导入本软件保存的场景文件；实测数据需另行核验');
    return E.normalizeSchoolConfig(x.config);
  }
  function csv(rows) {
    if (!rows.length) return '\ufeff';
    const keys = Object.keys(rows[0]),
      cell = (v) => {
        let s = String(v ?? '');
        if (typeof v === 'string' && /^[=+@\-\t\r]/.test(s)) s = "'" + s;
        return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
    return (
      '\ufeff' +
      [keys, ...rows.map((row) => keys.map((k) => row[k]))].map((row) => row.map(cell).join(',')).join('\r\n')
    );
  }
  function clockLabel(minutes, seconds = true) {
    const total = Math.round((680 + minutes) * 60),
      days = Math.floor(total / 86400),
      within = ((total % 86400) + 86400) % 86400;
    const parts = [Math.floor(within / 3600), Math.floor(within / 60) % 60];
    if (seconds) parts.push(within % 60);
    return (
      (days ? `${days > 0 ? '+' : ''}${days}天 ` : '') +
      parts.map((x) => String(x).padStart(2, '0')).join(':')
    );
  }
  return Object.freeze({
    VERSION,
    example,
    metrics,
    seedSets,
    candidates,
    pareto,
    summarize,
    evaluate,
    paired,
    compare,
    changes,
    session,
    readSession,
    csv,
    clone,
    clockLabel
  });
});
