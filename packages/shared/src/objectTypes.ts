export const OBJECT_TYPES = ['person', 'vehicle', 'object'] as const;
export type ObjectType = (typeof OBJECT_TYPES)[number];
