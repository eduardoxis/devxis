const overlay=document.querySelector('#global-loading');
const message=document.querySelector('#loading-message');
let active=0;

export function showLoading(label='Carregando…'){
  active+=1;
  if(message)message.textContent=label;
  if(overlay)overlay.hidden=false;
}

export function hideLoading(){
  active=Math.max(0,active-1);
  if(active===0&&overlay)overlay.hidden=true;
}

export async function withLoading(task, label) {
  showLoading(label);
  try {
    return await task();
  } finally {
    hideLoading();
  }
}
