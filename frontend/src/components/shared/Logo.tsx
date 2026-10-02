/**
 * Logo component — reads logo_url from site settings if available.
 * Falls back to the branded wordmark when no logo is uploaded yet.
 */
import { useEffect, useState } from 'react';
import { adminService } from '../../services/admin.service';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'full' | 'icon';
  className?: string;
}

const sizeMap = {
  sm: { img: 28, text: 'text-lg', sub: 'text-[10px]' },
  md: { img: 36, text: 'text-2xl', sub: 'text-[10px]' },
  lg: { img: 52, text: 'text-4xl', sub: 'text-xs' },
};

// Simple in-memory cache so we don't refetch on every render
let _cachedLogoUrl: string | null | undefined = undefined;
let _cachedFaviconUrl: string | null | undefined = undefined;

export default function Logo({ size = 'md', variant = 'full', className = '' }: LogoProps) {
  const [logoUrl, setLogoUrl] = useState<string | null>(_cachedLogoUrl ?? null);
  const { img, text, sub } = sizeMap[size];

  useEffect(() => {
    if (_cachedLogoUrl !== undefined) {
      setLogoUrl(_cachedLogoUrl);
      // Also update favicon if cached
      if (_cachedFaviconUrl) updateFavicon(_cachedFaviconUrl);
      return;
    }
    adminService.getPublicSettings().then((s: any) => {
      _cachedLogoUrl = s.logo_url ?? null;
      _cachedFaviconUrl = s.favicon_url ?? null;
      setLogoUrl(_cachedLogoUrl);
      if (_cachedFaviconUrl) updateFavicon(_cachedFaviconUrl);
    }).catch(() => {
      _cachedLogoUrl = null;
    });
  }, []);

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {logoUrl ? (
        <img src={logoUrl} alt="Logo" height={img} style={{ height: img, width: 'auto', maxWidth: img * 3 }} className="object-contain" />
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
          <span className={`font-extrabold tracking-tight text-gray-900 ${text}`}>PARTORA</span>
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
