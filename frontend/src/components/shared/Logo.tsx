/**
 * Logo component — reads logo_url from site settings if available.
 * Falls back to the branded wordmark when no logo is uploaded yet.
 */
import { useEffect, useState } from 'react';
import { adminService } from '../../services/admin.service';
import { resolveImageUrl, onImageError } from '../../utils/image';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'full' | 'icon';
  className?: string;
  /** Render the fallback wordmark in light text — for use on a permanently
   *  dark surface (e.g. the admin sidebar), independent of the app-wide
   *  light/dark mode toggle. */
  onDark?: boolean;
}

const sizeMap = {
  sm: { img: 28, text: 'text-lg', sub: 'text-[10px]' },
  md: { img: 36, text: 'text-2xl', sub: 'text-[10px]' },
  lg: { img: 52, text: 'text-4xl', sub: 'text-xs' },
};

// Simple in-memory cache so we don't refetch on every render/mount — BUT
// it must be invalidated the moment an admin saves new branding, or every
// already-mounted Logo (and the browser tab's favicon) keeps showing the
// old image until a full page reload. invalidateBrandingCache() below
// clears the cache and tells every currently-mounted Logo to refetch
// immediately, which is what makes "Save Changes" actually take effect
// without the user having to reload the page.
let _cachedLogoUrl: string | null | undefined = undefined;
let _cachedFaviconUrl: string | null | undefined = undefined;
const _listeners = new Set<() => void>();

/** Call after a successful branding save (logo/favicon) so every mounted
 *  Logo — storefront header, admin sidebar, login/register pages, etc. —
 *  updates immediately instead of showing the stale cached image. */
export function invalidateBrandingCache() {
  _cachedLogoUrl = undefined;
  _cachedFaviconUrl = undefined;
  _listeners.forEach(fn => fn());
}

export default function Logo({ size = 'md', variant = 'full', className = '', onDark = false }: LogoProps) {
  const [logoUrl, setLogoUrl] = useState<string | null>(_cachedLogoUrl ?? null);
  const { img, text, sub } = sizeMap[size];

  useEffect(() => {
    let active = true;

    function load() {
      if (_cachedLogoUrl !== undefined) {
        setLogoUrl(_cachedLogoUrl);
        if (_cachedFaviconUrl) updateFavicon(_cachedFaviconUrl);
        return;
      }
      adminService.getPublicSettings().then((s: any) => {
        if (!active) return;
        _cachedLogoUrl = resolveImageUrl(s.logo_url) ?? null;
        _cachedFaviconUrl = resolveImageUrl(s.favicon_url) ?? null;
        setLogoUrl(_cachedLogoUrl);
        if (_cachedFaviconUrl) updateFavicon(_cachedFaviconUrl);
      }).catch(() => {
        if (active) _cachedLogoUrl = null;
      });
    }

    load();
    _listeners.add(load);
    return () => {
      active = false;
      _listeners.delete(load);
    };
  }, []);

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {logoUrl ? (
        <img src={logoUrl} alt="Logo" height={img} onError={onImageError} style={{ height: img, width: 'auto', maxWidth: img * 3 }} className="object-contain" />
      ) : (
        <div
          className="flex items-center justify-center rounded-xl bg-brand-500 text-white font-bold flex-shrink-0"
          style={{ width: img, height: img, fontSize: img * 0.45 }}
        >
          P
        </div>
      )}

      {variant === 'full' && !logoUrl && (
        <div className="flex flex-col leading-none">
          <span className={`font-extrabold tracking-tight ${onDark ? 'text-white' : 'text-gray-900 dark:text-gray-50'} ${text}`}>PARTORA</span>
          <span className={`font-medium tracking-widest text-brand-500 uppercase mt-0.5 ${sub}`}>Automotive Parts</span>
        </div>
      )}
    </div>
  );
}

function updateFavicon(url: string) {
  let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = url;
}
