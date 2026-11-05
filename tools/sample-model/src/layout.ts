// Layout of the sample office as plain boxes, so tests can check it without glTF.
// Model axes: Y up, metres. "North" is -Z (plan y = -Z).
//
// 40 x 20 m, three 4 m floors and a roof. Every floor has:
// - a corridor along the X axis (z = -1.5..1.5) that stays clear for the simulator cameras;
// - a stair and elevator core north of the corridor (x = -4..4);
// - rooms north of the corridor and an open zone south of it.
// 1F: lobby with reception, control room, meeting room, cafe, training room, storage.
// 2F: open office, three meeting rooms, pantry, focus rooms.
// 3F: open office, conference room, executive offices, lounge.

export type Vec3 = [number, number, number];
export type Group = 'F1' | 'F2' | 'F3' | 'Roof';
export type Part =
  | 'slab'
  | 'carpet'
  | 'facade'
  | 'mullion'
  | 'glass'
  | 'wall'
  | 'core'
  | 'metal'
  | 'wood'
  | 'desk'
  | 'chair'
  | 'screen'
  | 'fabric'
  | 'plant'
  | 'pot'
  | 'stair'
  | 'roof'
  | 'equipment';

export interface Box {
  group: Group;
  part: Part;
  min: Vec3;
  max: Vec3;
  /** Draw the downward face. Off for things that stand on a floor and are never seen from below. */
  bottom: boolean;
}

export const FLOORS = 3;
export const FLOOR_PITCH = 4;
const X0 = -20;
const X1 = 20;
const Z0 = -10;
const Z1 = 10;
const SLAB = 0.2;
const EXT = 0.2;
const INT = 0.12;
const WALL_H = 3.8;
const DOOR_H = 2.2;
const XI0 = X0 + EXT;
const XI1 = X1 - EXT;
const ZI0 = Z0 + EXT;
const ZI1 = Z1 - EXT;
/** North and south faces of the corridor walls. */
const CN = -1.5 - INT / 2;
const CS = 1.5 + INT / 2;

/** Hole in the 2F and 3F slabs above the stair flights. */
export const STAIR_OPENING = { x0: -3.8, x1: -0.1, z0: -7.6, z1: -4.0 } as const;
const STEPS = 11;
const LANDING_Z = STAIR_OPENING.z0;

type Gap = readonly [number, number];
type Facing = 'N' | 'S' | 'E' | 'W';

class Kit {
  constructor(
    private readonly out: Box[],
    readonly group: Group,
    readonly base: number,
  ) {}

  /** Box in floor-local Y (0 = this floor's surface). */
  box(
    part: Part,
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    y0: number,
    y1: number,
    bottom = false,
  ) {
    this.out.push({
      group: this.group,
      part,
      min: [Math.min(x0, x1), this.base + y0, Math.min(z0, z1)],
      max: [Math.max(x0, x1), this.base + y1, Math.max(z0, z1)],
      bottom,
    });
  }

  /** Wall along X centred on z, with door openings that keep a header above DOOR_H. */
  wallX(part: Part, z: number, x0: number, x1: number, gaps: Gap[] = [], t = INT) {
    this.run(x0, x1, gaps, (a, b, y0, y1) => this.box(part, a, b, z - t / 2, z + t / 2, y0, y1));
  }

  wallZ(part: Part, x: number, z0: number, z1: number, gaps: Gap[] = [], t = INT) {
    this.run(z0, z1, gaps, (a, b, y0, y1) => this.box(part, x - t / 2, x + t / 2, a, b, y0, y1));
  }

  /** Full-height glass partition along X with frame posts at its ends and door edges. */
  glassX(z: number, x0: number, x1: number, gaps: Gap[] = []) {
    this.wallX('glass', z, x0, x1, gaps, 0.04);
    for (const x of [x0, x1, ...gaps.flat()]) {
      const a = Math.max(x0, Math.min(x1 - 0.06, x - 0.03));
      this.box('mullion', a, a + 0.06, z - 0.04, z + 0.04, 0, WALL_H);
    }
  }

  private run(
    a: number,
    b: number,
    gaps: Gap[],
    put: (a: number, b: number, y0: number, y1: number) => void,
  ) {
    let at = a;
    for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
      if (g0 > at) put(at, g0, 0, WALL_H);
      put(g0, g1, DOOR_H, WALL_H);
      at = g1;
    }
    if (b > at) put(at, b, 0, WALL_H);
  }

  /**
   * Chair facing the given way: a seat (top at 0.55 m, above the 0.5 m window where the viewer puts
   * object markers) on a back panel that runs down to the floor.
   */
  chair(x: number, z: number, facing: Facing) {
    const s = 0.24;
    this.box('chair', x - s, x + s, z - s, z + s, 0.42, 0.55);
    const back = {
      N: [x - s, x + s, z + s - 0.06, z + s],
      S: [x - s, x + s, z - s, z - s + 0.06],
      E: [x - s, x - s + 0.06, z - s, z + s],
      W: [x + s - 0.06, x + s, z - s, z + s],
    }[facing];
    this.box('chair', back[0]!, back[1]!, back[2]!, back[3]!, 0, 1.0);
  }

  /** Table top with two panel legs at the ends of its long side. */
  table(part: Part, x0: number, x1: number, z0: number, z1: number, top = 0.75) {
    this.box(part, x0, x1, z0, z1, top - 0.04, top);
    const alongX = x1 - x0 >= z1 - z0;
    const inset = 0.15;
    if (alongX) {
      for (const x of [x0 + inset, x1 - inset - 0.05])
        this.box(part, x, x + 0.05, z0 + 0.05, z1 - 0.05, 0, top - 0.04);
    } else {
      for (const z of [z0 + inset, z1 - inset - 0.05])
        this.box(part, x0 + 0.05, x1 - 0.05, z, z + 0.05, 0, top - 0.04);
    }
  }

  monitor(x: number, z: number, alongX = true) {
    if (alongX) this.box('screen', x - 0.28, x + 0.28, z - 0.015, z + 0.015, 0.8, 1.12);
    else this.box('screen', x - 0.015, x + 0.015, z - 0.28, z + 0.28, 0.8, 1.12);
  }

  /** Four desks facing each other in pairs, with a privacy panel, monitors and chairs. */
  deskCluster(cx: number, cz: number) {
    const w = 1.4;
    this.box('desk', cx - w, cx + w, cz - 0.72, cz - 0.02, 0.72, 0.75);
    this.box('desk', cx - w, cx + w, cz + 0.02, cz + 0.72, 0.72, 0.75);
    for (const x of [cx - w, cx - 0.025, cx + w - 0.05])
      this.box('desk', x, x + 0.05, cz - 0.7, cz + 0.7, 0, 0.72);
    this.box('fabric', cx - w, cx + w, cz - 0.02, cz + 0.02, 0.75, 1.15);
    for (const x of [cx - w / 2, cx + w / 2]) {
      this.monitor(x, cz - 0.2);
      this.monitor(x, cz + 0.2);
      this.chair(x, cz - 1.05, 'S');
      this.chair(x, cz + 1.05, 'N');
    }
  }

  plant(x: number, z: number) {
    this.box('pot', x - 0.25, x + 0.25, z - 0.25, z + 0.25, 0, 0.6);
    this.box('plant', x - 0.4, x + 0.4, z - 0.4, z + 0.4, 0.6, 1.6);
  }

  /** Sofa with its back on the given side. Seat top at 0.55 m. */
  sofa(x0: number, x1: number, z0: number, z1: number, back: Facing) {
    this.box('fabric', x0, x1, z0, z1, 0, 0.55);
    const b = {
      N: [x0, x1, z0, z0 + 0.2],
      S: [x0, x1, z1 - 0.2, z1],
      W: [x0, x0 + 0.2, z0, z1],
      E: [x1 - 0.2, x1, z0, z1],
    }[back];
    this.box('fabric', b[0]!, b[1]!, b[2]!, b[3]!, 0.55, 0.95);
  }

  /** Two sofas facing each other across a low table. */
  lounge(cx: number, cz: number) {
    this.sofa(cx - 1.2, cx + 1.2, cz - 1.6, cz - 0.7, 'N');
    this.sofa(cx - 1.2, cx + 1.2, cz + 0.7, cz + 1.6, 'S');
    this.box('wood', cx - 0.6, cx + 0.6, cz - 0.45, cz + 0.45, 0, 0.55);
  }
}

function slab(k: Kit, n: number) {
  if (n === 1) {
    k.box('slab', X0, X1, Z0, Z1, -SLAB, 0, true);
    return;
  }
  const { x0, x1, z0, z1 } = STAIR_OPENING;
  k.box('slab', X0, x0, Z0, Z1, -SLAB, 0, true);
  k.box('slab', x1, X1, Z0, Z1, -SLAB, 0, true);
  k.box('slab', x0, x1, Z0, z0, -SLAB, 0, true);
  k.box('slab', x0, x1, z1, Z1, -SLAB, 0, true);
}

function carpet(k: Kit) {
  k.box('carpet', XI0, XI1, CS, ZI1, 0, 0.02);
  k.box('carpet', XI0, -4, ZI0, CN, 0, 0.02);
  k.box('carpet', 4, XI1, ZI0, CN, 0, 0.02);
}

/** Window band between a solid sill and head, mullions every 4 m, corner columns. */
function facade(k: Kit, storefront: boolean) {
  const sill = 0.9;
  const head = 3.4;
  const sides: { x0: number; x1: number; z0: number; z1: number; alongX: boolean }[] = [
    { x0: X0, x1: X1, z0: Z0, z1: Z0 + EXT, alongX: true },
    { x0: X0, x1: X1, z0: Z1 - EXT, z1: Z1, alongX: true },
    { x0: X0, x1: X0 + EXT, z0: ZI0, z1: ZI1, alongX: false },
    { x0: X1 - EXT, x1: X1, z0: ZI0, z1: ZI1, alongX: false },
  ];
  for (const s of sides) {
    const south = s.alongX && s.z0 > 0;
    const g = (a: number, b: number) =>
      s.alongX ? [a, b, s.z0 + 0.07, s.z0 + 0.13] : [s.x0 + 0.07, s.x0 + 0.13, a, b];
    const span = s.alongX ? [s.x0, s.x1] : [s.z0, s.z1];
    const sub = (a: number, b: number) => (s.alongX ? [a, b, s.z0, s.z1] : [s.x0, s.x1, a, b]);
    k.box('facade', ...(sub(span[0]!, span[1]!) as [number, number, number, number]), head, WALL_H);
    if (storefront && south) {
      // 1F street side: full-height glass between x = -8 and 8 with glass doors in the middle.
      for (const [a, b] of [
        [X0, -8],
        [8, X1],
      ] as const) {
        k.box('facade', ...(sub(a, b) as [number, number, number, number]), 0, sill);
        k.box('glass', ...(g(a, b) as [number, number, number, number]), sill, head);
      }
      for (const [a, b] of [
        [-8, -1.6],
        [1.6, 8],
      ] as const)
        k.box('glass', ...(g(a, b) as [number, number, number, number]), 0, head);
      for (const [a, b] of [
        [-1.55, -0.03],
        [0.03, 1.55],
      ] as const)
        k.box('glass', ...(g(a, b) as [number, number, number, number]), 0, 2.5);
      k.box('glass', ...(g(-1.6, 1.6) as [number, number, number, number]), 2.5, head);
      for (const x of [-8, -4, -1.6, 1.6, 4, 8])
        k.box('mullion', x - 0.05, x + 0.05, s.z0, s.z1, 0, head);
      for (const x of [-16, -12, 12, 16])
        k.box('mullion', x - 0.05, x + 0.05, s.z0, s.z1, sill, head);
      continue;
    }
    k.box('facade', ...(sub(span[0]!, span[1]!) as [number, number, number, number]), 0, sill);
    k.box('glass', ...(g(span[0]!, span[1]!) as [number, number, number, number]), sill, head);
    const marks = s.alongX ? [-16, -12, -8, -4, 0, 4, 8, 12, 16] : [-6, -2, 2, 6];
    for (const m of marks) {
      const [a, b, c, d] = sub(m - 0.05, m + 0.05) as [number, number, number, number];
      k.box('mullion', a, b, c, d, sill, head);
    }
  }
  for (const [x, z] of [
    [X0, Z0],
    [X1 - 0.4, Z0],
    [X0, Z1 - 0.4],
    [X1 - 0.4, Z1 - 0.4],
  ] as const)
    k.box('facade', x, x + 0.4, z, z + 0.4, 0, WALL_H);
}

/** Stair (west) and two elevators (east) north of the corridor; a closed service room behind them. */
function core(k: Kit, n: number) {
  k.box('core', -4, -3.8, ZI0, CN, 0, WALL_H);
  k.box('core', 3.8, 4, ZI0, CN, 0, WALL_H);
  k.box('core', -0.1, 0.1, ZI0, -3.5, 0, WALL_H);
  k.box('core', 0.1, 3.8, -6.8, -6.6, 0, WALL_H);
  k.box('core', 1.9, 2.0, -6.6, -3.7, 0, WALL_H);
  k.wallX(
    'core',
    -3.6,
    0.1,
    3.8,
    [
      [0.55, 1.55],
      [2.35, 3.35],
    ],
    0.2,
  );
  for (const [a, b] of [
    [0.55, 1.04],
    [1.06, 1.55],
    [2.35, 2.84],
    [2.86, 3.35],
  ] as const)
    k.box('metal', a, b, -3.64, -3.56, 0, DOOR_H);
  // Wall between the two flights.
  k.box('core', -2.0, -1.9, LANDING_Z, STAIR_OPENING.z1, 0, WALL_H);

  if (n < FLOORS) {
    const rise = FLOOR_PITCH / (2 * STEPS);
    const run = (STAIR_OPENING.z1 - LANDING_Z) / STEPS;
    for (let i = 0; i < STEPS; i++) {
      // Up flight heads north from the corridor side, the return flight heads back south.
      const up = (i + 1) * rise;
      const zA = STAIR_OPENING.z1 - i * run;
      k.box('stair', STAIR_OPENING.x0, -2.0, zA - run, zA, Math.max(0, up - 0.3), up, true);
      const back = FLOOR_PITCH / 2 + (i + 1) * rise;
      const zB = LANDING_Z + i * run;
      k.box('stair', -1.9, STAIR_OPENING.x1, zB, zB + run, back - 0.3, back, true);
    }
    k.box(
      'stair',
      STAIR_OPENING.x0,
      STAIR_OPENING.x1,
      ZI0,
      LANDING_Z,
      FLOOR_PITCH / 2 - 0.25,
      FLOOR_PITCH / 2,
      true,
    );
  } else {
    // Top floor: guard the half of the opening that has no flight going up.
    k.box(
      'glass',
      STAIR_OPENING.x0,
      -2.0,
      STAIR_OPENING.z1 - 0.03,
      STAIR_OPENING.z1 + 0.03,
      0,
      1.1,
    );
    k.box(
      'metal',
      STAIR_OPENING.x0,
      -2.0,
      STAIR_OPENING.z1 - 0.04,
      STAIR_OPENING.z1 + 0.04,
      1.1,
      1.15,
    );
  }
}

function floor1(k: Kit) {
  // Control room (north-west) with a video wall.
  k.wallX('wall', -1.5, XI0, -12, [[-14.5, -13.5]]);
  k.wallZ('wall', -12, ZI0, CN);
  k.table('desk', -19.2, -13.0, -9.6, -8.8);
  k.box('screen', -18.8, -13.4, ZI0, ZI0 + 0.06, 1.3, 2.9);
  for (const x of [-17.6, -16.1, -14.6]) {
    k.monitor(x, -9.3);
    k.chair(x, -8.2, 'N');
  }
  k.plant(-19.2, -2.4);
  // Meeting room.
  k.glassX(-1.5, -12 + INT / 2, -4, [[-6.2, -5.2]]);
  meetingRoom(k, -7.8, -5.7, 3.6, 3);
  k.box('screen', -11.94, -11.88, -6.6, -4.8, 1.0, 2.1);
  // Cafe (north-east), open to the corridor.
  k.box('wood', 6, 14, ZI0, ZI0 + 0.7, 0, 1.0);
  for (const x of [8, 11, 14, 17]) {
    k.box('wood', x - 0.4, x + 0.4, -5.9, -5.1, 0.71, 0.75);
    k.box('wood', x - 0.05, x + 0.05, -5.55, -5.45, 0, 0.71);
    k.chair(x - 0.75, -5.5, 'E');
    k.chair(x + 0.75, -5.5, 'W');
  }
  k.plant(19.2, -9.2);
  k.plant(4.6, -2.4);
  // Training room (south-west).
  k.glassX(1.5, XI0, -10, [[-12.5, -11.5]]);
  k.wallZ('wall', -10, CS, ZI1);
  for (const z of [3.6, 5.6, 7.6])
    for (const [a, b] of [
      [-18.6, -16.2],
      [-15.4, -13.0],
    ] as const) {
      k.table('desk', a, b, z - 0.3, z + 0.3);
      k.chair(a + 0.6, z + 0.75, 'N');
      k.chair(b - 0.6, z + 0.75, 'N');
    }
  k.box('screen', -10.12, -10.06, 3.2, 6.6, 1.0, 2.4);
  // Lobby: reception facing the entrance, two seating groups, plants.
  k.box('wood', -3, 3, 4.0, 4.6, 0, 1.1);
  k.table('desk', -2.6, 2.6, 3.0, 3.7);
  for (const x of [-1.2, 1.2]) {
    k.monitor(x, 3.45);
    k.chair(x, 2.55, 'S');
  }
  k.lounge(-7, 6.6);
  k.lounge(7, 6.6);
  for (const x of [-9.3, -3.6, 3.6, 9.3]) k.plant(x, 9.2);
  // Storage (south-east).
  k.wallX('wall', 1.5, 10, XI1, [[11.5, 12.5]]);
  k.wallZ('wall', 10, CS, ZI1);
  for (const z of [3.6, 6.0, 8.6]) k.box('metal', 11, 18.8, z, z + 0.5, 0, 2.0);
  // Entrance canopy.
  k.box('metal', -4, 4, Z1, Z1 + 2, 3.0, 3.2, true);
  for (const x of [-3.85, 3.7]) k.box('metal', x, x + 0.15, Z1 + 1.75, Z1 + 1.9, 0, 3.0);
}

/** Table with chairs on both long sides; `seats` per side. */
function meetingRoom(k: Kit, cx: number, cz: number, length: number, seats: number) {
  k.table('wood', cx - length / 2, cx + length / 2, cz - 0.6, cz + 0.6);
  const step = length / seats;
  for (let i = 0; i < seats; i++) {
    const x = cx - length / 2 + step * (i + 0.5);
    k.chair(x, cz - 1.05, 'S');
    k.chair(x, cz + 1.05, 'N');
  }
}

function openOffice(k: Kit, xs: number[]) {
  for (const cz of [4.0, 7.7]) for (const cx of xs) k.deskCluster(cx, cz);
}

function floor2(k: Kit) {
  // Three meeting rooms with glass fronts.
  k.glassX(-1.5, XI0, -4, [
    [-17.7, -16.7],
    [-12.5, -11.5],
    [-7.2, -6.2],
  ]);
  k.wallZ('wall', -14.6, ZI0, CN);
  k.wallZ('wall', -9.3, ZI0, CN);
  for (const [cx, screenX] of [
    [-17.2, -14.72],
    [-11.95, -9.42],
    [-6.65, -4.06],
  ] as const) {
    meetingRoom(k, cx, -5.7, 2.4, 2);
    k.box('screen', screenX, screenX + 0.06, -6.5, -4.9, 1.0, 2.0);
  }
  // Pantry, open to the corridor.
  k.box('wood', 4.4, 10.6, ZI0, ZI0 + 0.65, 0, 0.95);
  meetingRoom(k, 7.5, -5.7, 3.0, 2);
  k.plant(10.4, -2.4);
  // Two focus rooms.
  k.wallX('wall', -1.5, 11, XI1, [
    [12.7, 13.7],
    [17.1, 18.1],
  ]);
  k.wallZ('wall', 11, ZI0, CN);
  k.wallZ('wall', 15.4, ZI0, CN);
  for (const cx of [13.2, 17.6]) {
    k.table('desk', cx - 0.8, cx + 0.8, ZI0 + 0.3, ZI0 + 1.0);
    k.monitor(cx, ZI0 + 0.5);
    k.chair(cx, ZI0 + 1.45, 'N');
    k.plant(cx + 1.6, -2.4);
  }
  openOffice(k, [-16, -10, -4, 4, 10, 16]);
  for (const x of [-19.2, 0, 19.2]) k.plant(x, 5.85);
}

function floor3(k: Kit) {
  // Conference room.
  k.glassX(-1.5, XI0, -4, [[-6.5, -5.5]]);
  k.table('wood', -16.5, -8.5, -6.5, -4.9);
  for (let i = 0; i < 7; i++) {
    const x = -15.9 + i * 1.15;
    k.chair(x, -6.95, 'S');
    k.chair(x, -4.45, 'N');
  }
  k.chair(-17.0, -5.7, 'E');
  k.chair(-8.0, -5.7, 'W');
  k.box('screen', -4.06, -4.0, -6.8, -4.6, 0.9, 2.3);
  k.plant(-19.2, -9.2);
  k.plant(-19.2, -2.4);
  // Three executive offices.
  k.glassX(-1.5, 4, XI1, [
    [6.0, 7.0],
    [11.3, 12.3],
    [16.6, 17.6],
  ]);
  k.wallZ('wall', 9.3, ZI0, CN);
  k.wallZ('wall', 14.6, ZI0, CN);
  for (const cx of [6.65, 11.95, 17.2]) {
    k.table('wood', cx - 1.0, cx + 1.0, -8.0, -7.2);
    k.monitor(cx, -7.75);
    k.chair(cx, -8.55, 'S');
    k.chair(cx - 0.5, -6.6, 'N');
    k.chair(cx + 0.5, -6.6, 'N');
    k.plant(cx + 2.0, -9.2);
  }
  openOffice(k, [-16, -10, -4, 2]);
  // Lounge at the east end.
  k.lounge(10.5, 5.6);
  k.lounge(16, 5.6);
  for (const [x, z] of [
    [19.2, 2.2],
    [19.2, 9.2],
    [7.5, 9.2],
    [13.25, 9.2],
  ] as const)
    k.plant(x, z);
}

function roof(out: Box[]) {
  const k = new Kit(out, 'Roof', FLOORS * FLOOR_PITCH);
  k.box('roof', X0, X1, Z0, Z1, -SLAB, 0, true);
  k.box('facade', X0, X1, Z0, Z0 + EXT, 0, 0.9);
  k.box('facade', X0, X1, Z1 - EXT, Z1, 0, 0.9);
  k.box('facade', X0, X0 + EXT, ZI0, ZI1, 0, 0.9);
  k.box('facade', X1 - EXT, X1, ZI0, ZI1, 0, 0.9);
  // Stair and lift overrun above the core, and two rooftop air handlers.
  k.box('core', -4, 4, ZI0, -3.5, 0, 1.4);
  k.box('equipment', -15, -10, -7, -3, 0, 1.2);
  k.box('equipment', 9, 14, 3, 7, 0, 1.3);
}

export function officeLayout(): Box[] {
  const out: Box[] = [];
  for (let n = 1; n <= FLOORS; n++) {
    const k = new Kit(out, `F${n}` as Group, (n - 1) * FLOOR_PITCH);
    slab(k, n);
    carpet(k);
    facade(k, n === 1);
    core(k, n);
    [floor1, floor2, floor3][n - 1]!(k);
  }
  roof(out);
  return out;
}
