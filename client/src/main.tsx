import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import './localContent.js'; // setting spells / feats from git-ignored data, before anything reads them
import { App } from './App.js';
import { STREAM_MODE } from './store.js';

// the DM's recording window only: its own chunk
const StreamView = lazy(() => import('./components/StreamView.js').then((m) => ({ default: m.StreamView })));
import './styles.css';
import './theme.css';
import './gothic.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {STREAM_MODE ? (
      <Suspense fallback={null}>
        <StreamView />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
