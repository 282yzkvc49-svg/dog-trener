import { createRoot } from 'react-dom/client';
import { App } from './App';
import { registerServiceWorker } from './lib/pwa';
import { requestPersistence } from './db/idb';
import { startStore } from './db/store';
import { cloud } from './cloud/cloud';
import { setPhotoFetcher } from './db/repo';

startStore();
setPhotoFetcher(cloud.fetchPhoto);
void cloud.init();
registerServiceWorker();
requestPersistence();

createRoot(document.getElementById('root')!).render(<App />);
