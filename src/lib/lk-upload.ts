import { API_URL } from './api';

export async function uploadLkFile(file: File, name: string): Promise<string> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const r = await fetch(`${API_URL}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64, name }),
  });
  if (!r.ok) throw new Error('Upload failed');
  const saved = await r.json() as { name?: string };
  return `${API_URL}/files/${saved.name || name}`;
}
