import { useLoading } from '../../context/LoadingContext';
import Logo from '../shared/Logo';

export default function GlobalLoadingOverlay() {
  const { isLoading } = useLoading();

  if (!isLoading) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      aria-live="polite"
      aria-label="Loading"
    >
      {/* Backdrop blur */}
      <div className="absolute inset-0 bg-white/60 backdrop-blur-sm" />

      {/* Card */}
      <div className="relative z-10 flex flex-col items-center gap-6 rounded-2xl bg-white/90 shadow-2xl border border-gray-100 px-14 py-10">
        <Logo size="lg" />

        {/* Three bouncing dots */}
        <div className="flex items-end gap-2 h-6">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="block w-2.5 h-2.5 rounded-full bg-brand-500"
              style={{
                animation: `bounceDot 1.2s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes bounceDot {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40%            { transform: translateY(-10px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
