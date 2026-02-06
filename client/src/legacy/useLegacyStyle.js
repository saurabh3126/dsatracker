import { useEffect } from 'react';

export function useLegacyStyle(styleKey, cssText) {
  useEffect(() => {
    const id = `legacy-style-${styleKey}`;
    const style = document.createElement('style');
    style.id = id;
    style.type = 'text/css';
    style.appendChild(document.createTextNode(cssText));

    // Replace any existing style with same id (hot reload / fast nav)
    const existing = document.getElementById(id);
    if (existing) existing.remove();

    document.head.appendChild(style);

    return () => {
      style.remove();
    };
  }, [styleKey, cssText]);
}
