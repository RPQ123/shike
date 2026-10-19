/* Shared counter-to-table routes. Dimensions are an adjustable scene example. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.DiningHallWalk=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const distance=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
 const compact=points=>points.filter((p,i)=>!i||distance(p,points[i-1])>1e-9).map(p=>p.slice());
 const length=points=>points.slice(1).reduce((sum,p,i)=>sum+distance(p,points[i]),0);
 function indices(n,k){
  if(n<=k)return Array.from({length:n},(_,i)=>i);
  if(k===1)return [0];
  const head=Math.min(4,Math.max(1,k-2)),rest=k-head;
  return Array.from({length:head},(_,i)=>i).concat(Array.from({length:rest},(_,j)=>head+Math.floor(j*(n-1-head)/Math.max(1,rest-1))));
 }
 function create(config){
  const twoSided=!config.serviceZones&&config.strategy==='fastest'&&config.allocation==='shared';
  const zones=config.serviceZones||[{id:0,seats:config.seats}],tables=[];
  const total=zones.reduce((sum,z)=>sum+z.seats*100,0),rest=18-zones.length;
  const exact=zones.map(z=>(z.seats*100-1)*rest/(total-zones.length));
  const quotas=exact.map(n=>1+Math.floor(n));
  const order=exact.map((n,i)=>({i,f:n-Math.floor(n)})).sort((a,b)=>b.f-a.f||a.i-b.i);
  for(let i=0,left=18-quotas.reduce((a,b)=>a+b,0);i<left;i++)quotas[order[i].i]++;
  let offset=0;
  const zoneTables=zones.map((z,i)=>{
   const count=quotas[i];
   return Array.from({length:count},()=>{
    const id=offset++,position=twoSided?[(id%3-1)*5,0,-4.5+Math.floor(id/3)*3.85]:[((config.serviceZones?Math.floor(id/2):id%9)-4)*4.1,0,(config.serviceZones?id%2:id>=9)?15.45:11.55];
    const t={id,position,zone:i};tables.push(t);return t;
   });
  });
  const seatMap=new Map();let seatOffset=0;
  zones.forEach((z,i)=>{
   const physical=zoneTables[i].flatMap(t=>Array.from({length:4},(_,chair)=>({id:t.id*4+chair,table:t.id,zone:i,position:[t.position[0]+(chair%2?.54:-.54),.17,t.position[2]+(chair<2?-1:1)*1.02],yaw:chair<2?0:Math.PI})));
   const selected=indices(z.seats,Math.min(physical.length,z.seats));
   selected.forEach((id,j)=>seatMap.set(seatOffset+id,physical[j]));
   for(let j=0;j<z.seats;j++)if(!seatMap.has(seatOffset+j))seatMap.set(seatOffset+j,physical[Math.min(physical.length-1,Math.floor(j*physical.length/z.seats))]);
   seatOffset+=z.seats;
  });
  const left=Math.ceil(config.windows/2),right=Math.floor(config.windows/2);
  const windows=Array.from({length:config.windows},(_,i)=>{
   if(!twoSided)return [(i+Math.floor((16-config.windows)/2)-7.5)*2.6,0,-3.65];
   const side=i<left?-1:1,count=side<0?left:right,local=i<left?i:i-left;
   return [side*19.85,0,-4.6+(Math.floor((8-count)/2)+local)*2.6];
  });
  return {twoSided,tables,windows,seatMap};
 }
 function waitingPoint(hall,student){
  const start=hall.windows[student.window],front=start[2]<5.15;
  return hall.twoSided?[Math.sign(start[0])*9.4,0,-5.7+(student.id%24)*.9]:[-20.7,0,10.4+(student.id%12)*.51];
 }
 function route(hall,start,seat,fromCounter){
  const table=hall.tables[seat.table].position,target=seat.position.slice();target[1]=0;
  const rowZ=table[2]+(target[2]<table[2]?-1.58:1.58);
  if(hall.twoSided){
   const side=Math.sign(start[0])||1,aisle=side*8.25;
   const crossZ=Math.abs(start[2]+6.7)+Math.abs(rowZ+6.7)<=Math.abs(start[2]-16.8)+Math.abs(rowZ-16.8)?-6.7:16.8;
   return compact(fromCounter?[start,[side*19.35,0,start[2]],[side*19.35,0,crossZ],[aisle,0,crossZ],[aisle,0,rowZ],[target[0],0,rowZ],target]:[start,[aisle,0,start[2]],[aisle,0,rowZ],[target[0],0,rowZ],target]);
  }
  const aisle=table[0]+(target[0]<table[0]?-1:1)*1.7;
  return compact([start,[21.8,0,start[2]],[21.8,0,13.5],[aisle,0,13.5],[aisle,0,rowZ],[target[0],0,rowZ],target]);
 }
 function plan(hall,student,seatId,available,speed){
  const seat=hall.seatMap.get(seatId),start=hall.windows[student.window],wait=waitingPoint(hall,student);
  const approach=hall.twoSided?compact([start,[Math.sign(start[0])*19.35,0,start[2]],[Math.sign(start[0])*19.35,0,start[2]<5.15?-6.7:16.8],[wait[0],0,start[2]<5.15?-6.7:16.8],wait]):compact([start,[21.8,0,-3.02],[21.8,0,9.1],wait]);
  const waiting=speed>0&&available>student.end;
  const routeToSeat=route(hall,waiting?wait:start,seat,!waiting);
  const pace=speed*(.94+(student.id%13)*.01);
  const approachMinutes=waiting?length(approach)/(pace*60):0;
  return {seat,waitingPosition:wait,approachRoute:approach,seatRoute:routeToSeat,approachMinutes,walkMinutes:speed>0?(length(routeToSeat)/pace+1)/60:0};
 }
 return Object.freeze({create,plan,length,route,waitingPoint});
});
