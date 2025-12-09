import { h, clearChildren } from '../utils/dom.js';
import { setState, getState } from '../state/store.js';
import { fetchFoxImage } from '../services/publicApi.js';

export function renderHome(root) {
  const state = getState();
  clearChildren(root);
  // If we haven't attempted to load an image yet, start one automatically
  if (state.foxImageStatus === 'idle') {
    // fire-and-forget fetch to populate state; render cycle will update
    (async () => {
      try {
        setState({ foxImageStatus: 'loading' });
        const { foxImage } = await fetchFoxImage();
        setState({ foxImageStatus: 'success', foxImage });
      } catch (err) {
        console.warn('Failed to fetch image on load', err);
        setState({ foxImageStatus: 'error', foxImageError: err.message });
      }
    })();
  }
 
  let imageNode = null;
  if (state.foxImageStatus === 'loading') {
    imageNode = h('p', { className: 'fox-loading' }, 'Loading fox...');
  } else if (state.foxImageStatus === 'error') {
    imageNode = h('p', { className: 'fox-error' }, 'Fox unavailable');
  } else if (state.foxImage && state.foxImage.content) {
    imageNode = h('div', { className: 'random-image' },
      h('img', { src: state.foxImage.content, alt: state.foxImage.author || 'Random fox', style: 'max-width:100%; height:auto; border-radius:8px;' }),
      h('div', { className: 'image-caption' }, state.foxImage.author || ''),
      h('div', { className: 'image-link' }, h('a', { href: state.foxImage.content, target: '_blank' }, 'Open image in new tab'))
    );
  } else {
    imageNode = h('p', {}, '');
  }

  const container = h('div', { className: 'home-view' },
    h('h1', {}, 'Minesweeper'),
    imageNode,
    h('div', { className: 'home-actions' },
      h('button', {
        onClick: () => setState({ view: 'game' })
      }, 'Play'),
      h('button', {
        onClick: () => setState({ view: 'settings' })
      }, 'Settings'),
      h('button', {
        onClick: async () => {
          try {
            console.log('HomeView: fetching new image (force)...');
            setState({ foxImageStatus: 'loading' });
            const { foxImage } = await fetchFoxImage({ force: true });
            console.log('HomeView: fetched image', foxImage && foxImage.content);
            setState({ foxImageStatus: "success", foxImage });
          } catch (err) {
            console.warn('Failed to fetch image', err);
            setState({ foxImageStatus: 'error', foxImageError: err.message });
          }
        }
      }, 'New Image'),
      h('button', {
        onClick: () => setState({ view: 'highscores' })
      }, 'High Scores')
    )
  );

  root.appendChild(container);
}
