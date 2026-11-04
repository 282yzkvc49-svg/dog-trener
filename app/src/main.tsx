import { createRoot } from 'react-dom/client';
import { App } from './App';
import { registerServiceWorker } from './lib/pwa';
import { requestPersistence } from './db/idb';
import { startStore } from './db/store';

startStore();
registerServiceWorker();
requestPersistence();

createRoot(document.getElementById('root')!).render(<App />);
