import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Building2, Globe, Phone, Banknote, Upload, X, ImageIcon, Sun, Moon, Check } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { adminService } from '../../services/admin.service';
import { Input } from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { getErrorMessage } from '../../services/api';
import type { AdminSettings } from '../../types';
import toast from 'react-hot-toast';
import { apiClient } from '../../services/api';
import { resolveImageUrl, onImageError } from '../../utils/image';

// ── image upload helper ──────────────────────────────────────────────────────
interface ImageUploadFieldProps {
  label: string;
  currentUrl?: string | null;
  onUploaded: (url: string) => void;
  onRemove: () => void;
  hint?: string;
}

function ImageUploadField({ label, currentUrl, onUploaded, onRemove, hint }: ImageUploadFieldProps) {
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync with parent when currentUrl changes (on first settings load)
  useEffect(() => { setPreview(currentUrl ?? null); }, [currentUrl]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5 MB'); return; }
    if (!file.type.startsWith('image/')) { toast.error('Please select an image'); return; }

    // Local preview first
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    // Upload to backend
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiClient.post<{ url: string }>('/api/admin/settings/upload-image', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onUploaded(res.data.url);
      toast.success(`${label} uploaded`);
    } catch (err) {
      toast.error(getErrorMessage(err));
      setPreview(currentUrl ?? null);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = () => {
    setPreview(null);
    onRemove();
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">{label}</label>
      {hint && <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">{hint}</p>}

      <div className="flex items-center gap-4">
        {/* Preview box */}
        <div className="w-20 h-20 rounded-lg border border-gray-200 dark:border-dark-600 bg-gray-50 dark:bg-dark-900 flex items-center justify-center overflow-hidden flex-shrink-0">
          {preview
            ? <img src={resolveImageUrl(preview)} alt={label} onError={onImageError} className="w-full h-full object-contain" />
            : <ImageIcon className="h-8 w-8 text-gray-300" />}
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-dark-700 disabled:opacity-50 transition-colors"
          >
            <Upload className="h-4 w-4" />
            {uploading ? 'Uploading…' : preview ? 'Replace' : 'Upload Image'}
          </button>
          {preview && (
            <button
              type="button"
              onClick={handleRemove}
              className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 font-medium"
            >
              <X className="h-3 w-3" />Remove
            </button>
          )}
        </div>
      </div>

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

// ── main page ────────────────────────────────────────────────────────────────
type FormValues = Omit<AdminSettings, 'default_delivery_fee'> & { default_delivery_fee: string };

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Image URL state (managed outside react-hook-form because they come from uploads, not text inputs)
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);

  const { register, handleSubmit, reset } = useForm<FormValues>();

  useEffect(() => {
    adminService.getSettings().then((data: any) => {
      reset({
        ...data,
        default_delivery_fee: String(data.default_delivery_fee || '0'),
      });
      // Initialise image state from saved settings
      setLogoUrl(data.logo_url ?? null);
      setFaviconUrl(data.favicon_url ?? null);
      setBannerUrl(data.banner_url ?? null);
    }).finally(() => setLoading(false));
  }, [reset]);

  const onSubmit = async (data: FormValues) => {
    setSaving(true);
    try {
      const { default_delivery_fee, free_delivery_threshold, ...basic } = data;

      // Merge the image URLs (from upload state) into the settings payload
      await adminService.updateSettings({
        ...basic,
        logo_url: logoUrl ?? undefined,
        favicon_url: faviconUrl ?? undefined,
        banner_url: bannerUrl ?? undefined,
      });

      await adminService.updateSettingsExtended({
        default_delivery_fee: parseFloat(default_delivery_fee) || 0,
        free_delivery_threshold: free_delivery_threshold || undefined,
      });

      toast.success('Settings saved');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-gray-400 dark:text-gray-500 text-sm">Loading settings…</div>;

  const ThemeSection = () => {
    const { theme, setTheme } = useTheme();
    const options: { value: 'light' | 'dark'; label: string; icon: React.ReactNode }[] = [
      { value: 'light', label: 'Light', icon: <Sun className="h-5 w-5" /> },
      { value: 'dark', label: 'Dark', icon: <Moon className="h-5 w-5" /> },
    ];
    return (
      <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 p-6 mb-5">
        <h2 className="text-sm font-bold text-gray-900 dark:text-gray-50 mb-1 flex items-center gap-2">
          {theme === 'dark' ? <Moon className="h-4 w-4 text-brand-500" /> : <Sun className="h-4 w-4 text-brand-500" />} Theme
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Applies to your account everywhere you're signed in — admin, staff, and customer pages — and is remembered for your next sign-in.
        </p>
        <div className="grid grid-cols-2 gap-3 max-w-sm">
          {options.map(opt => {
            const active = theme === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTheme(opt.value)}
                className={`relative flex flex-col items-center gap-2 py-4 rounded-xl border-2 transition-colors
                  ${active
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400'
                    : 'border-gray-200 dark:border-dark-600 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-dark-500'}`}
              >
                {active && (
                  <span className="absolute top-2 right-2 h-4 w-4 rounded-full bg-brand-500 text-white flex items-center justify-center">
                    <Check className="h-2.5 w-2.5" />
                  </span>
                )}
                {opt.icon}
                <span className="text-sm font-semibold">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const Section = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
    <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 p-6 mb-5">
      <h2 className="text-sm font-bold text-gray-900 dark:text-gray-50 mb-4 flex items-center gap-2">{icon} {title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </div>
  );

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-extrabold text-gray-900 dark:text-gray-50 mb-6">Site Settings</h1>

      <ThemeSection />

      <form onSubmit={handleSubmit(onSubmit)}>

        {/* ── Branding / Images ─────────────────────────────────────────── */}
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 p-6 mb-5">
          <h2 className="text-sm font-bold text-gray-900 dark:text-gray-50 mb-4 flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-brand-500" /> Branding &amp; Images
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <ImageUploadField
              label="Site Logo"
              currentUrl={logoUrl}
              onUploaded={url => setLogoUrl(url)}
              onRemove={() => setLogoUrl(null)}
              hint="Displayed in the header. PNG/SVG recommended."
            />
            <ImageUploadField
              label="Favicon"
              currentUrl={faviconUrl}
              onUploaded={url => setFaviconUrl(url)}
              onRemove={() => setFaviconUrl(null)}
              hint="Browser tab icon. Square PNG, 32×32 or 64×64 px."
            />
            <div className="sm:col-span-2">
              <ImageUploadField
                label="Homepage Banner"
                currentUrl={bannerUrl}
                onUploaded={url => setBannerUrl(url)}
                onRemove={() => setBannerUrl(null)}
                hint="Wide hero image shown on the homepage. 1200×400 px recommended."
              />
            </div>
          </div>
        </div>

        {/* ── Business Info ──────────────────────────────────────────────── */}
        <Section icon={<Globe className="h-4 w-4 text-brand-500" />} title="Business Information">
          <Input label="Business Name" {...register('business_name')} />
          <Input label="Business Email" type="email" {...register('business_email')} />
          <Input label="Business Phone" {...register('business_phone')} />
          <Input label="WhatsApp Number" {...register('whatsapp_number')} />
        </Section>

        {/* ── Social Media ───────────────────────────────────────────────── */}
        <Section icon={<Phone className="h-4 w-4 text-brand-500" />} title="Social Media">
          <Input label="Facebook URL" {...register('facebook_url')} />
          <Input label="Instagram URL" {...register('instagram_url')} />
          <Input label="TikTok URL" {...register('tiktok_url')} />
          <Input label="X (Twitter) URL" {...register('x_url')} />
        </Section>

        {/* ── Bank Details ───────────────────────────────────────────────── */}
        <Section icon={<Banknote className="h-4 w-4 text-brand-500" />} title="Bank Details (for customer payments)">
          <Input label="Bank Name" {...register('bank_name')} />
          <Input label="Account Name" {...register('bank_account_name')} />
          <Input label="Account Number" {...register('bank_account_number')} />
          <Input label="Branch" {...register('bank_branch')} />
        </Section>

        {/* ── Payment & Delivery ─────────────────────────────────────────── */}
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 p-6 mb-5">
          <h2 className="text-sm font-bold text-gray-900 dark:text-gray-50 mb-4 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-brand-500" /> Payment &amp; Delivery
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Deposit Percentage" type="number" {...register('default_deposit_percentage')} hint="Default: 75" />
            <Input label="Balance Percentage" type="number" {...register('default_balance_percentage')} hint="Default: 25" />
            <Input label="Delivery Fee (USD)" type="number" step="0.01" {...register('default_delivery_fee')} />
            <Input label="Free Delivery Threshold (USD)" type="number" step="0.01" {...register('free_delivery_threshold')} hint="Leave blank to disable" />
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" size="lg" loading={saving}>Save All Settings</Button>
        </div>
      </form>
    </div>
  );
}
