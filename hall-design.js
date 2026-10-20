/* Architectural presentation, in the event model's existing coordinates.
 * All surfaces are local geometry and procedural textures; no remote assets.
 */
(() => {
  'use strict';
  const T=window.THREE;
  class Batch {
    constructor(parent){this.parent=parent;this.batches=new Map();this.object=new T.Object3D();}
    add(geometry,material,position,scale=[1,1,1],rotation=[0,0,0],shadow=true){
      const key=geometry.uuid+material.uuid+shadow;
      if(!this.batches.has(key))this.batches.set(key,{geometry,material,matrices:[],shadow});
      this.object.position.set(...position);this.object.scale.set(...scale);this.object.rotation.set(...rotation);this.object.updateMatrix();
      this.batches.get(key).matrices.push(this.object.matrix.clone());
    }
    flush(){for(const b of this.batches.values()){const mesh=new T.InstancedMesh(b.geometry,b.material,b.matrices.length);b.matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.castShadow=b.shadow;mesh.receiveShadow=true;mesh.name='建筑与家具实例';this.parent.add(mesh);}}
  }
  function texture(kind){
    const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d');
    x.fillStyle=kind==='floor'?'#ebe8df':'#d5b88c';x.fillRect(0,0,512,512);
    let seed=5713;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    if(kind==='floor'){
      for(let i=0;i<3800;i++){x.fillStyle=`rgba(108,104,91,${rnd()*.028})`;x.fillRect(rnd()*512,rnd()*512,1+rnd()*8,1);}
      x.strokeStyle='#c0c0b5';x.lineWidth=5;x.strokeRect(2,2,508,508);x.strokeStyle='#fbf9f0';x.lineWidth=2;x.strokeRect(6,6,500,500);
    }else{
      for(let i=0;i<250;i++){x.strokeStyle=`rgba(122,86,45,${.025+rnd()*.09})`;x.lineWidth=.3+rnd();x.beginPath();x.moveTo(0,i*2.1);x.bezierCurveTo(160,i*2.1+rnd()*4,340,i*2.1-4,512,i*2.1);x.stroke();}
    }
    const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(kind==='floor'?22:1,kind==='floor'?13:1);t.anisotropy=4;return t;
  }
  function environment(renderer){
    const c=document.createElement('canvas');c.width=512;c.height=256;const x=c.getContext('2d'),gradient=x.createLinearGradient(0,0,0,256);
    gradient.addColorStop(0,'#e4eef4');gradient.addColorStop(.45,'#fffdf3');gradient.addColorStop(.58,'#ebe9df');gradient.addColorStop(1,'#adbaac');x.fillStyle=gradient;x.fillRect(0,0,512,256);
    x.fillStyle='#fff';x.fillRect(45,75,90,35);x.fillStyle='#fff9dd';x.fillRect(300,60,40,60);
    const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;texture.mapping=T.EquirectangularReflectionMapping;
    const generator=new T.PMREMGenerator(renderer),target=generator.fromEquirectangular(texture);generator.dispose();texture.dispose();return target;
  }
  function build(layout){
    const group=new T.Group();group.name='日光食堂建筑';
    const batch=new Batch(group),cube=new T.BoxGeometry(1,1,1),sphere=new T.IcosahedronGeometry(1,1),leaf=new T.IcosahedronGeometry(1,0),round=new T.CylinderGeometry(1,1,1,10),plate=new T.CylinderGeometry(1,1,1,20);
    const profile=new T.Shape();profile.moveTo(-.43,-.5);profile.lineTo(.43,-.5);profile.quadraticCurveTo(.5,-.5,.5,-.43);profile.lineTo(.5,.43);profile.quadraticCurveTo(.5,.5,.43,.5);profile.lineTo(-.43,.5);profile.quadraticCurveTo(-.5,.5,-.5,.43);profile.lineTo(-.5,-.43);profile.quadraticCurveTo(-.5,-.5,-.43,-.5);
    const softened=new T.ExtrudeGeometry(profile,{depth:1,bevelEnabled:false,curveSegments:3});softened.rotateX(-Math.PI/2);softened.center();
    const mat=(color,extra={})=>new T.MeshStandardMaterial({color,roughness:.66,metalness:0,...extra});
    const wall=mat(0xeee9df),stone=mat(0xd0d3ca),trim=mat(0xa5ada4,{metalness:.4,roughness:.35}),wood=mat(0xd0aa76,{map:texture('wood'),roughness:.46}),green=mat(0x2d7056),dark=mat(0x264d40),steel=mat(0xaab5b1,{metalness:.65,roughness:.27}),cream=mat(0xf9f7ed),soil=mat(0x665748),napkin=mat(0xe5e8da),panelLine=mat(0x558c75);
    const glass=mat(0xc6d9d3,{transparent:true,opacity:.23,metalness:.25,roughness:.1,depthWrite:false,side:T.DoubleSide});
    const leaves=[0x7c9962,0x9bb17b,0x597c50].map(color=>new T.MeshLambertMaterial({color}));
    const b=layout.bounds,z=layout.floorCenter[2],put=(size,p,m,shadow=true)=>batch.add(cube,m,p,size,[0,0,0],shadow);
    // A shallow foundation and porcelain tile material give the scene scale.
    put([b.width+2,.40,b.depth+.8],[0,-.30,z],stone);
    const tile=new T.Mesh(new T.BoxGeometry(b.width,.14,b.depth),mat(0xffffff,{map:texture('floor'),roughness:.4,metalness:.025}));tile.position.set(0,-.015,z);tile.receiveShadow=true;tile.name='浅色地砖';group.add(tile);
    const joints=[];for(let x=b.minX+2;x<b.maxX;x+=2)joints.push(x,.059,b.minZ,x,.059,b.maxZ);for(let zz=b.minZ+2;zz<b.maxZ;zz+=2)joints.push(b.minX,.059,zz,b.maxX,.059,zz);
    const grid=new T.LineSegments(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(joints,3)),new T.LineBasicMaterial({color:0xb1b6a7,transparent:true,opacity:.34}));grid.name='瓷砖接缝';group.add(grid);
    put([b.width+5,.12,b.depth+5],[0,-.58,z],mat(0xf3f2ea),false);
    function shrub(x,z,length=2.2){
      put([length,.60,.65],[x,.22,z],wall);put([length-.12,.05,.51],[x,.54,z],soil,false);
      for(let i=0;i<Math.ceil(length*8);i++){
        const a=i*2.399,xx=x+((i*.618)%1-.5)*(length-.15),zz=z+Math.sin(a)*.22;
        batch.add(sphere,leaves[i%3],[xx,.68+(i%3)*.08,zz],[.23,.17,.21],[0,a,.3],true);
        for(let j=0;j<4;j++){const angle=a+j*1.7;batch.add(leaf,leaves[(i+j)%3],[xx+Math.cos(angle)*.16,.80+(j%2)*.06,zz+Math.sin(angle)*.14],[.11,.16,.055],[j*.8,angle,.7],false);}
      }
    }
    function tree(x,z,height=2.2){
      batch.add(round,wood,[x,height*.42,z],[.08,height*.8,.08]);
      for(let i=0;i<15;i++){const a=i*2.4;batch.add(sphere,leaves[i%3],[x+Math.cos(a)*.38,height+.18*Math.sin(i),z+Math.sin(a)*.35],[.35,.44,.32],[0,a,.2]);}
      for(let i=0;i<65;i++){const a=i*2.399,rad=.22+(i%5)*.08;batch.add(leaf,leaves[i%3],[x+Math.cos(a)*rad,height+Math.sin(i*.7)*.45,z+Math.sin(a)*rad],[.16,.23,.07],[.6,a,.7],false);}
    }
    // Back window wall has a real central opening, matching the entrance route.
    const back=b.minZ+.02,front=b.maxZ-.05;
    for(const side of [-1,1]){
      put([b.width/2-2.5,.62,.30],[side*(b.width/4+1.25),.30,back],wall);
      put([b.width/2-2.5,.30,.48],[side*(b.width/4+1.25),3.62,back],wall);
      for(let i=0;i<4;i++){
        const cx=side*(4.6+i*4.6);
        put([.22,3.10,.30],[cx-2.15,2.10,back],trim);
        put([4.28,.13,.26],[cx,3.35,back],trim);
        put([4.28,.12,.25],[cx,.73,back],trim);
        put([4.13,2.55,.05],[cx,2.05,back],glass,false);
        put([.07,2.55,.10],[cx,2.05,back+.02],trim,false);
        shrub(cx,back-1,3.7);
      }
      // Low cutaway perimeter keeps the central seating fully visible.
      put([.8,.12,b.depth],[side*(b.width/2+.26),-.01,z],stone);
      put([.25,2.65,b.depth],[side*(b.width/2+.65),1.31,z],wall);
      put([.4,.13,b.depth],[side*(b.width/2+.65),2.71,z],cream);
      put([b.width/2-3,.66,.28],[side*(b.width/4+1.5),.27,front],wall);
      for(let i=0;i<4;i++)shrub(side*(5.0+i*4.6),front+.24,3.8);
      tree(side*(b.width/2+1.0),back+1.1,2.3);tree(side*(b.width/2+1.0),front-.4,2.0);
    }
    for(const entry of layout.entries){
      const ez=entry[2]<z?back:front;
      for(const side of [-1,1]){
        put([.16,2.6,.21],[side*2.45,1.3,ez],trim);
        put([2.38,.14,.24],[side*1.22,2.6,ez],trim);
        // Leaves are held open to leave the route clear.
        batch.add(cube,glass,[side*2.5,1.28,ez+.55],[.05,2.42,1.15],[0,side*.18,0],false);
        batch.add(cube,trim,[side*2.5,1.28,ez+.55],[.06,.07,1.15],[0,side*.18,0],false);
      }
      put([4.8,.04,1.4],[0,.062,ez],mat(0xc6c9be),false);
    }
    // Dining furniture uses the exact table and chair centers in the model.
    for(const table of layout.tables){
      const [x,,z]=table.position;
      batch.add(softened,wood,[x,.86,z],[1.96,.12,1.2]);
      put([1.72,.045,1.02],[x,.79,z],dark);
      for(const dx of [-.73,.73])for(const dz of [-.43,.43])put([.065,.72,.065],[x+dx,.40,z+dz],steel);
      for(let i=0;i<4;i++){
        const side=i<2?-1:1,xx=x+(i%2?.54:-.54),zz=z+side*1.02;
        batch.add(softened,green,[xx,.49,zz],[.49,.09,.47]);
        put([.47,.39,.075],[xx,.75,zz+side*.22],green);
        for(const dx of [-.17,.17])for(const dz of [-.16,.16])put([.035,.43,.035],[xx+dx,.24,zz+dz],steel);
        // Four place settings help explain the seating layout at a glance.
        batch.add(plate,cream,[xx,.932,z+side*.32],[.18,.025,.18]);
        put([.23,.018,.12],[xx+.24,.932,z+side*.30],napkin,false);
      }
      put([.16,.20,.11],[x,.99,z],cream);
      batch.add(round,green,[x+.40,.99,z],[.08,.18,.08]);
    }
    // Window carcasses, food pans and glazing are static instances. Only the
    // service indicators and staff arms remain individually animated.
    const food=[mat(0xd8ad68),mat(0x8eaf63),mat(0xcc8c6b)];
    const local=new T.Vector3();
    for(const slot of layout.slots){
      const rot=slot.rotation||0;
      const piece=(size,p,m)=>{local.set(...p).applyAxisAngle(new T.Vector3(0,1,0),rot).add(new T.Vector3(slot.x,0,slot.z));batch.add(cube,m,local.toArray(),size,[0,rot,0]);};
      piece([2.16,.96,1.24],[0,.50,0],slot.open?green:stone);
      piece([2.30,.10,1.40],[0,1.03,0],wood);
      piece([2.13,.10,.06],[0,.17,.64],dark);
      piece([2.20,.25,.40],[0,2.06,-.28],slot.open?green:stone);
      for(const x of [-.96,.96])piece([.045,.95,.045],[x,1.53,-.30],steel);
      if(slot.open){
        piece([2.02,.63,.035],[0,1.58,-.27],glass);
        for(let i=-1;i<=1;i++){piece([.48,.055,.35],[i*.58,1.12,.03],steel);piece([.38,.04,.26],[i*.58,1.16,.03],food[i+1]);}
        for(const x of [-.67,.67])piece([.035,.73,.026],[x,.57,.638],panelLine);
      }else piece([1.95,.83,.10],[0,1.49,-.27],stone);
    }
    batch.flush();return group;
  }
  window.DiningHallDesign=Object.freeze({build,environment});
})();
