import type { ModelUploadResult } from '@dt/shared';
import { ApiError } from './client';

// fetch has no upload progress events, hence XMLHttpRequest.
export function uploadModel(
  siteId: string,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<ModelUploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `/api/sites/${encodeURIComponent(siteId)}/model`);
    xhr.withCredentials = true;
    xhr.responseType = 'text';
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onerror = () => reject(new ApiError(0, 'network_error', 'Network error'));
    xhr.onload = () => {
      let body: { code?: string; message?: string; details?: unknown } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // non-JSON body
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as unknown as ModelUploadResult);
      else
        reject(
          new ApiError(
            xhr.status,
            body.code ?? 'http_error',
            body.message ?? xhr.statusText,
            body.details,
          ),
        );
    };
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}
