import { writeOfficeGlb } from './buildOffice';
import { repoPath } from './paths';

const out = repoPath('samples', 'office-3f.glb');
await writeOfficeGlb(out);
console.log(`wrote ${out}`);
