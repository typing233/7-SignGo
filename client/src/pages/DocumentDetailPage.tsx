import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit3, Trash2, Send } from 'lucide-react';
import api from '../api';
import PDFViewer from '../components/PDFViewer';

export default function DocumentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');

  useEffect(() => {
    api.get(`/documents/${id}`).then((res) => {
      setDoc(res.data.document);
      setEditTitle(res.data.document.title);
    }).catch(() => navigate('/documents'));
  }, [id]);

  const handleRename = async () => {
    if (!editTitle.trim()) return;
    const res = await api.patch(`/documents/${id}`, { title: editTitle });
    setDoc(res.data.document);
    setEditing(false);
  };

  const handleDelete = async () => {
    if (!confirm('确定删除该文档？')) return;
    try {
      await api.delete(`/documents/${id}`);
      navigate('/documents');
    } catch (err: any) {
      alert(err.response?.data?.error || '删除失败');
    }
  };

  if (!doc) return <div className="text-center py-12 text-gray-500">加载中...</div>;

  const token = localStorage.getItem('token');
  const pdfUrl = `/api/documents/${id}/file`;

  return (
    <div>
      <button onClick={() => navigate('/documents')} className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft size={18} /> 返回文档列表
      </button>

      <div className="flex items-center gap-4 mb-6">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="border rounded px-3 py-1 text-lg"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            />
            <button onClick={handleRename} className="text-blue-600">保存</button>
            <button onClick={() => setEditing(false)} className="text-gray-400">取消</button>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-800">{doc.title}</h1>
            <button onClick={() => setEditing(true)} className="text-gray-400 hover:text-blue-600">
              <Edit3 size={18} />
            </button>
          </>
        )}
        <div className="ml-auto flex gap-2">
          <button onClick={handleDelete} className="flex items-center gap-1 text-red-500 hover:text-red-600 border border-red-200 px-3 py-1.5 rounded">
            <Trash2 size={16} /> 删除
          </button>
          <button
            onClick={() => navigate(`/signing/new?docId=${doc.id}`)}
            className="flex items-center gap-1 bg-blue-600 text-white px-4 py-1.5 rounded hover:bg-blue-700"
          >
            <Send size={16} /> 发起签署
          </button>
        </div>
      </div>

      <div className="flex justify-center">
        <PDFViewer
          url={pdfUrl}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
        />
      </div>
    </div>
  );
}
