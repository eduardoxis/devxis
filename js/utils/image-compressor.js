// Seis imagens permanecem abaixo do limite de 1 MiB do documento Firestore.
const MAX_BYTES = 100 * 1024;
const MAX_DIMENSION = 6000;
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

async function hasValidImageSignature(file) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const starts = (...values) => values.every((value, index) => bytes[index] === value);
  return starts(0xff, 0xd8, 0xff) || starts(0x89, 0x50, 0x4e, 0x47) ||
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP' ||
    String.fromCharCode(...bytes.slice(0, 6)) === 'GIF87a' || String.fromCharCode(...bytes.slice(0, 6)) === 'GIF89a' ||
    String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp';
}

function canvasToDataUrl(canvas, quality) {
  return canvas.toDataURL('image/webp', quality);
}

export async function compressImage(file) {
  if (!file || !allowedTypes.has(file.type) || !(await hasValidImageSignature(file))) {
    throw new Error('Escolha uma imagem válida.');
  }

  if (file.size > 8 * 1024 * 1024) {
    throw new Error('A imagem deve ter no máximo 8 MB antes da compressão.');
  }

  const bitmap = await createImageBitmap(file);
  if (!bitmap.width || !bitmap.height || bitmap.width > MAX_DIMENSION || bitmap.height > MAX_DIMENSION) {
    bitmap.close();
    throw new Error('A imagem possui dimensões muito grandes.');
  }
  let width = Math.min(bitmap.width, 1280);
  let height = Math.round(bitmap.height * (width / bitmap.width));
  let output = '';

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d', { alpha: false }).drawImage(bitmap, 0, 0, width, height);

    output = canvasToDataUrl(canvas, Math.max(0.52, 0.84 - attempt * 0.07));
    if (Math.ceil(output.length * 0.75) <= MAX_BYTES) break;

    width = Math.round(width * 0.8);
    height = Math.round(height * 0.8);
  }

  bitmap.close();

  if (Math.ceil(output.length * 0.75) > MAX_BYTES) {
    throw new Error('Não foi possível comprimir a imagem com segurança. Use uma imagem mais simples.');
  }

  return output;
}
