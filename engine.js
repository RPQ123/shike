/*
 * Campus cafeteria discrete-event simulation, v1.2.0.
 * Dependency-free UMD: browser window.CanteenSim / CommonJS require().
 * Configured service means are SECONDS; all event, record and metric times
 * are MINUTES. All student, cohort and window identifiers are zero-based.
 *
 * The arrival distribution is a CLIPPED normal, not a truncated normal.
 * Hash-indexed per-student random streams support paired comparisons.
 * Dedicated queues and the shared pooled queue use FCFS, without switching.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CanteenSim = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = '1.2.0';
  var MULTIPLIERS = Object.freeze([0.85, 1, 1.15, 0.95, 1.1, 0.8, 1.2, 0.95]);
  var DEFAULT_CONFIG = Object.freeze({
    students: 960,
    windows: 8,
    serviceMean: 30,
    serviceCV: 0.35,
    arrivalPeak: 40,
    arrivalSpread: 7,
    stagger: 0,
    staggerParticipation: 1,
    horizon: 120,
    strategy: 'shortest',
    seed: 20261017,
    windowMeans: null
  });
  var strategyNames = Object.freeze({
    shortest: '最短队伍',
    workload: '预计工作量',
    fastest: '预计取餐完成最早',
    random: '随机分配',
    pooled: '共享单队列'
  });
  var KEYS = Object.keys(DEFAULT_CONFIG);

  function boundedNumber(value, key, min, max, integer) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(key + ' 必须是有限数值');
    }
    if (integer && !Number.isInteger(value)) {
      throw new RangeError(key + ' 必须是整数');
    }
    if (value < min || value > max) {
      throw new RangeError(key + ' 必须在 ' + min + ' 到 ' + max + ' 之间');
    }
    return value;
  }

  function normalizeConfig(input) {
    if (input === undefined) input = {};
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new TypeError('仿真参数必须是一个对象');
    }
    Object.keys(input).forEach(function (key) {
      if (KEYS.indexOf(key) === -1) throw new TypeError('未知仿真参数：' + key);
    });
    var c = {};
    KEYS.forEach(function (key) {
      c[key] = Object.prototype.hasOwnProperty.call(input, key) ? input[key] : DEFAULT_CONFIG[key];
    });
    boundedNumber(c.students, 'students', 0, 5000, true);
    boundedNumber(c.windows, 'windows', 1, 16, true);
    boundedNumber(c.serviceMean, 'serviceMean', 5, 120, false);
    boundedNumber(c.serviceCV, 'serviceCV', 0, 1, false);
    boundedNumber(c.horizon, 'horizon', 1, 360, false);
    boundedNumber(c.arrivalPeak, 'arrivalPeak', 0, c.horizon, false);
    boundedNumber(c.arrivalSpread, 'arrivalSpread', 1, 30, false);
    boundedNumber(c.stagger, 'stagger', 0, 30, false);
    boundedNumber(c.staggerParticipation, 'staggerParticipation', 0, 1, false);
    boundedNumber(c.seed, 'seed', 0, 4294967295, true);
    if (typeof c.strategy !== 'string' || !Object.prototype.hasOwnProperty.call(strategyNames, c.strategy)) {
      throw new RangeError('strategy 必须是 shortest、workload、fastest、random 或 pooled');
    }
    if (c.windowMeans !== null) {
      if (!Array.isArray(c.windowMeans) || c.windowMeans.length !== c.windows) {
        throw new RangeError('windowMeans 必须为 null，或包含与 windows 数量相同的服务均值');
      }
      c.windowMeans = Array.from(c.windowMeans, function (value, i) {
        return boundedNumber(value, 'windowMeans[' + i + ']', 1, 600, false);
      });
    }
    return c;
  }

  function mix32(x) {
    x = (x ^ (x >>> 16)) >>> 0;
    x = Math.imul(x, 0x7feb352d) >>> 0;
    x = (x ^ (x >>> 15)) >>> 0;
    x = Math.imul(x, 0x846ca68b) >>> 0;
    return (x ^ (x >>> 16)) >>> 0;
  }

  function uniform(seed, student, stream) {
    var key = (seed ^ Math.imul(student + 1, 0x9e3779b1) ^ Math.imul(stream + 1, 0x85ebca6b)) >>> 0;
    return (mix32(key) + 0.5) / 4294967296;
  }

  function normal(seed, student, stream) {
    return Math.sqrt(-2 * Math.log(uniform(seed, student, stream))) *
      Math.cos(2 * Math.PI * uniform(seed, student, stream + 1));
  }

  function nearestRank(sorted, p) {
    if (!sorted.length) return 0;
    return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
  }

  function quantile(values, p) {
    if (p === undefined) p = 0.95;
    boundedNumber(p, 'p', 0, 1, false);
    if (!Array.isArray(values)) throw new TypeError('values 必须是数值数组');
    var sorted = values.map(function (value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError('values 包含非有限数值');
      return value;
    }).sort(function (a, b) { return a - b; });
    return nearestRank(sorted, p);
  }

  function coefficientOfVariation(values) {
    if (!values.length) return 0;
    var mean = values.reduce(function (a, b) { return a + b; }, 0) / values.length;
    if (mean === 0) return 0;
    var variance = values.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / values.length;
    return Math.sqrt(variance) / mean;
  }

  function makeBins(records, field, lastTime) {
    var bins = Array.from({ length: Math.floor(lastTime) + 1 }, function (_, time) {
      return { time: time, count: 0 };
    });
    records.forEach(function (student) { bins[Math.floor(student[field])].count += 1; });
    return bins;
  }

  function makeTimeline(records, end) {
    var events = [];
    records.forEach(function (s) {
      events.push({ time: s.arrival, arrived: 1, completed: 0, waiting: 1, inService: 0 });
      events.push({ time: s.start, arrived: 0, completed: 0, waiting: -1, inService: 1 });
      events.push({ time: s.end, arrived: 0, completed: 1, waiting: 0, inService: -1 });
    });
    events.sort(function (a, b) { return a.time - b.time; });
    var times = Array.from({ length: Math.floor(end) + 1 }, function (_, t) { return t; });
    if (times[times.length - 1] !== end) times.push(end);
    var j = 0, arrived = 0, completed = 0, waiting = 0, inService = 0;
    return times.map(function (time) {
      while (j < events.length && events[j].time <= time) {
        arrived += events[j].arrived;
        completed += events[j].completed;
        waiting += events[j].waiting;
        inService += events[j].inService;
        j += 1;
      }
      return { time: time, arrived: arrived, completed: completed, waiting: waiting, inService: inService };
    });
  }

  function simulate(input) {
    var config = normalizeConfig(input);
    var n = config.students, count = config.windows, horizon = config.horizon;
    var effectiveWindowMeans = config.windowMeans ? config.windowMeans.slice() :
      Array.from({ length: count }, function (_, i) { return config.serviceMean * MULTIPLIERS[i % MULTIPLIERS.length]; });
    var means = effectiveWindowMeans.map(function (seconds) { return seconds / 60; });
    var sigma = Math.sqrt(Math.log(1 + config.serviceCV * config.serviceCV));
    var factors = new Float64Array(n), route = new Float64Array(n);
    var clampedArrivals = { lower: 0, upper: 0, total: 0 };
    var staggerParticipants = 0, shiftedStudents = 0;
    var students = Array.from({ length: n }, function (_, id) {
      var cohort = id % 3;
      // Stream 5 is separate from the original arrival (0,1), service (2,3)
      // and routing (4) streams. A threshold on the same per-student draw
      // gives nested participation sets across rates and paired scenarios.
      var participant = uniform(config.seed, id, 5) < config.staggerParticipation;
      var plannedOffset = (cohort - 1) * config.stagger;
      var appliedOffset = participant ? plannedOffset : 0;
      var target = config.arrivalPeak + appliedOffset;
      if (participant) staggerParticipants += 1;
      if (appliedOffset !== 0) shiftedStudents += 1;
      var raw = target + config.arrivalSpread * normal(config.seed, id, 0);
      var clipped = null;
      if (raw < 0) { clipped = 'lower'; clampedArrivals.lower += 1; }
      else if (raw > horizon) { clipped = 'upper'; clampedArrivals.upper += 1; }
      factors[id] = config.serviceCV === 0 ? 1 : Math.exp(sigma * normal(config.seed, id, 2) - sigma * sigma / 2);
      route[id] = uniform(config.seed, id, 4);
      return {
        id: id, cohort: cohort, arrival: Math.max(0, Math.min(horizon, raw)),
        staggerParticipant: participant, plannedArrivalOffset: plannedOffset,
        appliedArrivalOffset: appliedOffset, targetArrival: target,
        rawArrival: raw, arrivalClipped: clipped, start: null, end: null,
        wait: null, service: null, window: null
      };
    });
    clampedArrivals.total = clampedArrivals.lower + clampedArrivals.upper;
    var arrivals = students.slice().sort(function (a, b) { return a.arrival - b.arrival || a.id - b.id; });
    var servers = means.map(function (mean, id) {
      return { id: id, mean: mean, current: null, queue: [], head: 0, maxQueue: 0, physicalQueueIntegral: 0 };
    });
    var common = [], commonHead = 0;
    var nextArrival = 0, waiting = 0, inService = 0, time = 0;
    var queueIntegral = 0, systemIntegral = 0, busyIntegral = 0;
    var peakQueue = 0, peakQueueTime = 0, peakSystem = 0;

    function observePeaks() {
      if (waiting > peakQueue) { peakQueue = waiting; peakQueueTime = time; }
      if (waiting + inService > peakSystem) peakSystem = waiting + inService;
    }

    function startService(server, student) {
      student.window = server.id;
      student.start = time;
      student.wait = Math.max(0, time - student.arrival);
      student.service = server.mean * factors[student.id];
      student.end = time + student.service;
      server.current = student;
      inService += 1;
    }

    function firstIdle() {
      for (var i = 0; i < count; i += 1) if (servers[i].current === null) return servers[i];
      return null;
    }

    function chooseDedicated(student) {
      if (config.strategy === 'random') return servers[Math.floor(route[student.id] * count)];
      var best = null, bestScore = Infinity;
      for (var i = 0; i < count; i += 1) {
        var server = servers[i], queued = server.queue.length - server.head;
        var score;
        if (config.strategy === 'shortest') score = queued + (server.current === null ? 0 : 1);
        else {
          // This decision deliberately uses an EXPECTED residual. Neither the
          // actual departure nor this student's latent service factor is read.
          var expectedResidual = server.current === null ? 0 : Math.max(server.mean - (time - server.current.start), 0);
          score = expectedResidual + (queued + (config.strategy === 'fastest' ? 1 : 0)) * server.mean;
        }
        // Prefer an idle server on a zero-workload tie, then the lower ID.
        // This keeps workload routing work-conserving when a service overruns.
        if (score < bestScore || (score === bestScore && best.current !== null && server.current === null)) {
          best = server;
          bestScore = score;
        }
      }
      return best;
    }

    while (true) {
      var next = nextArrival < n ? arrivals[nextArrival].arrival : Infinity;
      for (var s = 0; s < count; s += 1) {
        if (servers[s].current !== null && servers[s].current.end < next) next = servers[s].current.end;
      }
      if (next === Infinity) break;
      var dt = next - time;
      queueIntegral += waiting * dt;
      systemIntegral += (waiting + inService) * dt;
      busyIntegral += inService * dt;
      if (config.strategy !== 'pooled') {
        for (s = 0; s < count; s += 1) {
          servers[s].physicalQueueIntegral += (servers[s].queue.length - servers[s].head) * dt;
        }
      }
      time = next;

      // Complete every service at this instant BEFORE dispatching queued jobs
      // and BEFORE handling simultaneous arrivals. Shared-queue idle ties are
      // resolved by ascending window ID.
      for (s = 0; s < count; s += 1) {
        if (servers[s].current !== null && servers[s].current.end <= time) {
          servers[s].current = null;
          inService -= 1;
        }
      }
      if (config.strategy === 'pooled') {
        for (s = 0; s < count && commonHead < common.length; s += 1) {
          if (servers[s].current === null) {
            waiting -= 1;
            startService(servers[s], common[commonHead++]);
          }
        }
      } else {
        for (s = 0; s < count; s += 1) {
          if (servers[s].current === null && servers[s].head < servers[s].queue.length) {
            waiting -= 1;
            startService(servers[s], servers[s].queue[servers[s].head++]);
          }
        }
      }

      while (nextArrival < n && arrivals[nextArrival].arrival <= time) {
        var student = arrivals[nextArrival++];
        var targetServer = config.strategy === 'pooled' ? firstIdle() : chooseDedicated(student);
        if (config.strategy === 'pooled' && targetServer === null) {
          common.push(student);
          waiting += 1;
        } else if (targetServer.current === null) {
          startService(targetServer, student);
        } else {
          student.window = targetServer.id;
          targetServer.queue.push(student);
          waiting += 1;
          targetServer.maxQueue = Math.max(targetServer.maxQueue, targetServer.queue.length - targetServer.head);
        }
        observePeaks();
      }
    }

    var lastDeparture = n ? time : 0;
    var observationEnd = Math.max(horizon, lastDeparture);
    var totalWait = 0, totalService = 0, totalSystem = 0, scheduledBusy = 0;
    var completedAtHorizon = 0, within5Count = 0, allWaits = [];
    var groups = means.map(function () { return []; });
    var cohortGroups = [[], [], []];
    students.forEach(function (student) {
      totalWait += student.wait;
      totalService += student.service;
      totalSystem += student.end - student.arrival;
      scheduledBusy += Math.max(0, Math.min(student.end, horizon) - student.start);
      if (student.end <= horizon) completedAtHorizon += 1;
      if (student.wait <= 5) within5Count += 1;
      allWaits.push(student.wait);
      groups[student.window].push(student);
      cohortGroups[student.cohort].push(student);
    });
    allWaits.sort(function (a, b) { return a - b; });
    var windows = groups.map(function (records, id) {
      var waits = records.map(function (record) { return record.wait; }).sort(function (a, b) { return a - b; });
      var busy = 0, duringHorizon = 0, waitTotal = 0, servedAtHorizon = 0, last = 0;
      records.forEach(function (record) {
        busy += record.service;
        duringHorizon += Math.max(0, Math.min(record.end, horizon) - record.start);
        waitTotal += record.wait;
        if (record.end <= horizon) servedAtHorizon += 1;
        last = Math.max(last, record.end);
      });
      return {
        id: id, meanService: means[id], meanServiceSeconds: effectiveWindowMeans[id],
        served: records.length, completedAtHorizon: servedAtHorizon,
        busyMinutes: busy, busyMinutesScheduled: duringHorizon,
        utilization: busy / observationEnd, utilizationScheduled: duringHorizon / horizon,
        meanWait: records.length ? waitTotal / records.length : 0,
        p95Wait: nearestRank(waits, 0.95), maxWait: waits.length ? waits[waits.length - 1] : 0,
        totalWait: waitTotal, queueIntegral: waitTotal,
        physicalQueueIntegral: servers[id].physicalQueueIntegral,
        maxQueue: servers[id].maxQueue,
        meanServiceActual: records.length ? busy / records.length : 0,
        lastDeparture: last, idleMinutes: Math.max(0, observationEnd - busy),
        loadShare: totalService ? busy / totalService : 0
      };
    });
    var cohorts = cohortGroups.map(function (records, id) {
      var waits = records.map(function (record) { return record.wait; }).sort(function (a, b) { return a - b; });
      var waitSum = records.reduce(function (sum, record) { return sum + record.wait; }, 0);
      var participants = records.filter(function (record) { return record.staggerParticipant; }).length;
      return {
        id: id, count: records.length,
        // Kept for old consumers: this is the scheduled center for a
        // participating member, not the mixed group's average target.
        targetArrival: config.arrivalPeak + (id - 1) * config.stagger,
        meanTargetArrival: records.length ? records.reduce(function (sum, record) { return sum + record.targetArrival; }, 0) / records.length : 0,
        staggerParticipants: participants,
        staggerParticipationRate: records.length ? participants / records.length : 0,
        shiftedStudents: records.filter(function (record) { return record.appliedArrivalOffset !== 0; }).length,
        meanArrival: records.length ? records.reduce(function (sum, record) { return sum + record.arrival; }, 0) / records.length : 0,
        meanWait: records.length ? waitSum / records.length : 0,
        p95Wait: nearestRank(waits, 0.95), maxWait: waits.length ? waits[waits.length - 1] : 0,
        within5min: records.length ? records.filter(function (record) { return record.wait <= 5; }).length / records.length : 0,
        meanSystemTime: records.length ? records.reduce(function (sum, record) { return sum + record.end - record.arrival; }, 0) / records.length : 0
      };
    });
    var metrics = {
      meanWait: n ? totalWait / n : 0,
      p95Wait: nearestRank(allWaits, 0.95),
      maxWait: allWaits.length ? allWaits[allWaits.length - 1] : 0,
      peakQueue: peakQueue, peakQueueTime: peakQueueTime, peakInSystem: peakSystem,
      within5min: n ? within5Count / n : 0, within5Count: within5Count,
      completionRate: n ? completedAtHorizon / n : 0,
      completedAtHorizon: completedAtHorizon, allCompleted: true,
      utilization: totalService / (count * observationEnd),
      utilizationScheduled: scheduledBusy / (count * horizon),
      observationEnd: observationEnd, lastDeparture: lastDeparture,
      clearanceTime: Math.max(0, lastDeparture - horizon),
      totalService: totalService, totalWait: totalWait,
      queueIntegral: queueIntegral, systemIntegral: systemIntegral,
      busyIntegral: busyIntegral,
      centralQueueIntegral: config.strategy === 'pooled' ? queueIntegral : 0,
      meanQueueLength: queueIntegral / observationEnd,
      meanSystemSize: systemIntegral / observationEnd,
      meanSystemTime: n ? totalSystem / n : 0,
      throughput: n / observationEnd,
      scheduledThroughput: completedAtHorizon / horizon,
      windowLoadCV: coefficientOfVariation(windows.map(function (window) { return window.busyMinutes; })),
      windowServedCV: coefficientOfVariation(windows.map(function (window) { return window.served; })),
      staggerParticipants: staggerParticipants,
      staggerParticipationRate: n ? staggerParticipants / n : 0,
      shiftedStudents: shiftedStudents,
      shiftedStudentRate: n ? shiftedStudents / n : 0
    };
    return {
      meta: {
        version: VERSION, timeUnit: 'minutes', serviceConfigUnit: 'seconds',
        arrivalModel: 'clipped-normal', serviceModel: 'lognormal',
        queueDiscipline: 'FCFS', p95Method: 'nearest-rank',
        randomMethod: 'hash-indexed-per-student-streams',
        participationModel: 'independent-per-student-bernoulli',
        participationStream: 5,
        staggerOffsetUnit: 'minutes; target-center shift before arrival clipping',
        cohortTargetArrivalMeaning: 'scheduled center for a participating member',
        tieBreak: 'idle-first-then-lowest-window-id',
        emptyRatioConvention: 0
      },
      config: config, effectiveWindowMeans: effectiveWindowMeans,
      students: students, windows: windows, cohorts: cohorts, metrics: metrics,
      timeline: makeTimeline(students, observationEnd),
      arrivalBins: makeBins(students, 'arrival', horizon),
      completionBins: makeBins(students, 'end', observationEnd),
      clampedArrivals: clampedArrivals
    };
  }

  function snapshot(result, requestedTime) {
    if (!result || !Array.isArray(result.students) || !Array.isArray(result.windows) || !result.metrics || !result.config) {
      throw new TypeError('snapshot 需要 simulate 返回的结果');
    }
    if (requestedTime === undefined) requestedTime = 0;
    if (typeof requestedTime !== 'number' || !Number.isFinite(requestedTime)) throw new TypeError('回放时间必须是有限数值');
    var time = Math.max(0, Math.min(result.metrics.observationEnd, requestedTime));
    var pooled = result.config.strategy === 'pooled';
    var windows = result.windows.map(function (window) {
      return {
        id: window.id, meanService: window.meanService, waiting: 0, serving: 0,
        completed: 0, currentStudent: null, elapsed: 0, remaining: 0,
        progress: 0, queueIds: [], busyMinutes: 0, utilization: 0
      };
    });
    var arrived = 0, completed = 0, waiting = 0, inService = 0, centralQueueIds = [];
    result.students.forEach(function (student) {
      if (student.arrival > time) return;
      arrived += 1;
      var window = windows[student.window];
      if (student.end <= time) {
        completed += 1;
        window.completed += 1;
        window.busyMinutes += student.service;
      } else if (student.start <= time) {
        inService += 1;
        window.serving = 1;
        window.currentStudent = student.id;
        window.elapsed = time - student.start;
        window.remaining = student.end - time;
        window.progress = student.service ? Math.max(0, Math.min(1, window.elapsed / student.service)) : 0;
        window.busyMinutes += window.elapsed;
      } else {
        waiting += 1;
        if (pooled) centralQueueIds.push(student.id);
        else { window.waiting += 1; window.queueIds.push(student.id); }
      }
    });
    function byArrival(a, b) { return result.students[a].arrival - result.students[b].arrival || a - b; }
    centralQueueIds.sort(byArrival);
    windows.forEach(function (window) {
      window.queueIds.sort(byArrival);
      window.utilization = time ? window.busyMinutes / time : 0;
    });
    return {
      time: time, arrived: arrived, completed: completed, waiting: waiting, inService: inService,
      notArrived: result.students.length - arrived,
      centralQueue: centralQueueIds.length, centralQueueIds: centralQueueIds,
      windows: windows
    };
  }

  return Object.freeze({
    VERSION: VERSION, DEFAULT_CONFIG: DEFAULT_CONFIG,
    DEFAULT_WINDOW_MULTIPLIERS: MULTIPLIERS, strategyNames: strategyNames,
    normalizeConfig: normalizeConfig, validateConfig: normalizeConfig,
    simulate: simulate, snapshot: snapshot, quantile: quantile
  });
});
