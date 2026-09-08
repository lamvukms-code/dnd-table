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
  const res = await fetch('/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dataUrl, name: file.name }),
  });
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !body.url) throw new Error(body.error || `Upload lỗi (${res.status})`);
  return body.url;
}
