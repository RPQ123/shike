/* Food-hall diorama. Presentation only: engine event times remain authoritative.
 * Offline dependency: Three.js r180 (MIT), bundled in vendor/three.min.js.
 * The renderer may be injected for geometry-only QA; that does not test WebGL.
 */
(function (root) {
  'use strict';
  const T = root.THREE;
  const palette = {
    cream:0xf5f0e6, edge:0xd6dfd1, green:0x246b58, mint:0xb6d1bf,
    wood:0xc7a273, dark:0x304a41, steel:0xdbe4df, blue:0x6b9cbd,
    coral:0xd48b74, gold:0xd7b465, leaf:0x668f61
  };
  const cohorts=[0x277f68,0xe68b50,0x5c91bf];
  const zoneColors=[0x397b70,0xb4864e,0x6d7db0,0xa67799];
  const min=(v,a,b)=>Math.max(a,Math.min(b,v));
  function material(color, extra) { return new T.MeshStandardMaterial(Object.assign({color,roughness:.8,metalness:0},extra||{})); }
  function box(parent,size,position,mat,shadow=true) {
    const mesh=new T.Mesh(new T.BoxGeometry(...size),mat);
    mesh.position.set(...position);mesh.castShadow=shadow;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  function cylinder(parent,radius,height,position,mat,segments=24) {
    const mesh=new T.Mesh(new T.CylinderGeometry(radius,radius,height,segments),mat);
    mesh.position.set(...position);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  function sphere(parent,radius,position,mat,segments=12) {
    const mesh=new T.Mesh(new T.SphereGeometry(radius,segments,8),mat);
    mesh.position.set(...position);mesh.castShadow=true;parent.add(mesh);return mesh;
  }
  function line(parent,points,color,opacity=1) {
    const geometry=new T.BufferGeometry().setFromPoints(points.map(p=>new T.Vector3(...p)));
    const mesh=new T.Line(geometry,new T.LineBasicMaterial({color,transparent:opacity<1,opacity}));parent.add(mesh);return mesh;
  }
  function plant(parent,x,z,scale=1) {
    const group=new T.Group();group.position.set(x,0,z);group.scale.setScalar(scale);parent.add(group);
    const pot=new T.Mesh(new T.CylinderGeometry(.29,.23,.44,12),material(0xe8ded0));pot.position.y=.23;pot.castShadow=true;group.add(pot);
    cylinder(group,.04,.60,[0,.7,0],material(0x977b56),6);
    const greens=[0x668f61,0x8eab78,0x789f69];
    for(let i=0;i<7;i++) {const a=i*2.4;const leaf=sphere(group,.27,[Math.cos(a)*.20,.9+(i%3)*.15,Math.sin(a)*.2],material(greens[i%3]),7);leaf.scale.set(.7,1.15,.75);}
    return group;
  }
  function arrow(parent,x,z,rotation=0,color=0x93ae91) {
    const shape=new T.Shape();shape.moveTo(-.065,-.42);shape.lineTo(.065,-.42);shape.lineTo(.065,.12);shape.lineTo(.23,.12);shape.lineTo(0,.43);shape.lineTo(-.23,.12);shape.lineTo(-.065,.12);shape.closePath();
    const m=new T.Mesh(new T.ShapeGeometry(shape),new T.MeshBasicMaterial({color,side:T.DoubleSide}));m.name='circulation arrow';m.rotation.x=-Math.PI/2;m.rotation.z=rotation;m.position.set(x,.088,z);parent.add(m);
  }
  function table(parent,x,z,zone,zoned) {
    const group=new T.Group();group.name='rectangular dining table';group.userData.zone=zone;group.position.set(x,0,z);parent.add(group);
    // Original geometry, with only tabletop/chair appearance informed by the
    // dated 2020 Binhe news photograph. Dimensions and placement are illustrative.
    const top=material(0xf0eddf),leg=material(0x8d9b99,{metalness:.45,roughness:.4}),seat=material(0xdc7940);
    box(group,[1.96,.10,1.2],[0,.85,0],top);
    for(const sx of [-.72,.72])for(const sz of [-.42,.42])box(group,[.065,.76,.065],[sx,.42,sz],leg);
    box(group,[1.5,.065,.07],[0,.26,0],leg);
    for(let i=0;i<4;i++) {
      const side=i<2?-1:1,sx=i%2?.54:-.54,sz=side*1.02;
      box(group,[.46,.075,.43],[sx,.49,sz],seat);
      for(const dx of [-.16,.16])for(const dz of [-.14,.14])box(group,[.035,.44,.035],[sx+dx,.255,sz+dz],leg);
      box(group,[.46,.38,.055],[sx,.76,sz+side*.20],seat);
    }
    if(zoned)box(group,[.25,.012,.16],[.69,.908,.38],material(zoneColors[zone%4]),false);
    return group;
  }
  function world(result,layout) {
    const g=new T.Group();g.name='Dining hall';const b=layout.bounds,c=layout.floorCenter;
    const polished=!!root.DiningHallDesign&&layout.twoSided;
    if(polished)g.add(root.DiningHallDesign.build(layout));
    const floor=material(palette.cream),edge=material(palette.edge),green=material(palette.green),wood=material(palette.wood),steel=material(palette.steel,{metalness:.22,roughness:.48});
    if(!polished) {
    box(g,[b.width+.4,.4,b.depth+.4],[0,-.31,c[2]],edge);
    box(g,[b.width,.16,b.depth],[0,-.035,c[2]],floor);
    box(g,[layout.twoSided?16:b.width-5.7,.022,layout.twoSided?b.depth-3:11.1],[0,.055,layout.twoSided?c[2]:2.6],material(0xe7eee1),false);
    if(!layout.twoSided)box(g,[b.width-7.7,.018,7.2],[0,.058,13.45],material(0xf0e8d9),false);
    for(let x=b.minX+1;x<b.maxX;x+=1.3)line(g,[[x,.057,b.minZ+.3],[x,.057,b.maxZ-.3]],0xaebea9,.18);
    for(let z=b.minZ+.3;z<b.maxZ;z+=1.3)line(g,[[b.minX+.3,.057,z],[b.maxX-.3,.057,z]],0xaebea9,.18);
    if(layout.twoSided) {
      for(const side of [-1,1]) {
        box(g,[.23,2.25,b.depth],[side*(b.width/2-.15),1.4,c[2]],material(0xe1e8da));
        box(g,[.42,.12,b.depth],[side*(b.width/2-.15),2.6,c[2]],wood);
        for(const z of [b.minZ+1,b.maxZ-1])plant(g,side*19.8,z,.68);
      }
      for(const entry of layout.entries) {
        box(g,[5,.025,1.2],[0,.06,entry[2]],material(0xdce9db),false);
        arrow(g,-1,entry[2],entry[2]<c[2]?0:Math.PI,0x78966d);
        arrow(g,1,entry[2],entry[2]<c[2]?Math.PI:0,0xbca270);
      }
    } else {
    box(g,[b.width,.35,.38],[0,.21,b.minZ+.14],material(0xc5d3bc));
    box(g,[b.width,2.25,.23],[0,1.53,b.minZ+.15],material(0xe1e8da));
    box(g,[b.width,.12,.42],[0,2.72,b.minZ+.15],wood);
    for(let x=b.minX+1.5;x<b.maxX-1;x+=3.4)box(g,[1.5,.055,.18],[x,2.6,b.minZ+.45],material(0xfff4d8,{emissive:0xffe3a8,emissiveIntensity:.22}));
    for(const side of [-1,1]) {
      box(g,[.18,.5,8.9],[side*(b.width/2-.1),.32,-2.85],edge);
      box(g,[.29,.09,8.95],[side*(b.width/2-.1),.62,-2.85],wood);
      // Decorations stay outside the centerline of both circulation aisles.
      for(const z of [-6.2,7.9])plant(g,side*(b.width/2-.30),z,.68);
    }
    }
    }
    const slotStations=layout.slots.map(slot=>{
      const station=new T.Group();station.position.set(slot.x,0,slot.z);station.rotation.y=slot.rotation||0;g.add(station);station.userData.windowId=slot.windowId;station.userData.slotIndex=slot.slotIndex;
      const face=slot.open?(layout.zoned?material(zoneColors[slot.zone%4]):green):material(0xaab9ad),cap=slot.open?wood:material(0xc6ccc1);
      if(!polished) {
      box(station,[2.16,.95,1.24],[0,.5,0],face);box(station,[2.27,.14,1.38],[0,1.015,0],cap);
      box(station,[2.0,.1,.20],[0,.12,.64],material(slot.open?0x193f35:0x8c9a8e));
      box(station,[.06,.95,.06],[-.95,1.52,-.31],steel);box(station,[.06,.95,.06],[.95,1.52,-.31],steel);
      box(station,[2.16,.16,.49],[0,2.0,-.28],face);
      if(!slot.open) {
        box(station,[1.95,.83,.10],[0,1.49,-.27],material(0xc5cdc0));
        for(let y=1.17;y<1.88;y+=.13)line(station,[[-.96,y,-.205],[.96,y,-.205]],0xa7b2a3,.8);
        return {group:station,open:false};
      }
      for(let i=-1;i<=1;i++){box(station,[.47,.04,.32],[i*.57,1.106,.04],steel);box(station,[.36,.04,.23],[i*.57,1.145,.04],material([0xd8ae6f,0x8baf70,0xcd896f][i+1]));}
      } else if(!slot.open) return {group:station,open:false};
      const status=box(station,[1.65,.063,.03],[0,.88,.637],material(0x6fb391,{emissive:0x5bb89a,emissiveIntensity:.2}));
      const progress=box(station,[1.66,.075,.033],[-.83,.78,.639],material(0xefd690,{emissive:0xdec875,emissiveIntensity:.25}));
      cylinder(station,.14,.42,[0,.88,-.78],material(0xf6f2e9),10);sphere(station,.13,[0,1.2,-.78],material(0xdcb697));cylinder(station,.16,.17,[0,1.35,-.78],material(0xffffff),12);
      const chefArm=new T.Group();chefArm.position.set(.16,1.0,-.77);station.add(chefArm);box(chefArm,[.075,.075,.35],[0,-.025,.14],material(0xf6f2e9));sphere(chefArm,.05,[0,-.025,.33],material(0xdcb697),7);
      const ring=new T.Mesh(new T.RingGeometry(.35,.46,32),new T.MeshBasicMaterial({color:0x61a981,side:T.DoubleSide,transparent:true,opacity:.68}));ring.rotation.x=-Math.PI/2;ring.position.set(layout.twoSided?Math.sign(slot.x)*19.85:slot.x,.087,layout.twoSided?slot.z:layout.serviceZ);g.add(ring);
      return {group:station,status,progress,chefArm,ring,open:true};
    });
    const stations=slotStations.filter(s=>s.open);
    // Queue guides are updated from frame.queueGroups, so sampled groups have
    // exactly the same geometry as the avatars they explain.
    const queueGuides=layout.queues.map(()=>{
      const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(layout.limits.waiting*3),3));geometry.setDrawRange(0,0);
      const guide=new T.Line(geometry,new T.LineBasicMaterial({color:0x9eb793,transparent:true,opacity:polished?.16:.55}));g.add(guide);return guide;
    });
    const lane=layout.circulation;
    if(!layout.twoSided) {
    line(g,[[lane.leftX,.082,17],[lane.leftX,.082,lane.rearZ],[lane.rightX-.65,.082,lane.rearZ]],0x8cac86,.65);
    line(g,[[b.minX+1,.082,lane.frontZ],[lane.rightX,.082,lane.frontZ],[lane.rightX,.082,17]],0xc5aa6e,.65);
    for(const x of [-12,-4,4,12]){arrow(g,x,lane.rearZ,-Math.PI/2,0x8eaa84);arrow(g,x,lane.frontZ,-Math.PI/2,0xc5aa6e);}
    for(const z of [10.4,13.1,16.4]){arrow(g,layout.entry[0],z,0,0x78966d);arrow(g,layout.exit[0],z,Math.PI,0xbca270);}
    } else for(const x of [-11.1,11.1])line(g,[[x,.082,b.minZ+.5],[x,.082,b.maxZ-.5]],0x8cac86,.55);
    if(!polished)layout.tables.forEach(t=>table(g,t.position[0],t.position[2],t.zone,layout.zoned));
    return {group:g,stations,slotStations,queueGuides};
  }
  const Crowd=root.DiningPeople;
  class View {
    constructor(host,options={}) {
      if(!T||!T.OrbitControls||!root.CanteenSceneState)throw new Error('三维组件未能载入');
      this.host=host;this.options=options;this.active=true;this.playing=false;this.frameHandle=0;this.positions=new Map();this.lastVisualTime=null;this.lastNow=0;this.selectedId=null;this.result=null;this.preset='perspective';this.pointerStart=null;this.silentCamera=0;this.timeScale=.25;
      this.scene=new T.Scene();this.scene.background=new T.Color(0xf1f0e9);
      this.scene.add(new T.HemisphereLight(0xfff9ef,0xb5c1ad,1.15));
      this.sun=new T.DirectionalLight(0xfff1d8,3.1);this.sun.position.set(-18,35,-18);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);this.sun.shadow.normalBias=.035;this.sun.shadow.bias=-.0002;this.scene.add(this.sun);this.scene.add(this.sun.target);
      const fill=new T.DirectionalLight(0xe2eef7,.7);fill.position.set(16,9,-12);this.scene.add(fill);
      this.camera=new T.OrthographicCamera(-20,20,20,-20,.1,240);
      this.renderer=options.renderer||new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
      this.renderer.setPixelRatio(Math.min(root.devicePixelRatio||1,1.7));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.98;this.renderer.outputColorSpace=T.SRGBColorSpace;
      if(root.DiningHallDesign){this.environmentTarget=root.DiningHallDesign.environment(this.renderer);this.scene.environment=this.environmentTarget.texture;this.scene.environmentIntensity=.48;}
      this.renderer.domElement.className='canteen-webgl';this.renderer.domElement.setAttribute('aria-label','三维食堂场景，可拖动旋转，滚轮或双指缩放，点击人物查看状态');this.renderer.domElement.tabIndex=0;host.appendChild(this.renderer.domElement);
      this.labels=root.document.createElement('div');this.labels.className='scene-label-layer';host.appendChild(this.labels);
      this.controls=new T.OrbitControls(this.camera,this.renderer.domElement);this.controls.enablePan=false;this.controls.enableDamping=true;this.controls.dampingFactor=.13;this.controls.minPolarAngle=.05;this.controls.maxPolarAngle=Math.PI*.46;this.controls.minZoom=.55;this.controls.maxZoom=3.5;this.controls.rotateSpeed=.65;this.controls.zoomSpeed=.7;
      this.controls.addEventListener('change',()=>{this.invalidate();this.notifyCamera();});
      this.controls.addEventListener('start',()=>options.onCameraChange?.());
      this.raycaster=new T.Raycaster();this.pointer=new T.Vector2();
      const canvas=this.renderer.domElement;
      canvas.addEventListener('pointerdown',e=>{this.pointerStart={x:e.clientX,y:e.clientY,id:this.studentAt(e)};});
      canvas.addEventListener('pointerup',e=>{
        const start=this.pointerStart;this.pointerStart=null;
        if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<5)this.pick(e,start.id);
      });
      canvas.addEventListener('pointercancel',()=>{this.pointerStart=null;});
      canvas.addEventListener('keydown',e=>{
        if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','0'].includes(e.key)){e.preventDefault();
          if(e.key==='0')this.setCamera('perspective');
          else if(['+','=','-'].includes(e.key))this.zoom(e.key==='-'?.85:1.15);
          else {const offset=this.camera.position.clone().sub(this.controls.target),s=new T.Spherical().setFromVector3(offset);if(e.key==='ArrowLeft')s.theta-=.13;if(e.key==='ArrowRight')s.theta+=.13;if(e.key==='ArrowUp')s.phi=Math.max(.06,s.phi-.1);if(e.key==='ArrowDown')s.phi=Math.min(Math.PI*.45,s.phi+.1);this.camera.position.copy(this.controls.target).add(new T.Vector3().setFromSpherical(s));this.controls.update();this.invalidate();}
        }
      });
      canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.setActive(false);options.onError?.('图形显示已中断，已切换到二维视图。');});
      this.observer=root.ResizeObserver?new root.ResizeObserver(()=>this.resize()):null;this.observer?.observe(host);
      this.resizeHandler=()=>this.resize();root.addEventListener('resize',this.resizeHandler);
      this.projectPoint=new T.Vector3();
    }
    disposeWorld() {
      if(this.worldGroup){this.scene.remove(this.worldGroup);const geometries=new Set(),materials=new Set();this.worldGroup.traverse(obj=>{if(obj.isInstancedMesh)obj.dispose();if(obj.geometry)geometries.add(obj.geometry);if(obj.material)(Array.isArray(obj.material)?obj.material:[obj.material]).forEach(m=>materials.add(m));});geometries.forEach(g=>g.dispose());const textures=new Set();materials.forEach(m=>{for(const value of Object.values(m))if(value?.isTexture)textures.add(value);m.dispose();});textures.forEach(t=>t.dispose());}
      this.worldGroup=null;this.labels.replaceChildren();this.positions.clear();
    }
    setResult(result) {
      this.disposeWorld();this.journeyTrace=null;this.data=null;this.result=result;this.layout=root.CanteenSceneState.createLayoutForResult(result);
      this.host.classList.toggle('two-sided-hall',!!this.layout.twoSided);
      const built=world(result,this.layout);this.worldGroup=built.group;this.stations=built.stations;this.slotStations=built.slotStations;this.queueGuides=built.queueGuides;this.scene.add(this.worldGroup);
      this.crowd=new Crowd(this.worldGroup,560);
      this.selection=new T.Mesh(new T.RingGeometry(.26,.32,32),new T.MeshBasicMaterial({color:0x245e54,side:T.DoubleSide}));this.selection.rotation.x=-Math.PI/2;this.selection.visible=false;this.worldGroup.add(this.selection);
      this.selectedRoute=new T.Line(new T.BufferGeometry(),new T.LineBasicMaterial({color:0xb77c39,transparent:true,opacity:.9}));this.selectedRoute.visible=false;this.selectedRouteKey='';this.worldGroup.add(this.selectedRoute);
      this.leaderSvg=root.document.createElementNS('http://www.w3.org/2000/svg','svg');Object.assign(this.leaderSvg.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none'});this.labels.appendChild(this.leaderSvg);
      this.labelLeaders=this.layout.windows.map(()=>{const line=root.document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('stroke','#829d88');line.setAttribute('stroke-width','1');line.setAttribute('opacity','.55');this.leaderSvg.appendChild(line);return line;});
      this.windowLabels=this.layout.windows.map(w=>{
        const button=root.document.createElement('button');button.type='button';button.className='scene-station-label';button.innerHTML='<b>'+String(w.id+1).padStart(2,'0')+'</b><span>等候 <em>0</em></span><small>空闲</small><i></i>';button.setAttribute('aria-label','查看窗口 '+(w.id+1));button.onclick=e=>{e.stopPropagation();this.selectedId=null;this.options.onSelect?.({type:'window',id:w.id});this.invalidate();};this.labels.appendChild(button);return button;
      });
      this.labels.classList.toggle('many-stations',result.config.windows>10);
      this.closedLabels=this.layout.slots.filter(s=>!s.open).map(slot=>{const label=root.document.createElement('div');label.className='scene-station-label is-closed';label.textContent='未开放';label.setAttribute('aria-label','固定槽位 '+(slot.slotIndex+1)+' 未开放');this.labels.appendChild(label);return {slot,label};});
      this.sign=root.document.createElement('div');this.sign.className='scene-sign';this.sign.textContent=(this.layout.twoSided?'两侧窗口 · 中间座位 · 全窗通用':this.layout.zoned?'分区展开示意 · '+this.layout.zones.length+' 个服务区':(result.config.mode==='school'?'高中分批就餐 · 同类套餐区':'固定场地'))+' · 开放 '+result.config.windows+' / 16 个窗口';Object.assign(this.sign.style,{left:'12px',top:'12px',color:'#426d58',background:'#f5faf2e8',padding:'6px 10px',borderRadius:'8px',fontSize:'11px',letterSpacing:'0',textShadow:'none'});this.labels.appendChild(this.sign);
      this.entryLabel=root.document.createElement('div');this.entryLabel.className='scene-wayfinding entrance';this.entryLabel.textContent=this.layout.twoSided?'前侧进出':'↑ 入场';this.labels.appendChild(this.entryLabel);
      this.exitLabel=root.document.createElement('div');this.exitLabel.className='scene-wayfinding exit';this.exitLabel.textContent=this.layout.twoSided?'后侧进出':(result.config.mode==='school'&&result.config.diningEnabled?({classroom:'返教室',dormitory:'返宿舍',gate:'往校门'}[result.config.returnDestination]||'返教室'):'离场')+' ↓';this.labels.appendChild(this.exitLabel);
      this.poolLabel=root.document.createElement('div');this.poolLabel.className='scene-pool-label';this.poolLabel.hidden=!this.layout.pooled||this.layout.zonePools;this.labels.appendChild(this.poolLabel);
      this.zoneQueueLabels=this.layout.zonePools?this.layout.zones.map(zone=>{const label=root.document.createElement('div');label.className='scene-pool-label';label.title=zone.name;label.style.fontSize='10px';label.style.borderLeft='3px solid #'+zoneColors[zone.id%4].toString(16);this.labels.appendChild(label);return label;}):[];
      this.zoneBanner=root.document.createElement('div');this.zoneBanner.className='scene-zone-banner';Object.assign(this.zoneBanner.style,{position:'absolute',left:'12px',top:'46px',display:'flex',gap:'5px',flexWrap:'wrap',maxWidth:'calc(100% - 24px)',pointerEvents:'none'});this.zoneBanner.hidden=!this.layout.zoned;this.labels.appendChild(this.zoneBanner);
      this.gradeBanner=root.document.createElement('div');this.gradeBanner.className='scene-grade-banner';Object.assign(this.gradeBanner.style,{position:'absolute',left:'12px',bottom:'12px',display:'flex',gap:'6px',flexWrap:'wrap',maxWidth:'calc(100% - 24px)',pointerEvents:'none'});this.gradeBanner.hidden=result.config.mode!=='school';this.labels.appendChild(this.gradeBanner);
      this.diningLabel=root.document.createElement('div');this.diningLabel.className='scene-pool-label';this.diningLabel.hidden=!(result.config.mode==='school'&&result.config.diningEnabled);this.labels.appendChild(this.diningLabel);
      this.seatWaitLabel=root.document.createElement('div');this.seatWaitLabel.className='scene-pool-label';this.seatWaitLabel.hidden=this.diningLabel.hidden;this.labels.appendChild(this.seatWaitLabel);
      const b=this.layout.bounds,shadow=this.sun.shadow.camera;const extent=Math.max(b.width,b.depth);shadow.left=-extent*.72;shadow.right=extent*.72;shadow.top=extent*.72;shadow.bottom=-extent*.72;shadow.near=.1;shadow.far=extent*4;this.sun.position.set(-18,extent, this.layout.floorCenter[2]-extent*.5);shadow.updateProjectionMatrix();this.sun.target.position.set(...this.layout.floorCenter);
      this.lastVisualTime=null;this.selectedId=null;this.setCamera(this.preset);this.resize();
    }
    setCamera(name) {
      if(!this.layout)return;this.preset=name;this.camera.zoom=1;
      const center=new T.Vector3(...this.layout.floorCenter);center.y=.6;this.controls.target.copy(center);
      const distance=Math.max(this.layout.bounds.width,this.layout.bounds.depth)*1.7;this.camera.far=distance*4;this.camera.updateProjectionMatrix();
      const directions={perspective:new T.Vector3(.54,1.8,1.58),top:new T.Vector3(0,1,.055),front:new T.Vector3(0,.65,1.4)};
      const dir=(directions[name]||directions.perspective).normalize();this.camera.position.copy(center).addScaledVector(dir,distance);this.camera.lookAt(center);this.controls.update();this.fit();this.invalidate();
    }
    fit() {
      if(!this.layout)return;const width=this.host.clientWidth||900,height=this.host.clientHeight||620,aspect=width/height;
      this.camera.updateMatrixWorld();const inv=this.camera.matrixWorldInverse;let halfX=0,halfY=0;const b=this.layout.bounds;
      for(const x of [b.minX-2,b.maxX+2])for(const z of [b.minZ-1.7,b.maxZ+1.8])for(const y of [-.65,3.7]){const v=new T.Vector3(x,y,z).applyMatrix4(inv);halfX=Math.max(halfX,Math.abs(v.x));halfY=Math.max(halfY,Math.abs(v.y));}
      this.halfHeight=Math.max(halfY,halfX/aspect)*1.05;this.camera.left=-this.halfHeight*aspect;this.camera.right=this.halfHeight*aspect;this.camera.top=this.halfHeight;this.camera.bottom=-this.halfHeight;this.camera.updateProjectionMatrix();
    }
    resize() {const width=this.host.clientWidth||900,height=this.host.clientHeight||620;this.renderer.setSize(width,height,false);this.width=width;this.height=height;this.fit();this.invalidate();}
    zoom(factor) {this.camera.zoom=min(this.camera.zoom*factor,this.controls.minZoom,this.controls.maxZoom);this.camera.updateProjectionMatrix();this.invalidate();this.notifyCamera();}
    getCameraPose() {return {position:this.camera.position.toArray(),target:this.controls.target.toArray(),zoom:this.camera.zoom,preset:this.preset};}
    notifyCamera() {if(this.layout&&!this.silentCamera)this.options.onCameraPoseChange?.(this.getCameraPose());}
    applyCameraPose(pose,options={}) {
      if(!pose||!['position','target'].every(k=>Array.isArray(pose[k])&&pose[k].length===3&&pose[k].every(Number.isFinite))||!Number.isFinite(pose.zoom)||pose.zoom<=0)throw new TypeError('镜头姿态必须包含有限 position、target 和 zoom');
      this.silentCamera++;const damping=this.controls.enableDamping;this.controls.enableDamping=false;this.controls.update();
      this.camera.position.fromArray(pose.position);this.controls.target.fromArray(pose.target);this.camera.zoom=min(pose.zoom,this.controls.minZoom,this.controls.maxZoom);this.preset=pose.preset||this.preset;this.camera.lookAt(this.controls.target);this.controls.update();this.controls.enableDamping=damping;this.fit();this.silentCamera--;this.invalidate();
      if(options.silent===false)this.notifyCamera();
    }
    setActive(active) {this.active=active;if(active){this.resize();this.invalidate();}else if(this.frameHandle){root.cancelAnimationFrame(this.frameHandle);this.frameHandle=0;}}
    framePeople(frame) {
      const people=frame.visiblePeople.concat(frame.visibleDiningPeople||[],frame.departures);
      if(this.selectedId!==null&&!people.some(p=>p.id===this.selectedId)) {
        const person=frame.people.concat(frame.diningPeople||[],frame.departures).find(p=>p.id===this.selectedId);
        if(person) {
          const copy={...person,position:person.position.slice()};
          if(person.state==='dining') {
            const s=this.result.students.find(s=>s.id===person.id),seat=this.layout.displaySeats.find(seat=>seat.id===s.displaySeatId);
            if(seat){copy.position=seat.position.slice();copy.yaw=seat.yaw;}
          }
          people.push(copy);
        }
      }
      return people;
    }
    selectStudent(id) {
      const s=this.result?.students.find(s=>s.id===id);if(!s)return;
      this.selectedId=id;
      if(this.journeyTrace){this.worldGroup.remove(this.journeyTrace);this.journeyTrace.geometry.dispose();this.journeyTrace.material.dispose();this.journeyTrace.dispose();}
      const first=root.CanteenSceneState.frame(this.result,s.arrival,this.layout).people.find(p=>p.id===id);
      const window=this.layout.windows[s.window],entry=first?.arrivalPath||root.CanteenSceneState.arrivalRoute(this.layout,{id,window:s.window,state:'serving',position:window.servicePosition||[window.x,0,this.layout.serviceZ]});
      const queue=first?.queuePath?first.queuePath.slice(0,first.slotIndex).reverse():[];
      const seat=this.layout.displaySeats.find(seat=>seat.id===s.displaySeatId);
      const routes=[entry.concat(queue,[window.servicePosition||[window.x,0,this.layout.serviceZ]]),...(s.seatQueueArrival>s.end?[s.approachRoute]:[]),s.seatRoute,seat?root.CanteenSceneState.returnRoute(this.layout,seat):[]].filter(Boolean);
      const segments=[];routes.forEach(route=>route.slice(1).forEach((end,i)=>{if(Math.hypot(end[0]-route[i][0],end[2]-route[i][2])>.01)segments.push([route[i],end]);}));
      this.journeyTrace=new T.InstancedMesh(new T.CylinderGeometry(1,1,1,8),new T.MeshBasicMaterial({color:0xc08a3c,transparent:true,opacity:.82}),segments.length);
      const object=new T.Object3D(),up=new T.Vector3(0,1,0),direction=new T.Vector3();
      segments.forEach(([a,b],i)=>{direction.set(b[0]-a[0],0,b[2]-a[2]);const length=direction.length();object.position.set((a[0]+b[0])/2,.12,(a[2]+b[2])/2);object.quaternion.setFromUnitVectors(up,direction.normalize());object.scale.set(.035,length,.035);object.updateMatrix();this.journeyTrace.setMatrixAt(i,object.matrix);});
      this.journeyTrace.name='所选学生就餐轨迹';this.worldGroup.add(this.journeyTrace);this.invalidate();
    }
    update(frame,options={}) {
      this.data=frame;this.playing=!!options.playing;this.timeScale=Number.isFinite(options.timeScale)&&options.timeScale>0?options.timeScale:.25;
      const seek=this.lastVisualTime===null||frame.visualTime<this.lastVisualTime||Math.abs(frame.visualTime-this.lastVisualTime)>.7||!this.playing;
      const items=this.framePeople(frame),seen=new Set(),groups=new Map(frame.queueGroups.map(q=>[q.id,q]));
      items.forEach(person=>{
        seen.add(person.id);let point=this.positions.get(person.id);const target=person.position;
        if(!point||seek) {
          point={position:target.slice(),target:target.slice(),moving:false,yaw:person.yaw,travelled:person.routeDistance||0,route:[],cursor:0,speed:3,person};
          const group=groups.get(person.queueId),isNew=!seek&&person.arrival>this.lastVisualTime&&person.arrival<=frame.visualTime;
          // A compressed event replay can skip extremely short stages. Only
          // a truly new visible queue tail walks in; resampled older students
          // retain their exact queue position and never respawn at the entrance.
          if(isNew&&person.state==='waiting'&&person.queueIndex===group?.count-1&&(person.start-frame.time)/this.timeScale>.4) {
            point.position=person.arrivalPath[0].slice();point.route=person.arrivalPath.map(p=>p.slice());point.cursor=1;point.phase='entering';
            const duration=Math.max(.35,Math.min(3,(person.start-frame.time)/this.timeScale*.65));
            point.speed=root.CanteenSceneState.samplePath(point.route,1).length/duration;point.moving=true;
          }
          this.positions.set(person.id,point);
        } else if(person.state==='departing'||person.state==='returning'||person.state==='walking-to-seat'||person.state==='walking-to-wait'||person.state==='sitting') {
          // Arc-length route position is determined by simulation time. Never
          // interpolate diagonally across a turn or let a completed avatar
          // remain at a window after the numerical frame has moved on.
          point.position=target.slice();point.target=target.slice();point.route=[];point.cursor=0;point.phase=person.state;point.yaw=person.yaw;point.travelled=person.routeDistance||0;point.moving=this.playing&&person.state!=='sitting';
        } else {
          const previous=point.person;point.target=target.slice();
          if(person.state==='dining'||person.state==='seat-waiting') {
            // Seat allocation is a logical capacity model: show the exact
            // occupied representative seat at the recorded event time.
            point.position=target.slice();point.route=[];point.cursor=0;point.phase=person.state;point.yaw=person.yaw;
          }
          if(previous?.state==='waiting'&&person.state==='serving') {
            const path=previous.queuePath||[],head=path[0]||point.position,lane=this.layout.circulation;
            point.route=[point.position.slice(),...path.slice(0,Math.max(0,previous.slotIndex)).reverse().map(p=>p.slice()),head.slice(),...(this.layout.twoSided?[]:[[head[0],0,lane.frontZ],[target[0],0,lane.frontZ]]),target.slice()];
            point.cursor=1;point.phase='handoff';const length=root.CanteenSceneState.samplePath(point.route,1).length;
            point.speed=length/Math.max(.2,Math.min(1.2,(person.end-frame.time)/this.timeScale*.5));
          } else if(person.state==='waiting'&&point.phase!=='entering') {
            const changed=Math.hypot(target[0]-point.targetAtLastUpdate?.[0]||0,target[2]-point.targetAtLastUpdate?.[2]||0)>.0001;
            if(changed) {
              const sameShape=previous?.queuePath?.[0]?.[0]===person.queuePath?.[0]?.[0];
              if(sameShape&&previous?.slotIndex>=person.slotIndex&&previous?.queueId===person.queueId) {
                const route=person.queuePath.slice(person.slotIndex,previous.slotIndex).reverse().map(p=>p.slice());
                point.route=[point.position.slice(),...route,target.slice()];point.cursor=1;point.phase='advancing';point.speed=3.2;
              } else {
                // A group may be repacked when its representative quota gains
                // a column. This is a display reflow, not a pedestrian journey.
                point.position=target.slice();point.route=[];point.cursor=0;point.phase=null;point.yaw=person.yaw;
              }
            }
          }
          point.person=person;
        }
        point.person=person;point.target=target.slice();point.targetAtLastUpdate=target.slice();
      });
      for(const id of this.positions.keys())if(!seen.has(id))this.positions.delete(id);
      frame.windows.forEach((w,i)=>{
        const zoneState=frame.zoneStates[w.zone];
        const label=this.windowLabels[i],station=this.stations[i],load=frame.pooled?(zoneState?zoneState.waiting/Math.max(1,zoneState.windowCount):frame.counts.waiting/frame.windows.length):w.waiting;
        const color=load>=40?0xc49349:(load>=15?0xabc179:0x6fb391);
        label.classList.toggle('is-busy',w.serving===1);label.classList.toggle('is-congested',load>=40);
        label.querySelector('em').textContent=frame.pooled?(w.serving?'取餐':'空闲'):w.waiting;
        label.querySelector('span').firstChild.textContent=frame.pooled?'':'等候 ';
        const school=this.result.config.mode==='school',owner=school?this.result.config.windowOwners?.[i]:null;
        const ownerText=school&&this.result.config.allocation!=='shared'?this.result.config.grades[owner]?.name+' · ':'';
        const beforeOpen=school&&frame.time<this.result.config.serviceStart;
        label.querySelector('small').textContent=(this.layout.zoned?'区'+(w.zone+1)+' · ':'')+ownerText+(beforeOpen?'待开餐':(w.serving?'取餐 '+Math.round(w.progress*100)+'%':'空闲'));
        label.querySelector('i').style.setProperty('--progress',(w.progress*100)+'%');
        label.title='窗口 '+(i+1)+(this.layout.zoned?' · '+w.zoneName:'')+' · '+(w.serving?'正在为学生 '+(w.currentStudent+1)+' 取餐 · 进度 '+Math.round(w.progress*100)+'%':'空闲')+(frame.pooled?'':' · 等候 '+w.waiting+' 人');
        station.ring.visible=!!w.serving;station.ring.material.color.setHex(color);station.status.material.color.setHex(color);station.status.material.emissive.setHex(color);station.status.material.emissiveIntensity=w.serving?.65:.06;
        station.progress.scale.x=Math.max(.001,w.progress);station.progress.position.x=-.83+.83*w.progress;station.progress.visible=!!w.serving;
        station.chefArm.rotation.x=w.serving?-.3-Math.sin(w.progress*Math.PI*2)*.22:0;
      });
      frame.queueGroups.forEach((q,i)=>{
        const guide=this.queueGuides[i];if(!guide)return;const attribute=guide.geometry.attributes.position;
        q.path.forEach((p,j)=>attribute.setXYZ(j,p[0],.083,p[2]));attribute.needsUpdate=true;guide.geometry.setDrawRange(0,q.visibleCount);guide.geometry.computeBoundingSphere();
        guide.material.color.setHex(q.cohort!==null&&q.cohort!==undefined?cohorts[q.cohort%3]:(this.layout.zoned?zoneColors[q.zone%4]:(q.count>=40?0xba9f62:0x9eb793)));
      });
      this.poolLabel.textContent=(this.layout.gradePools?'按年级候餐':'统一队列')+' · '+frame.counts.centralQueue+' 人';
      this.zoneBanner.replaceChildren();
      if(this.layout.zoned)frame.zoneStates.forEach((zone,i)=>{
        const badge=root.document.createElement('span');Object.assign(badge.style,{background:'#ffffffed',color:'#304a41',borderLeft:'3px solid #'+zoneColors[i%4].toString(16),borderRadius:'5px',padding:'4px 6px',fontSize:'10px'});
        const physical=frame.physicalSeatStates[i];
        badge.style.whiteSpace='pre-line';badge.style.lineHeight='1.45';
        badge.textContent=zone.name+' · '+zone.windowCount+' 窗 · 排队 '+zone.waiting+'\n座位使用 '+(physical?physical.dining:zone.dining)+' / '+zone.seats;badge.title=zone.name+'；餐品人数按取餐资格统计，座位人数按实际就座位置统计';this.zoneBanner.appendChild(badge);
        const label=this.zoneQueueLabels[i];if(label){label.hidden=zone.waiting===0;label.textContent='区'+(i+1)+(this.layout.gradePools?' 年级队列':' 候餐')+' · '+zone.waiting+' 人';const groups=frame.queueGroups.filter(q=>q.zone===i);label.scenePosition=[(Math.min(...groups.map(q=>q.bounds.minX))+Math.max(...groups.map(q=>q.bounds.maxX)))/2,.14,8.7];}
      });
      if(this.result.config.mode==='school') {
        this.gradeBanner.replaceChildren();
        this.result.config.grades.forEach((grade,i)=>{
          const members=this.result.students.filter(s=>s.cohort===i),released=members.filter(s=>(s.releaseTime??s.release??grade.releaseTime)<=frame.time).length;
          const arrived=members.filter(s=>s.arrival<=frame.time).length,complete=members.filter(s=>s.end<=frame.time).length;
          const badge=root.document.createElement('span');Object.assign(badge.style,{background:['#e5eff6ee','#f8e8e1ee','#f7efd9ee'][i],color:'#304a41',border:'1px solid '+['#88aecd','#d8a18b','#d9bd74'][i],borderRadius:'7px',padding:'5px 7px',fontSize:'10px'});
          badge.textContent=grade.name+' · '+(released?('放行 '+released+' / 到达 '+arrived+' / 取餐 '+complete):'尚未放行');this.gradeBanner.appendChild(badge);
        });
        this.diningLabel.textContent='就座 '+frame.counts.dining+' / '+this.result.config.seats+' 人';
        const capacity=this.result.config.seatWaitingCapacity,assessed=capacity!==null&&capacity!==undefined;
        this.seatWaitLabel.textContent='端盘步行 '+(frame.counts.walkingToSeat||0)+' 人 · 等座 '+frame.counts.seatWaiting+' 人';
        this.seatWaitLabel.style.color=assessed&&frame.counts.seatWaiting>capacity?'#923e2e':'';
        this.seatWaitLabel.title='等座容量只作诊断；当前动画未模拟等座对窗口的反向阻塞。';
      }
      this.lastVisualTime=frame.visualTime;this.invalidate();
    }
    placeLabel(el,position,offset=0) {
      this.projectPoint.set(...position).project(this.camera);const x=(this.projectPoint.x*.5+.5)*this.width,y=(-this.projectPoint.y*.5+.5)*this.height+offset;
      el.style.transform='translate('+x.toFixed(1)+'px,'+y.toFixed(1)+'px) translate(-50%,-100%)';el.style.visibility=(this.projectPoint.z<-1||this.projectPoint.z>1||x<-30||x>this.width+30||y<-30||y>this.height+30)?'hidden':'';
    }
    placeStationLabels() {
      if(this.layout.twoSided) {
        for(const side of [-1,1]) {
          const anchors=this.layout.windows.map((w,i)=>({w,i})).filter(a=>Math.sign(a.w.x)===side).map(a=>{
            this.projectPoint.set(a.w.x,2.22,a.w.z).project(this.camera);
            return {...a,x:(this.projectPoint.x*.5+.5)*this.width,y:(-this.projectPoint.y*.5+.5)*this.height};
          }).sort((a,b)=>a.y-b.y);
          if(!anchors.length)continue;
          const labelSide=anchors.reduce((n,a)=>n+a.x,0)/anchors.length<this.width/2?-1:1;
          const compact=this.width<700,height=compact?24:29,gap=compact?29:39,span=(anchors.length-1)*gap;
          const centerY=anchors.reduce((sum,a)=>sum+a.y,0)/anchors.length;
          const top=min(centerY-span/2,45,Math.max(45,this.height-25-span));
          anchors.forEach((a,index)=>{
            const label=this.windowLabels[a.i],x=labelSide<0?(compact?22:58):this.width-(compact?22:58),y=top+index*gap;
            label.querySelector('small').hidden=true;
            label.style.transform='translate('+x.toFixed(1)+'px,'+y.toFixed(1)+'px) translate(-50%,-100%)';label.style.visibility='';
            const leader=this.labelLeaders[a.i];leader.setAttribute('x1',a.x);leader.setAttribute('y1',a.y);leader.setAttribute('x2',x);leader.setAttribute('y2',y);
          });
        }
        this.closedLabels.forEach(({label})=>{label.hidden=true;});return;
      }
      const compact=this.width<700,anchors=this.layout.windows.map((w,i)=>{
        this.projectPoint.set(w.x,2.22,-4.5).project(this.camera);
        const label=this.windowLabels[i];label.querySelector('small').hidden=compact;
        return {i,x:(this.projectPoint.x*.5+.5)*this.width,y:(-this.projectPoint.y*.5+.5)*this.height,label};
      }).sort((a,b)=>a.x-b.x);
      const labelWidth=Math.max(52,...anchors.map(a=>a.label.offsetWidth||56)),labelHeight=Math.max(compact?30:60,...anchors.map(a=>a.label.offsetHeight||0));
      const rawSpan=anchors.length>1?anchors.at(-1).x-anchors[0].x:0;
      const span=Math.min(Math.max(0,this.width-labelWidth-20),Math.max(rawSpan,(anchors.length-1)*26));
      const center=anchors.length?(anchors[0].x+anchors.at(-1).x)/2:this.width/2;
      const left=min(center-span/2,labelWidth/2+6,Math.max(labelWidth/2+6,this.width-labelWidth/2-span-6));
      const separation=anchors.length>1?span/(anchors.length-1):labelWidth+8;
      const rows=Math.max(1,Math.min(anchors.length,Math.ceil((labelWidth+7)/Math.max(separation,1))));
      const anchorY=anchors.length?Math.min(...anchors.map(a=>a.y))-6:80;
      // Reserve the actual wrapped banner height before placing clickable labels.
      // A fixed 46px margin lets the zone badges cover windows on small screens.
      const bannerBottom=this.zoneBanner.hidden?46:this.zoneBanner.offsetTop+this.zoneBanner.offsetHeight+8;
      const bottom=Math.max(anchorY,bannerBottom+labelHeight+(rows-1)*(labelHeight+7));
      anchors.forEach((a,index)=>{
        const x=anchors.length>1?left+index*separation:min(a.x,labelWidth/2+6,this.width-labelWidth/2-6);
        const y=bottom-(index%rows)*(labelHeight+7),leader=this.labelLeaders[a.i];
        a.label.style.transform='translate('+x.toFixed(1)+'px,'+y.toFixed(1)+'px) translate(-50%,-100%)';a.label.style.visibility='';
        leader.setAttribute('x1',a.x.toFixed(1));leader.setAttribute('y1',a.y.toFixed(1));leader.setAttribute('x2',x.toFixed(1));leader.setAttribute('y2',y.toFixed(1));
      });
      this.closedLabels.forEach(({slot,label})=>{label.hidden=this.width<950;this.placeLabel(label,[slot.x,2.14,-4.5],-3);});
    }
    renderNow(now) {
      if(!this.result)return;const time=Number.isFinite(now)?now:(root.performance?.now()||0),dt=Math.min(Math.max((time-this.lastNow)/1000,0),.06);this.lastNow=time;
      this.controls.update();let moving=false;
      this.positions.forEach(point=>{
        if(point.person.state==='departing'||point.person.state==='returning'){point.moving=this.playing;return;}
        point.moving=false;
        if(this.playing&&point.cursor<point.route.length) {
          let budget=point.speed*dt;
          while(budget>0&&point.cursor<point.route.length) {
            const goal=point.route[point.cursor],dx=goal[0]-point.position[0],dz=goal[2]-point.position[2],distance=Math.hypot(dx,dz);
            if(distance<.0001){point.cursor++;continue;}
            const advance=Math.min(budget,distance);point.position[0]+=dx/distance*advance;point.position[2]+=dz/distance*advance;point.travelled+=advance;budget-=advance;
            const desired=Math.atan2(dx,dz),difference=Math.atan2(Math.sin(desired-point.yaw),Math.cos(desired-point.yaw));point.yaw+=difference*Math.min(1,dt*16);
            if(advance>=distance-.0001)point.cursor++;
          }
          point.moving=point.cursor<point.route.length;moving=moving||point.moving;
          if(!point.moving){point.position=point.target.slice();point.route=[];point.cursor=0;point.phase=null;point.yaw=point.person.yaw;}
        } else if(!this.playing){point.position=point.target.slice();point.yaw=point.person.yaw;}
      });
      if(this.data){
        this.crowd.update(this.framePeople(this.data),this.data.visualTime,this.positions,this.selectedId);
        if(this.journeyTrace)this.journeyTrace.visible=this.selectedId!==null;
        const point=this.positions.get(this.selectedId);this.selection.visible=!!point;
        if(point)this.selection.position.set(point.position[0],.086,point.position[2]);
        const route=point?.person?.route,show=route&&route.length>1;
        this.selectedRoute.visible=!!show;
        if(show){const key=this.selectedId+':'+point.person.state;
          if(key!==this.selectedRouteKey){this.selectedRoute.geometry.dispose();this.selectedRoute.geometry=new T.BufferGeometry().setFromPoints(route.map(p=>new T.Vector3(p[0],.09,p[2])));this.selectedRouteKey=key;}
        }else this.selectedRouteKey='';
      }
      this.camera.updateMatrixWorld();this.scene.updateMatrixWorld(true);
      this.placeStationLabels();
      this.placeLabel(this.entryLabel,this.layout.twoSided?this.layout.entries[0]:[this.layout.entry[0],.02,17.8]);this.placeLabel(this.exitLabel,this.layout.twoSided?this.layout.entries[1]:[this.layout.exit[0],.02,17.8]);this.placeLabel(this.poolLabel,[0,.14,8.7]);
      // Short, nearly empty queues can be closer than a readable label width.
      // Move colliding zone captions to separate rows without moving avatars.
      const zoneCaptionBoxes=[];
      this.zoneQueueLabels.forEach(label=>{
        if(label.hidden||!label.scenePosition)return;
        this.projectPoint.set(...label.scenePosition).project(this.camera);
        const x=(this.projectPoint.x*.5+.5)*this.width,y=(-this.projectPoint.y*.5+.5)*this.height,w=Math.max(128,label.textContent.length*10+20);
        let row=0;
        while(zoneCaptionBoxes.some(b=>Math.abs(b.x-x)<(b.w+w)/2+5&&Math.abs(b.y-(y-row*25))<24))row++;
        this.placeLabel(label,label.scenePosition,-row*25);zoneCaptionBoxes.push({x,y:y-row*25,w});
      });
      this.placeLabel(this.diningLabel,[0,.14,this.layout.twoSided?this.layout.floorCenter[2]:13.5]);this.placeLabel(this.seatWaitLabel,[this.layout.twoSided?-9.4:-19.4,.14,10]);
      this.renderer.render(this.scene,this.camera);if(moving&&this.playing)this.invalidate();
    }
    invalidate() {if(this.active&&!this.frameHandle)this.frameHandle=root.requestAnimationFrame(now=>{this.frameHandle=0;this.renderNow(now);});}
    studentAt(event) {
      if(!this.crowd)return null;
      const rect=this.renderer.domElement.getBoundingClientRect();
      this.pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
      this.camera.updateMatrixWorld();this.scene.updateMatrixWorld(true);
      this.raycaster.setFromCamera(this.pointer,this.camera);
      // Non-sparse body parts share the same instance-to-student index.
      const parts=Object.entries(this.crowd.parts).filter(([name])=>name!=='shadow'&&!this.crowd.sparse.has(name)).map(([,mesh])=>mesh);
      const hits=this.raycaster.intersectObjects(parts,false);
      return hits.length?(this.crowd.items[hits[0].instanceId]?.id??null):null;
    }
    pick(event,pressedId=null) {
      const id=pressedId??this.studentAt(event);
      if(id!==null){this.selectStudent(id);this.options.onSelect?.({type:'student',id});this.invalidate();}
    }
    clearSelection(){this.selectedId=null;this.invalidate();}
    getPickTargets(){
      if(!this.crowd)return [];
      const matrix=new T.Matrix4(),point=new T.Vector3();
      return this.crowd.items.slice(0,12).map((p,i)=>{this.crowd.parts.head.getMatrixAt(i,matrix);point.setFromMatrixPosition(matrix).applyMatrix4(this.crowd.parts.head.matrixWorld).project(this.camera);const head={id:p.id,x:(point.x*.5+.5)*this.width,y:(-.5*point.y+.5)*this.height};this.crowd.parts.leftShin.getMatrixAt(i,matrix);point.setFromMatrixPosition(matrix).applyMatrix4(this.crowd.parts.leftShin.matrixWorld).project(this.camera);return {...head,legX:(point.x*.5+.5)*this.width,legY:(-.5*point.y+.5)*this.height};});
    }
    dispose(){this.setActive(false);this.observer?.disconnect();root.removeEventListener('resize',this.resizeHandler);this.controls.dispose();this.disposeWorld();this.environmentTarget?.dispose();this.renderer.dispose();this.renderer.domElement.remove();this.labels.remove();}
  }
  root.Canteen3D=Object.freeze({VERSION:'1.6.0',View,createWorld:world});
})(typeof window!=='undefined'?window:globalThis);
