import type React from 'react';

// Resolves an image path/URL returned by the backend (e.g.
// "/static/products/prod_1_abc.png") into a URL the browser can actually
// load.
//
// Root cause this fixes: the backend always returns media-relative paths
// like "/static/...", which product cards, category cards, the product
// edit form, and the logo were rendering directly as <img src="...">.
// A relative path in an <img> tag resolves against the CURRENT PAGE's
// origin, i.e. the frontend dev server (http://localhost:3000), not the
// backend (http://localhost:8000) that actually serves /static — so every
// one of those images 404'd and showed the browser's broken-image icon.
//
// This reuses the same VITE_API_BASE_URL the API client already uses, so
// there is no new hardcoded localhost reference and it keeps working with
// whatever origin is configured for production.
const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');

export function resolveImageUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  // Already absolute (http(s)://), or a local blob:/data: URI (e.g. an
  // unsaved file preview from FileReader) — use as-is.
  if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) return path;
  // Backend-relative path (e.g. "/static/products/x.png") — anchor it to
  // the backend origin rather than the current page origin.
  return `${API_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`;
}

// A tiny inline "no image" placeholder (light gray square with a subtle
// icon look) so a missing/undefined image never renders the browser's
// broken-image icon.
export const IMAGE_FALLBACK =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='#f1f1f3'/><path d='M30 65 L45 45 L55 58 L68 42 L75 65 Z' fill='#c9ccd1'/><circle cx='38' cy='36' r='7' fill='#c9ccd1'/></svg>`
  );

export function onImageError(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  if (img.src !== IMAGE_FALLBACK) {
    img.onerror = null;
    img.src = IMAGE_FALLBACK;
  }
}
