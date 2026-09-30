import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { vehiclesService } from '../../services/products.service';
import { SkeletonTable } from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { getErrorMessage } from '../../services/api';
import type { Vehicle } from '../../types';
import toast from 'react-hot-toast';

type FormValues = Omit<Vehicle, 'id'> & { year_from: string; year_to: string };

export default function AdminVehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'create' | number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>();

  const load = (make?: string) => {
    vehiclesService.list(make ? { make } : undefined).then(setVehicles).finally(() => setLoading(false));
  };

  useEffect(() => { load(search || undefined); }, [search]);

  const openEdit = (v: Vehicle) => {
    reset({ ...v, year_from: String(v.year_from || ''), year_to: String(v.year_to || '') });
    setModal(v.id);
  };

  const onSubmit = async (data: FormValues) => {
    setSubmitting(true);
    try {
      const payload = {
        ...data,
        year_from: data.year_from ? parseInt(data.year_from) : undefined,
        year_to: data.year_to ? parseInt(data.year_to) : undefined,
      };
      if (modal === 'create') {
        await vehiclesService.create(payload);
        toast.success('Vehicle created');
      } else if (typeof modal === 'number') {
        await vehiclesService.update(modal, payload);
        toast.success('Vehicle updated');
      }
      setModal(null); reset(); load(search || undefined);
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setSubmitting(false); }
  };

  const deleteVehicle = async (id: number) => {
    if (!confirm('Delete this vehicle?')) return;
    try {
      await vehiclesService.delete(id);
      toast.success('Vehicle deleted');
      load(search || undefined);
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-extrabold text-gray-900 flex-1">Vehicles</h1>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filter by make…"
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 w-44" />
        <Button size="sm" onClick={() => { reset(); setModal('create'); }} leftIcon={<Plus className="h-4 w-4" />}>
          Add Vehicle
        </Button>
      </div>

      {loading ? <SkeletonTable rows={6} cols={5} /> : vehicles.length === 0 ? (
        <EmptyState title="No vehicles" description="Add vehicle records to link with product compatibility."
          action={<Button onClick={() => setModal('create')}>Add Vehicle</Button>} />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Make', 'Model', 'Years', 'Engine', 'Fuel', 'Transmission', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {vehicles.map(v => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-semibold text-gray-900">{v.make}</td>
                    <td className="px-4 py-3 text-gray-700">{v.model}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {v.year_from && v.year_to ? `${v.year_from}–${v.year_to}` : v.year_from || v.year_to || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{v.engine || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{v.fuel_type || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{v.transmission || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(v)} className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => deleteVehicle(v.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={!!modal} onClose={() => { setModal(null); reset(); }}
        title={modal === 'create' ? 'Add Vehicle' : 'Edit Vehicle'}>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <Input label="Make *" error={errors.make?.message}
              {...register('make', { required: 'Required' })} />
            <Input label="Model *" error={errors.model?.message}
              {...register('model', { required: 'Required' })} />
            <Input label="Generation" {...register('generation')} />
            <Input label="Year From" type="number" {...register('year_from')} />
            <Input label="Year To" type="number" {...register('year_to')} />
            <Input label="Engine" {...register('engine')} />
            <Input label="Fuel Type" {...register('fuel_type')} />
            <Input label="Transmission" {...register('transmission')} />
          </div>
          <div className="flex gap-3">
            <Button type="button" variant="ghost" fullWidth onClick={() => { setModal(null); reset(); }}>Cancel</Button>
            <Button type="submit" fullWidth loading={submitting}>{modal === 'create' ? 'Create' : 'Save'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
