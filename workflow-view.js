/* Three-step presentation. Calculations remain in the existing event engine. */
(() => {
  'use strict';
  const R = window.DiningResearch, S = window.DiningScheduleStudy;
  const $ = id => document.getElementById(id);
  const minute = value => { const [h,m] = value.split(':').map(Number); return h*60+m-680; };
  const time = value => R.clockLabel(value,false);
  window.DiningWorkflow = {mount(api) {
    let dirty = false, slotSeconds = 70, gradeGapMinutes = 10;
    const form = $('setup-form');
    const number = id => Number($(id).value);
    const kind = () => form.querySelector('[name=preset]:checked')?.value;
    function gapLabel() {
      const k=kind(), label=$('setup-gap-label');
      label.hidden=!k||k==='none';
      label.firstChild.textContent=k==='grade'?'相邻年级出发间隔 / 分钟':'相邻组出发间隔 / 秒';
      $('setup-gap').max=k==='grade'?60:600;
      $('setup-gap').disabled=!k||k==='none';
      $('setup-gap').value=k==='grade'?gradeGapMinutes:slotSeconds;
    }
    form.addEventListener('input',event=>{
      dirty=true;
      if(event.target.name==='preset') gapLabel();
      else if(event.target.id==='setup-gap') {
        if(kind()==='grade') gradeGapMinutes=number('setup-gap'); else slotSeconds=number('setup-gap');
      }
      $('setup-total').textContent='共'+[0,1,2].reduce((n,id)=>n+number('setup-students-'+id),0)+'人';
    });
    function apply(destination) {
      $('setup-error').textContent='';
      if(api.isBusy()) { $('setup-error').textContent='方案比较正在进行，请完成或取消后再修改参数。';return false; }
      if(!form.reportValidity()) return false;
      try {
        if(dirty) {
          const c=R.clone(api.getConfig()), originalWindows=c.windows;
          c.grades.forEach(g=>{
            const students=number('setup-students-'+g.id),classes=number('setup-classes-'+g.id);
            if(students!==g.students || classes!==g.classes) delete g.classSizes;
            Object.assign(g,{students,classes,readyTime:minute($('setup-start').value),deadline:minute($('setup-deadline').value),releaseLocked:false});
          });
          c.students=c.grades.reduce((n,g)=>n+g.students,0);
          if(!c.students) throw new Error('请至少设置一个年级的就餐人数。');
          const service=number('setup-service');
          if(c.serviceMean!==service || originalWindows!==number('setup-windows')) c.windowMeans=null;
          c.windows=number('setup-windows');c.seats=number('setup-seats');c.serviceMean=service;
          c.windowOwners=Array(c.windows).fill(0);
          const k=kind();
          if(k) {
            const order=$('setup-order').value.split(',').map(Number).filter(id=>c.grades.find(g=>g.id===id)?.students>0);
            api.run(S.makeConfig(c,k,{order,slotSeconds,gradeGapMinutes}));
          } else api.run(c);
        }
        if(destination) api.tab(destination);
        return true;
      } catch(error) { $('setup-error').textContent=error.message; return false; }
    }
    form.onsubmit=event=>{event.preventDefault();apply('live');};
    $('setup-advanced').onclick=()=>{if(apply()) api.parameters();};
    $('live-next').onclick=()=>api.tab('compare');
    $('result-back').onclick=()=>api.tab('setup');
    document.querySelectorAll('.workflow-nav [data-tab]').forEach(button=>{
      button.addEventListener('click',event=>{
        if(api.isBusy()) return;
        if(dirty && button.dataset.tab!=='setup') {event.stopImmediatePropagation();apply(button.dataset.tab);}
      },true);
    });
    function onConfigChange() {
      const c=api.getConfig(),result=api.getResult(),active=c.grades.filter(g=>g.students>0);
      let k=Object.keys(S.labels).find(id=>c.sourceProfile?.id==='schedule-'+id);
      const ordered=active.slice().sort((a,b)=>a.releaseTime-b.releaseTime);
      if(k) {
        try {
          const expected=S.makeConfig(c,k,{order:ordered.map(g=>g.id),slotSeconds:active[0].classInterval/active.length*60,gradeGapMinutes:ordered.length>1?ordered[1].releaseTime-ordered[0].releaseTime:10});
          if(active.some(g=>{const e=expected.grades.find(x=>x.id===g.id);return Math.abs(e.releaseTime-g.releaseTime)>1e-8||Math.abs(e.classInterval-g.classInterval)>1e-8;})) k=null;
        } catch (_) { k=null; }
      }
      let custom=$('setup-custom');
      if(!custom) {custom=document.createElement('p');custom.id='setup-custom';custom.className='custom-arrangement';custom.textContent='当前为自定义安排，可继续微调参数，或选择预设重新安排。';form.insertBefore(custom,form.firstChild);}
      custom.hidden=!!k;
      form.querySelectorAll('[name=preset]').forEach(input=>input.checked=input.value===k);
      c.grades.forEach(g=>{
        $('setup-students-'+g.id).value=g.students;$('setup-classes-'+g.id).value=g.classes;
      });
      $('setup-windows').value=c.windows;$('setup-seats').value=c.seats;$('setup-service').value=c.serviceMean;
      $('setup-start').value=time(Math.max(...active.map(g=>g.readyTime)));
      $('setup-deadline').value=time(Math.min(...active.map(g=>g.deadline)));
      const order=[...ordered.map(g=>g.id),...c.grades.filter(g=>!g.students).map(g=>g.id)].join(',');
      if(k!=='none') $('setup-order').value=order;
      if(k==='combined') slotSeconds=active[0].classInterval/active.length*60;
      if(k==='grade'&&ordered.length>1) gradeGapMinutes=ordered[1].releaseTime-ordered[0].releaseTime;
      gapLabel();$('setup-total').textContent='共'+c.students+'人';dirty=false;
      const m=R.metrics(result),last=Math.max(...result.students.map(s=>s.endpointTime));
      $('result-scenario').textContent=(S.labels[k]||'自定义安排')+' · '+c.students+'人 · '+c.windows+'个窗口';
      const late=result.students.filter(s=>s.late).length;
      $('result-summary').textContent='最后一名学生于'+R.clockLabel(last)+'返回教室。'+(late?'有'+late+'人超过规定的最晚返回时刻。':'所有学生均按时返回。');
      $('result-grades').innerHTML='<table><thead><tr><th>年级</th><th>就餐人数</th><th>平均排队</th><th>平均完整用时</th></tr></thead><tbody>'+active.map(g=>'<tr><th>'+['高一','高二','高三'][g.id]+'</th><td>'+g.students+'人</td><td>'+m['grade'+g.id+'Wait'].toFixed(2)+'分钟</td><td>'+m['grade'+g.id+'Total'].toFixed(2)+'分钟</td></tr>').join('')+'</tbody></table>';
    }
    return {onConfigChange};
  }};
})();
