/*
 * Campus cafeteria school-grade model, v1.5.0.
 * Load AFTER engine.js in a browser; require('./school-engine.js') in Node.
 * The v1.2 engine is delegated to unchanged for configs without mode:'school'.
 * Times are minutes since 11:20, except configured window service means (seconds).
 * Synthetic examples: compatible service counters within each fixed zone;
 * no kitchen, multi-station meal process, or aisle/stairway blocking.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'), require('./hall-walk.js'));
  else root.CanteenSim = factory(root.CanteenSim, root.DiningHallWalk);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Legacy, Hall) {
  'use strict';
  if (!Legacy || typeof Legacy.simulate !== 'function') throw new Error('请先加载 engine.js');

  var VERSION = '1.6.0';
  var gradeDefaults = [
    { id: 0, name: '高一', students: 300, classes: 6, readyTime: 25, releaseTime: 25, classInterval: 0.3, assemblyMax: 1.5, walkMin: 2, walkMax: 4, deadline: 120, classSizes: null, latestReleaseTime: null, releaseLocked: false },
    { id: 1, name: '高二', students: 340, classes: 7, readyTime: 25, releaseTime: 35, classInterval: 0.3, assemblyMax: 1.5, walkMin: 2, walkMax: 4, deadline: 120, classSizes: null, latestReleaseTime: null, releaseLocked: false },
    { id: 2, name: '高三', students: 320, classes: 7, readyTime: 25, releaseTime: 45, classInterval: 0.3, assemblyMax: 1.5, walkMin: 2, walkMax: 4, deadline: 120, classSizes: null, latestReleaseTime: null, releaseLocked: false }
  ];
  gradeDefaults.forEach(Object.freeze);
  var DEFAULT_SCHOOL_CONFIG = Object.freeze({
    mode: 'school', grades: Object.freeze(gradeDefaults), students: 960,
    windows: 8, serviceMean: 30, serviceCV: 0.35, windowMeans: null,
    strategy: 'pooled', allocation: 'shared',
    windowOwners: Object.freeze([0, 0, 0, 1, 1, 1, 2, 2]),
    serviceStart: 20, serviceEnd: 110, horizon: 120,
    diningEnabled: true, seats: 240, mealMean: 15, mealCV: 0.2,
    indoorWalkSpeed: 0, returnMinutes: 5, seed: 20261017,
    returnDestination: 'classroom', serviceZones: null, windowZones: null, gradeZoneWeights: null, sourceProfile: null,
    seatPoolByZone: null, seatWaitingCapacity: null
  });
  var KEYS = Object.keys(DEFAULT_SCHOOL_CONFIG), GRADE_KEYS = Object.keys(gradeDefaults[0]);
  var ZONE_KEYS = ['id', 'name', 'seats', 'walkExtra', 'returnExtra'];
  var SOURCE_KEYS = ['id', 'title', 'asOf', 'status', 'observedSchoolData'];
  var DESTINATION_LABELS = Object.freeze({ classroom: '返回教室', dormitory: '返回宿舍', gate: '到达校门' });

  function object(value, name) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(name + ' 必须为对象');
  }
  function number(value, name, min, max, integer) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(name + ' 必须为有限数值');
    if (integer && !Number.isInteger(value)) throw new RangeError(name + ' 必须为整数');
    if (value < min || value > max) throw new RangeError(name + ' 必须在 ' + min + ' 到 ' + max + ' 之间');
    return value;
  }
  function knownKeys(value, keys, name) {
    Object.keys(value).forEach(function (key) {
      if (keys.indexOf(key) === -1) throw new TypeError('未知' + name + '参数：' + key);
    });
  }
  function has(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
  function lastOccupiedClassIndex(grade) {
    if (!grade.students) return -1;
    if (grade.classSizes === null) return grade.classes - 1;
    for (var i = grade.classSizes.length - 1; i >= 0; i -= 1) if (grade.classSizes[i] > 0) return i;
    return -1;
  }
  function defaultOwners(count) {
    return Array.from({ length: count }, function (_, i) { return Math.min(2, Math.floor(i * 3 / count)); });
  }
  function normalizeSchoolConfig(input) {
    if (input === undefined) input = {};
    object(input, '学校仿真参数'); knownKeys(input, KEYS, '学校仿真');
    var c = {};
    KEYS.forEach(function (key) { c[key] = has(input, key) ? input[key] : DEFAULT_SCHOOL_CONFIG[key]; });
    if (c.mode !== 'school') throw new RangeError('mode 必须为 school');
    number(c.windows, 'windows', 1, 16, true);
    number(c.serviceMean, 'serviceMean', 5, 120);
    number(c.serviceCV, 'serviceCV', 0, 1);
    number(c.serviceStart, 'serviceStart', 0, 720);
    number(c.serviceEnd, 'serviceEnd', 0, 720);
    if (c.serviceEnd <= c.serviceStart) throw new RangeError('计划供餐结束必须晚于供餐开始');
    number(c.horizon, 'horizon', 1, 720);
    number(c.seed, 'seed', 0, 4294967295, true);
    if (typeof c.diningEnabled !== 'boolean') throw new TypeError('diningEnabled 必须为布尔值');
    number(c.seats, 'seats', 1, 5000, true);
    number(c.mealMean, 'mealMean', 1, 90);
    number(c.mealCV, 'mealCV', 0, 1);
    number(c.returnMinutes, 'returnMinutes', 0, 60);
    number(c.indoorWalkSpeed, 'indoorWalkSpeed', 0, 3);
    if (c.seatWaitingCapacity !== null) number(c.seatWaitingCapacity, 'seatWaitingCapacity', 0, 5000, true);
    if (typeof c.returnDestination !== 'string' || !has(DESTINATION_LABELS, c.returnDestination)) throw new RangeError('returnDestination 必须为 classroom、dormitory 或 gate');
    if (c.sourceProfile !== null) {
      object(c.sourceProfile, 'sourceProfile'); knownKeys(c.sourceProfile, SOURCE_KEYS, '案例出处');
      var source = c.sourceProfile;
      ['id', 'title'].forEach(function (key) {
        var limit = key === 'id' ? 80 : 160;
        if (typeof source[key] !== 'string' || !source[key].trim() || source[key].length > limit) throw new TypeError('sourceProfile.' + key + ' 必须为 1 到 ' + limit + ' 个字符');
      });
      if (typeof source.asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(source.asOf) || !Number.isFinite(Date.parse(source.asOf)) || new Date(source.asOf).toISOString().slice(0, 10) !== source.asOf) throw new TypeError('sourceProfile.asOf 必须为有效的 YYYY-MM-DD 日期');
      if (source.status !== 'research-assumptions' && source.status !== 'modified') throw new RangeError('sourceProfile.status 必须为 research-assumptions 或 modified');
      if (source.observedSchoolData !== false) throw new RangeError('sourceProfile.observedSchoolData 仅允许 false；案例数据未经学校实测校准');
      c.sourceProfile = { id: source.id.trim(), title: source.title.trim(), asOf: source.asOf, status: source.status, observedSchoolData: false };
    }
    if (typeof c.strategy !== 'string' || !has(Legacy.strategyNames, c.strategy)) throw new RangeError('strategy 必须为 shortest、workload、fastest、random 或 pooled');
    if (['shared', 'dedicated', 'overflow'].indexOf(c.allocation) === -1) throw new RangeError('allocation 必须为 shared、dedicated 或 overflow');
    if (!Array.isArray(c.grades) || c.grades.length !== 3) throw new RangeError('grades 必须恰好包含高一、高二、高三三个年级');
    c.grades = c.grades.map(function (source, i) {
      object(source, 'grades[' + i + ']'); knownKeys(source, GRADE_KEYS, '年级');
      var g = {};
      GRADE_KEYS.forEach(function (key) { g[key] = has(source, key) ? source[key] : gradeDefaults[i][key]; });
      if (g.id !== i) throw new RangeError('年级 id 必须依次为 0、1、2');
      if (typeof g.name !== 'string' || !g.name.trim() || g.name.length > 30) throw new TypeError('年级名称必须为 1 到 30 个字符');
      g.name = g.name.trim();
      number(g.students, g.name + '.students', 0, 5000, true);
      number(g.classes, g.name + '.classes', 0, 100, true);
      if (g.classSizes !== null) {
        if (!Array.isArray(g.classSizes) || g.classSizes.length !== g.classes) throw new RangeError(g.name + '.classSizes 数量必须与班级数一致');
        g.classSizes = Array.from(g.classSizes, function (value, index) { return number(value, g.name + '.classSizes[' + index + ']', 0, 5000, true); });
        if (g.classSizes.reduce(function (a, b) { return a + b; }, 0) !== g.students) throw new RangeError(g.name + '.classSizes 之和必须等于就餐人数');
      }
      if (g.students > 0 && (g.classes === 0 || (g.classSizes === null && g.classes > g.students))) throw new RangeError(g.name + ' 非空年级的班级数必须介于 1 和就餐人数之间；空班需用 classSizes 明确登记');
      number(g.readyTime, g.name + '.readyTime', 0, 720);
      number(g.releaseTime, g.name + '.releaseTime', 0, 720);
      number(g.classInterval, g.name + '.classInterval', 0, 30);
      number(g.assemblyMax, g.name + '.assemblyMax', 0, 30);
      number(g.walkMin, g.name + '.walkMin', 0, 60);
      number(g.walkMax, g.name + '.walkMax', 0, 60);
      number(g.deadline, g.name + '.deadline', 0, 1440);
      if (g.latestReleaseTime !== null) number(g.latestReleaseTime, g.name + '.latestReleaseTime', 0, 1440);
      if (typeof g.releaseLocked !== 'boolean') throw new TypeError(g.name + '.releaseLocked 必须为布尔值');
      if (g.releaseTime < g.readyTime) throw new RangeError(g.name + ' 放行时间不得早于允许放行时间');
      if (g.walkMax < g.walkMin) throw new RangeError(g.name + ' 步行时间上限不得小于下限');
      var lastClass = lastOccupiedClassIndex(g), lastRelease = g.releaseTime + Math.max(0, lastClass) * g.classInterval;
      if (lastRelease > 1440) throw new RangeError(g.name + ' 最后一个有学生班级放行时间超出 1440 分钟');
      if (lastClass >= 0 && g.latestReleaseTime !== null && lastRelease > g.latestReleaseTime + 1e-9) throw new RangeError(g.name + ' 最后一个有学生班级放行晚于最晚放行时刻');
      return g;
    });
    var total = c.grades.reduce(function (sum, grade) { return sum + grade.students; }, 0);
    number(total, '学生总数', 0, 5000, true);
    if (has(input, 'students')) {
      number(input.students, 'students', 0, 5000, true);
      if (input.students !== total) throw new RangeError('students 必须与三个年级就餐人数之和一致');
    }
    c.students = total;
    if (c.windowMeans !== null) {
      if (!Array.isArray(c.windowMeans) || c.windowMeans.length !== c.windows) throw new RangeError('windowMeans 数量必须与窗口数量一致');
      c.windowMeans = Array.from(c.windowMeans, function (value, i) { return number(value, 'windowMeans[' + i + ']', 1, 600); });
    }
    if (!has(input, 'windowOwners') || c.windowOwners === null) c.windowOwners = defaultOwners(c.windows);
    else {
      if (!Array.isArray(c.windowOwners) || c.windowOwners.length !== c.windows) throw new RangeError('windowOwners 数量必须与窗口数量一致');
      c.windowOwners = Array.from(c.windowOwners, function (value, i) { return number(value, 'windowOwners[' + i + ']', 0, 2, true); });
    }
    if (c.allocation === 'dedicated') c.grades.forEach(function (grade) {
      if (grade.students > 0 && c.windowOwners.indexOf(grade.id) === -1) throw new RangeError(grade.name + ' 有就餐学生，必须至少分配一个专用窗口');
    });
    if (c.serviceZones === null) {
      if (c.windowZones !== null || c.gradeZoneWeights !== null) throw new RangeError('未启用 serviceZones 时，windowZones 和 gradeZoneWeights 必须为 null');
    } else {
      if (!Array.isArray(c.serviceZones) || c.serviceZones.length < 1 || c.serviceZones.length > 4) throw new RangeError('serviceZones 必须为 null，或包含 1 到 4 个服务区');
      c.serviceZones = Array.from(c.serviceZones, function (source, i) {
        object(source, 'serviceZones[' + i + ']'); knownKeys(source, ZONE_KEYS, '服务区');
        var z = {
          id: has(source, 'id') ? source.id : i,
          name: has(source, 'name') ? source.name : '服务区 ' + (i + 1),
          seats: source.seats, walkExtra: has(source, 'walkExtra') ? source.walkExtra : 0,
          returnExtra: has(source, 'returnExtra') ? source.returnExtra : 0
        };
        if (z.id !== i) throw new RangeError('服务区 id 必须从 0 起连续编号');
        if (typeof z.name !== 'string' || !z.name.trim() || z.name.length > 30) throw new TypeError('服务区名称必须为 1 到 30 个字符');
        z.name = z.name.trim();
        number(z.seats, z.name + '.seats', 1, 5000, true);
        number(z.walkExtra, z.name + '.walkExtra', 0, 15);
        number(z.returnExtra, z.name + '.returnExtra', 0, 15);
        return z;
      });
      var zoneCount = c.serviceZones.length;
      var zoneSeats = c.serviceZones.reduce(function (totalSeats, z) { return totalSeats + z.seats; }, 0);
      number(zoneSeats, '服务区座位总数', 1, 5000, true);
      if (has(input, 'seats') && input.seats !== zoneSeats) throw new RangeError('seats 必须等于各服务区座位数之和');
      c.seats = zoneSeats;
      if (c.windowZones === null) c.windowZones = Array.from({ length: c.windows }, function (_, i) { return Math.min(zoneCount - 1, Math.floor(i * zoneCount / c.windows)); });
      else {
        if (!Array.isArray(c.windowZones) || c.windowZones.length !== c.windows) throw new RangeError('windowZones 数量必须与窗口数量一致');
        c.windowZones = Array.from(c.windowZones, function (value, i) { return number(value, 'windowZones[' + i + ']', 0, zoneCount - 1, true); });
      }
      if (c.gradeZoneWeights === null) c.gradeZoneWeights = [0, 1, 2].map(function () { return Array.from({ length: zoneCount }, function () { return 1 / zoneCount; }); });
      if (!Array.isArray(c.gradeZoneWeights) || c.gradeZoneWeights.length !== 3) throw new RangeError('gradeZoneWeights 必须为 3 × 服务区数量的权重矩阵');
      c.gradeZoneWeights = Array.from(c.gradeZoneWeights, function (source, grade) {
        if (!Array.isArray(source) || source.length !== zoneCount) throw new RangeError('各年级分区权重数量必须与服务区数量一致');
        var values = Array.from(source, function (value, zone) { return number(value, 'gradeZoneWeights[' + grade + '][' + zone + ']', 0, Number.MAX_VALUE); });
        var maxWeight = Math.max.apply(null, values);
        if (maxWeight === 0) {
          if (c.grades[grade].students > 0) throw new RangeError(c.grades[grade].name + ' 非空年级的服务区权重之和必须大于 0');
          return values;
        }
        // Validate every positive input weight before numerical normalization,
        // including tiny values that can underflow when scaled against a very
        // large weight. An unavailable route must never be silently accepted.
        values.forEach(function (weight, zone) {
          if (!weight || !c.grades[grade].students) return;
          var eligible = c.windowZones.some(function (windowZone, window) { return windowZone === zone && (c.allocation !== 'dedicated' || c.windowOwners[window] === grade); });
          if (!eligible) throw new RangeError(c.grades[grade].name + ' 在 ' + c.serviceZones[zone].name + ' 有正权重，必须有' + (c.allocation === 'dedicated' ? '本年级所属的' : '可用的') + '区内窗口');
        });
        // Preserve an already canonical row exactly, so JSON re-import and
        // paired helper calls do not gradually perturb zone probabilities.
        var weightSum = values.reduce(function (a, b) { return a + b; }, 0);
        if (weightSum !== 1) {
          values = values.map(function (value) { return value / maxWeight; });
          var scaledSum = values.reduce(function (a, b) { return a + b; }, 0);
          values = values.map(function (value) { return value / scaledSum; });
          var pivot = values.length - 1;
          while (values[pivot] === 0) pivot -= 1;
          var beforePivot = values.slice(0, pivot).reduce(function (a, b) { return a + b; }, 0);
          values[pivot] = Math.max(0, 1 - beforePivot);
        }
        return values;
      });
    }
    var effectiveZoneCount = c.serviceZones ? c.serviceZones.length : 1;
    if (c.seatPoolByZone !== null) {
      if (!Array.isArray(c.seatPoolByZone) || c.seatPoolByZone.length !== effectiveZoneCount) throw new RangeError('seatPoolByZone 数量必须与有效服务区数量一致');
      c.seatPoolByZone = Array.from(c.seatPoolByZone, function (value, i) { return number(value, 'seatPoolByZone[' + i + ']', 0, effectiveZoneCount - 1, true); });
    }
    return c;
  }

  function effectiveZones(config) {
    return config.serviceZones || [{ id: 0, name: '统一服务区', seats: config.seats, walkExtra: 0, returnExtra: 0 }];
  }
  function windowZone(config, id) { return config.windowZones ? config.windowZones[id] : 0; }
  function seatPoolMap(config) { return config.seatPoolByZone || effectiveZones(config).map(function (z) { return z.id; }); }
  function effectiveSeatPools(config) {
    var zones = effectiveZones(config), mapping = seatPoolMap(config), pools = [], byId = {}, offset = 0;
    zones.forEach(function (zone) {
      var id = mapping[zone.id], group = byId[id];
      if (!group) { group = { id: id, zoneIds: [], zoneNames: [], seats: 0, seatIds: [] }; byId[id] = group; pools.push(group); }
      group.zoneIds.push(zone.id); group.zoneNames.push(zone.name); group.seats += zone.seats;
      for (var i = 0; i < zone.seats; i += 1) group.seatIds.push(offset + i);
      offset += zone.seats;
    });
    return pools.sort(function (a, b) { return a.id - b.id; });
  }
  function destinationLabel(config) { return DESTINATION_LABELS[config.returnDestination || 'classroom']; }
  function chooseZone(config, grade, draw) {
    if (!config.serviceZones) return 0;
    var weights = config.gradeZoneWeights[grade], cumulative = 0, lastPositive = 0;
    for (var i = 0; i < weights.length; i += 1) {
      if (weights[i] > 0) lastPositive = i;
      cumulative += weights[i];
      if (draw < cumulative) return i;
    }
    return lastPositive;
  }

  function mix32(x) {
    x = (x ^ (x >>> 16)) >>> 0; x = Math.imul(x, 0x7feb352d) >>> 0;
    x = (x ^ (x >>> 15)) >>> 0; x = Math.imul(x, 0x846ca68b) >>> 0;
    return (x ^ (x >>> 16)) >>> 0;
  }
  function uniform(seed, person, stream) {
    var key = (seed ^ Math.imul(person + 1, 0x9e3779b1) ^ Math.imul(stream + 1, 0x85ebca6b)) >>> 0;
    return (mix32(key) + 0.5) / 4294967296;
  }
  function normal(seed, person, stream) {
    return Math.sqrt(-2 * Math.log(uniform(seed, person, stream))) * Math.cos(2 * Math.PI * uniform(seed, person, stream + 1));
  }
  function factor(seed, person, stream, cv) {
    if (cv === 0) return 1;
    var sigma = Math.sqrt(Math.log(1 + cv * cv));
    return Math.exp(sigma * normal(seed, person, stream) - sigma * sigma / 2);
  }
  function sum(records, getter) { return records.reduce(function (total, item) { return total + getter(item); }, 0); }
  function mean(records, getter) { return records.length ? sum(records, getter) / records.length : 0; }
  function maximum(records, getter) { return records.reduce(function (value, item) { return Math.max(value, getter(item)); }, 0); }
  function q(records, getter, p) { return Legacy.quantile(records.map(getter), p === undefined ? 0.95 : p); }
  function cv(values) {
    var average = values.length ? values.reduce(function (a, b) { return a + b; }, 0) / values.length : 0;
    return average ? Math.sqrt(values.reduce(function (a, b) { return a + (b - average) * (b - average); }, 0) / values.length) / average : 0;
  }
  function byArrival(a, b) { return a.arrival - b.arrival || a.id - b.id; }
  function byPickup(a, b) { return a.end - b.end || a.id - b.id; }
  function pool() { return { records: [], head: 0 }; }
  function poolSize(p) { return p.records.length - p.head; }
  function poolHead(p) { return poolSize(p) ? p.records[p.head] : null; }
  function poolPop(p) { return p.records[p.head++]; }

  function makeSchoolBaseline(input) {
    var c = normalizeSchoolConfig(input);
    var active = c.grades.filter(function (g) { return g.students > 0; });
    if (!active.length) return c;
    var start = Math.max.apply(null, active.map(function (g) { return g.readyTime; }));
    var locked = active.filter(function (g) { return g.releaseLocked; });
    if (locked.length) {
      var anchor = locked[0].releaseTime;
      if (locked.some(function (g) { return Math.abs(g.releaseTime - anchor) > 1e-9; })) throw new RangeError('共同放行不可行：锁定年级的首班放行时刻不同');
      if (anchor < start - 1e-9) throw new RangeError('共同放行不可行：锁定时刻早于其他年级允许放行时刻');
      start = anchor;
    }
    active.forEach(function (g) { if (!g.releaseLocked) g.releaseTime = Math.max(start, g.readyTime); });
    return normalizeSchoolConfig(c);
  }
  function makeSchoolGapConfig(input, gap) {
    number(gap, '年级放行间隔', 0, 120);
    var c = normalizeSchoolConfig(input);
    var order = c.grades.filter(function (g) { return g.students > 0; }).sort(function (a, b) { return a.releaseTime - b.releaseTime || a.id - b.id; });
    if (!order.length) return c;
    var start = Math.max.apply(null, order.map(function (g) { return g.readyTime; })), fixedAnchor = null;
    order.forEach(function (g, i) {
      if (!g.releaseLocked) return;
      var anchor = g.releaseTime - i * gap;
      if (fixedAnchor !== null && Math.abs(anchor - fixedAnchor) > 1e-9) throw new RangeError('年级错峰不可行：间隔与锁定首班时刻冲突');
      fixedAnchor = anchor;
    });
    if (fixedAnchor !== null) start = fixedAnchor;
    order.forEach(function (g, i) {
      var release = start + i * gap;
      if (release < g.readyTime - 1e-9) throw new RangeError(g.name + ' 错峰放行早于允许放行时刻');
      if (!g.releaseLocked) g.releaseTime = Math.max(release, g.readyTime);
    });
    return normalizeSchoolConfig(c);
  }

  function createStudents(config) {
    var students = [], batches = [], zones = effectiveZones(config), seatMapping = seatPoolMap(config);
    config.grades.forEach(function (g) {
      var classData = Array.from({ length: g.students || g.classSizes !== null ? g.classes : 0 }, function (_, classIndex) {
        var key = g.id * 8192 + classIndex;
        var data = {
          grade: g.id, gradeName: g.name, classIndex: classIndex,
          classId: g.id + '-' + classIndex, students: 0,
          readyTime: g.readyTime, release: g.releaseTime + classIndex * g.classInterval,
          assembly: g.assemblyMax * uniform(config.seed, key, 20),
          walk: g.walkMin + (g.walkMax - g.walkMin) * uniform(config.seed, key, 21)
        };
        batches.push(data); return data;
      });
      var explicitClassIndex = 0, explicitClassEnd = g.classSizes && g.classSizes.length ? g.classSizes[0] : 0;
      for (var ordinal = 0; ordinal < g.students; ordinal += 1) {
        if (g.classSizes !== null) while (ordinal >= explicitClassEnd) { explicitClassIndex += 1; explicitClassEnd += g.classSizes[explicitClassIndex]; }
        var classIndex = g.classSizes === null ? Math.floor(ordinal * g.classes / g.students) : explicitClassIndex, batch = classData[classIndex];
        batch.students += 1;
        var randomId = g.id * 8192 + ordinal;
        var jitter = 0.5 * uniform(config.seed, randomId, 22);
        // Stream 24 is independent of every v1.3 arrival/service/meal/routing
        // stream. Allocation is fixed per person for the complete meal visit.
        var zoneDraw = uniform(config.seed, randomId, 24), zoneId = chooseZone(config, g.id, zoneDraw), zone = zones[zoneId];
        var arrival = batch.release + batch.assembly + batch.walk + jitter + zone.walkExtra;
        students.push({
          id: students.length, cohort: g.id, grade: g.id, gradeName: g.name,
          zone: zoneId, zoneName: zone.name, zoneDraw: zoneDraw, zoneWalk: zone.walkExtra, zoneReturn: zone.returnExtra,
          gradeOrdinal: ordinal, randomId: randomId, classIndex: classIndex, classId: batch.classId,
          readyTime: g.readyTime, release: batch.release, gradeRelease: g.releaseTime,
          releaseDelay: batch.release - g.readyTime, assembly: batch.assembly, walk: batch.walk,
          arrivalJitter: jitter, arrival: arrival, rawArrival: arrival, arrivalClipped: null,
          targetArrival: batch.release + g.assemblyMax / 2 + (g.walkMin + g.walkMax) / 2 + 0.25 + zone.walkExtra,
          serviceFactor: factor(config.seed, randomId, 2, config.serviceCV),
          mealFactor: factor(config.seed, randomId, 10, config.mealCV),
          routeDraw: uniform(config.seed, randomId, 4),
          start: null, end: null, wait: null, service: null, window: null,
          seatId: null, seatZone: null, seatPool: seatMapping[zoneId], seatStart: null, seatWait: 0, mealDuration: 0, mealEnd: null,
          returnTime: null, endpointTime: null, deadline: g.deadline, late: false,
          staggerParticipant: true, plannedArrivalOffset: batch.release - g.readyTime,
          appliedArrivalOffset: batch.release - g.readyTime
        });
      }
    });
    return { students: students, batches: batches };
  }

  function simulatePickup(config, students, effectiveMeans) {
    var servers = effectiveMeans.map(function (seconds, id) {
      return { id: id, owner: config.windowOwners[id], zone: windowZone(config, id), mean: seconds / 60, current: null, queue: pool(), maxQueue: 0, physicalQueueIntegral: 0 };
    });
    var usePools = config.strategy === 'pooled' || config.allocation === 'overflow';
    var zoneCount = effectiveZones(config).length;
    var sharedPools = Array.from({ length: zoneCount }, pool);
    var gradePools = Array.from({ length: zoneCount }, function () { return [pool(), pool(), pool()]; });
    var arrivals = students.slice().sort(byArrival), nextArrival = 0;
    var time = 0, waiting = 0, inService = 0, opened = false;
    var queueIntegral = 0, systemIntegral = 0, busyIntegral = 0;
    var gradeQueueIntegrals = [0, 0, 0], gradeWaiting = [0, 0, 0];
    var zoneStats = Array.from({ length: zoneCount }, function () { return { waiting: 0, inService: 0, queueIntegral: 0, peakQueue: 0, peakQueueTime: 0 }; });
    var peakQueue = 0, peakQueueTime = 0, peakSystem = 0;

    function begin(server, student) {
      waiting -= 1; gradeWaiting[student.grade] -= 1; inService += 1;
      zoneStats[student.zone].waiting -= 1; zoneStats[student.zone].inService += 1;
      student.window = server.id; student.start = time; student.wait = time - student.arrival;
      student.service = server.mean * student.serviceFactor; student.end = time + student.service;
      server.current = student;
    }
    function choose(student) {
      var eligible = servers.filter(function (s) { return s.zone === student.zone && (config.allocation !== 'dedicated' || s.owner === student.grade); });
      if (config.strategy === 'random') return eligible[Math.floor(student.routeDraw * eligible.length)];
      var best = null, score = Infinity;
      eligible.forEach(function (server) {
        var count = poolSize(server.queue), estimate;
        if (config.strategy === 'shortest') estimate = count + (server.current ? 1 : 0);
        else {
          // Elapsed-service heuristic only. Actual current.end and the arriving
          // student's latent serviceFactor are NEVER inputs to a routing choice.
          var residual = server.current ? Math.max(server.mean - (time - server.current.start), 0) : 0;
          estimate = residual + (count + (config.strategy === 'fastest' ? 1 : 0)) * server.mean;
        }
        if (estimate < score || (estimate === score && best.current !== null && server.current === null)) { best = server; score = estimate; }
      });
      return best;
    }
    function dispatch() {
      if (!opened) return;
      if (!usePools) {
        servers.forEach(function (server) {
          if (!server.current && poolSize(server.queue)) begin(server, poolPop(server.queue));
        });
      } else if (config.allocation === 'shared') {
        servers.forEach(function (server) {
          if (!server.current && poolSize(sharedPools[server.zone])) begin(server, poolPop(sharedPools[server.zone]));
        });
      } else {
        // Reserve every idle owner's capacity for its own currently waiting
        // students before borrowing any other grade. This avoids window-ID
        // order stealing a student's own idle window during a joint release.
        servers.forEach(function (server) {
          if (!server.current && poolSize(gradePools[server.zone][server.owner])) begin(server, poolPop(gradePools[server.zone][server.owner]));
        });
        if (config.allocation === 'overflow') servers.forEach(function (server) {
          if (server.current) return;
          var selected = null;
          gradePools[server.zone].forEach(function (p) {
            var head = poolHead(p);
            if (head && (!selected || byArrival(head, poolHead(selected)) < 0)) selected = p;
          });
          if (selected) begin(server, poolPop(selected));
        });
      }
    }
    while (true) {
      var next = nextArrival < arrivals.length ? arrivals[nextArrival].arrival : Infinity;
      if (!opened && (students.length > 0 || waiting > 0)) next = Math.min(next, config.serviceStart);
      servers.forEach(function (server) { if (server.current) next = Math.min(next, server.current.end); });
      if (next === Infinity) break;
      var dt = next - time;
      queueIntegral += waiting * dt; systemIntegral += (waiting + inService) * dt; busyIntegral += inService * dt;
      for (var g = 0; g < 3; g += 1) gradeQueueIntegrals[g] += gradeWaiting[g] * dt;
      zoneStats.forEach(function (z) { z.queueIntegral += z.waiting * dt; });
      if (!usePools) servers.forEach(function (server) { server.physicalQueueIntegral += poolSize(server.queue) * dt; });
      time = next;
      if (!opened && time >= config.serviceStart) opened = true;
      servers.forEach(function (server) {
        if (server.current && server.current.end <= time) { zoneStats[server.zone].inService -= 1; server.current = null; inService -= 1; }
      });
      while (nextArrival < arrivals.length && arrivals[nextArrival].arrival <= time) {
        var student = arrivals[nextArrival++]; waiting += 1; gradeWaiting[student.grade] += 1;
        zoneStats[student.zone].waiting += 1;
        if (!usePools) {
          var target = choose(student); student.window = target.id; target.queue.records.push(student);
        } else if (config.allocation === 'shared') sharedPools[student.zone].records.push(student);
        else gradePools[student.zone][student.grade].records.push(student);
      }
      dispatch();
      if (waiting > peakQueue) { peakQueue = waiting; peakQueueTime = time; }
      zoneStats.forEach(function (z) { if (z.waiting > z.peakQueue) { z.peakQueue = z.waiting; z.peakQueueTime = time; } });
      peakSystem = Math.max(peakSystem, waiting + inService);
      if (!usePools) servers.forEach(function (server) { server.maxQueue = Math.max(server.maxQueue, poolSize(server.queue)); });
    }
    if (waiting !== 0 || inService !== 0 || students.some(function (s) { return s.end === null; })) throw new Error('内部错误：有学生未完成取餐');
    return {
      servers: servers, queueIntegral: queueIntegral, systemIntegral: systemIntegral, busyIntegral: busyIntegral,
      gradeQueueIntegrals: gradeQueueIntegrals, zoneStats: zoneStats, peakQueue: peakQueue, peakQueueTime: peakQueueTime, peakSystem: peakSystem, usePools: usePools
    };
  }

  // A binary heap chooses the earliest available physical seat. Students are
  // processed in pickup-completion FCFS order; table congestion does not feed
  // back into counter service in this model.
  function seatLess(a, b) { return a.available < b.available || (a.available === b.available && a.id < b.id); }
  function heapPush(heap, value) {
    var index = heap.length; heap.push(value);
    while (index > 0) {
      var parent = Math.floor((index - 1) / 2);
      if (!seatLess(value, heap[parent])) break;
      heap[index] = heap[parent]; index = parent;
    }
    heap[index] = value;
  }
  function heapPop(heap) {
    var first = heap[0], last = heap.pop();
    if (heap.length) {
      var index = 0;
      while (index * 2 + 1 < heap.length) {
        var child = index * 2 + 1;
        if (child + 1 < heap.length && seatLess(heap[child + 1], heap[child])) child += 1;
        if (!seatLess(heap[child], last)) break;
        heap[index] = heap[child]; index = child;
      }
      heap[index] = last;
    }
    return first;
  }
  function simulateDining(config, students) {
    if (config.diningEnabled) {
      var seatOffset = 0, zones = effectiveZones(config), mapping = seatPoolMap(config), heaps = {}, hall = Hall.create(config);
      zones.forEach(function (zone) {
        var poolId = mapping[zone.id], heap = heaps[poolId];
        if (!heap) { heap = []; heaps[poolId] = heap; }
        for (var i = 0; i < zone.seats; i += 1) heapPush(heap, { id: seatOffset + i, zone: zone.id, available: 0 });
        seatOffset += zone.seats;
      });
      students.slice().sort(byPickup).forEach(function (student) {
        var heap = heaps[mapping[student.zone]];
        var seat = heapPop(heap);
        student.seatId = seat.id; student.seatZone = seat.zone; student.seatPool = mapping[student.zone];
        var journey = Hall.plan(hall, student, seat.id, seat.available, config.indoorWalkSpeed);
        student.seatQueueArrival = student.end + journey.approachMinutes;
        student.seatWalkStart = Math.max(student.seatQueueArrival, seat.available);
        student.seatStart = student.seatWalkStart + journey.walkMinutes;
        student.indoorWalk = journey.approachMinutes + journey.walkMinutes;
        student.seatWait = student.seatWalkStart - student.seatQueueArrival;
        student.approachRoute = journey.approachRoute; student.seatRoute = journey.seatRoute;
        student.waitingPosition = journey.waitingPosition; student.displaySeatId = journey.seat.id;
        student.mealDuration = config.mealMean * student.mealFactor;
        student.mealEnd = student.seatStart + student.mealDuration;
        // Food selection and the physical dining area are separate. A shared
        // pool is one connected seating space; its actual seat determines the
        // return-time extra. No guessed transfer walk is added between seats.
        student.zoneReturn = zones[seat.zone].returnExtra;
        student.returnTime = student.mealEnd + config.returnMinutes + student.zoneReturn;
        seat.available = student.mealEnd; heapPush(heap, seat);
      });
    }
    students.forEach(function (student) {
      student.endpointTime = config.diningEnabled ? student.returnTime : student.end;
      student.late = student.endpointTime > student.deadline;
      student.lateness = Math.max(0, student.endpointTime - student.deadline);
      student.readyToEndpoint = student.endpointTime - student.readyTime;
    });
  }

  function buildEvents(students, dining) {
    var events = [];
    function add(time, key, delta, grade) { events.push({ time: time, key: key, delta: delta, grade: grade }); }
    students.forEach(function (s) {
      add(s.arrival, 'arrived', 1, s.grade); add(s.arrival, 'waiting', 1, s.grade);
      add(s.start, 'waiting', -1, s.grade); add(s.start, 'inService', 1, s.grade);
      add(s.end, 'inService', -1, s.grade); add(s.end, 'completed', 1, s.grade);
      if (dining) {
        add(s.end, 'walkingToSeat', 1, s.grade); add(s.seatQueueArrival, 'walkingToSeat', -1, s.grade);
        add(s.seatQueueArrival, 'seatWaiting', 1, s.grade); add(s.seatWalkStart, 'seatWaiting', -1, s.grade);
        add(s.seatWalkStart, 'walkingToSeat', 1, s.grade); add(s.seatStart, 'walkingToSeat', -1, s.grade);
        add(s.seatWalkStart, 'seatsReserved', 1, s.grade); add(s.mealEnd, 'seatsReserved', -1, s.grade);
        add(s.seatStart, 'dining', 1, s.grade); add(s.mealEnd, 'dining', -1, s.grade);
        add(s.mealEnd, 'returning', 1, s.grade); add(s.returnTime, 'returning', -1, s.grade);
        add(s.returnTime, 'returned', 1, s.grade);
      }
    });
    return events.sort(function (a, b) { return a.time - b.time; });
  }
  function eventSummary(events, observationEnd, step, summaryOnly) {
    var state = { arrived: 0, completed: 0, waiting: 0, inService: 0, seatWaiting: 0, walkingToSeat: 0, seatsReserved: 0, dining: 0, returning: 0, returned: 0 };
    var integrals = { waiting: 0, inService: 0, seatWaiting: 0, walkingToSeat: 0, seatsReserved: 0, dining: 0, returning: 0 };
    var peaks = { seatWaiting: 0, walkingToSeat: 0, seatsReserved: 0, dining: 0, returning: 0, onSite: 0 };
    var last = 0, i = 0;
    while (i < events.length) {
      var time = events[i].time, dt = time - last;
      Object.keys(integrals).forEach(function (key) { integrals[key] += state[key] * dt; });
      while (i < events.length && events[i].time === time) { state[events[i].key] += events[i].delta; i += 1; }
      peaks.seatWaiting = Math.max(peaks.seatWaiting, state.seatWaiting);
      peaks.dining = Math.max(peaks.dining, state.dining);
      peaks.walkingToSeat = Math.max(peaks.walkingToSeat, state.walkingToSeat);
      peaks.seatsReserved = Math.max(peaks.seatsReserved, state.seatsReserved);
      peaks.returning = Math.max(peaks.returning, state.returning);
      peaks.onSite = Math.max(peaks.onSite, state.waiting + state.inService + state.seatWaiting + state.walkingToSeat + state.dining);
      last = time;
    }
    if (summaryOnly) return { integrals: integrals, peaks: peaks };
    var timeline = [], diningTimeline = [], j = 0;
    Object.keys(state).forEach(function (key) { state[key] = 0; });
    var times = Array.from({ length: Math.floor(observationEnd / step) + 1 }, function (_, t) { return t * step; });
    if (times[times.length - 1] !== observationEnd) times.push(observationEnd);
    times.forEach(function (time) {
      while (j < events.length && events[j].time <= time) { state[events[j].key] += events[j].delta; j += 1; }
      timeline.push({ time: time, arrived: state.arrived, completed: state.completed, waiting: state.waiting, inService: state.inService });
      diningTimeline.push({ time: time, seatWaiting: state.seatWaiting, walkingToSeat: state.walkingToSeat, dining: state.dining, seatsOccupied: state.seatsReserved, returning: state.returning, returned: state.returned, onSite: state.waiting + state.inService + state.seatWaiting + state.walkingToSeat + state.dining });
    });
    return { timeline: timeline, diningTimeline: diningTimeline, integrals: integrals, peaks: peaks };
  }
  function bins(students, field, end, step) {
    var out = Array.from({ length: Math.floor(end / step) + 1 }, function (_, index) { return { time: index * step, count: 0 }; });
    students.forEach(function (s) { out[Math.floor(s[field] / step)].count += 1; });
    return out;
  }
  function recordMetrics(records) {
    var n = records.length, lateCount = records.filter(function (s) { return s.late; }).length;
    return {
      count: n, meanWait: mean(records, function (s) { return s.wait; }),
      p95Wait: q(records, function (s) { return s.wait; }), maxWait: maximum(records, function (s) { return s.wait; }),
      within5min: n ? records.filter(function (s) { return s.wait <= 5; }).length / n : 0,
      meanIndoorWalk: mean(records, function (s) { return s.indoorWalk || 0; }),
      meanSeatWait: mean(records, function (s) { return s.seatWait; }), p95SeatWait: q(records, function (s) { return s.seatWait; }),
      meanReleaseDelay: mean(records, function (s) { return s.releaseDelay; }),
      meanReadyToEndpoint: mean(records, function (s) { return s.readyToEndpoint; }),
      p95ReadyToEndpoint: q(records, function (s) { return s.readyToEndpoint; }),
      onTimeCount: n - lateCount, onTimeRate: n ? (n - lateCount) / n : 0, lateCount: lateCount,
      meanLateness: mean(records, function (s) { return s.lateness; }), maxLateness: maximum(records, function (s) { return s.lateness; }),
      meanSystemTime: mean(records, function (s) { return s.end - s.arrival; }),
      lastPickup: maximum(records, function (s) { return s.end; }), lastReturn: maximum(records, function (s) { return s.returnTime || 0; }),
      lastEndpoint: maximum(records, function (s) { return s.endpointTime; })
    };
  }

  function simulateSchool(input) {
    var config = normalizeSchoolConfig(input), generated = createStudents(config), students = generated.students;
    var n = students.length, zones = effectiveZones(config), seatMapping = seatPoolMap(config), seatPools = effectiveSeatPools(config);
    var effectiveMeans = config.windowMeans ? config.windowMeans.slice() : Array.from({ length: config.windows }, function (_, i) { return config.serviceMean * Legacy.DEFAULT_WINDOW_MULTIPLIERS[i % Legacy.DEFAULT_WINDOW_MULTIPLIERS.length]; });
    var pickup = simulatePickup(config, students, effectiveMeans);
    simulateDining(config, students);
    var base = recordMetrics(students), observationEnd = Math.max(config.horizon, config.serviceEnd, base.lastEndpoint);
    var timeStep = Math.max(1, Math.ceil(observationEnd / 14400));
    var eventData = eventSummary(buildEvents(students, config.diningEnabled), observationEnd, timeStep);
    var totalService = sum(students, function (s) { return s.service; });
    var totalWait = sum(students, function (s) { return s.wait; });
    var serviceDuration = config.serviceEnd - config.serviceStart;
    var groups = effectiveMeans.map(function () { return []; }), grades = [[], [], []];
    students.forEach(function (s) { groups[s.window].push(s); grades[s.grade].push(s); });
    var windows = groups.map(function (records, id) {
      var busy = sum(records, function (s) { return s.service; });
      var scheduled = sum(records, function (s) { return Math.max(0, Math.min(s.end, config.serviceEnd) - Math.max(s.start, config.serviceStart)); });
      var last = maximum(records, function (s) { return s.end; });
      return {
        id: id, owner: config.windowOwners[id], zone: windowZone(config, id), meanService: effectiveMeans[id] / 60, meanServiceSeconds: effectiveMeans[id],
        served: records.length, completedAtHorizon: records.filter(function (s) { return s.end <= config.horizon; }).length,
        completedByServiceEnd: records.filter(function (s) { return s.end <= config.serviceEnd; }).length,
        busyMinutes: busy, busyMinutesScheduled: scheduled,
        utilization: busy / observationEnd, utilizationScheduled: scheduled / serviceDuration,
        meanWait: mean(records, function (s) { return s.wait; }), p95Wait: q(records, function (s) { return s.wait; }),
        maxWait: maximum(records, function (s) { return s.wait; }), totalWait: sum(records, function (s) { return s.wait; }),
        queueIntegral: sum(records, function (s) { return s.wait; }), physicalQueueIntegral: pickup.servers[id].physicalQueueIntegral,
        maxQueue: pickup.servers[id].maxQueue, meanServiceActual: records.length ? busy / records.length : 0,
        lastDeparture: last, overtimeMinutes: Math.max(0, last - config.serviceEnd),
        idleMinutes: Math.max(0, observationEnd - busy), loadShare: totalService ? busy / totalService : 0
      };
    });
    var gradeMetrics = grades.map(function (records, id) {
      var g = config.grades[id], values = recordMetrics(records);
      return Object.assign(values, {
        id: id, grade: id, name: g.name, classes: g.classes, readyTime: g.readyTime, releaseTime: g.releaseTime, deadline: g.deadline,
        classSizes: g.classSizes === null ? null : g.classSizes.slice(), latestReleaseTime: g.latestReleaseTime, releaseLocked: g.releaseLocked,
        firstArrival: records.length ? Math.min.apply(null, records.map(function (s) { return s.arrival; })) : null,
        lastArrival: records.length ? maximum(records, function (s) { return s.arrival; }) : null,
        lastRelease: records.length ? maximum(records, function (s) { return s.release; }) : null,
        meanArrival: mean(records, function (s) { return s.arrival; }),
        meanTargetArrival: mean(records, function (s) { return s.targetArrival; }),
        targetArrival: g.releaseTime + g.assemblyMax / 2 + (g.walkMin + g.walkMax) / 2 + 0.25 + (config.serviceZones ? sum(zones, function (zone) { return config.gradeZoneWeights[id][zone.id] * zone.walkExtra; }) : 0),
        queueIntegral: pickup.gradeQueueIntegrals[id],
        borrowedWindowCount: records.filter(function (s) { return config.windowOwners[s.window] !== id; }).length,
        staggerParticipants: records.length, staggerParticipationRate: records.length ? 1 : 0,
        shiftedStudents: records.filter(function (s) { return s.releaseDelay > 0; }).length
      });
    });
    var physicalSeatMetrics = zones.map(function (zone) {
      var records = students.filter(function (s) { return s.seatZone === zone.id; });
      var events = eventSummary(buildEvents(records, config.diningEnabled), observationEnd, timeStep, true);
      var foodOriginCounts = zones.map(function () { return 0; });
      records.forEach(function (s) { foodOriginCounts[s.zone] += 1; });
      return {
        id: zone.id, name: zone.name, seats: zone.seats, seatPool: seatMapping[zone.id],
        servedDiners: records.length, totalMealMinutes: sum(records, function (s) { return s.mealDuration; }),
        seatOccupancyIntegral: events.integrals.seatsReserved, peakSeatsOccupied: events.peaks.seatsReserved,
        seatUtilization: config.diningEnabled ? events.integrals.seatsReserved / (zone.seats * observationEnd) : 0,
        foodOriginCounts: foodOriginCounts, metricBasis: 'actual-physical-seat-zone'
      };
    });
    var zoneMetrics = zones.map(function (zone) {
      var records = students.filter(function (s) { return s.zone === zone.id; });
      var zoneWindows = windows.filter(function (w) { return w.zone === zone.id; });
      var values = recordMetrics(records);
      var events = eventSummary(buildEvents(records, config.diningEnabled), observationEnd, timeStep, true);
      var sharesSeating = seatPools.some(function (p) { return p.id === seatMapping[zone.id] && p.zoneIds.length > 1; });
      return Object.assign(values, {
        id: zone.id, zone: zone.id, name: zone.name, windowCount: zoneWindows.length,
        windowIds: zoneWindows.map(function (w) { return w.id; }), seats: zone.seats,
        walkExtra: zone.walkExtra, returnExtra: zone.returnExtra,
        peakQueue: pickup.zoneStats[zone.id].peakQueue, peakQueueTime: pickup.zoneStats[zone.id].peakQueueTime,
        queueIntegral: pickup.zoneStats[zone.id].queueIntegral, independentQueueIntegral: events.integrals.waiting,
        totalWait: sum(records, function (s) { return s.wait; }),
        totalService: sum(records, function (s) { return s.service; }),
        totalSeatWait: sum(records, function (s) { return s.seatWait; }), seatQueueIntegral: events.integrals.seatWaiting,
        totalMealMinutes: sum(records, function (s) { return s.mealDuration; }),
        foodOriginSeatOccupancyIntegral: events.integrals.seatsReserved, foodOriginPeakDining: events.peaks.seatsReserved,
        seatOccupancyIntegral: sharesSeating ? null : events.integrals.seatsReserved,
        peakSeatWaiting: events.peaks.seatWaiting, peakSeatsOccupied: sharesSeating ? null : events.peaks.seatsReserved, peakOnSite: events.peaks.onSite,
        seatUtilization: sharesSeating ? null : (config.diningEnabled ? events.integrals.seatsReserved / (zone.seats * observationEnd) : 0),
        metricBasis: 'food-origin-cohort', seatMetricsBasis: sharesSeating ? 'food-origin-physical-alias-unavailable' : 'food-origin-equals-physical-zone',
        configuredCapacityPerMinute: sum(zoneWindows, function (w) { return 60 / w.meanServiceSeconds; }),
        completedByServiceEnd: records.filter(function (s) { return s.end <= config.serviceEnd; }).length,
        overtimeMinutes: Math.max(0, values.lastPickup - config.serviceEnd),
        endpointLabel: config.diningEnabled ? destinationLabel(config) : '取餐完成'
      });
    });
    var completedAtHorizon = students.filter(function (s) { return s.end <= config.horizon; }).length;
    var completedByServiceEnd = students.filter(function (s) { return s.end <= config.serviceEnd; }).length;
    var scheduledBusy = sum(windows, function (w) { return w.busyMinutesScheduled; });
    var shifted = students.filter(function (s) { return s.releaseDelay > 0; }).length;
    var seatBufferAssessed = config.diningEnabled && config.seatWaitingCapacity !== null;
    var seatBufferOverflowPeak = seatBufferAssessed ? Math.max(0, eventData.peaks.seatWaiting - config.seatWaitingCapacity) : 0;
    var metrics = Object.assign(base, {
      peakQueue: pickup.peakQueue, peakQueueTime: pickup.peakQueueTime, peakInSystem: pickup.peakSystem,
      peakOnSite: eventData.peaks.onSite,
      within5Count: students.filter(function (s) { return s.wait <= 5; }).length,
      completionRate: n ? completedAtHorizon / n : 0, completedAtHorizon: completedAtHorizon, allCompleted: true,
      completedByServiceEnd: completedByServiceEnd, serviceEndCompletionRate: n ? completedByServiceEnd / n : 0,
      utilization: totalService / (config.windows * observationEnd), utilizationScheduled: scheduledBusy / (config.windows * serviceDuration),
      observationEnd: observationEnd, lastDeparture: base.lastPickup,
      clearanceTime: Math.max(0, base.lastPickup - config.horizon), overtimeMinutes: Math.max(0, base.lastPickup - config.serviceEnd),
      totalService: totalService, totalWait: totalWait, queueIntegral: pickup.queueIntegral,
      systemIntegral: pickup.systemIntegral, busyIntegral: pickup.busyIntegral,
      independentQueueIntegral: eventData.integrals.waiting,
      centralQueueIntegral: pickup.usePools ? pickup.queueIntegral : 0,
      meanQueueLength: pickup.queueIntegral / observationEnd, meanSystemSize: pickup.systemIntegral / observationEnd,
      throughput: n / observationEnd, scheduledThroughput: completedByServiceEnd / serviceDuration,
      configuredCapacityPerMinute: sum(effectiveMeans, function (seconds) { return 60 / seconds; }),
      windowLoadCV: cv(windows.map(function (w) { return w.busyMinutes; })), windowServedCV: cv(windows.map(function (w) { return w.served; })),
      staggerParticipants: n, staggerParticipationRate: n ? 1 : 0, shiftedStudents: shifted, shiftedStudentRate: n ? shifted / n : 0,
      totalSeatWait: sum(students, function (s) { return s.seatWait; }), seatQueueIntegral: eventData.integrals.seatWaiting,
      totalMealMinutes: sum(students, function (s) { return s.mealDuration; }), seatOccupancyIntegral: eventData.integrals.seatsReserved,
      peakSeatWaiting: eventData.peaks.seatWaiting, peakSeatsOccupied: eventData.peaks.seatsReserved,
      seatUtilization: config.diningEnabled ? eventData.integrals.seatsReserved / (config.seats * observationEnd) : 0,
      seatBufferAssessed: seatBufferAssessed, seatBufferExceeded: seatBufferOverflowPeak > 0, seatBufferOverflowPeak: seatBufferOverflowPeak,
      endpointLabel: config.diningEnabled ? destinationLabel(config) : '取餐完成',
      gradeMeanWaitRange: Math.max.apply(null, gradeMetrics.filter(function (g) { return g.count; }).map(function (g) { return g.meanWait; }).concat([0])) -
        (n ? Math.min.apply(null, gradeMetrics.filter(function (g) { return g.count; }).map(function (g) { return g.meanWait; })) : 0)
    });
    var validityWarnings = [];
    if (config.diningEnabled && eventData.peaks.seatWaiting > 0 && !seatBufferAssessed) validityWarnings.push({
      code: 'SEAT_BUFFER_UNASSESSED', severity: 'model-applicability', peak: eventData.peaks.seatWaiting,
      message: '等座区容量尚未设置；本次峰值为 ' + eventData.peaks.seatWaiting + ' 人，尚不能判断现场能否容纳。模型未计算等座对窗口的反向阻塞。'
    });
    if (seatBufferOverflowPeak > 0) validityWarnings.push({
      code: 'SEAT_BUFFER_CAPACITY_EXCEEDED', severity: 'model-applicability', peak: eventData.peaks.seatWaiting,
      capacity: config.seatWaitingCapacity, overflowPeak: seatBufferOverflowPeak,
      message: '模拟等座峰值 ' + eventData.peaks.seatWaiting + ' 人超过输入容量 ' + config.seatWaitingCapacity + ' 人，超出 ' + seatBufferOverflowPeak + ' 人；当前无反向阻塞模型的结果不满足该容量适用条件。'
    });
    var sharedSeating = seatPools.some(function (p) { return p.zoneIds.length > 1; });
    var result = {
      meta: {
        version: VERSION, mode: 'school', timeUnit: 'minutes', clockOrigin: '11:20', serviceConfigUnit: 'seconds', inputData: 'synthetic-example',
        mealCompatibility: config.serviceZones ? 'within-zone-compatible-counters; one-fixed-zone-per-student' : 'all-windows-supply-substitutable-set-meals',
        arrivalModel: 'class-release + class-shared-uniform-assembly + class-shared-uniform-walk + individual-uniform-0-to-0.5-minute-jitter' + (config.serviceZones ? ' + zone-walk-extra' : ''),
        serviceModel: 'lognormal', mealModel: 'lognormal', p95Method: 'nearest-rank',
        randomMethod: 'hash-indexed-grade-and-person-streams', gradeRandomIdStride: 8192,
        queueDiscipline: config.allocation === 'overflow' ? 'FCFS-within-grade; own-grade-first; oldest-head-overflow' : 'FCFS-within-selected-queue',
        effectiveStrategy: config.allocation === 'overflow' ? 'grade-priority-pooled' : config.strategy,
        tieBreak: 'arrival-then-student-id; ascending-window-id; own-grade-pass-before-overflow-pass',
        seatDiscipline: 'FCFS-by-pickup-completion-then-student-id; earliest-available-seat' + (sharedSeating ? '; shared-within-explicit-seat-pool' : (config.serviceZones ? '; independent-seats-within-zone' : '')),
        serviceEndMeaning: 'planned-stop-only; finish-all-students-and-measure-overtime',
        deadlineMeaning: config.diningEnabled ? 'return-to-' + config.returnDestination + '-complete' : 'pickup-complete',
        returnDestination: config.returnDestination,
        serviceZoneModel: config.serviceZones ? (sharedSeating ? 'fixed-food-zone; compatible-windows-in-food-zone; explicit-shared-seat-pools' : 'fixed-per-person-zone; independent-compatible-windows-and-seats') : 'disabled-single-shared-facility',
        classSizeModel: config.grades.some(function (g) { return g.classSizes !== null; }) ? 'explicit-per-class-where-provided; balanced-fallback' : 'balanced-within-grade',
        seatPoolModel: 'physical-zone-seats-merged-by-explicit-pool-id; no-cross-pool-borrowing',
        seatReturnTimingModel: 'actual-physical-seat-zone-return-extra', seatTransferTravelModel: 'connected-seating-space; no-added-transfer-travel',
        seatMetricBasis: 'physicalSeatMetrics-by-actual-seat-zone; food-cohort-metrics-separately-labelled',
        zoneChoiceStream: 24, zoneChoiceModel: 'independent-per-student-categorical-from-grade-weights',
        crossZoneRouting: false, crossZoneSeats: sharedSeating, multiStationMeal: false, stairCongestionModel: false,
        timelineStepMinutes: timeStep, binWidthMinutes: timeStep,
        seatBlockingFeedback: false, seatBufferCapacityModel: 'diagnostic-only; uncapped-waiting-events', physicalAisleCapacityModel: false, emptyRatioConvention: 0
      },
      config: config, effectiveWindowMeans: effectiveMeans, students: students, windows: windows,
      effectiveServiceZones: zones, effectiveWindowZones: windows.map(function (w) { return w.zone; }), zoneMetrics: zoneMetrics,
      effectiveSeatPoolByZone: seatMapping.slice(), effectiveSeatPools: seatPools, physicalSeatMetrics: physicalSeatMetrics,
      validityWarnings: validityWarnings,
      cohorts: gradeMetrics, gradeMetrics: gradeMetrics, classBatches: generated.batches, metrics: metrics,
      timeline: eventData.timeline, diningTimeline: eventData.diningTimeline,
      arrivalBins: bins(students, 'arrival', observationEnd, timeStep), completionBins: bins(students, 'end', observationEnd, timeStep),
      clampedArrivals: { lower: 0, upper: 0, total: 0 }
    };
    result.batchOverlaps = config.grades.map(function (grade) {
      var state = schoolSnapshot(result, grade.releaseTime);
      var earlier = state.gradeStates.filter(function (g) { return g.grade !== grade.id && config.grades[g.grade].releaseTime < grade.releaseTime; });
      function aggregate(key) { return sum(earlier, function (g) { return g[key]; }); }
      return {
        grade: grade.id, name: grade.name, time: grade.releaseTime,
        previousArrived: aggregate('arrived'), previousWaiting: aggregate('waiting'), previousInService: aggregate('inService'),
        previousSeatWaiting: aggregate('seatWaiting'), previousDining: aggregate('dining'), previousReturning: aggregate('returning'),
        previousStillOnSite: aggregate('waiting') + aggregate('inService') + aggregate('seatWaiting') + aggregate('walkingToSeat') + aggregate('dining'),
        previousReturned: aggregate('returned'), byGrade: earlier
      };
    });
    return result;
  }

  function schoolSnapshot(result, requestedTime) {
    if (requestedTime === undefined) requestedTime = 0;
    if (typeof requestedTime !== 'number' || !Number.isFinite(requestedTime)) throw new TypeError('回放时间必须为有限数值');
    var time = Math.max(0, Math.min(result.metrics.observationEnd, requestedTime)), c = result.config;
    var usePools = c.strategy === 'pooled' || c.allocation === 'overflow';
    var windows = result.windows.map(function (w) {
      return { id: w.id, owner: w.owner, zone: windowZone(c, w.id), meanService: w.meanService, waiting: 0, serving: 0, completed: 0, currentStudent: null, elapsed: 0, remaining: 0, progress: 0, queueIds: [], busyMinutes: 0, utilization: 0 };
    });
    var gradeStates = c.grades.map(function (g) {
      return { grade: g.id, name: g.name, arrived: 0, waiting: 0, inService: 0, pickedUp: 0, seatWaiting: 0, walkingToSeat: 0, dining: 0, returning: 0, returned: 0, notArrived: g.students };
    });
    var zones = effectiveZones(c), zoneQueueIds = zones.map(function () { return []; });
    var zoneGradeQueueIds = zones.map(function () { return [[], [], []]; });
    var zoneStates = zones.map(function (z) {
      var count = result.students.filter(function (s) { return (s.zone === undefined ? 0 : s.zone) === z.id; }).length;
      return { id: z.id, zone: z.id, name: z.name, count: count, windowCount: windows.filter(function (w) { return w.zone === z.id; }).length, seats: z.seats,
        arrived: 0, waiting: 0, inService: 0, pickedUp: 0, seatWaiting: 0, walkingToSeat: 0, dining: 0, seatsOccupied: 0,
        returning: 0, returned: 0, notArrived: count, centralQueue: 0, onSite: 0, endpointCompleted: 0 };
    });
    var mapping = result.effectiveSeatPoolByZone || seatPoolMap(c);
    var physicalSeatStates = zones.map(function (z) {
      return { id: z.id, name: z.name, seats: z.seats, seatPool: mapping[z.id], dining: 0, seatsOccupied: 0, diningIds: [], seatIds: [] };
    });
    var seatPoolStates = (result.effectiveSeatPools || effectiveSeatPools(c)).map(function (p) {
      return { id: p.id, zoneIds: p.zoneIds.slice(), seats: p.seats, seatWaiting: 0, dining: 0, seatsOccupied: 0, seatWaitingIds: [], diningIds: [] };
    }), seatPoolStatesById = {};
    seatPoolStates.forEach(function (p) { seatPoolStatesById[p.id] = p; });
    var centralQueueIds = [], gradeQueueIds = [[], [], []], seatWaitingIds = [], walkingToSeatIds = [], diningIds = [], returningIds = [], returnedIds = [];
    var arrived = 0, waiting = 0, inService = 0, completed = 0;
    result.students.forEach(function (s) {
      if (s.arrival > time) return;
      var grade = gradeStates[s.grade], zone = zoneStates[s.zone === undefined ? 0 : s.zone];
      arrived += 1; grade.arrived += 1; grade.notArrived -= 1; zone.arrived += 1; zone.notArrived -= 1;
      if (s.end <= time) {
        var served = windows[s.window]; completed += 1; grade.pickedUp += 1; zone.pickedUp += 1; served.completed += 1; served.busyMinutes += s.service;
        if (c.diningEnabled) {
          var seatingPool = seatPoolStatesById[mapping[zone.id]];
          if (time < s.seatQueueArrival || (time >= s.seatWalkStart && time < s.seatStart)) {
            grade.walkingToSeat += 1; zone.walkingToSeat += 1; walkingToSeatIds.push(s.id);
            if (time >= s.seatWalkStart) {
              var reserved = physicalSeatStates[s.seatZone]; reserved.seatsOccupied += 1; reserved.seatIds.push(s.seatId);
              seatingPool.seatsOccupied += 1;
            }
          }
          else if (s.seatStart > time) {
            grade.seatWaiting += 1; zone.seatWaiting += 1; seatWaitingIds.push(s.id);
            seatingPool.seatWaiting += 1; seatingPool.seatWaitingIds.push(s.id);
          }
          else if (s.mealEnd > time) {
            grade.dining += 1; zone.dining += 1; diningIds.push(s.id);
            var physical = physicalSeatStates[s.seatZone === null || s.seatZone === undefined ? zone.id : s.seatZone];
            physical.dining += 1; physical.seatsOccupied += 1; physical.diningIds.push(s.id); physical.seatIds.push(s.seatId);
            seatingPool.dining += 1; seatingPool.seatsOccupied += 1; seatingPool.diningIds.push(s.id);
          }
          else if (s.returnTime > time) { grade.returning += 1; zone.returning += 1; returningIds.push(s.id); }
          else { grade.returned += 1; zone.returned += 1; returnedIds.push(s.id); }
        }
      } else if (s.start <= time) {
        var window = windows[s.window]; inService += 1; grade.inService += 1; zone.inService += 1;
        window.serving = 1; window.currentStudent = s.id; window.elapsed = time - s.start; window.remaining = s.end - time;
        window.progress = s.service ? window.elapsed / s.service : 0; window.busyMinutes += window.elapsed;
      } else {
        waiting += 1; grade.waiting += 1; zone.waiting += 1; gradeQueueIds[s.grade].push(s.id);
        zoneQueueIds[zone.id].push(s.id); zoneGradeQueueIds[zone.id][s.grade].push(s.id);
        if (usePools) centralQueueIds.push(s.id);
        else { windows[s.window].waiting += 1; windows[s.window].queueIds.push(s.id); }
      }
    });
    function sortArrival(a, b) { return byArrival(result.students[a], result.students[b]); }
    centralQueueIds.sort(sortArrival); gradeQueueIds.forEach(function (ids) { ids.sort(sortArrival); });
    zoneQueueIds.forEach(function (ids) { ids.sort(sortArrival); });
    zoneGradeQueueIds.forEach(function (gradeIds) { gradeIds.forEach(function (ids) { ids.sort(sortArrival); }); });
    zoneStates.forEach(function (z) {
      var sharesSeating = seatPoolStatesById[mapping[z.id]].zoneIds.length > 1;
      z.foodOriginDining = z.dining; z.metricBasis = 'food-origin-cohort';
      z.seatsOccupied = sharesSeating ? null : physicalSeatStates[z.id].seatsOccupied;
      z.seatMetricsBasis = sharesSeating ? 'food-origin-physical-alias-unavailable' : 'food-origin-equals-physical-zone';
      z.centralQueue = usePools ? z.waiting : 0;
      z.onSite = z.waiting + z.inService + z.seatWaiting + z.walkingToSeat + z.dining;
      z.endpointCompleted = c.diningEnabled ? z.returned : z.pickedUp;
    });
    seatWaitingIds.sort(function (a, b) { return byPickup(result.students[a], result.students[b]); });
    seatPoolStates.forEach(function (p) { p.seatWaitingIds.sort(function (a, b) { return byPickup(result.students[a], result.students[b]); }); });
    windows.forEach(function (w) { w.queueIds.sort(sortArrival); w.utilization = time ? w.busyMinutes / time : 0; });
    return {
      time: time, arrived: arrived, waiting: waiting, inService: inService, completed: completed, pickedUp: completed,
      notArrived: result.students.length - arrived, centralQueue: centralQueueIds.length, centralQueueIds: centralQueueIds,
      gradeQueueIds: gradeQueueIds, windows: windows, gradeStates: gradeStates,
      zoneStates: zoneStates, zoneQueueIds: zoneQueueIds, zoneGradeQueueIds: zoneGradeQueueIds,
      physicalSeatStates: physicalSeatStates, seatPoolStates: seatPoolStates,
      seatWaiting: seatWaitingIds.length, seatWaitingIds: seatWaitingIds,
      walkingToSeat: walkingToSeatIds.length, walkingToSeatIds: walkingToSeatIds,
      dining: diningIds.length, diningIds: diningIds, seatsOccupied: physicalSeatStates.reduce(function(sum,z){return sum+z.seatsOccupied;},0),
      returning: returningIds.length, returningIds: returningIds, returned: returnedIds.length, returnedIds: returnedIds,
      onSite: waiting + inService + seatWaitingIds.length + walkingToSeatIds.length + diningIds.length,
      endpointCompleted: c.diningEnabled ? returnedIds.length : completed
    };
  }
  function isSchool(input) { return input && input.mode === 'school'; }
  function normalizeConfig(input) { return isSchool(input) ? normalizeSchoolConfig(input) : Legacy.normalizeConfig(input); }
  function simulate(input) { return isSchool(input) ? simulateSchool(input) : Legacy.simulate(input); }
  function snapshot(result, time) {
    if (!result || !result.config || !Array.isArray(result.students) || !Array.isArray(result.windows) || !result.metrics) throw new TypeError('snapshot 需要 simulate 返回的结果');
    return isSchool(result.config) ? schoolSnapshot(result, time) : Legacy.snapshot(result, time);
  }
  return Object.freeze(Object.assign({}, Legacy, {
    VERSION: VERSION, LEGACY_VERSION: Legacy.VERSION, DEFAULT_SCHOOL_CONFIG: DEFAULT_SCHOOL_CONFIG,
    normalizeConfig: normalizeConfig, validateConfig: normalizeConfig, normalizeSchoolConfig: normalizeSchoolConfig,
    simulate: simulate, simulateSchool: simulateSchool, snapshot: snapshot, snapshotState: snapshot,
    makeSchoolBaseline: makeSchoolBaseline, makeSchoolGapConfig: makeSchoolGapConfig
  }));
});
