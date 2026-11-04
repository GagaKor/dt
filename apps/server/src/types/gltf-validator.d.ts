declare module 'gltf-validator' {
  export interface ValidatorMessage {
    code: string;
    message: string;
    severity: number;
    pointer?: string;
  }
  export interface ValidatorReport {
    issues: { numErrors: number; numWarnings: number; messages: ValidatorMessage[] };
  }
  export function validateBytes(data: Uint8Array): Promise<ValidatorReport>;
}
