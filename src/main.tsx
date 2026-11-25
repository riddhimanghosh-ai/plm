import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts.css';
import './index.css';
import App from './App';
import { applyTheme, savedTheme } from './domain/theme';

applyTheme(savedTheme());   // before the first paint, so the page never flashes the old colours

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
