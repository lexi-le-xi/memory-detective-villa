"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type Floor = 1 | 2;
type Lang = "zh" | "en";
type Point = { x: number; y: number };
type Target = Point & { id: string; name: string; floor: Floor; color?: string };

const MAP_W = 960;
const MAP_H = 600;
const SCALE = 55;
const clueNamesEn: Record<string, string> = {
  milk: "Milk Cup", clock: "Living-Room Clock", log: "Breaker Log",
  paper: "Flat Newspaper", cord: "Curtain Cord", lock: "Automatic Lock",
};

const toWorld = (p: Point) => new THREE.Vector3((p.x - MAP_W / 2) / SCALE, 0, (p.y - MAP_H / 2) / SCALE);
const toMap = (v: THREE.Vector3): Point => ({ x: v.x * SCALE + MAP_W / 2, y: v.z * SCALE + MAP_H / 2 });

type Collider = { minX: number; maxX: number; minZ: number; maxZ: number };

function box(scene: THREE.Scene, position: [number, number, number], size: [number, number, number], color: number, roughness = .85) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, flatShading: true }));
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

/**
 * Same as box(), but also pushes an XZ-plane bounding box (with a small
 * inset so grazing a corner doesn't snag) into the collider list so the
 * player can't walk through it. Use for anything solid — walls, tables,
 * counters, beds — but not small decor (plates, screens) that the player
 * should be able to walk over/near without a wall-like block.
 */
function solidBox(scene: THREE.Scene, colliders: Collider[], position: [number, number, number], size: [number, number, number], color: number, roughness = .85) {
  const mesh = box(scene, position, size, color, roughness);
  const [x, , z] = position;
  const [w, , d] = size;
  const inset = 0.03;
  colliders.push({ minX: x - w / 2 + inset, maxX: x + w / 2 - inset, minZ: z - d / 2 + inset, maxZ: z + d / 2 - inset });
  return mesh;
}

function labelSprite(text: string, color = "#ead9bc", plain = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  if(!plain){ctx.fillStyle = "rgba(12,10,10,.78)";ctx.fillRect(0,18,512,92);ctx.strokeStyle="rgba(197,155,82,.8)";ctx.strokeRect(2,20,508,88);}
  ctx.fillStyle=color;ctx.font=plain?"700 38px Arial":"600 42px Arial";ctx.textAlign="center";ctx.textBaseline="middle";
  if(plain){ctx.shadowColor="rgba(0,0,0,.9)";ctx.shadowBlur=12;ctx.lineWidth=7;ctx.strokeStyle="rgba(0,0,0,.55)";ctx.strokeText(text,256,65);}
  ctx.fillText(text, 256, 65);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(plain?1.15:2.25,plain?.29:.56,1);
  return sprite;
}

function addWall(scene: THREE.Scene, colliders: Collider[], x: number, z: number, w: number, d: number, h = 3.1) {
  return solidBox(scene, colliders, [x, h / 2, z], [w, h, d], 0x987b63);
}

function checkerTexture() {
  const canvas = document.createElement("canvas"); canvas.width = 16; canvas.height = 16;
  const ctx = canvas.getContext("2d")!; ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#8f5e46"; ctx.fillRect(0,0,16,16); ctx.fillStyle = "#a96f4f";
  ctx.fillRect(0,0,8,8); ctx.fillRect(8,8,8,8);
  const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(13,8); texture.magFilter = texture.minFilter = THREE.NearestFilter; texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const clueWorldPositions: Record<string, [number, number, number]> = {
  milk: [4.65, 1.08, -2.4], clock: [-7.23, .05, -.18], log: [6.72, 1.02, 1.68],
  paper: [5.45, .88, -2.2], cord: [8.02, 1.15, -2.1], lock: [2.22, 1.18, -.35],
};

function clueMaterial(color: number, emissive = 0) {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: emissive ? .35 : 0, roughness: 1, flatShading: true });
}

function makeClueModel(id: string) {
  const group = new THREE.Group();
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, position: [number,number,number], rotation?: [number,number,number]) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position); if(rotation)mesh.rotation.set(...rotation); mesh.castShadow=true; group.add(mesh); return mesh;
  };
  if (id === "milk") {
    add(new THREE.CylinderGeometry(.28,.3,.055,12),clueMaterial(0xe8d9bb),[0,0,0]);
    add(new THREE.CylinderGeometry(.19,.16,.34,10),clueMaterial(0xf1e5ca),[0,.19,0]);
    add(new THREE.CylinderGeometry(.145,.145,.018,12),clueMaterial(0xe9dfc4,0x8b7148),[0,.365,0]);
    add(new THREE.TorusGeometry(.16,.035,6,10,Math.PI*1.55),clueMaterial(0xf1e5ca),[.18,.22,0],[Math.PI/2,0,Math.PI/2]);
  } else if (id === "clock") {
    add(new THREE.BoxGeometry(.52,1.55,.32),clueMaterial(0x80593b),[0,.78,0]);
    add(new THREE.CylinderGeometry(.22,.22,.045,12),clueMaterial(0xe8d9a9),[0,1.17,-.18],[Math.PI/2,0,0]);
    add(new THREE.BoxGeometry(.025,.16,.025),clueMaterial(0x382b26),[0,1.19,-.22],[0,0,.6]);
    add(new THREE.BoxGeometry(.025,.12,.025),clueMaterial(0x382b26),[.03,1.13,-.22],[0,0,-.7]);
    add(new THREE.CylinderGeometry(.04,.04,.42,8),clueMaterial(0xc59b52),[0,.58,-.2]);
    add(new THREE.SphereGeometry(.09,8,6),clueMaterial(0xc59b52),[0,.34,-.2]);
  } else if (id === "log") {
    add(new THREE.BoxGeometry(.78,.055,.56),clueMaterial(0x604934),[0,0,0]);
    add(new THREE.BoxGeometry(.68,.025,.47),clueMaterial(0xe8dfc8),[0,.04,0]);
    add(new THREE.BoxGeometry(.2,.05,.08),clueMaterial(0x485d63),[0,.075,-.22]);
    for(let i=0;i<4;i++) add(new THREE.BoxGeometry(.5,.012,.018),clueMaterial(0x6d6255),[0,.065,-.11+i*.11]);
  } else if (id === "paper") {
    add(new THREE.BoxGeometry(.78,.025,.56),clueMaterial(0xeee2c4),[0,0,0],[0,.18,0]);
    add(new THREE.BoxGeometry(.7,.018,.5),clueMaterial(0xdccda9),[.06,.025,.03],[0,-.08,0]);
    for(let i=0;i<5;i++) add(new THREE.BoxGeometry(.52,.012,.015),clueMaterial(0x6a6158),[.03,.04,-.17+i*.085],[0,-.08,0]);
  } else if (id === "cord") {
    add(new THREE.TorusGeometry(.3,.035,6,14),clueMaterial(0xc7a06c),[0,.28,0],[0,Math.PI/2,0]);
    add(new THREE.CylinderGeometry(.055,.055,.72,7),clueMaterial(0xc7a06c),[0,-.12,0]);
    add(new THREE.CylinderGeometry(.13,.13,.11,10),clueMaterial(0x76513e),[0,.62,0],[Math.PI/2,0,0]);
  } else if (id === "lock") {
    add(new THREE.BoxGeometry(.42,.62,.15),clueMaterial(0xb8a06d),[0,0,0]);
    add(new THREE.CylinderGeometry(.11,.11,.15,10),clueMaterial(0x6b573b),[0,.08,-.13],[Math.PI/2,0,0]);
    add(new THREE.BoxGeometry(.045,.15,.025),clueMaterial(0x2f2925),[0,-.15,-.09]);
  }
  const marker = add(new THREE.OctahedronGeometry(.065),clueMaterial(0xffd367,0xc87817),[0,id === "clock" ? 1.75 : .72,0]);
  marker.userData.marker = true; marker.userData.baseY = marker.position.y;
  const glow = new THREE.PointLight(0xffc35f,2.8,2.2); glow.position.y=id === "clock" ? 1.1 : .4; group.add(glow);
  return group;
}

function makeCharacterModel(id: string, fallbackColor: string) {
  const group = new THREE.Group();
  const mat = (color: number | string) => new THREE.MeshStandardMaterial({ color, roughness: .72, metalness: 0 });
  const add = (geometry: THREE.BufferGeometry, color: number | string, position: [number,number,number], scale: [number,number,number]=[1,1,1], rotation?: [number,number,number]) => {
    const mesh=new THREE.Mesh(geometry,mat(color));mesh.position.set(...position);mesh.scale.set(...scale);if(rotation)mesh.rotation.set(...rotation);mesh.castShadow=true;group.add(mesh);return mesh;
  };
  const sphere=(color:number|string,p:[number,number,number],s:[number,number,number]=[1,1,1])=>add(new THREE.SphereGeometry(.36,20,14),color,p,s);
  const small=(color:number|string,p:[number,number,number],s:[number,number,number]=[1,1,1])=>add(new THREE.SphereGeometry(.08,12,8),color,p,s);

  if(id === "felix") {
    add(new THREE.CapsuleGeometry(.25,.62,8,16),0x303846,[-.05,.2,0],[1,1,1],[0,0,Math.PI/2]);
    sphere(0xc28d6c,[.7,.27,0],[1,1.08,.88]);
    sphere(0xd5d0c8,[.7,.52,.05],[1.02,.42,.82]);
    small(0x2c2928,[.59,.31,-.31],[.7,.25,.35]); small(0x2c2928,[.81,.31,-.31],[.7,.25,.35]);
    small(0xb96d62,[.7,.25,-.34],[.55,1,.6]);
    add(new THREE.TorusGeometry(.09,.018,6,12,Math.PI),0x7a665d,[.7,.13,-.33],[1,1,1],[0,0,0]);
    group.userData.labelHeight=1.3; return group;
  }

  const designs:Record<string,{body:number|string,skin:number,hair:number,headY:number,bodyY:number}>={
    amy:{body:0x6f8b75,skin:0xe2ae8e,hair:0x3e2928,headY:1.43,bodyY:.63},
    coco:{body:0xa56d93,skin:0xf0b596,hair:0xa74367,headY:1.42,bodyY:.62},
    dean:{body:0x3e5872,skin:0x8d5c45,hair:0x272526,headY:1.48,bodyY:.66},
    ben:{body:0x727cb4,skin:0xe9b08b,hair:0xc96e32,headY:1.46,bodyY:.65},
    ella:{body:0xd7aa5d,skin:0x9f6a4f,hair:0x302625,headY:1.37,bodyY:.58},
  };
  const d=designs[id]||{body:fallbackColor,skin:0xd5a080,hair:0x3a2d2b,headY:1.43,bodyY:.63};
  if(["amy","coco","ella"].includes(id)) add(new THREE.CylinderGeometry(.23,.38,.68,16),d.body,[0,d.bodyY,0],[1,1,1]);
  else add(new THREE.CapsuleGeometry(.29,.42,8,16),d.body,[0,d.bodyY,0]);
  sphere(d.skin,[0,d.headY,0],[1,1.08,.88]);
  small(d.skin,[-.36,d.headY,0],[.72,1.05,.65]); small(d.skin,[.36,d.headY,0],[.72,1.05,.65]);
  const faceZ=-.325;
  small(0x2b292b,[-.115,d.headY+.035,faceZ],[.63,1.05,.38]); small(0x2b292b,[.115,d.headY+.035,faceZ],[.63,1.05,.38]);
  small(0xc96e63,[0,d.headY-.015,-.365],[.55,1.05,.58]);
  small(0xe99a94,[-.24,d.headY-.07,-.3],[.82,.35,.3]); small(0xe99a94,[.24,d.headY-.07,-.3],[.82,.35,.3]);
  small(0x7b3c47,[0,d.headY-.15,-.35],[.9,.48,.34]);
  small(0xf6eee2,[0,d.headY-.135,-.373],[.62,.16,.2]);

  if(id==="amy") {
    sphere(d.hair,[0,d.headY+.15,.1],[1.06,.84,.8]);
    sphere(d.hair,[-.19,d.headY+.25,-.13],[.48,.34,.34]); sphere(d.hair,[.18,d.headY+.24,-.14],[.5,.33,.34]);
    sphere(d.hair,[-.3,d.headY-.02,.08],[.36,.82,.46]); sphere(d.hair,[.3,d.headY-.01,.09],[.28,.72,.42]);
    small(0xf0d6a0,[.39,d.headY-.02,-.05],[.45,.45,.4]);
    add(new THREE.BoxGeometry(.4,.12,.08),0xd9e1ce,[0,d.bodyY+.25,-.27]);
  } else if(id==="coco") {
    sphere(d.hair,[0,d.headY+.12,.1],[1.08,.88,.82]);
    for(const x of[-.28,-.12,.13,.29])sphere(d.hair,[x,d.headY+.24,-.12],[.46,.42,.38]);
    sphere(d.hair,[-.3,d.headY-.12,.08],[.38,.82,.45]); sphere(d.hair,[.3,d.headY-.12,.08],[.38,.82,.45]);
    for(const x of[-.115,.115])add(new THREE.TorusGeometry(.105,.018,8,16),0x6f304b,[x,d.headY+.035,-.36]);
    add(new THREE.BoxGeometry(.08,.018,.02),0x6f304b,[0,d.headY+.035,-.37]);
    add(new THREE.TorusGeometry(.25,.025,8,16),0xf1d7a0,[0,d.bodyY+.22,-.23],[1,1,1],[Math.PI/2,0,0]);
  } else if(id==="dean") {
    sphere(d.hair,[0,d.headY+.25,.04],[1,.35,.8]);
    for(const x of[-.12,0,.12])small(d.hair,[x,d.headY+.28,-.15],[1.05,.7,.8]);
    add(new THREE.BoxGeometry(.2,.055,.035),0x3c2826,[0,d.headY-.13,-.37]);
    add(new THREE.BoxGeometry(.22,.32,.035),0xeee7dc,[0,d.bodyY+.15,-.28]);
    add(new THREE.BoxGeometry(.08,.28,.04),0x9d3644,[0,d.bodyY+.12,-.31]);
    for(let i=0;i<3;i++)small(0xe4bd5c,[-.15,d.bodyY+.23-i*.13,-.29],[.25,.25,.2]);
  } else if(id==="ben") {
    sphere(d.hair,[.03,d.headY+.2,.05],[1.05,.62,.8]);
    sphere(d.hair,[.15,d.headY+.29,-.12],[.85,.38,.42]); sphere(d.hair,[-.16,d.headY+.25,-.13],[.58,.35,.4]);
    for(const x of[-.115,.115])add(new THREE.TorusGeometry(.105,.018,8,16),0xf1eee7,[x,d.headY+.035,-.36]);
    add(new THREE.BoxGeometry(.08,.018,.02),0xf1eee7,[0,d.headY+.035,-.37]);
    add(new THREE.TorusGeometry(.39,.04,8,18,Math.PI),0x35425c,[0,d.headY+.05,.03]);
    small(0x35425c,[-.37,d.headY,.02],[.6,1.4,.5]); small(0x35425c,[.37,d.headY,.02],[.6,1.4,.5]);
  } else if(id==="ella") {
    sphere(d.hair,[0,d.headY+.12,.1],[1.06,.82,.82]);
    sphere(d.hair,[0,d.headY+.38,.12],[.6,.55,.58]); sphere(d.hair,[-.25,d.headY+.18,-.1],[.5,.42,.4]);
    add(new THREE.BoxGeometry(.44,.53,.035),0xf5e6c8,[0,d.bodyY-.02,-.29]);
    small(0x62c6a8,[-.39,d.headY-.04,-.06],[.4,.55,.4]); small(0x62c6a8,[.39,d.headY-.04,-.06],[.4,.55,.4]);
  }
  group.userData.labelHeight=d.headY+.65;
  return group;
}

function buildHouse(scene: THREE.Scene, floor: Floor, lang: Lang): Collider[] {
  const colliders: Collider[] = [];
  const addFloor = (position:[number,number,number],size:[number,number,number]) => {
    const mesh=box(scene,position,size,0xffffff);
    mesh.material=new THREE.MeshStandardMaterial({map:checkerTexture(),roughness:1,flatShading:true});
  };
  if(floor===1)addFloor([0,-.08,0],[17.6,.16,10.8]);
  else {
    // Three slabs leave a real opening for the upstairs stairwell.
    addFloor([-5.05,-.08,0],[7.5,.16,10.8]);
    addFloor([5.05,-.08,0],[7.5,.16,10.8]);
    addFloor([0,-.08,-1.48],[2.6,.16,7.74]);
  }
  const ceiling = box(scene, [0, 3.18, 0], [17.6, .12, 10.8], 0xd4b89b);
  ceiling.material = new THREE.MeshStandardMaterial({ color: 0xd4b89b, emissive: 0x31251e, side: THREE.BackSide, flatShading: true });
  addWall(scene, colliders, 0, -5.35, 17.8, .18); addWall(scene, colliders, 0, 5.35, 17.8, .18);
  addWall(scene, colliders, -8.8, 0, .18, 10.8); addWall(scene, colliders, 8.8, 0, .18, 10.8);

  if (floor === 1) {
    addWall(scene, colliders, -2.2, -3.3, .16, 4.1); addWall(scene, colliders, -2.2, 3.4, .16, 3.8);
    addWall(scene, colliders, 3.25, -3.3, .16, 4.1); addWall(scene, colliders, 3.25, 3.45, .16, 3.7);
    addWall(scene, colliders, -5.55, .55, 6.5, .16); addWall(scene, colliders, 5.95, .55, 5.5, .16);
    addWall(scene, colliders, -.05, .55, 3.8, .16);

    // Living room: fireplace, sofas, clock, drinks.
    solidBox(scene, colliders, [-7.85, 1.05, -2.2], [.65, 2.1, 2.3], 0x6f4b3a);
    box(scene, [-7.45, .55, -2.2], [.38, .85, 1.35], 0x2c2220);
    solidBox(scene, colliders, [-5.3, .46, -4.2], [3.1, .8, .75], 0x477a78);
    solidBox(scene, colliders, [-3.25, .46, -2.65], [.75, .8, 2.15], 0x477a78);
    box(scene, [-5.2, .28, -2.7], [1.7, .45, 1.05], 0xc1774e);
    solidBox(scene, colliders, [-7.25, 1.15, -.15], [.55, 2.25, .42], 0x8d633f);
    const clockFace = new THREE.Mesh(new THREE.CircleGeometry(.2, 24), new THREE.MeshStandardMaterial({ color: 0xc4aa78 }));
    clockFace.position.set(-7.24, 1.65, -.37); clockFace.rotation.x = -Math.PI / 2; scene.add(clockFace);

    // Dining room: long table and six chairs.
    solidBox(scene, colliders, [.55, .72, -2.55], [3.7, .18, 1.35], 0xb56d45);
    [[-1,-3.65],[.1,-3.65],[1.2,-3.65],[-1,-1.45],[.1,-1.45],[1.2,-1.45]].forEach(([x,z]) => box(scene, [x,.48,z], [.55,.85,.55], 0x76513e));
    for (let i = -1; i <= 1; i++) {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,.025,20), new THREE.MeshStandardMaterial({color:0xc9bda5}));
      plate.position.set(i * .9, .83, -2.55); scene.add(plate);
    }

    // Kitchen: worktops, stove, pantry shelves.
    solidBox(scene, colliders, [5.9, .55, -4.55], [4.8, 1, .65], 0x6f9382);
    solidBox(scene, colliders, [8.05, .55, -2.25], [.65, 1, 3.8], 0x6f9382);
    solidBox(scene, colliders, [5.65, .55, -2.4], [2.8, 1, 1.05], 0xd5ad72);
    box(scene, [4.1, 1.05, -4.5], [.8, .1, .55], 0x171719);
    for (let i = 0; i < 4; i++) box(scene, [7.95, .55 + i * .5, -1.05], [.48, .1, 1.1], 0x75614d);

    // Foyer, grand stair and monitor room. The stair mesh itself stays
    // decorative (its footprint sits inside the foyer/monitor-room gap,
    // and blocking it would fight with the floor-switch button's own
    // teleport), but the inspection table and monitor console are solid.
    box(scene, [-5.6, .06, 3.1], [4.6, .05, 3.7], 0x9b4557);
    for (let i = 0; i < 7; i++) box(scene, [-.2, .13 + i * .17, 4.55 - i * .3], [2.5, .22, .38], 0x735b43);
    solidBox(scene, colliders, [5.8, .75, 4.45], [3.6, 1.35, .65], 0x3e342e);
    for (let i = 0; i < 3; i++) {
      const screen = box(scene, [4.65 + i * 1.12, 1.18, 4.08], [.9, .62, .08], 0x111a1c);
      (screen.material as THREE.MeshStandardMaterial).emissive.setHex(0x152c30);
    }
    // Dean's inspection table keeps the breaker log in clear view.
    solidBox(scene, colliders, [6.72, .5, 1.68], [1.25, .9, .78], 0x7c5b42);
  } else {
    addWall(scene, colliders, -2.25, -2.6, .16, 5.5);
    // The full-length wall (x=2.15, z=-2.6, d=5.5, spanning z -5.35..-.15)
    // ran straight through the master-bedroom doorway (jambs at z -1.2 and
    // .44) — shortened to stop where the door frame begins, leaving a real
    // gap instead of a wall the player (and the eye) can't pass through.
    addWall(scene, colliders, 2.15, -3.275, .16, 4.15);
    addWall(scene, colliders, 5.45, .2, 6.5, .16); addWall(scene, colliders, -5.5, .2, 6.5, .16);
    // Make the master-bedroom entrance distinct from the surrounding wall.
    // The two center posts are the outer/inner faces of the same thin door
    // leaf, only ~0.07 units apart — solid on both would seal the doorway,
    // since the room boundary (x>2.2) sits right between them. Only the
    // side jambs (the actual frame flanking the opening) are solid; the
    // door-leaf faces and handles stay decorative.
    box(scene, [2.055, 1.28, -.38], [.12, 2.48, 1.38], 0x49352d);
    box(scene, [1.97, 2.58, -.38], [.23, .16, 1.62], 0xc19a62);
    solidBox(scene, colliders, [1.97, 1.3, -1.13], [.23, 2.7, .14], 0xc19a62);
    solidBox(scene, colliders, [1.97, 1.3, .37], [.23, 2.7, .14], 0xc19a62);
    const masterHandle = new THREE.Mesh(new THREE.SphereGeometry(.075,12,8),new THREE.MeshStandardMaterial({color:0xe0b45e,emissive:0x5a3610,emissiveIntensity:.45,metalness:.45,roughness:.38}));
    masterHandle.position.set(1.91,1.18,.08);scene.add(masterHandle);
    // Matching inner face, so the door remains recognizable from inside the room.
    box(scene, [2.245, 1.28, -.38], [.12, 2.48, 1.38], 0x49352d);
    box(scene, [2.33, 2.58, -.38], [.23, .16, 1.62], 0xc19a62);
    solidBox(scene, colliders, [2.33, 1.3, -1.13], [.23, 2.7, .14], 0xc19a62);
    solidBox(scene, colliders, [2.33, 1.3, .37], [.23, 2.7, .14], 0xc19a62);
    const innerMasterHandle = new THREE.Mesh(new THREE.SphereGeometry(.075,12,8),new THREE.MeshStandardMaterial({color:0xe0b45e,emissive:0x5a3610,emissiveIntensity:.45,metalness:.45,roughness:.38}));
    innerMasterHandle.position.set(2.39,1.18,.08);scene.add(innerMasterHandle);
    solidBox(scene, colliders, [5.55, .45, -2.35], [3.8, .75, 2.15], 0x668a87); // bed
    box(scene, [5.55, 1.1, -3.25], [3.8, 1.1, .22], 0x76513e);
    solidBox(scene, colliders, [8.25, 1.45, -2.1], [.18, 2.9, 3.7], 0x9e5268); // curtains
    solidBox(scene, colliders, [3.0, .9, -4.65], [1.3, 1.8, .45], 0x4b3a30); // fireplace
    solidBox(scene, colliders, [-6.0, .45, -2.4], [3.5, .75, 2], 0x47403d); // guest bed
    // The top tread is flush with the landing; each following tread drops
    // below it. Treads and the landing block stay non-solid — this is now
    // a real descending staircase (matches the floor cutout above), and
    // colliding with individual steps the way a wall collides would make
    // the stairs unclimbable. Only the railings are solid.
    box(scene,[-.1,-1.36,4.08],[2.58,2.7,2.55],0x171413);
    for(let i=0;i<8;i++)box(scene,[-.1,-.12-i*.18,2.62+i*.3],[2.4,.2,.4],0x735b43);
    const leftRail=solidBox(scene,colliders,[-1.38,.2,3.67],[.1,.1,2.5],0xc19a62);leftRail.rotation.x=.42;
    const rightRail=solidBox(scene,colliders,[1.18,.2,3.67],[.1,.1,2.5],0xc19a62);rightRail.rotation.x=.42;
    [[2.55,.42],[3.55,.06],[4.55,-.3]].forEach(([z,y])=>{solidBox(scene,colliders,[-1.38,y,z],[.1,.9,.1],0x8b653f);solidBox(scene,colliders,[1.18,y,z],[.1,.9,.1],0x8b653f);});
  }

  return colliders;
}

export default function Mansion3D({ floor, lang, player, setPlayer, actors, clues, found, onInteract, onOpenPeople, onOpenBoard, peopleLabel, boardLabel }: {
  floor: Floor; lang: Lang; player: Point; setPlayer: (p: Point) => void; actors: Target[]; clues: Target[]; found: string[];
  onInteract: (kind: "actor" | "clue" | "stairs", id: string) => void;
  onOpenPeople: () => void; onOpenBoard: () => void; peopleLabel: string; boardLabel: string;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ keys: new Set<string>(), yaw: floor === 1 ? Math.PI : 0, target: null as null | { kind: "actor" | "clue" | "stairs"; id: string; label: string } });
  const [prompt, setPrompt] = useState("");
  const [room, setRoom] = useState("");
  const [miniPlayer, setMiniPlayer] = useState(player);
  const [miniYaw, setMiniYaw] = useState(stateRef.current.yaw);
  const [inMasterRoom, setInMasterRoom] = useState(false);
  const [masterLightOn, setMasterLightOn] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x667677);
    scene.fog = new THREE.FogExp2(0x756b67, .018);
    const camera = new THREE.PerspectiveCamera(67, 1, .05, 70);
    const start = toWorld(player); camera.position.set(start.x, 1.65, start.z);
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(1); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.BasicShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.62;
    mount.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffe6bd, 0x4b5062, 3.25));
    scene.add(new THREE.AmbientLight(0xffe8cf, 1.45));
    const warm = new THREE.PointLight(0xffb869, 28, 18); warm.position.set(-4, 2.35, -2.4); warm.castShadow = true; scene.add(warm);
    const cold = new THREE.PointLight(0x9fc7dc, 20, 16); cold.position.set(5.5, 2.3, 2.5); scene.add(cold);
    const hall = new THREE.PointLight(0xffd39b, 18, 13); hall.position.set(0, 2.4, 3.5); scene.add(hall);
    const colliders = buildHouse(scene, floor, lang);
    const playerRadius = 0.32;

    // Resolves a proposed new position against every collider on one axis
    // at a time (so sliding along a wall you're grazing still works,
    // rather than movement stopping dead the instant either axis touches
    // something).
    const resolveAxis = (value: number, otherAxis: number, isX: boolean) => {
      for (const c of colliders) {
        const withinOther = isX ? (otherAxis > c.minZ - playerRadius && otherAxis < c.maxZ + playerRadius)
          : (otherAxis > c.minX - playerRadius && otherAxis < c.maxX + playerRadius);
        if (!withinOther) continue;
        const min = isX ? c.minX : c.minZ;
        const max = isX ? c.maxX : c.maxZ;
        if (value + playerRadius > min && value - playerRadius < max) {
          const fromBelow = Math.abs((value) - min);
          const fromAbove = Math.abs(max - (value));
          value = fromBelow < fromAbove ? min - playerRadius : max + playerRadius;
        }
      }
      return value;
    };

    const interactive: THREE.Object3D[] = [];
    actors.filter(a => a.floor === floor).forEach(actor => {
      const p = toWorld(actor);
      const group = new THREE.Group(); group.position.set(p.x, 0, p.z); group.userData = { kind: "actor", id: actor.id, label: actor.name };
      const model=makeCharacterModel(actor.id,actor.color||"#777");
      if(actor.id==="felix")group.position.y=.83;
      if(actor.id==="amy")model.position.y=.43;
      if(actor.id==="coco"||actor.id==="dean")group.rotation.y=Math.PI;
      group.add(model);
      const label = labelSprite(actor.name,"#fff3dc",true); label.position.set(.58,(model.userData.labelHeight || 2.28)-.18,0); group.add(label); scene.add(group); interactive.push(group);
    });
    clues.filter(c => c.floor === floor && !found.includes(c.id)).forEach(clue => {
      const group = makeClueModel(clue.id); const position=clueWorldPositions[clue.id] || [toWorld(clue).x,.55,toWorld(clue).z]; group.position.set(...position);
      group.userData = { kind: "clue", id: clue.id, label: lang === "zh" ? clue.name : (clueNamesEn[clue.id] || clue.name) };
      scene.add(group); interactive.push(group);
    });
    const stairs = new THREE.Group(); stairs.position.set(0, .5, 3.75); stairs.userData = { kind: "stairs", id: "stairs", label: floor === 1 ? (lang === "zh" ? "前往二楼" : "Go Upstairs") : (lang === "zh" ? "返回一楼" : "Go Downstairs") };
    const stairMarker = new THREE.Mesh(new THREE.ConeGeometry(.24, .6, 4), new THREE.MeshStandardMaterial({ color: 0xc79c54, emissive: 0x4d3517 })); stairMarker.rotation.z = floor === 1 ? 0 : Math.PI; stairs.add(stairMarker); scene.add(stairs); interactive.push(stairs);

    const resize = () => { const { clientWidth:w, clientHeight:h } = mount; renderer.setSize(Math.max(1,Math.floor(w*.68)),Math.max(1,Math.floor(h*.68)),false); camera.aspect=w/h; camera.updateProjectionMatrix(); };
    resize(); const observer = new ResizeObserver(resize); observer.observe(mount);
    const keyDown = (e: KeyboardEvent) => { const key=e.key.toLowerCase(); if(key.startsWith("arrow"))e.preventDefault(); stateRef.current.keys.add(key); if (["e","enter"].includes(key) && stateRef.current.target) { const t=stateRef.current.target; onInteract(t.kind,t.id); } };
    const keyUp = (e: KeyboardEvent) => stateRef.current.keys.delete(e.key.toLowerCase());
    const raycaster = new THREE.Raycaster(); const center = new THREE.Vector2(0,0); const clickPoint = new THREE.Vector2();
    const click = (e: MouseEvent) => {
      const rect=renderer.domElement.getBoundingClientRect();
      clickPoint.set(((e.clientX-rect.left)/rect.width)*2-1,-((e.clientY-rect.top)/rect.height)*2+1);
      raycaster.setFromCamera(clickPoint,camera);
      const hits=raycaster.intersectObjects(interactive,true);
      for(const hit of hits){
        let root:THREE.Object3D|null=hit.object;
        while(root&&!root.userData.kind)root=root.parent;
        if(root&&camera.position.distanceTo(root.position)<3.5){onInteract(root.userData.kind,root.userData.id);break;}
      }
    };
    window.addEventListener("keydown",keyDown); window.addEventListener("keyup",keyUp); renderer.domElement.addEventListener("click",click);
    const clock = new THREE.Clock(); let frame=0; let lastPrompt=""; let lastRoom=""; let lastMapUpdate=0; let lastMasterRoom=false;
    const animate = () => {
      frame=requestAnimationFrame(animate); const dt=Math.min(clock.getDelta(),.04); const keys=stateRef.current.keys; const speed=2.65*dt;
      if(keys.has("arrowleft")) stateRef.current.yaw += 1.7*dt; if(keys.has("arrowright")) stateRef.current.yaw -= 1.7*dt;
      const forward=new THREE.Vector3(-Math.sin(stateRef.current.yaw),0,-Math.cos(stateRef.current.yaw));
      const move=new THREE.Vector3(); if(keys.has("arrowup"))move.add(forward); if(keys.has("arrowdown"))move.sub(forward);
      if(move.lengthSq()){
        move.normalize().multiplyScalar(speed);
        let nextX = THREE.MathUtils.clamp(camera.position.x + move.x, -8.25, 8.25);
        let nextZ = THREE.MathUtils.clamp(camera.position.z + move.z, -4.85, 4.85);
        nextX = resolveAxis(nextX, camera.position.z, true);
        nextZ = resolveAxis(nextZ, nextX, false);
        camera.position.x = nextX; camera.position.z = nextZ;
      }
      camera.rotation.set(0,stateRef.current.yaw,0,"YXZ");
      if(clock.elapsedTime-lastMapUpdate>.08){lastMapUpdate=clock.elapsedTime;const mapped=toMap(camera.position);setMiniPlayer(mapped);setMiniYaw(stateRef.current.yaw);setPlayer(mapped);const nowInMaster=floor===2&&camera.position.x>2.2&&camera.position.z<.2;if(nowInMaster!==lastMasterRoom){lastMasterRoom=nowInMaster;setInMasterRoom(nowInMaster);}}
      interactive.forEach(o=>{ if(o.userData.kind==="clue"){const marker=o.children.find(child=>child.userData.marker);if(marker){marker.rotation.y+=dt*2;marker.position.y=marker.userData.baseY+Math.sin(clock.elapsedTime*3)*.05;}} if(o.userData.kind==="stairs") o.position.y=.5+Math.sin(clock.elapsedTime*2)*.08; });
      raycaster.setFromCamera(center,camera); const hits=raycaster.intersectObjects(interactive,true); let chosen:null|THREE.Object3D=null;
      for(const hit of hits){let root:THREE.Object3D|null=hit.object;while(root&& !root.userData.kind)root=root.parent;if(root&&camera.position.distanceTo(root.position)<2.65){chosen=root;break;}}
      if(!chosen){let best=2.0;interactive.forEach(o=>{const d=camera.position.distanceTo(o.position);if(d<best){best=d;chosen=o;}});}
      const target = chosen as THREE.Object3D | null; stateRef.current.target=target?{kind:target.userData.kind,id:target.userData.id,label:target.userData.label}:null;
      const nextPrompt=target?(lang==="zh"?`按 E 互动 · ${target.userData.label}`:`Press E · ${target.userData.label}`):""; if(nextPrompt!==lastPrompt){lastPrompt=nextPrompt;setPrompt(nextPrompt);}
      const x=camera.position.x,z=camera.position.z; const nextRoom=floor===2?(z<.2&&x>2.2?(lang==="zh"?"主卧":"MASTER BEDROOM"):z<.2&&x<-2.2?(lang==="zh"?"客房":"GUEST ROOM"):(lang==="zh"?"二楼走廊":"UPPER HALL")):(z<.55?(x<-2.2?(lang==="zh"?"客厅":"LIVING ROOM"):x>3.25?(lang==="zh"?"厨房":"KITCHEN"):(lang==="zh"?"餐厅":"DINING ROOM")):(x<-2.2?(lang==="zh"?"门厅":"FOYER"):x>3.25?(lang==="zh"?"管家室":"MONITOR ROOM"):(lang==="zh"?"主楼梯":"GRAND STAIR"))); if(nextRoom!==lastRoom){lastRoom=nextRoom;setRoom(nextRoom);}
      renderer.render(scene,camera);
    }; animate();
    return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener("keydown",keyDown);window.removeEventListener("keyup",keyUp);renderer.domElement.removeEventListener("click",click);renderer.dispose();scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const m=o.material as THREE.Material;m.dispose();}});mount.removeChild(renderer.domElement);};
  }, [floor, lang, actors, clues, found, onInteract, setPlayer]);

  return <div className="map-shell three-shell">
    <div className="three-viewport" ref={mountRef} aria-label={lang === "zh" ? `别墅${floor}楼第一人称3D探索场景` : `First-person 3D villa, floor ${floor}`} />
    {inMasterRoom&&!masterLightOn&&<div className="master-darkness" role="dialog" aria-label={lang==="zh"?"主卧灯光已关闭":"The master-bedroom light is off"}><button onClick={()=>setMasterLightOn(true)}>{lang==="zh"?"开灯":"Turn On Light"}</button></div>}
    <div className="three-room">{room}</div><div className="crosshair" aria-hidden="true">+</div>
    <div className={`mini-map floor-${floor}`} aria-label={lang === "zh" ? `缩略地图，玩家位于${room}` : `Mini map, player in ${room}`}>
      <div className="mini-title"><span>{lang === "zh" ? "别墅平面图" : "VILLA MAP"}</span><b>{floor}F</b></div>
      <div className="mini-plan">
        {floor === 1 ? <>
          <span className="mini-zone living">{lang === "zh" ? "客厅" : "LIVING"}</span><span className="mini-zone dining">{lang === "zh" ? "餐厅" : "DINING"}</span><span className="mini-zone kitchen">{lang === "zh" ? "厨房" : "KITCHEN"}</span>
          <span className="mini-zone foyer">{lang === "zh" ? "门厅" : "FOYER"}</span><span className="mini-zone stair">{lang === "zh" ? "楼梯" : "STAIR"}</span><span className="mini-zone monitor">{lang === "zh" ? "管家室" : "MONITOR"}</span>
        </> : <>
          <span className="mini-zone guest">{lang === "zh" ? "客房" : "GUEST"}</span><span className="mini-zone hall">{lang === "zh" ? "走廊" : "HALL"}</span><span className="mini-zone bedroom">{lang === "zh" ? "主卧" : "MASTER"}</span>
        </>}
        <i className="mini-player" style={{ left: `${Math.max(2,Math.min(98,miniPlayer.x/MAP_W*100))}%`, top: `${Math.max(3,Math.min(97,miniPlayer.y/MAP_H*100))}%`, transform: `translate(-50%,-50%) rotate(${-miniYaw}rad)` }} />
      </div>
    </div>
    <div className="map-actions" aria-label={lang === "zh" ? "调查操作" : "Investigation actions"}>
      <button className="floor-switch" onClick={()=>onInteract("stairs","stairs")}>{floor===1?(lang==="zh"?"⇧ 前往二楼":"⇧ Go Upstairs"):(lang==="zh"?"⇩ 返回一楼":"⇩ Go Downstairs")}</button>
      <div><button onClick={onOpenPeople}>{peopleLabel}</button><button onClick={onOpenBoard}>{boardLabel}</button></div>
    </div>
    {prompt && <button className="interaction-prompt" onClick={()=>{const t=stateRef.current.target;if(t)onInteract(t.kind,t.id);}}><kbd>E</kbd>{prompt.replace(/^按 E 互动 · |^Press E · /,"")}</button>}
  </div>;
}
