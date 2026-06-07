import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Clock, CheckCircle, XCircle, AlertTriangle, Send, Download, Eye, Bell } from 'lucide-react';
import api from '../api';

interface SigningProcess {
  id: number;
  title: string;
  document_title: string;
  status: string;
  total_signers: number;
  signed_count: number;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: '草稿', color: 'text-gray-500 bg-gray-100', icon: FileText },
  in_progress: { label: '进行中', color: 'text-blue-600 bg-blue-50', icon: Clock },
  completed: { label: '已完成', color: 'text-green-600 bg-green-50', icon: CheckCircle },
  expired: { label: '已过期', color: 'text-yellow-600 bg-yellow-50', icon: AlertTriangle },
  rejected: { label: '已拒签', color: 'text-red-600 bg-red-50', icon: XCircle },
};

export default function DashboardPage() {
  const [processes, setProcesses] = useState<SigningProcess[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [selectedProcess, setSelectedProcess] = useState<any>(null);
  const [signers, setSigners] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    loadProcesses();
  }, []);

  const loadProcesses = () => {
    api.get('/signing').then((res) => setProcesses(res.data.processes));
  };

  const loadDetail = async (id: number) => {
    const [processRes, auditRes] = await Promise.all([
      api.get(`/signing/${id}`),
      api.get(`/signing/${id}/audit`),
    ]);
    setSelectedProcess(processRes.data.process);
    setSigners(processRes.data.signers);
    setAuditLogs(auditRes.data.logs);
    setShowDetail(true);
  };

  const handleRemind = async (processId: number, signerId: number) => {
    try {
      await api.post(`/signing/${processId}/remind/${signerId}`);
      alert('提醒已发送');
    } catch (err: any) {
      alert(err.response?.data?.error || '发送失败');
    }
  };

  const handleDownload = async (processId: number) => {
    try {
      const res = await api.get(`/signing/${processId}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `signed_document.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err: any) {
      alert('下载失败');
    }
  };

  const filtered = filter === 'all' ? processes : processes.filter((p) => p.status === filter);

  const signerStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      pending: '等待中',
      notified: '已通知',
      signed: '已签署',
      rejected: '已拒签',
    };
    return map[status] || status;
  };

  const signerStatusColor = (status: string) => {
    const map: Record<string, string> = {
      pending: 'text-gray-500',
      notified: 'text-blue-500',
      signed: 'text-green-600',
      rejected: 'text-red-600',
    };
    return map[status] || 'text-gray-500';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">签署仪表板</h1>
        <Link to="/signing/new" className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          <Send size={16} /> 发起签署
        </Link>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {[
          { key: 'all', label: '全部' },
          { key: 'draft', label: '草稿' },
          { key: 'in_progress', label: '进行中' },
          { key: 'completed', label: '已完成' },
          { key: 'expired', label: '已过期' },
          { key: 'rejected', label: '已拒签' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === tab.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
            {tab.key !== 'all' && (
              <span className="ml-1">({processes.filter((p) => p.status === tab.key).length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Process list */}
      <div className="space-y-3">
        {filtered.map((p) => {
          const cfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.draft;
          const Icon = cfg.icon;
          return (
            <div key={p.id} className="bg-white border rounded-lg p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${cfg.color}`}>
                    <Icon size={12} />
                    {cfg.label}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-medium text-gray-800 truncate">{p.title}</h3>
                    <p className="text-xs text-gray-400 truncate">{p.document_title}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="text-right text-xs text-gray-400">
                    <div>签署进度: {p.signed_count}/{p.total_signers}</div>
                    <div>{new Date(p.created_at).toLocaleDateString('zh-CN')}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => loadDetail(p.id)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                      title="查看详情"
                    >
                      <Eye size={16} />
                    </button>
                    {p.status === 'completed' && (
                      <button
                        onClick={() => handleDownload(p.id)}
                        className="p-1.5 text-gray-400 hover:text-green-600 rounded"
                        title="下载签署文档"
                      >
                        <Download size={16} />
                      </button>
                    )}
                    {p.status === 'draft' && (
                      <Link
                        to={`/signing/${p.id}/edit`}
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                        title="编辑"
                      >
                        <FileText size={16} />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
              {/* Progress bar */}
              {p.status === 'in_progress' && (
                <div className="mt-3">
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className="bg-blue-600 h-1.5 rounded-full transition-all"
                      style={{ width: `${(p.signed_count / p.total_signers) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <FileText size={48} className="mx-auto mb-3 opacity-50" />
            <p>暂无签署流程</p>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {showDetail && selectedProcess && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b sticky top-0 bg-white rounded-t-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-800">{selectedProcess.title}</h2>
                <button onClick={() => setShowDetail(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_CONFIG[selectedProcess.status]?.color || ''}`}>
                  {STATUS_CONFIG[selectedProcess.status]?.label || selectedProcess.status}
                </span>
                {selectedProcess.expires_at && (
                  <span className="text-xs text-gray-400">截止: {new Date(selectedProcess.expires_at).toLocaleString('zh-CN')}</span>
                )}
              </div>
            </div>

            {/* Signers section */}
            <div className="p-6 border-b">
              <h3 className="font-medium text-gray-700 mb-3">签署方状态</h3>
              <div className="space-y-3">
                {signers.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${s.status === 'signed' ? 'bg-green-500' : s.status === 'rejected' ? 'bg-red-500' : s.status === 'notified' ? 'bg-blue-500' : 'bg-gray-300'}`} />
                      <div>
                        <div className="font-medium text-sm text-gray-700">{s.sign_order}. {s.name}</div>
                        <div className="text-xs text-gray-400">{s.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className={`text-xs font-medium ${signerStatusColor(s.status)}`}>{signerStatusLabel(s.status)}</div>
                        {s.signed_at && <div className="text-xs text-gray-400">{new Date(s.signed_at).toLocaleString('zh-CN')}</div>}
                        {s.rejected_at && <div className="text-xs text-gray-400">{new Date(s.rejected_at).toLocaleString('zh-CN')}</div>}
                        {s.reject_reason && <div className="text-xs text-red-400 mt-0.5">原因: {s.reject_reason}</div>}
                      </div>
                      {(s.status === 'notified' || s.status === 'pending') && selectedProcess.status === 'in_progress' && (
                        <button
                          onClick={() => handleRemind(selectedProcess.id, s.id)}
                          className="p-1 text-yellow-500 hover:text-yellow-600"
                          title="发送提醒"
                        >
                          <Bell size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Audit logs section */}
            <div className="p-6">
              <h3 className="font-medium text-gray-700 mb-3">审计日志</h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {auditLogs.map((log: any) => (
                  <div key={log.id} className="flex items-start gap-2 text-xs">
                    <span className="text-gray-400 whitespace-nowrap flex-shrink-0">
                      {new Date(log.created_at).toLocaleString('zh-CN')}
                    </span>
                    <span className="text-gray-600">{log.details || log.action}</span>
                  </div>
                ))}
                {auditLogs.length === 0 && (
                  <p className="text-xs text-gray-400">暂无日志记录</p>
                )}
              </div>
            </div>

            {/* Actions */}
            {selectedProcess.status === 'completed' && (
              <div className="p-6 border-t bg-gray-50 rounded-b-xl">
                <button
                  onClick={() => handleDownload(selectedProcess.id)}
                  className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                >
                  <Download size={16} /> 下载已签署文档
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
