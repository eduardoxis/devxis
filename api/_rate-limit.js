const hits=new Map();
export function rateLimit(key,max=4,windowMs=10*60*1000){const now=Date.now();const values=(hits.get(key)||[]).filter(at=>now-at<windowMs);if(values.length>=max)return false;values.push(now);hits.set(key,values);return true}
