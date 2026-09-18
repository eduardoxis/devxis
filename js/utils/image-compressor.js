const MAX_BYTES = 130 * 1024;

function canvasToDataUrl(canvas, quality) {
  return canvas.toDataURL('image/webp', quality);
}

export async function compressImage(file) {
  if (!file?.type?.startsWith('image/')) {
    throw new Error('Escolha uma imagem válida.');
  }

  if (file.size > 8 * 1024 * 1024) {
    throw new Error('A imagem deve ter no máximo 8 MB antes da compressão.');
  }

  const bitmap = await createImageBitmap(file);
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
