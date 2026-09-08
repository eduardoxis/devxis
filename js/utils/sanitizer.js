export const text=value=>String(value??'').replace(/[<>]/g,'').trim();
export const safeUrl=value=>{try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:'#'}catch{return '#'}};
