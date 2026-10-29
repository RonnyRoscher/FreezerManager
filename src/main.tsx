import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { supabase } from './data/supabaseClient';
import { createSupabaseRepository } from './data/supabaseRepository';
import './styles.css';

const repo = createSupabaseRepository(supabase);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App repo={repo} />
  </React.StrictMode>,
);
