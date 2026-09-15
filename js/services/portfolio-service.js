import { db, firebaseReady } from '../../firebase/firebase-config.js';
import {
  collection,
  getDocs,
  query,
  where,
  limit,
  onSnapshot,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const CACHE_PREFIX = 'devxis-public-v2:';
const CACHE_MS = 10 * 60 * 1000;
let publicProjects = null;
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
function byNewest(first, second) {
  return (second.ordem || 0) - (first.ordem || 0);
}
function publicQuery(name, maxItems) {
  return query(collection(db, name), where('publicado', '==', true), limit(maxItems));
}

export async function getProjectsPage(cursor = 0, pageSize = 6) {
  if (!firebaseReady) return { items: [], cursor: null, hasMore: false };

  try {
    if (!publicProjects) {
      const snapshot = await getDocs(
        publicQuery('projects', 30),
      );
      publicProjects = mapDocs(snapshot).sort(byNewest);
    }

    const offset = Number(cursor) || 0;
    const items = publicProjects.slice(offset, offset + pageSize);
    const nextOffset = offset + pageSize;
    const hasMore = nextOffset < publicProjects.length;
    return { items, cursor: hasMore ? nextOffset : null, hasMore };
  } catch (error) {
    console.warn('Projetos públicos indisponíveis.', error.code || error);
    return { items: [], cursor: null, hasMore: false };
  }
}

export async function getPublished(name, fallback = []) {
  const cached = readCache(name);
  if (cached) return cached;
  if (!firebaseReady) return fallback;

  try {
    const snapshot = await getDocs(publicQuery(name, 12));
    const items = mapDocs(snapshot).sort((first, second) => (first.ordem || 0) - (second.ordem || 0));
    saveCache(name, items);
    return items;
  } catch (error) {
    console.warn(`Conteúdo público "${name}" indisponível; usando conteúdo inicial.`, error.code || error);
    return fallback;
  }
}

export function watchProjects(onChange) {
  if (!firebaseReady) {
    onChange([]);
    return () => {};
  }

  return onSnapshot(
    publicQuery('projects', 30),
    (snapshot) => {
      publicProjects = mapDocs(snapshot).sort(byNewest);
      onChange(publicProjects);
    },
    (error) => console.warn('Atualização de projetos indisponível.', error.code || error),
  );
}

export function watchPublished(name, fallback, onChange) {
  if (!firebaseReady) {
    onChange(fallback);
    return () => {};
  }

  return onSnapshot(
    publicQuery(name, 12),
    (snapshot) => onChange(mapDocs(snapshot).sort(byNewest)),
    (error) => {
      console.warn(`Atualização de "${name}" indisponível.`, error.code || error);
      onChange(fallback);
    },
  );
}
export const getTestimonials = () => getPublished('testimonials', [{ nome: 'Cliente DEVXIS', empresa: 'Empresa parceira', texto: 'Atendimento profissional, cuidadoso e solução muito bem executada.', avaliacao: 5 }]);
export const getTechnologies = () => getPublished('technologies', []);

export async function createQuote(data) {
  const response = await fetch('/api/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Não foi possível enviar a solicitação.');
  return result;
}
