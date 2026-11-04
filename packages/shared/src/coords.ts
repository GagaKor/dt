export function planToModel(p: { x: number; y: number }): { X: number; Z: number } {
  return { X: p.x, Z: -p.y };
}

export function modelToPlan(p: { X: number; Z: number }): { x: number; y: number } {
  return { x: p.X, y: -p.Z };
}
