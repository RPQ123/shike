/* Instanced, articulated students. Positions and states remain event-driven. */
(() => {
  'use strict';
  const T=window.THREE,shirts=[0x277f68,0xe68b50,0x5c91bf],skins=[0xe5bb97,0xd9ac87,0xecc7a8,0xc99b77,0xe3b795];
  const material=(color)=>new T.MeshLambertMaterial({color});
  class DiningPeople {
    constructor(parent,capacity=560){
      this.group=new T.Group();this.group.name='学生动态实例';parent.add(this.group);this.capacity=capacity;this.parts={};this.items=[];
      this.base=new T.Object3D();this.local=new T.Object3D();this.matrix=new T.Matrix4();this.color=new T.Color();
      this.sparse=new Set(['ponytail','bag','tray','bowl','food']);this.sparseCounts={};
      const add=(key,geometry,mat,shadow=false)=>{const mesh=new T.InstancedMesh(geometry,mat,capacity);mesh.name='学生部件-'+key;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.count=0;mesh.frustumCulled=false;mesh.castShadow=shadow;mesh.receiveShadow=true;this.group.add(mesh);this.parts[key]=mesh;};
      const fabric=material(0xffffff),skin=material(0xffffff),navy=material(0x33434c),hair=material(0x342e29),white=material(0xf5f3e9),shoe=material(0x343b37);
      add('body',new T.CylinderGeometry(.18,.155,.43,8),fabric,true);
      add('hips',new T.BoxGeometry(.28,.16,.20),navy);
      add('head',new T.SphereGeometry(.131,12,8),skin,true);
      add('hair',new T.SphereGeometry(.136,12,6,0,Math.PI*2,0,Math.PI*.56),hair);
      add('ponytail',new T.SphereGeometry(.085,8,6),hair);
      add('neck',new T.CylinderGeometry(.055,.055,.10,7),skin);
      add('collar',new T.BoxGeometry(.16,.035,.13),white);
      for(const side of ['left','right']){
        add(side+'Arm',new T.CapsuleGeometry(.049,.19,2,6),fabric);
        add(side+'Forearm',new T.CapsuleGeometry(.042,.19,2,6),skin);
        add(side+'Hand',new T.SphereGeometry(.049,7,5),skin);
        add(side+'Leg',new T.CapsuleGeometry(.065,.27,2,6),navy);
        add(side+'Shin',new T.CapsuleGeometry(.053,.29,2,6),navy);
        add(side+'Shoe',new T.BoxGeometry(.12,.085,.235),shoe);
        add(side+'Sole',new T.BoxGeometry(.123,.024,.239),white);
      }
      add('bag',new T.BoxGeometry(.22,.30,.13),material(0x566d61));
      add('tray',new T.BoxGeometry(.40,.025,.28),material(0xd8e2d7,.43));
      add('bowl',new T.SphereGeometry(.085,10,5,0,Math.PI*2,0,Math.PI*.5),white);
      add('food',new T.CylinderGeometry(.055,.055,.015,9),material(0xd4a768));
      add('shadow',new T.CircleGeometry(.22,16),new T.MeshBasicMaterial({color:0x4a5849,transparent:true,opacity:.14,depthWrite:false,side:T.DoubleSide}));
    }
    transform(part,index,position,rotation=[0,0,0],scale=[1,1,1]){
      if(this.sparse.has(part)){if(!scale[0]||!scale[1]||!scale[2])return;index=this.sparseCounts[part]++;}
      this.local.position.set(...position);this.local.rotation.set(...rotation);this.local.scale.set(...scale);this.local.updateMatrix();this.matrix.multiplyMatrices(this.base.matrix,this.local.matrix);this.parts[part].setMatrixAt(index,this.matrix);
    }
    update(items,time,positions,selectedId){
      this.items=items.slice(0,this.capacity);
      for(const key of this.sparse)this.sparseCounts[key]=0;
      this.items.forEach((p,i)=>{
        const data=positions?.get(p.id),pos=data?.position||p.position,sit=p.state==='dining'?1:(p.sitProgress||0);
        const walking=['departing','returning','walking-to-seat','walking-to-wait'].includes(p.state)||!!data?.moving;
        const phase=(data?.travelled??p.routeDistance??0)*6.4+p.id*.36,step=walking?Math.sin(phase)*.39:0,bob=walking?Math.abs(Math.sin(phase))*.018:0;
        const size=.94+(p.id%9)*.008;
        this.base.position.set(pos[0],pos[1]+.072+bob,pos[2]);this.base.rotation.set(0,data?.yaw??p.yaw,0);this.base.scale.setScalar(size);this.base.updateMatrix();
        this.color.setHex(shirts[p.cohort%3]);if(selectedId===p.id)this.color.lerp(new T.Color(0xffffff),.32);
        for(const key of ['body','leftArm','rightArm'])this.parts[key].setColorAt(i,this.color);
        this.color.setHex(skins[p.id%skins.length]);for(const key of ['head','neck','leftForearm','rightForearm','leftHand','rightHand'])this.parts[key].setColorAt(i,this.color);
        const drop=.42*sit,bodyY=1.14-drop,headY=1.62-drop;
        this.transform('body',i,[0,bodyY,0],[0,0,0],[1,1,1]);this.transform('hips',i,[0,.84-.51*sit,.015]);
        this.transform('neck',i,[0,1.43-drop,0]);this.transform('collar',i,[0,1.36-drop,.025]);
        const eating=p.state==='dining'?Math.sin(time*12+p.id)*.035:0;
        this.transform('head',i,[0,headY,.014],[eating,0,0]);this.transform('hair',i,[0,headY+.025,-.016],[0,0,p.id%3===0?-.05:0]);
        this.transform('ponytail',i,[0,headY-.025,-.14],[.2,0,0],p.id%4===0?[.75,1.5,.7]:[0,0,0]);
        const receiving=p.state==='serving',hasTray=['departing','seat-waiting','walking-to-seat','walking-to-wait','sitting','dining'].includes(p.state)||(receiving&&p.serviceProgress>.32);
        const reach=receiving?Math.sin(Math.min(1,p.serviceProgress/.8)*Math.PI)*.12:0;
        for(const [name,side] of [['left',-1],['right',1]]){
          const swing=step*side,shoulder=1.23-drop;
          this.transform(name+'Arm',i,[side*.205,shoulder-.09,hasTray?.035:0],[hasTray?-.28-reach:swing,0,side*.08]);
          this.transform(name+'Forearm',i,[side*.205,shoulder-.25,hasTray?.18:Math.sin(swing)*.15],[hasTray?-1.30+eating:swing-.12,0,0]);
          this.transform(name+'Hand',i,[side*.205,shoulder-.29,hasTray?.31:Math.sin(swing)*.27],[0,0,0]);
          const thighAngle=-Math.PI/2*sit+swing*(1-sit),kneeZ=.40*sit-Math.sin(swing)*.18*(1-sit);
          this.transform(name+'Leg',i,[side*.085,.63-.30*sit,.20*sit],[thighAngle,0,0]);
          this.transform(name+'Shin',i,[side*.085,.23-.13*sit,kneeZ],[walking?-.28*Math.max(0,-Math.sin(phase)*side)*(1-sit):0,0,0]);
          const footY=.03-.12*sit,footZ=.055+.40*sit-Math.sin(swing)*.25*(1-sit);
          this.transform(name+'Shoe',i,[side*.085,footY,footZ],[0,0,0]);this.transform(name+'Sole',i,[side*.085,footY-.046,footZ]);
        }
        this.transform('bag',i,[0,bodyY,-.19],[0,0,0],p.id%3===0&&!sit?[1,1,1]:[0,0,0]);
        const trayY=.94-.25*sit,trayZ=.37+.16*sit;
        this.transform('tray',i,[0,trayY,trayZ],[0,0,0],hasTray?[1,1,1]:[0,0,0]);
        this.transform('bowl',i,[-.08,trayY+.04,trayZ],[Math.PI,0,0],hasTray?[1,1,1]:[0,0,0]);
        this.transform('food',i,[-.08,trayY+.047,trayZ],[0,0,0],hasTray?[1,1,1]:[0,0,0]);
        this.transform('shadow',i,[0,-.012-pos[1],0],[-Math.PI/2,0,0],[1.05,1.05,1]);
      });
      for(const [key,mesh] of Object.entries(this.parts)){mesh.count=this.sparse.has(key)?this.sparseCounts[key]:this.items.length;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
      for(const [name,mesh] of Object.entries(this.parts))if(name!=='shadow'&&!this.sparse.has(name))mesh.boundingSphere=null;
    }
  }
  window.DiningPeople=DiningPeople;
})();
