import {adminDb} from './_firebase-admin.js';
import {rateLimit} from './_rate-limit.js';

const clean=value=>String(value||'').trim().replace(/[<>]/g,'');
export default async function handler(request,response){
  if(request.method!=='POST'){response.setHeader('Allow','POST');return response.status(405).json({error:'Método não permitido.'})}
  const body=request.body||{};
  if(body.site)return response.status(200).json({ok:true});
  const quote={nome:clean(body.nome),email:clean(body.email).toLowerCase(),whatsapp:clean(body.whatsapp),tipoSistema:clean(body.tipoSistema),faixaOrcamento:clean(body.faixaOrcamento),descricao:clean(body.descricao),empresa:clean(body.empresa),prazo:clean(body.prazo)};
  if(!quote.nome||!/^\S+@\S+\.\S+$/.test(quote.email)||!quote.whatsapp||!quote.tipoSistema||!quote.faixaOrcamento||!quote.descricao)return response.status(400).json({error:'Preencha todos os campos obrigatórios.'});
  if(quote.nome.length>100||quote.descricao.length>3000)return response.status(400).json({error:'Um dos campos ultrapassou o limite permitido.'});
  const ip=String(request.headers['x-forwarded-for']||request.socket?.remoteAddress||'unknown').split(',')[0];
  if(!rateLimit(`${ip}:${quote.email}`))return response.status(429).json({error:'Aguarde alguns minutos antes de enviar outro pedido.'});
  try{await adminDb.collection('quotes').add({...quote,status:'novo',criadoEm:new Date(),origem:'site'});return response.status(201).json({ok:true})}catch(error){console.error('quote create',error);return response.status(500).json({error:'Não foi possível registrar o pedido agora.'})}
}
