export const text = (value) => String(value ?? '').replace(/[\u0000-\u001F\u007F<>]/g, '').trim();

export const safeUrl = (value) => {
  const rawValue = String(value ?? '').trim();
  if (rawValue.length <= 180000 && /^data:image\/(avif|gif|jpe?g|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(rawValue)) {
    return rawValue;
  }

  try {
    const url = new URL(rawValue);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '#';
  } catch {
    return '#';
  }
};
