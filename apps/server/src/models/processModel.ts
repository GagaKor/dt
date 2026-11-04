import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { dedup, getBounds, meshopt, weld } from '@gltf-transform/functions';
import type { FloorRange, ModelWarning } from '@dt/shared';
import draco3d from 'draco3dgltf';
import { validateBytes } from 'gltf-validator';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { suggestFloors } from './floorSuggestion.js';

export type ModelErrorCode = 'not_glb' | 'invalid_gltf' | 'unsupported_extension';

export class ModelError extends Error {
  constructor(
    public readonly code: ModelErrorCode,
    message: string,
    public readonly details: string[] = [],
  ) {
    super(message);
    this.name = 'ModelError';
  }
}

export interface ProcessedModel {
  glb: Uint8Array;
  floorSuggestion: FloorRange[];
  warnings: ModelWarning[];
  bounds: { min: [number, number, number]; max: [number, number, number] };
}

// Texture extensions that need an extra wasm decoder in the browser are rejected;
// everything else is allowed.
const DENIED_TEXTURE_EXTENSION = /^(KHR|EXT)_texture_/;
const ALLOWED_TEXTURE_EXTENSIONS = new Set(['KHR_texture_transform', 'EXT_texture_webp']);
export const UNSUPPORTED_EXTENSIONS = {
  isDenied: (name: string): boolean =>
    DENIED_TEXTURE_EXTENSION.test(name) && !ALLOWED_TEXTURE_EXTENSIONS.has(name),
};

const TOO_LARGE_HEIGHT_M = 300;
const TOO_SMALL_HEIGHT_M = 1.5;
const MAX_VALIDATOR_DETAILS = 5;

let ioPromise: Promise<NodeIO> | undefined;
function getIo(): Promise<NodeIO> {
  ioPromise ??= (async () => {
    await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
    return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'meshopt.decoder': MeshoptDecoder,
      'meshopt.encoder': MeshoptEncoder,
    });
  })();
  return ioPromise;
}

export async function processModel(input: Uint8Array): Promise<ProcessedModel> {
  const magic = new TextDecoder().decode(input.subarray(0, 4));
  if (input.length < 12 || magic !== 'glTF') {
    throw new ModelError('not_glb', 'The file is not a binary glTF (.glb) model.');
  }

  const report = await validateBytes(input);
  if (report.issues.numErrors > 0) {
    const details = report.issues.messages
      .filter((m) => m.severity === 0)
      .slice(0, MAX_VALIDATOR_DETAILS)
      .map((m) => (m.pointer ? `${m.message} (${m.pointer})` : m.message));
    throw new ModelError('invalid_gltf', 'The model file is not a valid glTF 2.0 file.', details);
  }

  const io = await getIo();
  let doc;
  try {
    doc = await io.readBinary(input);
  } catch (e) {
    throw new ModelError('invalid_gltf', 'The model file could not be read.', [
      e instanceof Error ? e.message : String(e),
    ]);
  }

  const denied = doc
    .getRoot()
    .listExtensionsUsed()
    .map((e) => e.extensionName)
    .filter((name) => UNSUPPORTED_EXTENSIONS.isDenied(name));
  if (denied.length > 0) {
    throw new ModelError(
      'unsupported_extension',
      'The model uses compressed textures that this viewer cannot display. Re-export it with PNG, JPEG or WebP textures.',
      denied,
    );
  }

  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const bounds = scene ? getBounds(scene) : undefined;
  if (!bounds || !bounds.min.every(Number.isFinite) || !bounds.max.every(Number.isFinite)) {
    throw new ModelError('invalid_gltf', 'The model contains no visible geometry.');
  }
  const floorSuggestion = suggestFloors(doc, { minY: bounds.min[1], maxY: bounds.max[1] });

  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if (ext.extensionName === KHRDracoMeshCompression.EXTENSION_NAME) ext.dispose();
  }
  await doc.transform(dedup(), weld(), meshopt({ encoder: MeshoptEncoder }));
  const glb = await io.writeBinary(doc);

  const height = bounds.max[1] - bounds.min[1];
  const warnings: ModelWarning[] = [];
  if (height > TOO_LARGE_HEIGHT_M) warnings.push('units_suspect_too_large');
  if (height < TOO_SMALL_HEIGHT_M) warnings.push('units_suspect_too_small');

  return { glb, floorSuggestion, warnings, bounds: { min: bounds.min, max: bounds.max } };
}
