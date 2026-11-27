import { storedCredentials } from './store.js';

/** Upload an image file to the server; returns the served URL (e.g. "/uploads/ab12.png"). */
export async function uploadImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Không phải ảnh');
  if (file.size > 6 * 1024 * 1024) throw new Error('Ảnh quá lớn (tối đa 6MB)');
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Đọc file lỗi'));
    r.readAsDataURL(file);
  });
  return uploadDataUrl(dataUrl, file.name);
}

/** Upload an already-encoded image (e.g. a token rendered on a canvas); returns its URL. */
export async function uploadDataUrl(dataUrl: string, name: string): Promise<string> {
  const creds = storedCredentials();
  const res = await fetch('/upload', {
    method: 'POST',
    // only people at the table may upload (the server checks this identity)
    headers: {
      'content-type': 'application/json',
      'x-participant-id': creds.participantId ?? '',
      'x-participant-secret': creds.secret ?? '',
    },
    body: JSON.stringify({ dataUrl, name }),
  });
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !body.url) throw new Error(body.error || `Upload lỗi (${res.status})`);
  return body.url;
}
