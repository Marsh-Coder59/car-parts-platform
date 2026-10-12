import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { User, Lock, MapPin, Plus, Trash2, Check, Camera, Sun, Moon } from 'lucide-react';
import { userService, addressService } from '../../services/user.service';
import { authService } from '../../services/auth.service';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useLoading } from '../../context/LoadingContext';
import { Input } from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { getErrorMessage } from '../../services/api';
import type { Address } from '../../types';
import { resolveImageUrl, onImageError } from '../../utils/image';
import toast from 'react-hot-toast';

type Tab = 'profile' | 'password' | 'addresses' | 'appearance';

export default function AccountPage() {
  const { user, refresh } = useAuth();
  const { theme, setTheme } = useTheme();
  const { showLoading, hideLoading } = useLoading();
  const [tab, setTab] = useState<Tab>('profile');
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addrModal, setAddrModal] = useState(false);
  const [editAddr, setEditAddr] = useState<Address | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const profileForm = useForm({ defaultValues: { first_name: user?.first_name || '', last_name: user?.last_name || '', phone: '' } });
  const pwdForm = useForm<{ current_password: string; new_password: string; confirm: string }>();
  const addrForm = useForm<Omit<Address, 'id'>>({ defaultValues: { country: 'Kenya', is_default: false } });

  useEffect(() => {
    if (tab === 'addresses') addressService.list().then(setAddresses);
  }, [tab]);

  useEffect(() => {
    if ((user as any)?.avatar_url) setAvatarPreview((user as any).avatar_url);
  }, [user]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5 MB'); return; }
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleUploadAvatar = async () => {
    if (!avatarFile) return;
    showLoading('Uploading photo…');
    try {
      const formData = new FormData();
      formData.append('avatar', avatarFile);
      await userService.uploadAvatar(formData);
      await refresh();
      toast.success('Profile photo updated');
      setAvatarFile(null);
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { hideLoading(); }
  };

  const onSaveProfile = async (data: { first_name: string; last_name: string; phone: string }) => {
    showLoading();
    try {
      await userService.updateProfile(data);
      if (avatarFile) await handleUploadAvatar();
      await refresh();
      toast.success('Profile updated');
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { hideLoading(); }
  };

  const onChangePassword = async (data: { current_password: string; new_password: string; confirm: string }) => {
    if (data.new_password !== data.confirm) { toast.error('Passwords do not match'); return; }
    showLoading();
    try {
      await authService.changePassword(data.current_password, data.new_password);
      toast.success('Password changed successfully');
      pwdForm.reset();
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { hideLoading(); }
  };

  const onSaveAddress = async (data: Omit<Address, 'id'>) => {
    showLoading();
    try {
      if (editAddr) { await addressService.update(editAddr.id, data); toast.success('Address updated'); }
      else { await addressService.create(data); toast.success('Address added'); }
      setAddrModal(false); setEditAddr(null); addrForm.reset();
      setAddresses(await addressService.list());
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { hideLoading(); }
  };

  const deleteAddress = async (id: number) => {
    if (!confirm('Delete this address?')) return;
    try {
      await addressService.delete(id);
      setAddresses(a => a.filter(x => x.id !== id));
      toast.success('Address deleted');
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  const openEditAddr = (addr: Address) => { setEditAddr(addr); addrForm.reset(addr); setAddrModal(true); };
  const initials = user ? `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase() : '?';

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'profile', label: 'Profile', icon: <User className="h-4 w-4" /> },
    { key: 'password', label: 'Password', icon: <Lock className="h-4 w-4" /> },
    { key: 'addresses', label: 'Addresses', icon: <MapPin className="h-4 w-4" /> },
    { key: 'appearance', label: 'Appearance', icon: theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" /> },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-6">My Account</h1>
      <div className="flex gap-1 bg-gray-100 dark:bg-dark-700 rounded-xl p-1 mb-6">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${tab === t.key ? 'bg-white dark:bg-dark-800 text-gray-900 dark:text-gray-50 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 p-6">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-50 mb-5">Personal Information</h2>
          {/* Profile Picture */}
          <div className="flex flex-col items-center mb-6 pb-6 border-b border-gray-100 dark:border-dark-700">
            <div className="relative group">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-brand-100 flex items-center justify-center ring-4 ring-white shadow-md">
                {avatarPreview
                  ? <img src={resolveImageUrl(avatarPreview)} alt="Profile" onError={onImageError} className="w-full h-full object-cover" />
                  : <span className="text-2xl font-bold text-brand-600">{initials}</span>}
              </div>
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                <Camera className="h-6 w-6 text-white" />
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            <p className="mt-3 text-sm font-medium text-gray-900 dark:text-gray-50">{user?.first_name} {user?.last_name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{user?.email}</p>
            <div className="flex items-center gap-2 mt-3">
              <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs text-brand-600 hover:text-brand-700 font-medium hover:underline">Change photo</button>
              {avatarPreview && (avatarFile || (user as any)?.avatar_url) && (
                <button type="button" onClick={() => { setAvatarPreview(null); setAvatarFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className="text-xs text-gray-400 dark:text-gray-500 hover:text-red-500 font-medium hover:underline">Remove</button>
              )}
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">JPG, PNG or WEBP · Max 5 MB</p>
            {avatarFile && (
              <button type="button" onClick={handleUploadAvatar} className="mt-2 px-4 py-1.5 text-xs font-semibold bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors">Upload Photo</button>
            )}
          </div>
          <form onSubmit={profileForm.handleSubmit(onSaveProfile)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="First name" {...profileForm.register('first_name', { required: 'Required' })} error={profileForm.formState.errors.first_name?.message} />
              <Input label="Last name" {...profileForm.register('last_name', { required: 'Required' })} error={profileForm.formState.errors.last_name?.message} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Email</label>
              <input value={user?.email || ''} disabled className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-dark-600 bg-gray-50 dark:bg-dark-900 text-gray-400 dark:text-gray-500 text-sm" />
            </div>
            <Input label="Phone" {...profileForm.register('phone')} />
            <Button type="submit">Save Changes</Button>
          </form>
        </div>
      )}

      {tab === 'password' && (
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 p-6">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-50 mb-5">Change Password</h2>
          <form onSubmit={pwdForm.handleSubmit(onChangePassword)} className="space-y-4">
            <Input label="Current password" type="password" {...pwdForm.register('current_password', { required: 'Required' })} error={pwdForm.formState.errors.current_password?.message} />
            <Input label="New password" type="password" hint="At least 8 characters" {...pwdForm.register('new_password', { required: 'Required', minLength: { value: 8, message: 'At least 8 characters' } })} error={pwdForm.formState.errors.new_password?.message} />
            <Input label="Confirm new password" type="password" {...pwdForm.register('confirm', { required: 'Required' })} error={pwdForm.formState.errors.confirm?.message} />
            <Button type="submit">Update Password</Button>
          </form>
        </div>
      )}

      {tab === 'addresses' && (
        <div className="space-y-3">
          {addresses.map(addr => (
            <div key={addr.id} className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 p-4 flex items-start gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{addr.label || addr.full_name}</p>
                  {addr.is_default && <span className="text-xs text-brand-600 bg-brand-50 dark:bg-brand-900/20 px-2 py-0.5 rounded-full font-medium flex items-center gap-1"><Check className="h-3 w-3" />Default</span>}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{addr.full_name} · {addr.address_line1}, {addr.city}</p>
                {addr.phone && <p className="text-xs text-gray-400 dark:text-gray-500">{addr.phone}</p>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => openEditAddr(addr)} className="text-xs text-brand-600 hover:underline">Edit</button>
                <button onClick={() => deleteAddress(addr.id)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
          <button onClick={() => { setEditAddr(null); addrForm.reset({ country: 'Kenya', is_default: false }); setAddrModal(true); }}
            className="flex items-center gap-2 w-full p-4 border-2 border-dashed border-gray-200 dark:border-dark-600 rounded-xl text-sm text-gray-500 dark:text-gray-400 hover:border-brand-300 hover:text-brand-600 transition-colors">
            <Plus className="h-4 w-4" />Add New Address
          </button>
        </div>
      )}

      {tab === 'appearance' && (
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 p-6">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-50 mb-1">Appearance</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
            Applies to your account everywhere you're signed in, and is remembered for your next sign-in.
          </p>
          <div className="grid grid-cols-2 gap-3 max-w-sm">
            {([
              { value: 'light' as const, label: 'Light', icon: <Sun className="h-5 w-5" /> },
              { value: 'dark' as const, label: 'Dark', icon: <Moon className="h-5 w-5" /> },
            ]).map(opt => {
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
      )}

      <Modal isOpen={addrModal} onClose={() => { setAddrModal(false); setEditAddr(null); }} title={editAddr ? 'Edit Address' : 'Add Address'}>
        <form onSubmit={addrForm.handleSubmit(onSaveAddress)} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Label (e.g. Home)" {...addrForm.register('label')} />
            <Input label="Full name" {...addrForm.register('full_name', { required: 'Required' })} error={addrForm.formState.errors.full_name?.message} />
          </div>
          <Input label="Phone" {...addrForm.register('phone')} />
          <Input label="Address line 1" {...addrForm.register('address_line1', { required: 'Required' })} error={addrForm.formState.errors.address_line1?.message} />
          <Input label="Address line 2" {...addrForm.register('address_line2')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="City" {...addrForm.register('city', { required: 'Required' })} error={addrForm.formState.errors.city?.message} />
            <Input label="County" {...addrForm.register('county')} />
          </div>
          <Input label="Postal code" {...addrForm.register('postal_code')} />
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" {...addrForm.register('is_default')} className="rounded" />
            Set as default address
          </label>
          <Button type="submit" fullWidth>{editAddr ? 'Save Changes' : 'Add Address'}</Button>
        </form>
      </Modal>
    </div>
  );
}
