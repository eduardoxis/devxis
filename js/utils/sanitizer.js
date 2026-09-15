export const text = (value) => String(value ?? '').replace(/[<>]/g, '').trim();

export const safeUrl = (value) => {
  const rawValue = String(value ?? '').trim();
  if (/^data:image\/(avif|gif|jpe?g|png|webp);base64,/i.test(rawValue)) {
    return rawValue;
  }

  try {
    const url = new URL(rawValue);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '#';
  } catch {
    return '#';
  }
};
