import { h, clearChildren } from '../utils/dom.js';
import { setState, getState } from '../state/store.js';
import { fetchMotivationQuote } from '../services/publicApi.js';

export function renderHome(root) {
  const state = getState();
  clearChildren(root);
  // If we haven't attempted to load an image yet, start one automatically
  if (state.quoteStatus === 'idle') {
    // fire-and-forget fetch to populate state; render cycle will update
    (async () => {
      try {
        setState({ quoteStatus: 'loading' });
        const { quote } = await fetchMotivationQuote();
        setState({ quoteStatus: 'success', quote });
      } catch (err) {
        console.warn('Failed to fetch image on load', err);
        setState({ quoteStatus: 'error', quoteError: err.message });
      }
    })();
  }
 
  let imageNode = null;
  if (state.quoteStatus === 'loading') {
    imageNode = h('p', { className: 'quote-loading' }, 'Loading image...');
  } else if (state.quoteStatus === 'error') {
    imageNode = h('p', { className: 'quote-error' }, 'Image unavailable');
  } else if (state.quote && state.quote.content) {
    imageNode = h('div', { className: 'random-image' },
      h('img', { src: state.quote.content, alt: state.quote.author || 'Random image', style: 'max-width:100%; height:auto; border-radius:8px;' }),
      h('div', { className: 'image-caption' }, state.quote.author || ''),
      h('div', { className: 'image-link' }, h('a', { href: state.quote.content, target: '_blank' }, 'Open image in new tab'))
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
            setState({ quoteStatus: 'loading' });
            const { quote } = await fetchMotivationQuote({ force: true });
            console.log('HomeView: fetched image', quote && quote.content);
            setState({ quoteStatus: "success", quote });
          } catch (err) {
            console.warn('Failed to fetch image', err);
            setState({ quoteStatus: 'error', quoteError: err.message });
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
