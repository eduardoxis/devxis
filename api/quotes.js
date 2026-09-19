import {getAdminDb} from './_firebase-admin.js';
import {rateLimit} from './_rate-limit.js';

export const config={api:{bodyParser:{sizeLimit:'16kb'}}};

const TYPES=new Set(['Landing page','Site institucional','Sistema web','Loja virtual','Manutenção','Outro']);
const BUDGETS=new Set(['Até R$ 2.000','R$ 2.000 a R$ 5.000','R$ 5.000 a R$ 10.000','Acima de R$ 10.000']);
const FIELDS=new Set(['nome','email','whatsapp','tipoSistema','faixaOrcamento','descricao','empresa','prazo','site']);
const clean=value=>typeof value==='string'?value.trim().replace(/[\u0000-\u001F\u007F]/g,''):'';
const fail=(response,status,error)=>response.status(status).json({error});
const ipOf=request=>String(request.headers['x-forwarded-for']||request.socket?.remoteAddress||'unknown').split(',')[0].trim();
function allowedOrigin(request){
  const origin=request.headers.origin;
  if(!origin)return true;
  const configured=(process.env.ALLOWED_ORIGINS||'').split(',').map(value=>value.trim()).filter(Boolean);
  if(configured.includes(origin))return true;
  const host=String(request.headers.host||'').toLowerCase();
  if(origin===`https://${host}`||origin===`http://${host}`)return true;
  return process.env.NODE_ENV!=='production' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}
export function validateQuotePayload(body){
  if(!body||typeof body!=='object'||Array.isArray(body))return {error:'Dados inválidos.'};
  if(Object.keys(body).some(key=>!FIELDS.has(key)))return {error:'Dados inválidos.'};
  const quote={nome:clean(body.nome),email:clean(body.email).toLowerCase(),whatsapp:clean(body.whatsapp),tipoSistema:clean(body.tipoSistema),faixaOrcamento:clean(body.faixaOrcamento),descricao:clean(body.descricao),empresa:clean(body.empresa),prazo:clean(body.prazo)};
  if(!quote.nome||quote.nome.length<2||quote.nome.length>100)return {error:'Confira o nome informado.'};
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(quote.email)||quote.email.length>160)return {error:'Confira o e-mail informado.'};
  if(!/^[+()\s0-9-]{8,25}$/.test(quote.whatsapp))return {error:'Confira o WhatsApp informado.'};
  if(!TYPES.has(quote.tipoSistema)||!BUDGETS.has(quote.faixaOrcamento))return {error:'Selecione opções válidas para o projeto.'};
  if(quote.descricao.length<10||quote.descricao.length>3000)return {error:'A descrição deve ter entre 10 e 3000 caracteres.'};
  if(quote.empresa.length>120||quote.prazo.length>80)return {error:'Um dos campos ultrapassou o limite permitido.'};
  return {quote};
}
export default async function handler(request,response){
  response.setHeader('Cache-Control','private, no-store, max-age=0');
  if(request.method!=='POST'){response.setHeader('Allow','POST');return fail(response,405,'Método não permitido.')}
  if(!allowedOrigin(request))return fail(response,403,'Origem não permitida.');
  if(!String(request.headers['content-type']||'').toLowerCase().startsWith('application/json'))return fail(response,415,'Envie os dados no formato JSON.');
  if(Number(request.headers['content-length']||0)>16*1024)return fail(response,413,'Dados muito grandes.');
  const body=request.body||{};
  if(body.site)return response.status(200).json({ok:true}); // honeypot, resposta neutra para bots
  const checked=validateQuotePayload(body);
  if(checked.error)return fail(response,400,checked.error);
  try{
    if(!await rateLimit(`${ipOf(request)}:${checked.quote.email}`))return fail(response,429,'Aguarde alguns minutos antes de enviar outro pedido.');
    await getAdminDb().collection('quotes').add({...checked.quote,status:'novo',criadoEm:new Date(),origem:'site'});
    return response.status(201).json({ok:true});
  }catch(error){
    const unavailable=error?.message==='Firebase Admin não configurado.'||error?.message==='Rate limit não configurado.';
    const credentialError=/credential|private key|invalid grant|unauthenticated|decoder|pem/i.test(`${error?.code||''} ${error?.message||''}`);
    console.error('quote_submission_failed',{code:error?.code||'unknown',message:error?.message||'unknown'});
    if(credentialError)return fail(response,503,'A conexão segura do formulário precisa ser revisada.');
    return fail(response,unavailable?503:500,unavailable?'O envio está temporariamente indisponível. Tente novamente em alguns minutos.':'Não foi possível registrar o pedido agora.');
  }
}
