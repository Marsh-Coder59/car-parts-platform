/**
 * Logo component — single source of truth.
 * To replace the logo: drop your image at src/assets/logo.png
 * and update the <img> src below. The wordmark/fallback is shown
 * automatically when no image is present.
 */

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'full' | 'icon';
  className?: string;
}

// If you add a real logo image, import it here:
// import logoImage from '../../assets/logo.png';
const logoImage: string | null = null; // Set to imported image when ready

const sizeMap = {
  sm: { img: 28, text: 'text-lg' },
  md: { img: 36, text: 'text-2xl' },
  lg: { img: 52, text: 'text-4xl' },
};

export default function Logo({ size = 'md', variant = 'full', className = '' }: LogoProps) {
  const { img, text } = sizeMap[size];

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* Logo mark — replace with <img> when you have a real logo */}
      {logoImage ? (
        <img src={logoImage} alt="Partora" width={img} height={img} className="object-contain" />
      ) : (
        <div
          className="flex items-center justify-center rounded-xl bg-brand-500 text-white font-bold"
          style={{ width: img, height: img, fontSize: img * 0.45 }}
        >
          P
        </div>
      )}

      {variant === 'full' && (
        <div className="flex flex-col leading-none">
          <span className={`font-extrabold tracking-tight text-gray-900 ${text}`}>
            PARTORA
          </span>
          <span className="text-[10px] font-medium tracking-widest text-brand-500 uppercase mt-0.5">
            Automotive Parts
          </span>
        </div>
      )}
    </div>
  );
}
