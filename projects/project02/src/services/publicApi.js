import { loadCachedQuote, saveCachedQuote } from './localStorageService.js';

export async function fetchMotivationQuote({ force = false } = {}) {
  const cached = loadCachedQuote();
  if (!force && cached && cached.content) {
    console.log('publicApi: returning cached quote');
    return { source: 'cache', quote: cached };
  }

  const resp = await fetch("https://randomfox.ca/floof/");
  if (!resp.ok) {
    throw new Error("Failed to fetch fox image");
  }

  const data = await resp.json();
  console.log('publicApi.fetchMotivationQuote: remote data=', data);
  const imageUrl = data?.message || data?.image || data?.url || null;
  if (!imageUrl) {
    console.warn('publicApi: no image URL found in response', data);
    const empty = { content: null, author: null };
    saveCachedQuote(empty);
    return { source: 'network', quote: empty };
  }

  const quote = {
    content: imageUrl,
    author: 'Random Image'
  };

  console.log('publicApi.fetchMotivationQuote: mapped quote=', quote);
  saveCachedQuote(quote);
  return { source: 'network', quote };
}
