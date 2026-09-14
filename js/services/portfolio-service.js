import { db, firebaseReady } from '../../firebase/firebase-config.js';
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const CACHE_PREFIX = 'devxis-public-v2:';
const CACHE_MS = 10 * 60 * 1000;
const samples = [
  { nome: 'Portal para consultoria', descricaoCurta: 'Site institucional com páginas estratégicas e captação de novos contatos.', categoria: 'Website' },
  { nome: 'Sistema de orçamentos', descricaoCurta: 'Painel para criar, enviar e acompanhar propostas em um só lugar.', categoria: 'Sistema web' },
  { nome: 'Área do cliente', descricaoCurta: 'Uma experiência simples para solicitações, documentos e acompanhamento.', categoria: 'Plataforma' },
];
function readCache(key) {
  try {
    const data = JSON.parse(sessionStorage.getItem(CACHE_PREFIX + key));
    return data && Date.now() - data.at < CACHE_MS ? data.value : null;
  } catch {
    return null;
  }
}
function saveCache(key, value) {
  try {
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), value }));
  } catch {}
}
function mapDocs(snapshot) {
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function getProjectsPage(cursor = null, pageSize = 6) {
  if (!firebaseReady) return { items: samples, cursor: null, hasMore: false };
  const constraints = [where('publicado', '==', true), orderBy('ordem', 'asc'), limit(pageSize + 1)];
  if (cursor) constraints.splice(2, 0, startAfter(cursor));
  const snapshot = await getDocs(query(collection(db, 'projects'), ...constraints));
  const docs = snapshot.docs;
  const hasMore = docs.length > pageSize;
  const visible = docs.slice(0, pageSize);
  return { items: visible.map((doc) => ({ id: doc.id, ...doc.data() })), cursor: visible.at(-1) || null, hasMore };
}

export async function getPublished(name, fallback = []) {
  const cached = readCache(name);
  if (cached) return cached;
  if (!firebaseReady) return fallback;
  const snapshot = await getDocs(query(collection(db, name), where('publicado', '==', true), orderBy('ordem', 'asc'), limit(12)));
  const items = mapDocs(snapshot);
  saveCache(name, items);
  return items;
}
export const getTestimonials = () => getPublished('testimonials', [{ nome: 'Cliente DEVXIS', empresa: 'Empresa parceira', texto: 'Atendimento profissional, cuidadoso e solução muito bem executada.', avaliacao: 5 }]);
export const getTechnologies = () => getPublished('technologies', []);

export async function createQuote(data) {
  const response = await fetch('/api/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Não foi possível enviar a solicitação.');
  return result;
}
