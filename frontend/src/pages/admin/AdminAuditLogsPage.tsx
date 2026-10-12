import { useEffect, useState } from 'react';
import { adminService } from '../../services/admin.service';
import { formatDateTime } from '../../utils/format';
import { SkeletonTable } from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import { Select } from '../../components/ui/Input';

const PAGE_SIZE = 50;
const ENTITY_TYPES = ['', 'users', 'products', 'orders', 'payments', 'inventory', 'deliveries', 'returns', 'refunds', 'coupons', 'site_settings'];

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<{
    id: number; user_id: number; user_email: string; action: string;
    entity_type: string; entity_id: string; ip_address: string; created_at: string;
  }[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    adminService.getAuditLogs({ entity_type: entityType || undefined, page, page_size: PAGE_SIZE })
      .then(setLogs).finally(() => setLoading(false));
  }, [entityType, page]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-gray-900 dark:text-gray-50">Audit Logs</h1>
        <Select value={entityType} onChange={e => { setEntityType(e.target.value); setPage(1); }} className="w-48">
          {ENTITY_TYPES.map(t => <option key={t} value={t}>{t || 'All Entities'}</option>)}
        </Select>
      </div>

      {loading ? <SkeletonTable rows={10} cols={5} /> : logs.length === 0 ? (
        <EmptyState title="No audit logs" description="Actions will be logged here." />
      ) : (
        <>
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 dark:bg-dark-900 border-b border-gray-100 dark:border-dark-700">
                  <tr>
                    {['Time', 'Actor', 'Action', 'Entity', 'Entity ID', 'IP'].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-dark-700">
                  {logs.map(log => (
                    <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-dark-700">
                      <td className="px-4 py-2.5 text-gray-400 dark:text-gray-500 whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                      <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300 truncate max-w-[140px]">{log.user_email || `#${log.user_id}`}</td>
                      <td className="px-4 py-2.5">
                        <span className="font-semibold text-gray-900 dark:text-gray-50">{log.action}</span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">{log.entity_type || '—'}</td>
                      <td className="px-4 py-2.5 font-mono text-gray-400 dark:text-gray-500">{log.entity_id || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-400 dark:text-gray-500">{log.ip_address || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE}
            total={logs.length < PAGE_SIZE ? (page - 1) * PAGE_SIZE + logs.length : page * PAGE_SIZE + 1}
            onChange={setPage} />
        </>
      )}
    </div>
  );
}
