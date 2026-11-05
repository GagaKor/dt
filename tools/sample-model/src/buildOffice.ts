import { Document, NodeIO, type Material, type Node } from '@gltf-transform/core';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { officeLayout, type Box, type Group, type Part } from './layout';

export type { Vec3 } from './layout';

// No metallic surfaces: viewers without an environment map render them almost black.
interface Look {
  name: string;
  hex: number;
  alpha?: number;
  roughness?: number;
}

const LOOKS: Record<Exclude<Part, 'carpet'>, Look> = {
  slab: { name: 'Slab', hex: 0xc3c8d0 },
  facade: { name: 'Facade', hex: 0xaeb6c2 },
  mullion: { name: 'Mullion', hex: 0x5b6472, roughness: 0.6 },
  glass: { name: 'Glass', hex: 0x9fc4e0, alpha: 0.3, roughness: 0.05 },
  wall: { name: 'Wall', hex: 0xeef0f3 },
  core: { name: 'Core', hex: 0xd3d7dd },
  metal: { name: 'Metal', hex: 0xb4bbc4, roughness: 0.45 },
  wood: { name: 'Wood', hex: 0xb98b5e, roughness: 0.7 },
  desk: { name: 'Desk', hex: 0xe9e4da, roughness: 0.6 },
  chair: { name: 'Chair', hex: 0x3b4350 },
  screen: { name: 'Screen', hex: 0x1c2330, roughness: 0.3 },
  fabric: { name: 'Fabric', hex: 0x6f8299 },
  plant: { name: 'Plant', hex: 0x5c8a57 },
  pot: { name: 'Pot', hex: 0x8a7a68 },
  stair: { name: 'Stair', hex: 0xb4bac4 },
  roof: { name: 'Roof', hex: 0x959eac },
  equipment: { name: 'Equipment', hex: 0x9aa2ad, roughness: 0.7 },
};

/** Each floor gets its own carpet color so floors are easy to tell apart. */
const CARPETS: Record<Exclude<Group, 'Roof'>, Look> = {
  F1: { name: 'Carpet 1F', hex: 0xd8cdb8 },
  F2: { name: 'Carpet 2F', hex: 0xb8cbbd },
  F3: { name: 'Carpet 3F', hex: 0xb9c4d8 },
};

const GROUPS: Group[] = ['F1', 'F2', 'F3', 'Roof'];

// One quad per face so each face keeps a flat normal. Corner flags pick min (0) or max (1) per axis.
const FACES: { n: [number, number, number]; v: [number, number, number][]; bottom?: true }[] = [
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
    bottom: true,
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

interface MeshData {
  positions: number[];
  normals: number[];
  indices: number[];
}

function pushBox(mesh: MeshData, { min, max, bottom }: Box): void {
  for (const face of FACES) {
    if (face.bottom && !bottom) continue;
    const base = mesh.positions.length / 3;
    for (const c of face.v) {
      mesh.positions.push(c[0] ? max[0] : min[0], c[1] ? max[1] : min[1], c[2] ? max[2] : min[2]);
      mesh.normals.push(...face.n);
    }
    mesh.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function createMaterial(doc: Document, look: Look): Material {
  // Colors are given in sRGB; glTF base colors are linear. Rounded because `**` can differ in the
  // last bit between Node versions, and the committed glb must not depend on the Node version.
  const c = [(look.hex >> 16) & 255, (look.hex >> 8) & 255, look.hex & 255].map(
    (v) => Math.round((v / 255) ** 2.2 * 1e6) / 1e6,
  );
  const m = doc
    .createMaterial(look.name)
    .setBaseColorFactor([c[0]!, c[1]!, c[2]!, look.alpha ?? 1])
    .setMetallicFactor(0)
    .setRoughnessFactor(look.roughness ?? 0.9);
  if (look.alpha !== undefined) m.setAlphaMode('BLEND');
  return m;
}

function createMeshNode(doc: Document, name: string, boxes: Box[], material: Material): Node {
  const buffer = doc.getRoot().listBuffers()[0]!;
  const data: MeshData = { positions: [], normals: [], indices: [] };
  for (const b of boxes) pushBox(data, b);
  const vertexCount = data.positions.length / 3;
  const accessor = (
    type: 'VEC3' | 'SCALAR',
    array: Float32Array<ArrayBuffer> | Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer>,
  ) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const prim = doc
    .createPrimitive()
    .setMaterial(material)
    .setAttribute('POSITION', accessor('VEC3', new Float32Array(data.positions)))
    .setAttribute('NORMAL', accessor('VEC3', new Float32Array(data.normals)))
    .setIndices(
      accessor(
        'SCALAR',
        vertexCount > 0xffff ? new Uint32Array(data.indices) : new Uint16Array(data.indices),
      ),
    );
  return doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim));
}

/**
 * The sample office: one node per floor (F1-F3) and the roof, each holding one mesh per material,
 * named `<group>_<Material>` (e.g. F2_Desk, F1_Glass, F3_Carpet).
 */
export function buildOfficeDocument(): Document {
  const doc = new Document();
  doc.createBuffer();
  doc.getRoot().getAsset().generator = 'dt sample-model';
  const scene = doc.createScene('Office');
  doc.getRoot().setDefaultScene(scene);

  const materials = new Map<string, Material>();
  const materialFor = (look: Look) => {
    let m = materials.get(look.name);
    if (!m) materials.set(look.name, (m = createMaterial(doc, look)));
    return m;
  };

  const layout = officeLayout();
  for (const group of GROUPS) {
    const node = doc.createNode(group);
    scene.addChild(node);
    const byLook = new Map<Look, Box[]>();
    for (const b of layout) {
      if (b.group !== group) continue;
      const look = b.part === 'carpet' ? CARPETS[group as keyof typeof CARPETS] : LOOKS[b.part];
      byLook.set(look, [...(byLook.get(look) ?? []), b]);
    }
    for (const [look, boxes] of byLook) {
      const label = look.name.split(' ')[0]!;
      node.addChild(createMeshNode(doc, `${group}_${label}`, boxes, materialFor(look)));
    }
  }
  return doc;
}

export async function writeOfficeGlb(outPath: string): Promise<void> {
  await mkdir(dirname(outPath), { recursive: true });
  await new NodeIO().write(outPath, buildOfficeDocument());
}
