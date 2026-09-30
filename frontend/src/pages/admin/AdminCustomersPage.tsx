import { useEffect, useState } from 'react';
import { Search, ChevronRight, UserCheck, UserX } from 'lucide-react';
import { adminService } from '../../services/admin.service';
import { formatDate } from '../../utils/format';
import { SkeletonTable } from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import Modal from '../../components/ui/Modal';
import { formatCurrency } from '../../utils/format';
import { getErrorMessage } from '../../services/api';
import type { CustomerDetail } from '../../types';
import toast from 'react-hot-toast';

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<{ id: number; first_name: string; last_name: string; email: string; status: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = () => {
    setLoading(true);
    adminService.getCustomers({ search: search || undefined }).then(setCustomers).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search]);

  const openDetail = (id: number) => {
    setDetailLoading(true);
    adminService.getCustomer(id).then(setSelected).finally(() => setDetailLoading(false));
  };

  const toggleStatus = async (userId: number, currentStatus: string) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await adminService.updateUserStatus(userId, newStatus);
      toast.success(`User ${newStatus === 'ACTIVE' ? 'activated' : 'suspended'}`);
      if (selected?.id === userId) {
        setSelected(prev => prev ? { ...prev, status: newStatus as 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED' } : prev);
      }
      load();
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-extrabold text-gray-900 flex-1">Customers</h1>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
        </div>
      </div>

      {loading ? <SkeletonTable rows={8} cols={5} /> : customers.length === 0 ? (
        <EmptyState title="No customers found" description="Customer accounts will appear here after registration." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Name', 'Email', 'Status', 'Joined', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {customers.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => openDetail(c.id)}>
                    <td className="px-4 py-3 font-semibold text-gray-900">{c.first_name} {c.last_name}</td>
                    <td className="px-4 py-3 text-gray-500">{c.email}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.status === 'ACTIVE' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{formatDate(c.created_at)}</td>
                    <td className="px-4 py-3"><ChevronRight className="h-4 w-4 text-gray-300" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title="Customer Details" size="lg">
        {detailLoading ? (
          <div className="p-6 text-center text-gray-400">Loading…</div>
        ) : selected ? (
          <div className="p-6">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{selected.first_name} {selected.last_name}</h3>
                <p className="text-sm text-gray-500">{selected.email}</p>
                {selected.phone && <p className="text-sm text-gray-500">{selected.phone}</p>}
              </div>
              <button
                onClick={() => toggleStatus(selected.id, selected.status)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${selected.status === 'ACTIVE' ? 'text-red-700 bg-red-50 hover:bg-red-100' : 'text-green-700 bg-green-50 hover:bg-green-100'}`}
              >
                {selected.status === 'ACTIVE' ? <><UserX className="h-3.5 w-3.5" />Suspend</> : <><UserCheck className="h-3.5 w-3.5" />Activate</>}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { label: 'Total Orders', value: selected.stats.total_orders },
                { label: 'Total Spent', value: formatCurrency(selected.stats.total_spent) },
                { label: 'Outstanding', value: formatCurrency(selected.stats.outstanding_balance) },
              ].map(s => (
                <div key={s.label} className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-gray-900">{s.value}</p>
                  <p className="text-xs text-gray-500">{s.label}</p>
                </div>
              ))}
            </div>

            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recent Orders</h4>
            {selected.recent_orders.length === 0 ? (
              <p className="text-sm text-gray-400">No orders yet.</p>
            ) : (
              <div className="space-y-1">
                {selected.recent_orders.map(o => (
                  <div key={o.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0 text-sm">
                    <span className="font-medium text-gray-900">{o.order_number}</span>
                    <span className="text-gray-500">{formatCurrency(o.total)}</span>
                    <span className="text-xs text-gray-400">{formatDate(o.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
