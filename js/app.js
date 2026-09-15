import {watchProjects,watchPublished,createQuote} from './services/portfolio-service.js';
import {quoteData} from './utils/validators.js';
import {text,safeUrl} from './utils/sanitizer.js';
import {withLoading} from './utils/loading.js';
const $=selector=>document.querySelector(selector);
const toast=message=>{const el=$('#toast');el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),3800)};
const pagination={pages:[],current:0,hasMore:false};
$('#year').textContent=new Date().getFullYear();
$('.menu-toggle').addEventListener('click',event=>{const nav=$('nav');nav.classList.toggle('open');event.currentTarget.setAttribute('aria-expanded',String(nav.classList.contains('open')))});

function enableSectionAnimations(){if(!('IntersectionObserver' in window))return;const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target)}}),{threshold:.12});document.querySelectorAll('main > section').forEach(section=>{if(section.id!=='inicio'){section.classList.add('reveal-section');observer.observe(section)}})}
enableSectionAnimations();

function projectCard(item){
  const card=document.createElement('article');card.className='project-card content-enter';
  const image=document.createElement('div');image.className='project-image';
  if(item.imagem){image.style.backgroundImage=`url("${safeUrl(item.imagem)}")`}else image.classList.add('no-image');
  image.textContent=text(item.categoria||'Projeto');
  const content=document.createElement('div');content.className='project-content';
  const title=document.createElement('h3');title.textContent=text(item.nome);
  const description=document.createElement('p');description.textContent=text(item.descricaoCurta||item.descricao||'Projeto desenvolvido sob medida.');
  const button=document.createElement('button');button.type='button';button.textContent='Ver projeto →';button.onclick=()=>openProject(item);
  content.append(title,description,button);card.append(image,content);return card;
}
function renderProjects(items){const root=$('#projects-grid');root.replaceChildren(...items.map((item,index)=>{const card=projectCard(item);card.style.setProperty('--enter-delay',`${index*80}ms`);return card}))}
function openProject(item){const modal=$('#project-modal'),content=$('#modal-content');content.replaceChildren();const title=document.createElement('h2');title.textContent=text(item.nome);const description=document.createElement('p');description.textContent=text(item.descricaoCompleta||item.descricaoCurta);content.append(title,description);if(item.tecnologias?.length){const tech=document.createElement('p');tech.textContent=`Tecnologias: ${item.tecnologias.map(text).join(', ')}`;content.append(tech)}if(item.linkDemonstracao){const link=document.createElement('a');link.className='button primary';link.href=safeUrl(item.linkDemonstracao);link.target='_blank';link.rel='noopener noreferrer';link.textContent='Ver demonstração ↗';content.append(link)}modal.hidden=false}
$('.modal-close').onclick=()=>$('#project-modal').hidden=true;$('#project-modal').onclick=e=>{if(e.target.id==='project-modal')e.currentTarget.hidden=true};
function applyProjects(items){const current=pagination.current;pagination.pages=[];for(let start=0;start<items.length;start+=6){const next=start+6<items.length;pagination.pages.push({items:items.slice(start,start+6),cursor:next?start+6:null})}if(!pagination.pages.length)pagination.pages.push({items:[],cursor:null});pagination.current=Math.min(current,pagination.pages.length-1);pagination.hasMore=pagination.current<pagination.pages.length-1;renderProjects(pagination.pages[pagination.current].items);updatePagination()}
function updatePagination(){const box=$('#projects-pagination');const previous=$('#projects-prev'),next=$('#projects-next');box.hidden=false;previous.disabled=pagination.current===0;next.disabled=pagination.current>=pagination.pages.length-1;$('#projects-page').textContent=`Página ${pagination.current+1}`}
$('#projects-prev').onclick=()=>{if(pagination.current>0){pagination.current-=1;renderProjects(pagination.pages[pagination.current].items);updatePagination()}};
$('#projects-next').onclick=()=>{if(pagination.current<pagination.pages.length-1){pagination.current+=1;renderProjects(pagination.pages[pagination.current].items);updatePagination()}};
function renderTestimonials(items){const root=$('#testimonials-grid');root.replaceChildren(...items.map((item,index)=>{const card=document.createElement('article');card.className='testimonial content-enter';card.style.setProperty('--enter-delay',`${index*80}ms`);const quote=document.createElement('p');quote.textContent=`“${text(item.texto)}”`;const by=document.createElement('footer');by.textContent=`${text(item.nome)}${item.empresa?` · ${text(item.empresa)}`:''}`;card.append(quote,by);return card}))}
function renderTechnologies(items){if(!items.length)return;const list=$('#technologies-list');list.replaceChildren(...items.map((item,index)=>Object.assign(document.createElement('span'),{textContent:text(item.nome),className:'content-enter',style:`--enter-delay:${index*60}ms`})))}
function load(){watchProjects(applyProjects);watchPublished('testimonials',[{nome:'Cliente DEVXIS',empresa:'Empresa parceira',texto:'Atendimento profissional, cuidadoso e solução muito bem executada.',avaliacao:5}],renderTestimonials);watchPublished('technologies',[],renderTechnologies)}
load();
let lastSubmit=0;$('#quote-form').addEventListener('submit',async event=>{event.preventDefault();if(event.currentTarget.site.value)return; if(Date.now()-lastSubmit<30000)return toast('Aguarde um instante antes de enviar novamente.');const button=event.currentTarget.querySelector('[type=submit]');try{const data=quoteData(event.currentTarget);button.disabled=true;await withLoading(()=>createQuote(data),'Enviando seu pedido…');lastSubmit=Date.now();event.currentTarget.reset();toast('Pedido enviado! Vou retornar em breve.')}catch(error){toast(error.message||'Não foi possível enviar o pedido.')}finally{button.disabled=false}});
