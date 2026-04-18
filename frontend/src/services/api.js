const BASE_URL = 'http://localhost:8000';

async function handleResponse(response) {
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const j = await response.json();
      if (j && j.detail) detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
    } catch (_) { /* non-JSON */ }
    throw new Error(detail);
  }
  return response.json();
}

export async function analyzeDocument(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE_URL}/analyze`, { method: 'POST', body: form });
  return handleResponse(res);
}

export async function applyAdversarial(fileBase64, operation, intensity, filename) {
  const res = await fetch(`${BASE_URL}/adversarial/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_base64: fileBase64, operation, intensity, filename }),
  });
  return handleResponse(res);
}

export async function runOcr(fileBase64, filename) {
  const res = await fetch(`${BASE_URL}/ocr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_base64: fileBase64, filename }),
  });
  return handleResponse(res);
}

export function resolveAssetUrl(path) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  if (path.startsWith('/')) return `${BASE_URL}${path}`;
  return `${BASE_URL}/${path}`;
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = reader.result || '';
      const comma = s.indexOf(',');
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export { BASE_URL };
