import { backendOrigin } from './config.js';

const backend = new URL(backendOrigin);
const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(backend.hostname);
if ((backend.protocol !== 'https:' && !(backend.protocol === 'http:' && loopback)) ||
    backend.username || backend.password || backend.pathname !== '/' || backend.search || backend.hash) {
  throw new Error('Configure Braino with an HTTPS origin (HTTP is allowed only for localhost).');
}

function openWorkspace() {
  // A normal first-party tab shares the backend's HttpOnly session cookie.
  // The dashboard starts Google OAuth and the callback returns to /app.
  return chrome.tabs.create({ url: new URL('/app', backend).href });
}

chrome.action.onClicked.addListener(() => {
  void openWorkspace().catch(console.error);
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') void openWorkspace().catch(console.error);
});
