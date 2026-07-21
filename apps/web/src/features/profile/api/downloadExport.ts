import { API_BASE } from '@/lib/apiClient';

/** File download, not JSON+zod — bypasses `apiFetch` on purpose. */
export async function downloadExport(format: 'csv' | 'json'): Promise<void> {
  const res = await fetch(`${API_BASE}/me/export?format=${format}`);
  if (!res.ok) throw new Error(`Export failed (${res.status})`);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `wortgarten-words.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
