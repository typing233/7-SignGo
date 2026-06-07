import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Upload, FileText, Trash2, Edit3, Send } from 'lucide-react';
import api from '../api';

interface Document {
  id: number;
  title: string;
  filename: string;
  created_at: string;
  page_count: number;
}

export default function DocumentListPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const navigate = useNavigate();

  const fetchDocuments = async () => {
    try {
      const res = await api.get('/documents');
      setDocuments(res.data.documents);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDocuments(); }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.post('/documents/upload', formData);
      await fetchDocuments();
    } catch (err: any) {
      alert(err.response?.data?.error || '上传失败');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除该文档？')) return;
    try {
      await api.delete(`/documents/${id}`);
      setDocuments(documents.filter((d) => d.id !== id));
    } catch (err: any) {
      alert(err.response?.data?.error || '删除失败');
    }
  };

  const handleRename = async (id: number) => {
    if (!editTitle.trim()) return;
    try {
      await api.patch(`/documents/${id}`, { title: editTitle });
      setEditingId(null);
      await fetchDocuments();
    } catch (err: any) {
      alert(err.response?.data?.error || '重命名失败');
    }
  };

  if (loading) return <div className="text-center py-12 text-gray-500">加载中...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">我的文档</h1>
        <label className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 cursor-pointer">
          <Upload size={18} />
          {uploading ? '上传中...' : '上传PDF'}
          <input type="file" accept=".pdf" onChange={handleUpload} className="hidden" disabled={uploading} />
        </label>
      </div>

      {documents.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <FileText size={48} className="mx-auto mb-4" />
          <p>暂无文档，上传一个PDF开始吧</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map((doc) => (
            <div key={doc.id} className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
              {editingId === doc.id ? (
                <div className="flex gap-2 mb-2">
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="flex-1 border rounded px-2 py-1 text-sm"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleRename(doc.id)}
                  />
                  <button onClick={() => handleRename(doc.id)} className="text-blue-600 text-sm">保存</button>
                  <button onClick={() => setEditingId(null)} className="text-gray-400 text-sm">取消</button>
                </div>
              ) : (
                <Link to={`/documents/${doc.id}`} className="block">
                  <h3 className="font-medium text-gray-800 truncate">{doc.title}</h3>
                </Link>
              )}
              <p className="text-sm text-gray-400 mt-1">{new Date(doc.created_at).toLocaleDateString('zh-CN')}</p>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                <button
                  onClick={() => { setEditingId(doc.id); setEditTitle(doc.title); }}
                  className="text-gray-400 hover:text-blue-600" title="重命名"
                >
                  <Edit3 size={16} />
                </button>
                <button onClick={() => handleDelete(doc.id)} className="text-gray-400 hover:text-red-500" title="删除">
                  <Trash2 size={16} />
                </button>
                <button
                  onClick={() => navigate(`/signing/new?docId=${doc.id}`)}
                  className="ml-auto flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                >
                  <Send size={14} /> 发起签署
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
