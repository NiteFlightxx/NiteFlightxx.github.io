import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { VerletPaperEngine, COLS, ROWS, WIDTH, rowUV } from './VerletPaperEngine';
import { ticketTextures } from './ticketTextures';
import { vertexShader, fragmentShader, cutoutShader } from './foilShader';
import { TicketAudio } from './TicketAudio';

export type StageControls = { flip: () => void; tear: () => void };
type Props = { edition: number; zone: string; dark: boolean; xray: boolean; muted: boolean; issue: number; onProgress: (n: number) => void; controls: React.RefObject<StageControls | null> };

export default function TicketStage({ edition, zone, dark, xray, muted, issue, onProgress, controls }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const settings = useRef({ dark, xray, muted }); settings.current = { dark, xray, muted };
  const progress = useRef(onProgress); progress.current = onProgress;
  useEffect(() => {
    if (!host.current) return;
    const container = host.current;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch { container.dataset.error = '当前浏览器无法启用 WebGL，请开启硬件加速后查看通行证。'; return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.VSMShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, .1, 50);
    camera.position.set(0, .1, 10.7); camera.lookAt(0, -.2, 0);
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(-2, 9, 4); light.castShadow = true;
    light.shadow.mapSize.set(512,512); light.shadow.camera.left=-6; light.shadow.camera.right=6; light.shadow.camera.top=6; light.shadow.camera.bottom=-6;
    light.shadow.normalBias=.03; light.shadow.bias=-.0002; light.shadow.radius=9; light.shadow.blurSamples=16; scene.add(light);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({ color: 0x343a2c, opacity:.2 }));
    floor.rotation.x = -Math.PI/2; floor.position.y=-3.65; floor.receiveShadow=true; scene.add(floor);
    const group = new THREE.Group(); group.rotation.set(.035,-.15,-.105); group.position.y=.14; scene.add(group);
    const engine = new VerletPaperEngine(), audio = new TicketAudio();
    const textures = ticketTextures(edition, zone);
    const torn = new Array(25).fill(0);
    const uniforms = { uFront:{value:textures.front},uBack:{value:textures.back},uMask:{value:textures.mask},uBackMask:{value:textures.backMask},uEdition:{value:edition},uTime:{value:0},uTorn:{value:torn} };
    const material = new THREE.ShaderMaterial({ vertexShader,fragmentShader,uniforms,side:THREE.DoubleSide });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(engine.positions,3).setUsage(THREE.DynamicDrawUsage));
    const uv = new Float32Array(900*2), indices:number[]=[];
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) {
      const i=r*COLS+c; uv[i*2]=c/24; uv[i*2+1]=rowUV(r);
      if(r<ROWS-1 && c<COLS-1 && r!==24) indices.push(i,i+COLS,i+1,i+1,i+COLS,i+COLS+1);
    }
    geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2)); geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry,material); mesh.castShadow=true; mesh.frustumCulled=false; group.add(mesh);
    const depth = new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide});
    depth.onBeforeCompile = shader => {
      shader.uniforms.uTorn=uniforms.uTorn;
      shader.vertexShader = 'varying vec2 cutUv;\n'+shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\ncutUv=uv;');
      shader.fragmentShader='varying vec2 cutUv;\n'+cutoutShader+'\n'+shader.fragmentShader.replace('void main() {','void main() {\nif(shape(cutUv)<.5) discard;');
    }; mesh.customDepthMaterial=depth;
    const latticeGeometry=new THREE.BufferGeometry(), linePositions=new Float32Array(engine.springs.length*6), colors=new Float32Array(engine.springs.length*6);
    latticeGeometry.setAttribute('position',new THREE.BufferAttribute(linePositions,3).setUsage(THREE.DynamicDrawUsage));
    latticeGeometry.setAttribute('color',new THREE.BufferAttribute(colors,3).setUsage(THREE.DynamicDrawUsage));
    const latticeMaterial=new THREE.LineBasicMaterial({vertexColors:true,depthTest:false,transparent:true,opacity:.8});
    const lattice=new THREE.LineSegments(latticeGeometry,latticeMaterial); lattice.renderOrder=5; lattice.frustumCulled=false; group.add(lattice);
    let flip=0, targetX=-.15, targetY=.035, activePointer=-1, mode:'grab'|'slice'|'pull'|null=null, startY=0, startX=0, pullCount=0, lastColumn=-1, animation=0, clock=0, tearing=false, alive=true;
    const mouse=new THREE.Vector2(),raycaster=new THREE.Raycaster();
    const ray = (event:PointerEvent|MouseEvent) => {
      const bounds=renderer.domElement.getBoundingClientRect(); mouse.set((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1);
      raycaster.setFromCamera(mouse,camera); return raycaster.intersectObject(mesh)[0];
    };
    engine.onSnap=(column,count)=> { torn[column]=1; audio.muted=settings.current.muted; audio.snap(column); progress.current(count); if(count===25){audio.verified(); mode=null;container.style.cursor='grab';} };
    const pointerDown=(event:PointerEvent)=> {
      const hit=ray(event); if(!hit?.uv) return;
      audio.unlock(); activePointer=event.pointerId; renderer.domElement.setPointerCapture(event.pointerId);
      startY=event.clientY;startX=event.clientX;pullCount=engine.torn.size;
      const row=hit.uv.y>=.28?Math.round((1-hit.uv.y)/.72*24):25+Math.round((.28-hit.uv.y)/.28*10), col=Math.round(hit.uv.x*24);
      mode=Math.abs(hit.uv.y-.28)<.04 ? 'slice' : row>=25 && !engine.detached ? 'pull':'grab';
      lastColumn=-1;
      if(mode==='slice') { engine.sever(col);lastColumn=col; }
      else { const local=group.worldToLocal(hit.point.clone());engine.grab={vertex:row*25+col,x:local.x,y:local.y,z:local.z+.12}; }
      container.style.cursor=mode==='slice'?'ew-resize':'grabbing';
    };
    const pointerMove=(event:PointerEvent)=> {
      const bounds=renderer.domElement.getBoundingClientRect();
      targetX=-.15+((event.clientX-bounds.left)/bounds.width-.5)*.45;
      targetY=.035+((event.clientY-bounds.top)/bounds.height-.5)*.22;
      if(event.pointerId!==activePointer) return;
      if(mode==='slice') {
        const hit=ray(event);
        // The pointer is projected to the seam plane after cutting, so the newly open gap remains draggable.
        const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0,0,1).applyQuaternion(group.quaternion),group.position);
        const point=new THREE.Vector3(); raycaster.ray.intersectPlane(plane,point); group.worldToLocal(point);
        const col=Math.max(0,Math.min(24,Math.round(((hit?.uv?.x ?? (point.x/WIDTH+.5)))*24)));
        const from=lastColumn<0?col:lastColumn;
        for(let c=Math.min(from,col);c<=Math.max(from,col);c++) engine.sever(c);
        lastColumn=col;
      } else if(engine.grab) {
        const movedX=(event.clientX-startX)/bounds.height*7, movedY=-(event.clientY-startY)/bounds.height*7;
        const i=engine.grab.vertex*3;
        engine.grab.x=engine.rest[i]+movedX;engine.grab.y=engine.rest[i+1]+movedY;engine.grab.z=.3+Math.min(.8,Math.abs(movedX)*.5+Math.abs(movedY)*.3);
        if(mode==='pull' && event.clientY>startY+12) {
          const count=Math.min(25,pullCount+Math.floor((event.clientY-startY-12)/5));
          for(let c=0;c<count;c++) engine.sever(c);
        }
      }
    };
    const pointerUp=(event:PointerEvent)=>{if(event.pointerId!==activePointer)return;engine.grab=null;mode=null;activePointer=-1;lastColumn=-1;container.style.cursor='grab';};
    const onFlip=()=>{flip+=Math.PI;audio.unlock();};
    controls.current={flip:onFlip,tear:()=>{audio.unlock();tearing=true;}};
    const resize=()=> {const w=container.clientWidth,h=container.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.position.z=w<420?12:10.7;camera.updateProjectionMatrix();};
    const observer=new ResizeObserver(resize);observer.observe(container);resize();
    renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointermove',pointerMove);renderer.domElement.addEventListener('pointerup',pointerUp);renderer.domElement.addEventListener('pointercancel',pointerUp);renderer.domElement.addEventListener('lostpointercapture',pointerUp);renderer.domElement.addEventListener('dblclick',onFlip);
    const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const springColors={seam:new THREE.Color(0xe9a33d),structural:new THREE.Color(0x13bfd0),shear:new THREE.Color(0x7b68f2),bend:new THREE.Color(0x7b68f2)},lineColor=new THREE.Color(),strainColor=new THREE.Color(0xf04c40);
    const render=(time:number)=> {
      if(!alive)return;const dt=clock?Math.min((time-clock)/1000,.033):1/60;clock=time;
      if(tearing && !engine.detached && Math.floor(time/35)!==Math.floor((time-dt*1000)/35)) for(let c=0;c<25;c++)if(!engine.torn.has(c)){engine.sever(c);break;}
      engine.step(dt);geometry.attributes.position.needsUpdate=true;geometry.computeVertexNormals();
      group.rotation.y+=(targetX+flip-group.rotation.y)*.065;group.rotation.x+=(targetY-group.rotation.x)*.065;
      group.position.y=.14+(reducedMotion?0:Math.sin(time*.0008)*.055);
      // Each new issue slides into its suspended position.
      group.position.x+=(0-group.position.x)*.085;
      uniforms.uTime.value=time*.001;
      lattice.visible=settings.current.xray;material.wireframe=false;
      if(settings.current.xray){
        let count=0;const p=engine.positions;
        for(const s of engine.springs){if(!s.active)continue;const strain=Math.abs(Math.hypot(p[s.a*3]-p[s.b*3],p[s.a*3+1]-p[s.b*3+1],p[s.a*3+2]-p[s.b*3+2])/Math.max(s.rest,.01)-(s.rest>0?1:0));lineColor.copy(springColors[s.type]).lerp(strainColor,Math.min(1,strain*6));for(const v of [s.a,s.b]){linePositions.set(p.subarray(v*3,v*3+3),count*3);colors.set([lineColor.r,lineColor.g,lineColor.b],count*3);count++;}}
        latticeGeometry.setDrawRange(0,count);latticeGeometry.attributes.position.needsUpdate=true;latticeGeometry.attributes.color.needsUpdate=true;
      }
      floor.material.opacity=settings.current.dark?.24:.14;
      renderer.render(scene,camera);animation=requestAnimationFrame(render);
    };
    group.position.x=issue>0?2.5:.2;animation=requestAnimationFrame(render);
    return ()=> {alive=false;cancelAnimationFrame(animation);observer.disconnect();controls.current=null;audio.dispose();geometry.dispose();material.dispose();depth.dispose();Object.values(textures).forEach(t=>t.dispose());latticeGeometry.dispose();latticeMaterial.dispose();floor.geometry.dispose();floor.material.dispose();light.shadow.dispose();renderer.dispose();renderer.domElement.remove();};
  },[edition,zone,issue]);
  return <div ref={host} className="ticket-canvas" role="img" aria-label="NITE 全息通行证。拖动票面可弯折，沿穿孔虚线划过或向下拉动票根可撕开，也可以使用撕开通行证按钮。" />;
}
