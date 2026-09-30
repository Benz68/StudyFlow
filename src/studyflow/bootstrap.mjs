import './app.mjs';

// Update returning installations as well as new visits; the shell also works offline.
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then(registration => registration.update())
      .catch(() => { /* Offline first visits still have a usable local planner. */ });
  });
}
