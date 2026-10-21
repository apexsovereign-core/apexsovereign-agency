import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { APEX_TAB_FAVICON_DATA_URI } from './logoBase64.ts';

// Force browser tab favicon to instantly match company logo and bypass browser tab caches
if (typeof document !== 'undefined') {
  const syncCompanyLogoToTab = () => {
    try {
      // Remove any pre-existing or cached favicon links
      document.querySelectorAll("link[rel*='icon']").forEach((el) => el.remove());

      // Create new crisp icon link with inline base64 data URI
      const iconLink = document.createElement('link');
      iconLink.type = 'image/png';
      iconLink.rel = 'icon';
      iconLink.href = APEX_TAB_FAVICON_DATA_URI;
      document.head.appendChild(iconLink);

      // Attach shortcut icon fallback
      const shortcutLink = document.createElement('link');
      shortcutLink.type = 'image/x-icon';
      shortcutLink.rel = 'shortcut icon';
      shortcutLink.href = APEX_TAB_FAVICON_DATA_URI;
      document.head.appendChild(shortcutLink);
    } catch {
      // Graceful fallback for non-DOM contexts
    }
  };

  syncCompanyLogoToTab();
  if (typeof window !== 'undefined') {
    window.addEventListener('load', syncCompanyLogoToTab);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);


