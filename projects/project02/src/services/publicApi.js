import { loadCachedFoxImage, saveCachedFoxImage } from './localStorageService.js';

export async function fetchFoxImage({ force = false } = {}) {
  const cached = loadCachedFoxImage();
  if (!force && cached && cached.content) {
    console.log('publicApi: returning cached fox image');
    return { source: 'cache', foxImage: cached };
  }

  const resp = await fetch("https://randomfox.ca/floof/");
  if (!resp.ok) {
    throw new Error("Failed to fetch fox image");
  }

  const data = await resp.json();
  console.log('publicApi.fetchFoxImage: remote data=', data);
  const imageUrl = data?.message || data?.image || data?.url || null;
  if (!imageUrl) {
    console.warn('publicApi: no image URL found in response', data);
    const empty = { content: null, author: null };
    saveCachedFoxImage(empty);
    return { source: 'network', foxImage: empty };
  }

  const foxImage = {
    content: imageUrl,
    author: 'Random Fox'
  };

  console.log('publicApi.fetchFoxImage: mapped foxImage=', foxImage);
  saveCachedFoxImage(foxImage);
  return { source: 'network', foxImage };
}
