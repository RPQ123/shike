/* Presentation only. Field names remain stable so editing preserves imported values. */
(() => {
  'use strict';
  window.DiningParameterView = function (c, field, escape, clock) {
    const grid = (content) => `<div class="field-grid">${content}</div>`;
    const section = (title, content) => `<section class="form-section"><h3>${title}</h3>${content}</section>`;
    const fold = (title, content, extra = '') =>
      `<details class="form-section parameter-group ${extra}"><summary>${title}</summary>${content}</details>`;
    const grade = (g, content) =>
      `<div class="grade-fields"><h3>${escape(g.name)}</h3>${grid(content)}</div>`;
    const input = (g, key, label, options = {}) =>
      field(
        `g${g.id}_${key}`,
        label,
        options.type === 'time' ? (g[key] === null ? '' : clock(g[key])) : g[key],
        options
      );
    let html = section(
      '人数与放行',
      c.grades
        .map((g) =>
          grade(
            g,
            input(g, 'students', '就餐人数', { max: 5000, step: 1 }) +
              input(g, 'releaseTime', '首班放行', { type: 'time' }) +
              input(g, 'deadline', '返程完成截止', { type: 'time' })
          )
        )
        .join('')
    );
    html += section(
      '窗口与座位',
      '<p class="form-help">所有窗口通用，按预计取餐完成最早分配；两侧窗口、中间座位、前后进出。</p>' +
        grid(
          field('windows', '开放窗口数量', c.windows, { min: 2, max: 16, step: 1 }) +
            field('seats', '座位总数', c.seats, { min: 2, max: 5000, step: 1 }) +
            field('serviceMean', '平均打餐时间 / 秒', c.serviceMean, {
              min: 5,
              max: 120,
              note: c.windowMeans?.some((value) => value !== c.serviceMean)
                ? '各窗另有设置；修改此项会统一窗口速度'
                : ''
            }) +
            field('mealMean', '平均用餐时间 / 分钟', c.mealMean, { min: 1, max: 90 }) +
            field('indoorWalkSpeed', '端盘步行速度 / 米每秒', c.indoorWalkSpeed, { min: 0, max: 3, step: .1 }) +
            field('returnMinutes', '返程时间 / 分钟', c.returnMinutes, { max: 60 })
        )
    );
    html += fold(
      '班级安排与时间限制',
      c.grades
        .map((g) =>
          grade(
            g,
            input(g, 'classes', '班级数', { max: 100, step: 1 }) +
              input(g, 'classInterval', '班间隔 / 分钟', { max: 30 }) +
              input(g, 'readyTime', '最早允许放行', { type: 'time' }) +
              input(g, 'latestReleaseTime', '末班最晚放行', { type: 'time', optional: true }) +
              field(`g${g.id}_classSizes`, '各班人数（可空）', g.classSizes?.join(',') || '', {
                type: 'text',
                optional: true,
                note: '逗号分隔；留空按总人数均分'
              }) +
              `<label class="check"><input type="checkbox" name="g${g.id}_releaseLocked" ${g.releaseLocked ? 'checked' : ''}>筛选时锁定首班时刻</label>`
          )
        )
        .join('')
    );
    html += fold(
      '步行与模型细节',
      c.grades
        .map((g) =>
          grade(
            g,
            input(g, 'assemblyMax', '集合上限 / 分钟', { max: 30 }) +
              input(g, 'walkMin', '步行最短 / 分钟', { max: 60 }) +
              input(g, 'walkMax', '步行最长 / 分钟', { max: 60 })
          )
        )
        .join('') +
        grid(
          field('windowMeans', '各窗口打餐时间 / 秒', c.windowMeans?.join(',') || '', {
            type: 'text',
            optional: true,
            note: '按窗口顺序填写，英文逗号分隔'
          }) +
            field('serviceCV', '打餐时长变异系数', c.serviceCV, { max: 1 }) +
            field('mealCV', '用餐时长变异系数', c.mealCV, { max: 1 }) +
            field('serviceStart', '开始供餐', clock(c.serviceStart), { type: 'time' }) +
            field('serviceEnd', '结束供餐', clock(c.serviceEnd), { type: 'time' }) +
            field('horizon', '初始观察时长 / 分钟', c.horizon, {
              min: 1,
              max: 720,
              note: '从11:20起；未完成会继续计算'
            }) +
            field('seed', '随机种子', c.seed, { max: 4294967295, step: 1 }) +
            `<label class="field">返程终点<select name="returnDestination"><option value="classroom" ${c.returnDestination === 'classroom' ? 'selected' : ''}>教室</option><option value="dormitory" ${c.returnDestination === 'dormitory' ? 'selected' : ''}>宿舍</option><option value="gate" ${c.returnDestination === 'gate' ? 'selected' : ''}>校门</option></select></label>`
        ) +
        '<p class="form-help">变异系数描述时长波动，0 表示每次相同。修改平均打餐时间会统一所有窗口；未修改项保留导入值与精度。</p>',
      'advanced-settings'
    );
    return html;
  };
})();
