import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Edit2, UserX } from 'lucide-react';
import { adminService } from '../../services/admin.service';
import { formatDate } from '../../utils/format';
import { SkeletonTable } from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { getErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

interface StaffMember { id: number; first_name: string; last_name: string; email: string; role: string; status: string; created_at: string; }
interface StaffFormValues { first_name: string; last_name: string; email: string; phone: string; password: string; role: string; }

export default function AdminStaffPage() {
  const { isAdmin } = useAuth();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'create' | number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<StaffFormValues>({
    defaultValues: { role: 'STAFF' }
  });

  const load = () => {
    adminService.getStaff().then(setStaff).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const onSubmit = async (data: StaffFormValues) => {
    setSubmitting(true);
    try {
      if (modal === 'create') {
        await adminService.createStaff(data);
        toast.success('Staff account created');
      } else if (typeof modal === 'number') {
        await adminService.updateStaff(modal, { first_name: data.first_name, last_name: data.last_name, phone: data.phone, role: data.role });
        toast.success('Staff updated');
      }
      setModal(null);
      reset();
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const deactivate = async (id: number) => {
    if (!confirm('Deactivate this staff account?')) return;
    try {
      await adminService.deleteStaff(id);
      toast.success('Staff account deactivated');
      load();
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  const openEdit = (member: StaffMember) => {
    reset({ first_name: member.first_name, last_name: member.last_name, role: member.role, email: member.email, phone: '', password: '' });
    setModal(member.id);
  };

  if (!isAdmin) return <div className="text-red-600 text-sm p-4">Admin access required.</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-gray-900 dark:text-gray-50">Staff Management</h1>
        <Button size="sm" onClick={() => { reset({ role: 'STAFF' }); setModal('create'); }} leftIcon={<Plus className="h-4 w-4" />}>
          Add Staff
        </Button>
      </div>

      {loading ? <SkeletonTable rows={5} cols={5} /> : staff.length === 0 ? (
        <EmptyState title="No staff accounts" description="Create staff and admin accounts here."
          action={<Button onClick={() => setModal('create')}>Add Staff</Button>} />
      ) : (
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-dark-900 border-b border-gray-100 dark:border-dark-700">
              <tr>
                {['Name', 'Email', 'Role', 'Status', 'Joined', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-dark-700">
              {staff.map(s => (
                <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-dark-700">
                  <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-50">{s.first_name} {s.last_name}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{s.email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.role === 'ADMIN' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>
                      {s.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold ${s.status === 'ACTIVE' ? 'text-green-600' : 'text-red-600'}`}>{s.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">{formatDate(s.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(s)} className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30 rounded-lg transition-colors">
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      {s.status === 'ACTIVE' && (
                        <button onClick={() => deactivate(s.id)} className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors">
                          <UserX className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={!!modal} onClose={() => { setModal(null); reset(); }}
        title={modal === 'create' ? 'Add Staff Account' : 'Edit Staff'}>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="First name" error={errors.first_name?.message}
              {...register('first_name', { required: 'Required' })} />
            <Input label="Last name" error={errors.last_name?.message}
              {...register('last_name', { required: 'Required' })} />
          </div>
          {modal === 'create' && (
            <>
              <Input label="Email" type="email" error={errors.email?.message}
                {...register('email', { required: 'Required' })} />
              <Input label="Phone" {...register('phone')} />
              <Input label="Password" type="password" hint="At least 8 characters"
                error={errors.password?.message}
                {...register('password', { required: modal === 'create' ? 'Required' : false, minLength: { value: 8, message: 'At least 8 characters' } })} />
            </>
          )}
          <Select label="Role" {...register('role')}>
            <option value="STAFF">STAFF</option>
            <option value="ADMIN">ADMIN</option>
          </Select>
          <div className="flex gap-3">
            <Button type="button" variant="ghost" fullWidth onClick={() => { setModal(null); reset(); }}>Cancel</Button>
            <Button type="submit" fullWidth loading={submitting}>
              {modal === 'create' ? 'Create Account' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
