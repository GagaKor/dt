import { Document, NodeIO, type Material, type Node } from '@gltf-transform/core';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export type Vec3 = [number, number, number];

const X0 = -20;
const X1 = 20;
const Z0 = -10;
const Z1 = 10;
const T = 0.2;
const FLOOR_PITCH = 4;
const WALL_H = 3.8;
const FLOORS = 3;

// 24 vertices per box so each face keeps a flat normal.
const FACES: { n: Vec3; v: [Vec3, Vec3, Vec3, Vec3] }[] = [
  {
    n: [1, 0, 0],
    v: [
      [1, 0, 1],
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
    ],
  },
  {
    n: [-1, 0, 0],
    v: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
  },
  {
    n: [0, 1, 0],
    v: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
  },
  {
    n: [0, -1, 0],
    v: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
  },
  {
    n: [0, 0, 1],
    v: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
  },
  {
    n: [0, 0, -1],
    v: [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
  },
];

interface Mesh {
  positions: number[];
  normals: number[];
  indices: number[];
}

function pushBox(mesh: Mesh, min: Vec3, max: Vec3): void {
  for (const face of FACES) {
    const base = mesh.positions.length / 3;
    for (const c of face.v) {
      mesh.positions.push(c[0] ? max[0] : min[0], c[1] ? max[1] : min[1], c[2] ? max[2] : min[2]);
      mesh.normals.push(...face.n);
    }
    mesh.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function build(
  doc: Document,
  parent: Node | null,
  name: string,
  boxes: [Vec3, Vec3][],
  material: Material,
): Node {
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer();
  const mesh: Mesh = { positions: [], normals: [], indices: [] };
  for (const [min, max] of boxes) pushBox(mesh, min, max);
  const prim = doc
    .createPrimitive()
    .setMaterial(material)
    .setAttribute(
      'POSITION',
      doc
        .createAccessor()
        .setType('VEC3')
        .setArray(new Float32Array(mesh.positions))
        .setBuffer(buffer),
    )
    .setAttribute(
      'NORMAL',
      doc
        .createAccessor()
        .setType('VEC3')
        .setArray(new Float32Array(mesh.normals))
        .setBuffer(buffer),
    )
    .setIndices(
      doc
        .createAccessor()
        .setType('SCALAR')
        .setArray(new Uint16Array(mesh.indices))
        .setBuffer(buffer),
    );
  const node = doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim));
  if (parent) parent.addChild(node);
  else doc.getRoot().getDefaultScene()?.addChild(node);
  return node;
}

export function addBox(
  doc: Document,
  parent: Node | null,
  name: string,
  min: Vec3,
  max: Vec3,
  material: Material,
): Node {
  return build(doc, parent, name, [[min, max]], material);
}

function material(doc: Document, name: string, hex: number): Material {
  const c = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => (v / 255) ** 2.2);
  return doc
    .createMaterial(name)
    .setBaseColorFactor([c[0]!, c[1]!, c[2]!, 1])
    .setMetallicFactor(0)
    .setRoughnessFactor(0.9);
}

function floorWalls(y0: number): [Vec3, Vec3][] {
  const y1 = y0 + WALL_H;
  const boxes: [Vec3, Vec3][] = [
    [
      [X0, y0, Z0],
      [X1, y1, Z0 + T],
    ],
    [
      [X0, y0, Z1 - T],
      [X1, y1, Z1],
    ],
    [
      [X0, y0, Z0 + T],
      [X0 + T, y1, Z1 - T],
    ],
    [
      [X1 - T, y0, Z0 + T],
      [X1, y1, Z1 - T],
    ],
  ];
  // Door gaps are 1 m wide, centered between the partitions (x = -10, 0, 10).
  const gaps = [-12, -4, 4, 12].map((c) => [c - 0.5, c + 0.5] as const);
  for (const zc of [-1.5, 1.5]) {
    let x = X0 + T;
    for (const [g0, g1] of gaps) {
      boxes.push([
        [x, y0, zc - T / 2],
        [g0, y1, zc + T / 2],
      ]);
      x = g1;
    }
    boxes.push([
      [x, y0, zc - T / 2],
      [X1 - T, y1, zc + T / 2],
    ]);
  }
  for (const x of [-10, 0, 10]) {
    boxes.push([
      [x - T / 2, y0, Z0 + T],
      [x + T / 2, y1, -1.5 - T / 2],
    ]);
    boxes.push([
      [x - T / 2, y0, 1.5 + T / 2],
      [x + T / 2, y1, Z1 - T],
    ]);
  }
  return boxes;
}

export function buildOfficeDocument(): Document {
  const doc = new Document();
  doc.createBuffer();
  doc.getRoot().getAsset().generator = 'dt sample-model';
  doc.createScene('Office');
  doc.getRoot().setDefaultScene(doc.getRoot().listScenes()[0]!);
  const slab = material(doc, 'Slab', 0xc8ccd4);
  const wall = material(doc, 'Wall', 0xeef0f3);
  const roof = material(doc, 'Roof', 0x9aa3b2);

  for (let n = 1; n <= FLOORS; n++) {
    const top = (n - 1) * FLOOR_PITCH;
    addBox(doc, null, `F${n}_Slab`, [X0, top - T, Z0], [X1, top, Z1], slab);
    build(doc, null, `F${n}_Walls`, floorWalls(top), wall);
  }
  addBox(
    doc,
    null,
    'Roof',
    [X0, FLOORS * FLOOR_PITCH - T, Z0],
    [X1, FLOORS * FLOOR_PITCH, Z1],
    roof,
  );
  return doc;
}

export async function writeOfficeGlb(outPath: string): Promise<void> {
  await mkdir(dirname(outPath), { recursive: true });
  await new NodeIO().write(outPath, buildOfficeDocument());
}
