/*
 * Deterministic presentation state. Event times, queue identities and counts
 * come exclusively from the simulation engine. In school mode release/travel,
 * seats, dining and return durations are numerical inputs. Scene coordinates
 * Counter-to-seat routes and durations share the hall-walk model.
 * Coordinates are illustrative scene units, not a measured school floorplan.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./school-engine.js'), require('./hall-walk.js'));
  else root.CanteenSceneState = factory(root.CanteenSim, root.DiningHallWalk);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Engine, Hall) {
  'use strict';
  var VERSION = '1.6.0', SLOT_COUNT = 16, WAITING_LIMIT = 320;
  var DEPARTURE_LIMIT = 64, DEPARTURE_DURATION = 1.5;
  var SEAT_DISPLAY_LIMIT = 72, SEAT_WAITING_LIMIT = 48;
  var FRONT_IDENTITY_COUNT = 4, COLUMN_ROWS = 20, COLUMN_SPACING = 0.64;

  function freezeTree(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.keys(value).forEach(function (key) { freezeTree(value[key]); });
      Object.freeze(value);
    }
    return value;
  }
  function facing(position, target) { return Math.atan2(target[0] - position[0], target[2] - position[2]); }
  function distance(a, b) { return Math.hypot(a[0] - b[0], a[2] - b[2]); }
  function compactPath(points) {
    return points.filter(function (p, i) { return !i || distance(p, points[i - 1]) > 1e-8; }).map(function (p) { return p.slice(); });
  }
  // Arc-length interpolation makes speed independent of the number of bends.
  function samplePath(points, progress) {
    var path = compactPath(points), lengths = [], length = 0;
    if (!path.length) throw new RangeError('行走路线不能为空');
    for (var i = 1; i < path.length; i++) { var d = distance(path[i - 1], path[i]); lengths.push(d); length += d; }
    var travelled = Math.max(0, Math.min(1, progress)) * length, remaining = travelled;
    for (var j = 0; j < lengths.length; j++) {
      if (remaining <= lengths[j] || j === lengths.length - 1) {
        var t = lengths[j] ? Math.min(1, remaining / lengths[j]) : 0, a = path[j], b = path[j + 1];
        return { position: [a[0] + (b[0] - a[0]) * t, 0, a[2] + (b[2] - a[2]) * t], yaw: facing(a, b), distance: travelled, length: length };
      }
      remaining -= lengths[j];
    }
    return { position: path[0].slice(), yaw: Math.PI, distance: travelled, length: length };
  }
  function allocateCounts(counts, budget) {
    var total = counts.reduce(function (sum, n) { return sum + n; }, 0);
    if (total <= budget) return counts.slice();
    // Reserve each nonempty queue's true head. Allocate the remaining budget
    // proportionally by largest remainder, with stable queue-index tie breaks.
    var chosen = counts.map(function (n) { return n ? 1 : 0; });
    var reserved = chosen.reduce(function (sum, n) { return sum + n; }, 0);
    var remaining = budget - reserved, weight = total - reserved, fractions = [];
    counts.forEach(function (n, i) {
      var exact = n ? (n - 1) * remaining / weight : 0, whole = Math.floor(exact);
      chosen[i] += whole; fractions.push({ i: i, fraction: exact - whole });
    });
    var left = budget - chosen.reduce(function (sum, n) { return sum + n; }, 0);
    fractions.sort(function (a, b) { return b.fraction - a.fraction || a.i - b.i; });
    for (var k = 0; k < left; k++) chosen[fractions[k].i]++;
    return chosen;
  }
  function selectedIndices(length, capacity) {
    if (!capacity || !length) return [];
    if (length <= capacity) return Array.from({ length: length }, function (_, i) { return i; });
    if (capacity === 1) return [0];
    var head = Math.min(FRONT_IDENTITY_COUNT, Math.max(1, capacity - 2));
    var chosen = Array.from({ length: head }, function (_, i) { return i; }), remaining = capacity - head;
    for (var j = 0; j < remaining; j++) chosen.push(head + Math.floor(j * (length - 1 - head) / Math.max(1, remaining - 1)));
    if (remaining === 1) chosen[chosen.length - 1] = length - 1;
    return chosen;
  }
  function buildQueues(layout, capacities) {
    if (layout.twoSided) return capacities.map(function(capacity,i) {
      var spec=layout.queueSpecs[i],w=layout.windows[spec.window],side=Math.sign(w.x);
      var columns=Math.max(1,Math.ceil(capacity/COLUMN_ROWS));
      var spacing=Math.min(.44,2.05/Math.max(1,columns-1));
      var slots=Array.from({length:Math.max(1,capacity)},function(_,index) {
        var col=Math.floor(index/COLUMN_ROWS),row=index%COLUMN_ROWS;
        if(col%2)row=COLUMN_ROWS-1-row;
        return [side*(18.7-row*.38),0,w.z+(col-(columns-1)/2)*spacing];
      });
      return {id:spec.id,window:spec.window,zone:0,zoneName:spec.zoneName,cohort:null,
        capacity:capacity,columns:columns,rows:COLUMN_ROWS,slots:slots,path:slots.map(function(p){return p.slice();}),
        bounds:{minX:Math.min.apply(null,slots.map(function(p){return p[0];}))-.2,maxX:Math.max.apply(null,slots.map(function(p){return p[0];}))+.2,minZ:w.z-1.2,maxZ:w.z+1.2},
        accessX:side*11.1,labelPosition:[side*12,0,w.z]};
    });
    var columns = capacities.map(function (n) { return Math.max(1, Math.ceil(n / COLUMN_ROWS)); });
    var span = columns.reduce(function (sum, n) { return sum + (n - 1) * COLUMN_SPACING; }, 0) + Math.max(0, columns.length - 1) * 1.42;
    var cursor = -span / 2;
    return capacities.map(function (capacity, i) {
      var spec = layout.queueSpecs[i];
      var cols = columns[i], firstX = cursor;
      var slots = Array.from({ length: Math.max(1, capacity) }, function (_, index) {
        var col = Math.floor(index / COLUMN_ROWS), row = index % COLUMN_ROWS;
        if (col % 2) row = COLUMN_ROWS - 1 - row;
        return [firstX + col * COLUMN_SPACING, 0, layout.queueZ + row * layout.queueSpacing];
      });
      cursor += (cols - 1) * COLUMN_SPACING + 1.42;
      var lastX = firstX + (cols - 1) * COLUMN_SPACING;
      return {
        id: spec.id, window: spec.window, zone: spec.zone, zoneName: spec.zoneName,
        cohort: spec.cohort,
        capacity: capacity, columns: cols, rows: COLUMN_ROWS, slots: slots,
        path: slots.map(function (p) { return p.slice(); }),
        bounds: { minX: firstX - 0.28, maxX: lastX + 0.28, minZ: layout.queueZ - 0.28, maxZ: layout.queueZ + 19 * layout.queueSpacing + 0.28 },
        accessX: lastX + 0.55,
        labelPosition: [(firstX + lastX) / 2, 0, 8.65]
      };
    });
  }
  function createLayout(windowCount, pooled, config) {
    if (!Number.isInteger(windowCount) || windowCount < 1 || windowCount > SLOT_COUNT) throw new RangeError('3D 布局窗口数必须是 1 到 16 的整数');
    if (pooled === undefined) pooled = false;
    if (typeof pooled !== 'boolean') throw new TypeError('pooled 必须是布尔值');
    config = config || {};
    var schoolMode = config.mode === 'school', gradePools = schoolMode && pooled && config.allocation !== 'shared';
    var zoned = schoolMode && Array.isArray(config.serviceZones) && config.serviceZones.length > 0;
    var zones = (zoned ? config.serviceZones : [{id:0,name:'统一服务区',seats:config.seats || SEAT_DISPLAY_LIMIT}]).map(function(z){ return {id:z.id,name:z.name,seats:z.seats}; });
    var seatPoolByZone = config.seatPoolByZone ? config.seatPoolByZone.slice() : zones.map(function(z){return z.id;});
    var seatPools = [];
    zones.forEach(function(z){
      var id=seatPoolByZone[z.id],p=seatPools.find(function(x){return x.id===id;});
      if(!p){p={id:id,zoneIds:[],seats:0};seatPools.push(p);}
      p.zoneIds.push(z.id);p.seats+=z.seats;z.seatPool=id;
    });
    seatPools.sort(function(a,b){return a.id-b.id;});
    function zoneOfWindow(id) { return zoned ? config.windowZones[id] : 0; }
    function queueId(zone, grade, window) {
      if (!pooled) return 'window-' + window;
      if (zoned) return 'zone-' + zone + (gradePools ? '-grade-' + grade : '');
      return gradePools ? 'grade-' + grade : 'central';
    }
    var width = 45.6, firstOpen = Math.floor((SLOT_COUNT - windowCount) / 2);
    var slots = Array.from({ length: SLOT_COUNT }, function (_, slotIndex) {
      var id = slotIndex - firstOpen, open = id >= 0 && id < windowCount, x = (slotIndex - 7.5) * 2.6;
      return { slotIndex: slotIndex, windowId: open ? id : null, zone: open ? zoneOfWindow(id) : null, open: open, x: x, z: -5, position: [x, 0, -5] };
    });
    var windows = slots.filter(function (s) { return s.open; }).map(function (s) {
      return { id: s.windowId, slotIndex: s.slotIndex, zone: s.zone, zoneName: zones[s.zone].name, x: s.x, z: -5, position: s.position.slice(), servicePosition: [s.x, 0, -3.65], queueHead: [s.x, 0, -2.3], queueId: queueId(s.zone, gradePools ? config.windowOwners[s.windowId] : null, s.windowId) };
    });
    var layout = {
      version: VERSION, windowCount: windowCount, slotCount: SLOT_COUNT, pooled: pooled, schoolMode: schoolMode, gradePools: gradePools, zoned: zoned, zonePools: zoned && pooled, zones: zones,
      seatPoolByZone:seatPoolByZone,seatPools:seatPools,sharedSeating:seatPools.some(function(p){return p.zoneIds.length>1;}),
      windowSpacing: 2.6, windowZ: -5, serviceZ: -3.65, queueZ: -2.3, queueSpacing: 0.52,
      bounds: { minX: -width / 2, maxX: width / 2, minZ: -7.7, maxZ: 18, width: width, depth: 25.7 },
      floorCenter: [0, 0, 5.15], entry: [-21.8, 0, 17], exit: [21.8, 0, 17],
      circulation: { frontZ: -3.02, rearZ: 9.1, leftX: -21.8, rightX: 21.8 },
      slots: slots, windows: windows,
      tables: Array.from({ length: 18 }, function (_, i) { return { position: [((zoned ? Math.floor(i/2) : i%9) - 4) * 4.1, 0, (zoned ? i%2 : (i<9?0:1)) ? 15.45 : 11.55], clearanceRadius: 1.42 }; }),
      limits: { waiting: WAITING_LIMIT, dedicated: WAITING_LIMIT, pooled: WAITING_LIMIT, departures: DEPARTURE_LIMIT, seats: SEAT_DISPLAY_LIMIT, seatWaiting: SEAT_WAITING_LIMIT },
      departureDuration: DEPARTURE_DURATION
    };
    var tableQuotas = allocateCounts(zones.map(function(z){return z.seats*100;}), layout.tables.length), tableOffset = 0;
    zones.forEach(function(zone, zi) {
      zone.windowIds = windows.filter(function(w){return w.zone===zi;}).map(function(w){return w.id;});
      zone.tableIds = [];
      for(var k=0;k<tableQuotas[zi];k++) { var tableId=tableOffset++; layout.tables[tableId].zone=zi; zone.tableIds.push(tableId); }
    });
    layout.displaySeats = [];
    layout.tables.forEach(function (table, ti) {
      for (var chair = 0; chair < 4; chair++) {
        var side = chair < 2 ? -1 : 1, xOffset = chair%2 ? .54 : -.54;
        var position = [table.position[0] + xOffset, 0.17, table.position[2] + side * 1.02];
        layout.displaySeats.push({ id: ti * 4 + chair, table: ti, zone: table.zone, position: position, yaw: side < 0 ? 0 : Math.PI });
      }
    });
    layout.queueSpecs = [];
    if(pooled) zones.forEach(function(zone) {
      (gradePools ? [0,1,2] : [null]).forEach(function(grade){layout.queueSpecs.push({id:queueId(zone.id,grade),zone:zone.id,zoneName:zone.name,cohort:grade,window:null});});
    });
    else windows.forEach(function(w){layout.queueSpecs.push({id:queueId(w.zone,null,w.id),zone:w.zone,zoneName:w.zoneName,cohort:null,window:w.id});});
    var qCount = layout.queueSpecs.length;
    layout.queues = buildQueues(layout, Array.from({ length: qCount }, function (_, i) { return Math.floor(WAITING_LIMIT / qCount) + (i < WAITING_LIMIT % qCount ? 1 : 0); }));
    if(schoolMode&&!zoned&&!pooled&&config.strategy==='fastest'&&config.allocation==='shared') {
      layout.twoSided=true;
      var physical=Hall.create(config);
      layout.exactSeats=true;layout.tables=physical.tables;layout.displaySeats=Array.from(physical.seatMap.values());
      layout.zones[0].tableIds=layout.tables.map(function(t){return t.id;});
      layout.bounds.maxZ=physical.maxZ;layout.bounds.depth=physical.maxZ-layout.bounds.minZ;
      layout.floorCenter=[0,0,physical.centerZ];
      var leftCount=Math.ceil(windowCount/2),rightCount=Math.floor(windowCount/2);
      layout.slots=Array.from({length:16},function(_,slot) {
        var left=slot<8,local=slot%8,count=left?leftCount:rightCount,first=Math.floor((8-count)/2);
        var open=local>=first&&local<first+count,id=open?(left?0:leftCount)+local-first:null,side=left?-1:1;
        return {slotIndex:slot,windowId:id,zone:open?0:null,open:open,x:side*21.2,z:physical.slotZ[local],rotation:left?Math.PI/2:-Math.PI/2,position:[side*21.2,0,physical.slotZ[local]]};
      });
      layout.windows=layout.slots.filter(function(s){return s.open;}).map(function(s) {
        var side=Math.sign(s.x);
        return {id:s.windowId,slotIndex:s.slotIndex,zone:0,zoneName:zones[0].name,x:s.x,z:s.z,position:s.position.slice(),servicePosition:[side*19.85,0,s.z],queueHead:[side*18.7,0,s.z],queueId:'window-'+s.windowId};
      });
      layout.entries=[[0,0,physical.minZ+.3],[0,0,physical.maxZ-.3]];layout.entry=layout.entries[0];layout.exit=layout.entries[1];
      layout.queues=buildQueues(layout,Array.from({length:windowCount},function(_,i){return Math.floor(WAITING_LIMIT/windowCount)+(i<WAITING_LIMIT%windowCount?1:0);}));
    }
    return freezeTree(layout);
  }
  function createLayoutForResult(result) {
    var c = result.config;
    return createLayout(c.windows, c.strategy === 'pooled' || (c.mode === 'school' && c.allocation === 'overflow'), c);
  }
  function arrivalRoute(layout, person) {
    var lane = layout.circulation, target = person.position;
    if(layout.twoSided) {
      var entrance=layout.entries[person.id%2],side=Math.sign(layout.windows[person.window].x),aisle=side*11.1;
      return compactPath([entrance,[aisle,0,entrance[2]],[aisle,0,target[2]],target]);
    }
    if (person.state === 'serving') return compactPath([layout.entry, [lane.leftX, 0, lane.frontZ], [target[0], 0, lane.frontZ], target]);
    // Approach a waiting person's slot through the group's clear right-hand
    // access aisle. Do not walk up through the people occupying the last column.
    return compactPath([layout.entry, [lane.leftX, 0, lane.rearZ], [person.accessX, 0, lane.rearZ], [person.accessX, 0, target[2]], target]);
  }
  function departureRoute(layout, windowId) {
    var start = layout.windows[windowId].servicePosition, lane = layout.circulation;
    if(layout.twoSided) {
      var exit=layout.entries[start[2]<layout.floorCenter[2]?0:1],aisle=Math.sign(start[0])*11.1;
      return compactPath([start,[aisle,0,start[2]],[aisle,0,exit[2]],exit]);
    }
    return compactPath([start, [start[0], 0, lane.frontZ], [lane.rightX, 0, lane.frontZ], layout.exit]);
  }
  function basePerson(student, state, position) {
    return {
      id: student.id, cohort: student.cohort, zone: student.zone === undefined ? 0 : student.zone, zoneName: student.zoneName || '统一服务区', state: state, window: student.window,
      gradeName: student.gradeName || null, classId: student.classId,
      queueId: null, queueIndex: null, slotIndex: null,
      arrival: student.arrival, start: student.start, end: student.end,
      position: position.slice(), yaw: Math.PI, visible: true,
      visualTransition: false, visualProgress: 0, serviceProgress: 0
    };
  }
  function returnRoute(layout, seat) {
    var table = layout.tables[seat.table].position, start = seat.position.slice(), lane = layout.circulation;
    start[1] = 0;
    var side = start[0] >= table[0] ? 1 : -1, accessX = table[0] + side * 1.7;
    if(layout.twoSided) {
      var exit=layout.entries[start[2]<layout.floorCenter[2]?0:1];
      var rowZ=table[2]+(start[2]<table[2]?-1.58:1.58);
      return compactPath([start,[start[0],0,rowZ],[accessX,0,rowZ],[accessX,0,exit[2]],exit]);
    }
    return compactPath([start, [accessX, 0, start[2]], [accessX, 0, 13.5], [lane.rightX, 0, 13.5], layout.exit]);
  }
  function schoolDiningFrame(result, time, layout, options) {
    var c = result.config, enabled = c.mode === 'school' && c.diningEnabled;
    var answer = { people: [], visiblePeople: [], departures: [], walkingToSeat: 0, seatWaiting: 0, dining: 0, returning: 0, returned: 0, seatedDrawn: 0, seatWaitingDrawn: 0, representedSeats: 0, description: '' };
    if (!enabled) return answer;
    var seatScale = options.seatsPerFigure === undefined ? Math.max(1, c.seats / SEAT_DISPLAY_LIMIT) : options.seatsPerFigure;
    if (!Number.isFinite(seatScale) || seatScale < 1) throw new RangeError('座位代表比例必须是大于等于1的有限数值');
    var selectedSeats = [], seatMap = new Map(), seatOffset = 0, zoneDisplaySeats = [];
    layout.zones.forEach(function(zone, zi) {
      var physicalSeats=layout.displaySeats.filter(function(seat){return seat.zone===zi;});
      zoneDisplaySeats.push(physicalSeats);
      var seatBudget=Math.min(physicalSeats.length,zone.seats,Math.max(1,Math.round(zone.seats/seatScale)));
      selectedIndices(zone.seats,seatBudget).forEach(function(localSeat,displaySeat){var logicalSeat=seatOffset+localSeat;selectedSeats.push(logicalSeat);seatMap.set(logicalSeat,physicalSeats[layout.exactSeats?localSeat:displaySeat]);});
      seatOffset+=zone.seats;
    });
    answer.representedSeats = selectedSeats.length;
    var seatWaiters = [], returning = [];
    result.students.forEach(function (s) {
      if (s.end > time) return;
      var approaching = time < s.seatQueueArrival;
      var walking = time >= s.seatWalkStart && time < s.seatStart;
      if (approaching || walking) {
        answer.walkingToSeat++;
        var path = approaching ? s.approachRoute : s.seatRoute;
        var begin = approaching ? s.end : s.seatWalkStart;
        var finish = approaching ? s.seatQueueArrival : s.seatStart - Math.min(1/60,(s.seatStart-s.seatWalkStart)/3);
        var progress = Math.max(0,Math.min(1,(time-begin)/Math.max(1e-9,finish-begin)));
        var motion = samplePath(path,progress), seat = seatMap.get(s.seatId);
        var person = basePerson(s,approaching?'walking-to-wait':(time>=finish?'sitting':'walking-to-seat'),motion.position);
        person.route=path;person.routeDistance=motion.distance;person.yaw=motion.yaw;
        person.visualTransition=true;person.visualProgress=progress;person.seatId=s.seatId;
        person.seatZone=s.seatZone;person.displaySeatId=s.displaySeatId;
        person.sitProgress=walking&&time>=finish?Math.min(1,(time-finish)/Math.max(1e-9,s.seatStart-finish)):0;
        if(person.sitProgress&&seat){person.yaw=seat.yaw;person.position[1]=seat.position[1]*person.sitProgress;}
        person.visible=!!seat;
        answer.people.push(person);if(person.visible)answer.visiblePeople.push(person);
      }
      else if (time < s.seatStart) seatWaiters.push(s);
      else if (time < s.mealEnd) {
        answer.dining++;
        var seat = seatMap.get(s.seatId), zoneId=s.seatZone===undefined||s.seatZone===null?(s.zone||0):s.seatZone, person = basePerson(s, 'dining', seat ? seat.position : layout.tables[layout.zones[zoneId].tableIds[0]].position);
        person.seatId = s.seatId; person.seatZone=zoneId; person.seatPool=layout.seatPoolByZone[zoneId]; person.visible = !!seat; person.mealProgress = (time - s.seatStart) / Math.max(1e-9, s.mealEnd - s.seatStart);
        if (seat) { person.yaw = seat.yaw; person.displaySeatId = seat.id; answer.visiblePeople.push(person); answer.seatedDrawn++; }
        answer.people.push(person);
      } else if (time < s.returnTime) { answer.returning++; returning.push(s); }
      else answer.returned++;
    });
    seatWaiters.sort(function (a,b) { return a.end - b.end || a.id - b.id; });
    answer.seatWaiting = seatWaiters.length;
    var waitersByZone=layout.seatPools.map(function(pool){return seatWaiters.filter(function(s){return layout.seatPoolByZone[s.zone||0]===pool.id;});});
    var waiterQuotas=allocateCounts(waitersByZone.map(function(group){return group.length;}),Math.min(SEAT_WAITING_LIMIT,seatWaiters.length));
    var drawIndex = 0, waiterColumn=0, drawnWaitingPositions=new Set();
    waitersByZone.forEach(function(group,zone) {
      var selectedWaiters=new Set(selectedIndices(group.length,waiterQuotas[zone])),localDraw=0;
      group.forEach(function(s,index) {
        var visible=selectedWaiters.has(index),slot=visible?localDraw++:Math.min(Math.max(0,waiterQuotas[zone]-1),index);
        var position=[-21.3+(waiterColumn+Math.floor(slot/12))*.46,0,10.4+(slot%12)*.51];
        if(layout.twoSided)position=s.waitingPosition?s.waitingPosition.slice():[slot%2?-9.4:9.4,0,-5.5+Math.floor(slot/2)*.9];
        if(layout.twoSided&&c.indoorWalkSpeed>0&&visible){
          var key=position[0]+','+position[2];
          if(drawnWaitingPositions.has(key)){visible=false;localDraw--;}
          else drawnWaitingPositions.add(key);
        }
        var p=basePerson(s,'seat-waiting',position);p.visible=visible;p.queueIndex=index;p.yaw=0;p.seatZone=null;p.seatId=null;p.seatPool=layout.seatPools[zone].id;p.queueId='seat-pool-'+p.seatPool;
        answer.people.push(p);if(visible)answer.visiblePeople.push(p);
      });
      waiterColumn+=Math.ceil(waiterQuotas[zone]/12);drawIndex+=localDraw;
    });
    answer.seatWaitingDrawn = drawIndex;
    returning.sort(function (a,b) { return b.mealEnd - a.mealEnd || a.id - b.id; });
    returning.forEach(function (s) {
      var actualSeatZone=s.seatZone===undefined||s.seatZone===null?(s.zone||0):s.seatZone;
      var zoneSeats=zoneDisplaySeats[actualSeatZone],seat = layout.displaySeats[s.displaySeatId] || seatMap.get(s.seatId) || zoneSeats[s.seatId % zoneSeats.length];
      var route = returnRoute(layout, seat), length = samplePath(route, 1).length;
      // Indoor departure uses the same metres/second and per-student pace as
      // counter-to-seat travel. Remaining return time happens outside the hall.
      var pace = c.indoorWalkSpeed * (.94 + (s.id % 13) * .01);
      var duration = pace > 0 ? length / pace / 60 : s.returnTime - s.mealEnd;
      var progress = (time - s.mealEnd) / Math.max(1e-9, duration);
      if (progress >= 1 || answer.departures.length >= DEPARTURE_LIMIT) return;
      var motion = samplePath(route, progress), p = basePerson(s, 'returning', motion.position);
      p.yaw = motion.yaw; p.route = route; p.routeDistance = motion.distance; p.visualTransition = true; p.visualProgress = progress;p.seatId=s.seatId;p.seatZone=actualSeatZone;p.seatPool=layout.seatPoolByZone[actualSeatZone];
      answer.departures.push(p);
    });
    answer.description = (layout.sharedSeating?'取餐资格按餐品区限制，同一座位组可共用席位；共享仅适用于同一连通就座空间。':(layout.zoned?'各区独立抽取座位，不跨区借座。':''))+'座位按固定编号抽取 ' + selectedSeats.length + '/' + c.seats + ' 个示意席位，正在用餐 ' + answer.dining + ' 人、绘制 ' + answer.seatedDrawn + ' 人；等座 ' + answer.seatWaiting + ' 人、绘制 ' + answer.seatWaitingDrawn + ' 人。人数统计完整，场景面积与座位图形不用于测算真实密度。';
    return answer;
  }
  function frame(result, requestedTime, layout, providedSnapshot, options) {
    if (!Engine || typeof Engine.snapshot !== 'function') throw new Error('scene-state.js 需要先加载 engine.js');
    if (!result || !result.config || !result.metrics || !Array.isArray(result.students) || !Array.isArray(result.windows)) throw new TypeError('frame 需要 simulate 返回的结果');
    if (requestedTime === undefined) requestedTime = 0;
    if (typeof requestedTime !== 'number' || !Number.isFinite(requestedTime)) throw new TypeError('3D 回放时间必须是有限数值');
    var time = Math.max(0, Math.min(result.metrics.observationEnd, requestedTime)), visualTime = Math.max(0, requestedTime);
    var pooled = result.config.strategy === 'pooled' || (result.config.mode === 'school' && result.config.allocation === 'overflow');
    if (!layout || (result.config.mode === 'school' && !layout.schoolMode)) layout = createLayoutForResult(result);
    if (layout.windowCount !== result.config.windows || layout.pooled !== pooled) throw new RangeError('3D 布局必须与当前窗口数和队列策略一致');
    var snap = providedSnapshot || Engine.snapshot(result, time);
    if (!snap || snap.time !== time || !Array.isArray(snap.windows) || snap.windows.length !== result.config.windows || !Array.isArray(snap.centralQueueIds)) throw new RangeError('提供的快照必须对应当前回放时间和窗口数');
    var queueIds = layout.queueSpecs.map(function(spec) {
      if(!pooled)return snap.windows[spec.window].queueIds;
      if(layout.zonePools)return layout.gradePools?snap.zoneGradeQueueIds[spec.zone][spec.cohort]:snap.zoneQueueIds[spec.zone];
      if(layout.gradePools)return snap.gradeQueueIds[spec.cohort];
      return snap.centralQueueIds;
    });
    options = options || {};
    var requestedScale = options.peoplePerFigure === undefined ? 1 : options.peoplePerFigure;
    if (typeof requestedScale !== 'number' || !Number.isFinite(requestedScale) || requestedScale < 1) throw new RangeError('代表人数比例必须是大于等于 1 的有限数值');
    var nonempty = queueIds.filter(function (ids) { return ids.length > 0; }).length;
    var budget = Math.min(WAITING_LIMIT, Math.max(nonempty, Math.round(snap.waiting / requestedScale)));
    var quotas = allocateCounts(queueIds.map(function (ids) { return ids.length; }), budget);
    var queueLayouts = buildQueues(layout, quotas), peopleById = new Array(result.students.length), visiblePeople = [], queueGroups = [];
    queueLayouts.forEach(function (q, qi) {
      var ids = queueIds[qi], chosen = selectedIndices(ids.length, q.capacity), selectedAt = new Map();
      chosen.forEach(function (index, slot) { selectedAt.set(index, slot); });
      ids.forEach(function (id, index) {
        var selected = selectedAt.has(index), slot = selected ? selectedAt.get(index) : null;
        var fallback = ids.length < 2 ? 0 : Math.round(index * Math.max(0, q.capacity - 1) / (ids.length - 1));
        var position = q.slots[selected ? slot : fallback], person = basePerson(result.students[id], 'waiting', position);
        person.window = q.window; person.queueId = q.id; person.queueIndex = index; person.slotIndex = slot; person.visible = selected;
        person.queuePath = q.path; person.accessX = q.accessX; person.queueHead = q.slots[0];
        if(layout.twoSided)person.yaw=facing(position,layout.windows[q.window].servicePosition);
        if (selected && slot > 0) person.yaw = facing(position, q.slots[slot - 1]);
        person.arrivalPath = arrivalRoute(layout, person);
        peopleById[id] = person; if (selected) visiblePeople.push(person);
      });
      queueGroups.push(Object.assign({}, q, { queueIds: ids.slice(), count: ids.length, visibleIds: chosen.map(function (i) { return ids[i]; }), visibleCount: chosen.length, omittedCount: ids.length - chosen.length, sampled: ids.length > chosen.length }));
    });
    var windows = snap.windows.map(function (window, i) {
      var w = layout.windows[i];
      if (window.currentStudent !== null) {
        var person = basePerson(result.students[window.currentStudent], 'serving', w.servicePosition);
        if(layout.twoSided)person.yaw=facing(w.servicePosition,w.position);
        person.serviceProgress = window.progress; person.arrivalPath = arrivalRoute(layout, person);
        peopleById[person.id] = person; visiblePeople.push(person);
      }
      return Object.assign({}, window, { zone:w.zone,zoneName:w.zoneName,queueIds: window.queueIds.slice(), position: w.position.slice(), servicePosition: w.servicePosition.slice(), queueId: w.queueId, slotIndex: w.slotIndex });
    });
    var people = peopleById.filter(Boolean); visiblePeople.sort(function (a, b) { return a.id - b.id; });
    var recent = result.students.filter(function (student) { return student.end <= time && visualTime >= student.end && visualTime < student.end + DEPARTURE_DURATION; });
    recent.sort(function (a, b) { return b.end - a.end || a.id - b.id; });
    var departures = recent.slice(0, DEPARTURE_LIMIT).map(function (student) {
      var progress = Math.max(0, Math.min(1, (visualTime - student.end) / DEPARTURE_DURATION));
      var path = departureRoute(layout, student.window), motion = samplePath(path, progress), person = basePerson(student, 'departing', motion.position);
      person.yaw = motion.yaw; person.visualTransition = true; person.visualProgress = progress; person.serviceProgress = 1; person.route = path; person.routeDistance = motion.distance;
      return person;
    });
    var diningFrame = schoolDiningFrame(result, time, layout, options);
    if (result.config.mode === 'school' && result.config.diningEnabled) departures = diningFrame.departures;
    var visibleWaiting = quotas.reduce(function (sum, n) { return sum + n; }, 0), omittedWaiting = snap.waiting - visibleWaiting;
    var description = omittedWaiting ? '全场等候 ' + snap.waiting + ' 人，绘制 ' + visibleWaiting + ' 名真实学生代表；各队按人数比例抽样并保留队首，约 ' + (snap.waiting / visibleWaiting).toFixed(1) + ' 人对应 1 个图形。' : '等候学生按 1∶1 绘制，共 ' + snap.waiting + ' 人。';
    if (options.peoplePerFigure !== undefined) description += ' 对比共用约 ' + requestedScale.toFixed(1) + ' 人/图形，图形数取整并保留各非空队首。';
    if (diningFrame.description) description += ' ' + diningFrame.description;
    return {
      version: VERSION, time: time, visualTime: visualTime, pooled: pooled, layout: layout, snapshot: snap,
      counts: { total: result.students.length, arrived: snap.arrived, waiting: snap.waiting, inService: snap.inService, completed: snap.completed, notArrived: snap.notArrived, active: snap.waiting + snap.inService, centralQueue: snap.centralQueue, walkingToSeat: diningFrame.walkingToSeat, seatWaiting: diningFrame.seatWaiting, dining: diningFrame.dining, returning: diningFrame.returning, returned: diningFrame.returned },
      windows: windows, people: people, visiblePeople: visiblePeople, queueGroups: queueGroups, departures: departures,
      diningPeople: diningFrame.people, visibleDiningPeople: diningFrame.visiblePeople, gradeStates: snap.gradeStates || [], zoneStates:snap.zoneStates || [],physicalSeatStates:snap.physicalSeatStates||[],seatPoolStates:snap.seatPoolStates||[],
      sampling: { activeTotal: people.length, activeVisible: visiblePeople.length, waitingTotal: snap.waiting, visibleWaiting: visibleWaiting, omittedWaiting: omittedWaiting, sampled: omittedWaiting > 0, ratio: snap.waiting ? visibleWaiting / snap.waiting : 1, peoplePerFigure: visibleWaiting ? snap.waiting / visibleWaiting : 1, description: description, budget: WAITING_LIMIT, requestedPeoplePerFigure: requestedScale, recentDepartures: recent.length, visibleDepartures: departures.length, omittedDepartures: recent.length - departures.length, method: 'global-320-proportional-largest-remainder-head-4-rank-sample' }
    };
  }
  return Object.freeze({ VERSION: VERSION, createLayout: createLayout, createLayoutForResult: createLayoutForResult, frame: frame, samplePath: samplePath, arrivalRoute: arrivalRoute, departureRoute: departureRoute, returnRoute: returnRoute });
});
