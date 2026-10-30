import { API_URL } from './api';

// v1.35.3-fix6: files.service.save() ждёт ПОЛНЫЙ data-url ("data:image/png;base64,...")
// — раньше обрезали префикс → 400 «Некорректный файл».
export async function uploadLkFile(file: File, name: string): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const r = await fetch(`${API_URL}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64: dataUrl, name }),
  });
  if (!r.ok) throw new Error('Upload failed');
  // files.service.save() возвращает { url: '/files/<name>' } — как apiFilesUploadFile.
  const saved = await r.json() as { url?: string };
  return `${API_URL}${saved.url || `/files/${name}`}`;
}
