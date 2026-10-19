/* The three scheduling rules share the existing student-event engine. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./school-engine.js'),require('./research.js'));
  else root.DiningScheduleStudy=factory(root.CanteenSim,root.DiningResearch);
})(typeof globalThis!=='undefined'?globalThis:this,function(E,R){
  'use strict';
  const labels=Object.freeze({none:'不实行错峰',grade:'仅按年级错峰',combined:'年级与班级结合错峰'});
  const defaults=Object.freeze({order:[2,1,0],gradeGapMinutes:10,slotSeconds:60,gaps:[0,15,30,45,60,75,90,105,120]});
  function makeConfig(input,kind,options={}){
    if(!labels[kind])throw new RangeError('未知的就餐安排');
    const c=E.normalizeSchoolConfig(R.clone(input));
    const active=c.grades.filter(g=>g.students>0),ids=active.map(g=>g.id);
    if(!active.length)throw new RangeError('请设置就餐学生');
    if(active.some(g=>g.releaseLocked))throw new RangeError('请先取消首班时刻锁定，再比较三种安排');
    const order=(options.order||defaults.order.filter(id=>ids.includes(id))).slice();
    if(order.length!==ids.length||new Set(order).size!==ids.length||order.some(id=>!ids.includes(id)))throw new RangeError('年级顺序须包含所有就餐年级且不重复');
    const gradeGap=options.gradeGapMinutes??defaults.gradeGapMinutes,seconds=options.slotSeconds??defaults.slotSeconds;
    if(!Number.isFinite(gradeGap)||gradeGap<0||gradeGap>60)throw new RangeError('年级间隔须为0至60分钟');
    if(!Number.isFinite(seconds)||seconds<0||seconds>600)throw new RangeError('相邻组间隔须为0至600秒');
    const start=Math.max(...active.map(g=>g.readyTime)),slot=seconds/60;
    order.forEach((id,index)=>{
      const g=c.grades.find(g=>g.id===id);
      g.releaseTime=start+(kind==='grade'?index*gradeGap:kind==='combined'?index*slot:0);
      g.classInterval=kind==='combined'?order.length*slot:0;
    });
    c.sourceProfile={id:'schedule-'+kind,title:labels[kind],asOf:c.sourceProfile?.asOf||'2026-10-19',status:'research-assumptions',observedSchoolData:false};
    return E.normalizeSchoolConfig(c);
  }
  function three(input,options={}){return Object.keys(labels).map(id=>({id,label:labels[id],config:makeConfig(input,id,options)}));}
  function metrics(result){
    return {...R.metrics(result),lastEndpoint:result.students.length?Math.max(...result.students.map(s=>s.endpointTime)):0,
      lateCount:result.students.filter(s=>s.late).length};
  }
  function summarize(rounds){
    return {...R.summarize(rounds),lastEndpointMin:Math.min(...rounds.map(r=>r.lastEndpoint)),lastEndpointMax:Math.max(...rounds.map(r=>r.lastEndpoint))};
  }
  function select(rows,returnTarget){
    if(!Number.isFinite(returnTarget))throw new RangeError('请设置返回目标时刻');
    return rows.filter(r=>r.summary.lastEndpointMax<=returnTarget+1e-9).slice().sort((a,b)=>a.summary.meanWait-b.summary.meanWait||a.summary.meanTotal-b.summary.meanTotal||a.seconds-b.seconds)[0]||null;
  }
  function evaluate(config,seeds){
    const rounds=seeds.map(seed=>({seed,...metrics(E.simulateSchool({...config,seed}))}));
    return {config:R.clone(config),seeds:seeds.slice(),rounds,summary:summarize(rounds)};
  }
  return Object.freeze({labels,defaults,makeConfig,three,metrics,summarize,select,evaluate});
});
