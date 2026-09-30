import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Building2, Globe, Phone, Banknote } from 'lucide-react';
import { adminService } from '../../services/admin.service';
import { Input } from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { getErrorMessage } from '../../services/api';
import type { AdminSettings } from '../../types';
import toast from 'react-hot-toast';

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit, reset } = useForm<AdminSettings & { default_delivery_fee: string }>();

  useEffect(() => {
    adminService.getSettings().then(data => {
      reset({
        ...data,
        default_delivery_fee: String(data.default_delivery_fee || '0'),
      });
    }).finally(() => setLoading(false));
  }, [reset]);

  const onSubmit = async (data: AdminSettings & { default_delivery_fee: string }) => {
    setSaving(true);
    try {
      // Split basic settings and extended settings (delivery fee)
      const { default_delivery_fee, free_delivery_threshold, ...basic } = data;
      await adminService.updateSettings(basic);
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

  if (loading) return <div className="text-gray-400 text-sm">Loading settings…</div>;

  const Section = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
    <div className="bg-white rounded-xl border border-gray-100 p-6 mb-5">
      <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
        {icon} {title}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </div>
  );

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-extrabold text-gray-900 mb-6">Site Settings</h1>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Section icon={<Globe className="h-4 w-4 text-brand-500" />} title="Business Information">
          <Input label="Business Name" {...register('business_name')} />
          <Input label="Business Email" type="email" {...register('business_email')} />
          <Input label="Business Phone" {...register('business_phone')} />
          <Input label="WhatsApp Number" {...register('whatsapp_number')} />
        </Section>

        <Section icon={<Phone className="h-4 w-4 text-brand-500" />} title="Social Media">
          <Input label="Facebook URL" {...register('facebook_url')} />
          <Input label="Instagram URL" {...register('instagram_url')} />
          <Input label="TikTok URL" {...register('tiktok_url')} />
          <Input label="X (Twitter) URL" {...register('x_url')} />
        </Section>

        <Section icon={<Banknote className="h-4 w-4 text-brand-500" />} title="Bank Details (for customer payments)">
          <Input label="Bank Name" {...register('bank_name')} />
          <Input label="Account Name" {...register('bank_account_name')} />
          <Input label="Account Number" {...register('bank_account_number')} />
          <Input label="Branch" {...register('bank_branch')} />
        </Section>

        <div className="bg-white rounded-xl border border-gray-100 p-6 mb-5">
          <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-brand-500" /> Payment & Delivery
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Deposit Percentage" type="number" {...register('default_deposit_percentage')} hint="Default: 75" />
            <Input label="Balance Percentage" type="number" {...register('default_balance_percentage')} hint="Default: 25" />
            <Input label="Delivery Fee (KES)" type="number" step="0.01" {...register('default_delivery_fee')} />
            <Input label="Free Delivery Threshold (KES)" type="number" step="0.01" {...register('free_delivery_threshold')} hint="Leave blank to disable" />
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" size="lg" loading={saving}>Save All Settings</Button>
        </div>
      </form>
    </div>
  );
}
