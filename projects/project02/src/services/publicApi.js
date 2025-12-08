// Simple public GET example: fetch a random programming/tech quote

import { loadCachedQuote, saveCachedQuote } from './localStorageService.js';

export async function fetchMotivationQuote() {
  const cached = loadCachedQuote();
  if (cached) {
    return { source: 'cache', quote: cached };
  }
  const resp = await fetch('https://api.quotable.io/random?tags=technology,famous-quotes', {
    method: 'GET'
  });
  if (!resp.ok) {
    throw new Error('Failed to fetch quote');
  }
  const data = await resp.json();
  const quote = {
    content: data.content,
    author: data.author
  };
  saveCachedQuote(quote);
  return { source: 'network', quote };
}
