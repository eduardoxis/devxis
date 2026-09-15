import {getProjectsPage,getTestimonials,getTechnologies,createQuote} from './services/portfolio-service.js';
import {quoteData} from './utils/validators.js';
import {text,safeUrl} from './utils/sanitizer.js';
import {withLoading} from './utils/loading.js';
const $=selector=>document.querySelector(selector);
const toast=message=>{const el=$('#toast');el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),3800)};
const pagination={pages:[],current:0,hasMore:false};
$('#year').textContent=new Date().getFullYear();
$('.menu-toggle').addEventListener('click',event=>{const nav=$('nav');nav.classList.toggle('open');event.currentTarget.setAttribute('aria-expanded',String(nav.classList.contains('open')))});

function projectCard(item){
  const card=document.createElement('article');card.className='project-card';
  const image=document.createElement('div');image.className='project-image';
  if(item.imagem){image.style.backgroundImage=`url("${safeUrl(item.imagem)}")`}else image.classList.add('no-image');
  image.textContent=text(item.categoria||'Projeto');
  const content=document.createElement('div');content.className='project-content';
  const title=document.createElement('h3');title.textContent=text(item.nome);
  const description=document.createElement('p');description.textContent=text(item.descricaoCurta||item.descricao||'Projeto desenvolvido sob medida.');
  const button=document.createElement('button');button.type='button';button.textContent='Ver projeto →';button.onclick=()=>openProject(item);
  content.append(title,description,button);card.append(image,content);return card;
}
function renderProjects(items){const root=$('#projects-grid');root.replaceChildren(...items.map(projectCard))}
function openProject(item){const modal=$('#project-modal'),content=$('#modal-content');content.replaceChildren();const title=document.createElement('h2');title.textContent=text(item.nome);const description=document.createElement('p');description.textContent=text(item.descricaoCompleta||item.descricaoCurta);content.append(title,description);if(item.tecnologias?.length){const tech=document.createElement('p');tech.textContent=`Tecnologias: ${item.tecnologias.map(text).join(', ')}`;content.append(tech)}if(item.linkDemonstracao){const link=document.createElement('a');link.className='button primary';link.href=safeUrl(item.linkDemonstracao);link.target='_blank';link.rel='noopener noreferrer';link.textContent='Ver demonstração ↗';content.append(link)}modal.hidden=false}
$('.modal-close').onclick=()=>$('#project-modal').hidden=true;$('#project-modal').onclick=e=>{if(e.target.id==='project-modal')e.currentTarget.hidden=true};
async function loadProjects(next=false){
  if(next&&pagination.current<pagination.pages.length-1){pagination.current+=1;renderProjects(pagination.pages[pagination.current].items);updatePagination();return}
  const cursor=pagination.pages.at(-1)?.cursor||null;
  const result=await withLoading(()=>getProjectsPage(cursor),'Carregando projetos…');
  pagination.pages.push(result);pagination.current=pagination.pages.length-1;pagination.hasMore=result.hasMore;renderProjects(result.items);updatePagination();
}
function updatePagination(){const box=$('#projects-pagination');const previous=$('#projects-prev'),next=$('#projects-next');box.hidden=false;previous.disabled=pagination.current===0;next.disabled=!pagination.hasMore&&pagination.current===pagination.pages.length-1;$('#projects-page').textContent=`Página ${pagination.current+1}`}
$('#projects-prev').onclick=()=>{if(pagination.current>0){pagination.current-=1;renderProjects(pagination.pages[pagination.current].items);updatePagination()}};
$('#projects-next').onclick=()=>loadProjects(true).catch(()=>toast('Não foi possível carregar mais projetos.'));
function renderTestimonials(items){const root=$('#testimonials-grid');root.replaceChildren(...items.map(item=>{const card=document.createElement('article');card.className='testimonial';const quote=document.createElement('p');quote.textContent=`“${text(item.texto)}”`;const by=document.createElement('footer');by.textContent=`${text(item.nome)}${item.empresa?` · ${text(item.empresa)}`:''}`;card.append(quote,by);return card}))}
async function load(){try{await loadProjects();const [testimonials,technologies]=await withLoading(()=>Promise.all([getTestimonials(),getTechnologies()]),'Preparando conteúdo…');renderTestimonials(testimonials);if(technologies.length){const list=$('#technologies-list');list.replaceChildren(...technologies.map(item=>Object.assign(document.createElement('span'),{textContent:text(item.nome)})))}}catch(error){console.warn('Não foi possível atualizar um conteúdo público.',error)}}
load();
let lastSubmit=0;$('#quote-form').addEventListener('submit',async event=>{event.preventDefault();if(event.currentTarget.site.value)return; if(Date.now()-lastSubmit<30000)return toast('Aguarde um instante antes de enviar novamente.');const button=event.currentTarget.querySelector('[type=submit]');try{const data=quoteData(event.currentTarget);button.disabled=true;await withLoading(()=>createQuote(data),'Enviando seu pedido…');lastSubmit=Date.now();event.currentTarget.reset();toast('Pedido enviado! Vou retornar em breve.')}catch(error){toast(error.message||'Não foi possível enviar o pedido.')}finally{button.disabled=false}});
