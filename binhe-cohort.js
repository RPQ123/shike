/* 2026–2027 demand follows annual admission plans. Capacities and timings
 * are adjustable experiment settings, not measured school facilities. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports)
    module.exports = factory(require('./research.js'), require('./common-windows.js'));
  else root.DiningBinheCohort = factory(root.DiningResearch, root.DiningCommonWindows);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (R, Common) {
  'use strict';
  const cohorts = Object.freeze([
    Object.freeze({admissionYear:2026,students:580,url:'https://edu.xa.gov.cn/web_files/edu/file/2026/07/16/202607161006095103689.pdf'}),
    Object.freeze({admissionYear:2025,students:530,url:'https://edu.xa.gov.cn/web_files/edu/file/2025/07/18/202507181020453109104.pdf'}),
    Object.freeze({admissionYear:2024,students:500,url:'https://edu.xa.gov.cn/web_files/edu/file/2024/07/18/202407181807215286171.pdf'})
  ]);
  function create() {
    const c=Common.normalize(R.example());
    c.students=cohorts.reduce((sum,g)=>sum+g.students,0);
    c.windows=16;c.windowMeans=Array(16).fill(20);c.windowOwners=Array(16).fill(0);
    c.seats=480;c.horizon=120;c.serviceEnd=100;c.seed=20261019;c.indoorWalkSpeed=1.1;
    c.sourceProfile={id:'binhe-admission-2026-27',title:'滨河 · 招生计划人数',asOf:'2026-10-19',status:'research-assumptions',observedSchoolData:false};
    c.grades.forEach((g,i)=>{
      g.students=cohorts[i].students;g.classes=Math.ceil(g.students/50);
      g.classSizes=null;
      g.latestReleaseTime=65;g.deadline=100;
    });
    return Common.normalize(c);
  }
  return Object.freeze({cohorts,create});
});
