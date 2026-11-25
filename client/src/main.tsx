import React from 'react';
import ReactDOM from 'react-dom/client';
import './localContent.js'; // setting spells / feats from git-ignored data, before anything reads them
import { App } from './App.js';
import './styles.css';
import './theme.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
