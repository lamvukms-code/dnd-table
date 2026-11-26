import React from 'react';
import ReactDOM from 'react-dom/client';
import './localContent.js'; // setting spells / feats from git-ignored data, before anything reads them
import { App } from './App.js';
import { StreamView } from './components/StreamView.js';
import { STREAM_MODE } from './store.js';
import './styles.css';
import './theme.css';
import './gothic.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {STREAM_MODE ? <StreamView /> : <App />}
  </React.StrictMode>,
);
