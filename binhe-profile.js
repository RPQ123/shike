/* Public-source context for an illustrative Binhe high-school scenario.
 * Admission plans are official facts. Participation, classes, schedules,
 * capacities, meal choices and all duration distributions are assumptions.
 * This file contains no measured current-school operation or student records.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BinheProfile = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function freezeTree(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.keys(value).forEach(function (key) { freezeTree(value[key]); });
      Object.freeze(value);
    }
    return value;
  }
  var metadata = {
    id: 'binhe-plan-2026', title: '2026秋季三届招生计划规模推演',
    asOf: '2026-10-18', status: 'research-assumptions', observedSchoolData: false
  };
  var evidence = [
    {id:'O01',title:'2026年普通高中分学校招生计划',url:'https://edu.xa.gov.cn/web_files/edu/file/2026/07/16/202607161006095103689.pdf',year:2026,date:'2026-07-16',publisher:'西安市教育局',level:'official-plan',note:'滨河高级中学当年高中招生计划580人，见附件第2页。',limitation:'招生计划不是实际录取、当前在校或每天就餐人数；生物创新实验班50人已含在总计划中。'},
    {id:'O02',title:'2025年普通高中分学校招生计划',url:'https://edu.xa.gov.cn/web_files/edu/file/2025/07/18/202507181020453109104.pdf',year:2025,date:'2025-07-18',publisher:'西安市教育局',level:'official-plan',note:'滨河高级中学当年高中招生计划530人，见附件第1页。',limitation:'不能直接认定为2026年高二实际在校或午餐人数。'},
    {id:'O03',title:'2024年普通高中分学校招生计划',url:'https://edu.xa.gov.cn/web_files/edu/file/2024/07/18/202407181807215286171.pdf',year:2024,date:'2024-07-18',publisher:'西安市教育局',level:'official-plan',note:'滨河高级中学当年高中招生计划500人，见附件第1页。',limitation:'不能直接认定为2026年高三实际在校或午餐人数。'},
    {id:'D01',title:'2020级高一家长访谈整理',url:'https://www.sohu.com/a/437470127_715709',year:2020,date:'2020-12-10',publisher:'西安升学，家长访谈整理',level:'historical-parent',note:'家长描述高中独立餐厅、不同餐品区域及打饭吃饭后返宿舍约半小时；答疑同时提到高中走读生。',limitation:'历史主观描述，不是2026官方作息或实测；未确认座位能否跨餐品共享或现行排队方式。文中1:2走读住校比例属于其原初三班，不能用于高中。'},
    {id:'D02',title:'不同届学生对滨河的历史回忆汇编',url:'https://www.sohu.com/a/400724083_715709',year:2020,date:'2020-06-09',publisher:'西安升学，明确整理自知乎',level:'historical-student',note:'含2019届学生回顾高一11:50下课、12:30返寝及高三曾提前放学的描述。',limitation:'缺少原回答链接，且涉及不同届；不是2026正式课表。只提示需要比较短时窗和不同年级顺序。'},
    {id:'D03',title:'初三复课首日错时用餐报道',url:'https://sn.ifeng.com/c/7vTL0IS6iXq',year:2020,date:'2020-04-08',publisher:'西安日报，凤凰网转载',level:'historical-news',note:'记者记录滨河初三复课时统一配餐、错时用餐、按班分区和编号餐位；照片可见浅色矩形桌面与橙色靠背椅。',limitation:'事件为2020年4月7日初三疫情复课，不能作为2026高中常态规定。3D仅借鉴桌椅形态与配色，布局和尺寸均为示意。'}
  ];
  var assumptions = [
    {id:'A01',field:'grades.students',title:'模拟午餐人数',value:'高一580、高二530、高三500，共1610人',note:'以三届招生计划作为规模基数，并假设100%参加午餐；不是实际到餐数据。可直接修改年级人数进行参与率敏感性分析。'},
    {id:'A02',field:'grades.classes,grades.classSizes',title:'班级组织',value:'12 / 11 / 10班，班间隔0.2分钟',note:'默认班级数、近似均分班额与班间隔均为假设，尚无该校高中班级台账；可填写各班实际就餐人数，填入后严格核对总数。'},
    {id:'A03',field:'grades.readyTime,grades.releaseTime,grades.latestReleaseTime,grades.releaseLocked,grades.deadline',title:'放行与截止',value:'共同可放行11:50；高三11:50、高二11:55、高一12:00；12:30返回截止',note:'高三先行与40分钟时窗是待比较方案，不是已确认的现行政策；默认未设置最晚末班放行与锁定。自动方案须遵守填写的时间边界。'},
    {id:'A04',field:'serviceZones,windowZones,gradeZoneWeights',title:'餐品区及需求',value:'普通套餐12窗、480座、75%需求；特色餐4窗、160座、25%需求',note:'两个区及其名称、窗口、座位、比例全为假设；不表示实际楼层或偏好。每人固定一个餐品区，餐品资格和座位共享分别配置。'},
    {id:'A05',field:'windowMeans,serviceCV,serviceStart,serviceEnd,strategy',title:'窗口供餐',value:'16窗均值20秒/人，变异系数0.35；11:45–12:45供餐',note:'默认区内公共先到先服务队列是研究安排，未确认该校实际队列形式；一次交易服务模型不含缺货、后厨堵塞或多站取餐，所有运营数值待测。'},
    {id:'A06',field:'assemblyMax,walkMin,walkMax,mealMean,mealCV,returnMinutes,returnDestination',title:'集合、步行、用餐与返程',value:'集合0–1分、步行2–4分、个人扰动0–0.5分；用餐均值12分、变异系数0.2；返宿舍4分',note:'均为假设分布；同班共享集合和步行项。全员返宿舍只是示例的统一返回目标，不表示全体住校；住宿生与走读生混合返回目标尚待实现，现行午餐后去向待核。'},
    {id:'A07',field:'serviceZones.walkExtra,serviceZones.returnExtra',title:'附加通行时间',value:'特色区去程增加2分、返程增加1分',note:'用于演示较远服务区的时间成本；未测量真实距离，未建模楼梯容量或人群碰撞。'},
    {id:'A08',field:'scene',title:'三维场景',value:'自建矩形桌与橙色靠背椅；单层展开式分区示意',note:'桌椅外观参考2020新闻照片；场地尺寸、桌椅布局与窗口位置均为示意，不能用于测算真实通道能力。'},
    {id:'A09',field:'seatPoolByZone,seatWaitingCapacity',title:'座位共享与等座容量',value:'默认各区独立座位；等座区容量待核',note:'可为连通的就座空间设置共享组，不能用它替代跨楼层通行模型。等座容量只作适用性诊断，超限不能解释为现场可执行；未计算反向阻塞。'}
  ];
  function createConfig() {
    return {
      mode:'school', sourceProfile:Object.assign({},metadata),
      grades:[580,530,500].map(function (n,i) {
        return {id:i,name:['高一','高二','高三'][i],students:n,classes:[12,11,10][i],readyTime:30,releaseTime:[40,35,30][i],classInterval:.2,assemblyMax:1,walkMin:2,walkMax:4,deadline:70};
      }),
      students:1610,windows:16,serviceMean:20,serviceCV:.35,
      windowMeans:Array.from({length:16},function(){return 20;}),
      strategy:'pooled',allocation:'shared',windowOwners:Array.from({length:16},function(_,i){return i%3;}),
      serviceStart:25,serviceEnd:85,horizon:120,diningEnabled:true,
      seats:640,mealMean:12,mealCV:.2,returnMinutes:4,returnDestination:'dormitory',
      serviceZones:[{id:0,name:'普通套餐区（假设）',seats:480,walkExtra:0,returnExtra:0},{id:1,name:'特色餐区（假设）',seats:160,walkExtra:2,returnExtra:1}],
      windowZones:Array.from({length:16},function(_,i){return i<12?0:1;}),
      gradeZoneWeights:[[.75,.25],[.75,.25],[.75,.25]],seed:20261017
    };
  }
  return freezeTree({
    VERSION:'1.5.0',id:metadata.id,title:'滨河研究案例（含假设）',
    schoolName:'西安铁一中滨河高级中学',asOf:metadata.asOf,metadata:metadata,
    scopeNote:'以公开招生计划建立高中规模情景，以历史就餐资料改进模型结构；尚未取得学校现行作息、资源台账和运营实测。',
    admissionPlans:[{gradeId:0,grade:'高一',year:2026,plannedStudents:580,sourceId:'O01'},{gradeId:1,grade:'高二',year:2025,plannedStudents:530,sourceId:'O02'},{gradeId:2,grade:'高三',year:2024,plannedStudents:500,sourceId:'O03'}],
    evidence:evidence,assumptions:assumptions,
    missingData:['当前各年级实际在校、分班与当天到餐人数','当前下课、集合放行、最晚末班放行、午休和返回截止时刻','高中与其他学段、教职工共享资源的边界','各餐区实际开放窗口、可用座位、窗口餐品兼容关系及座位共享边界','餐品需求、实际队列方式、服务与用餐时长、往返耗时的实测分布','当前楼层平面与楼梯、入口、通道及等座区可容纳人数','高中住宿生与走读生人数、午餐参与率及各自午餐后返回目标'],
    createConfig:createConfig
  });
});
