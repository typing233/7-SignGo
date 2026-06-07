import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Plus, Trash2, ArrowRight } from 'lucide-react';
import api from '../api';

interface SignerInput {
  name: string;
  email: string;
  sign_order: number;
}

export default function CreateSigningPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const docId = searchParams.get('docId');
  const [doc, setDoc] = useState<any>(null);
  const [title, setTitle] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [signers, setSigners] = useState<SignerInput[]>([{ name: '', email: '', sign_order: 1 }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!docId) { navigate('/documents'); return; }
    api.get(`/documents/${docId}`).then((res) => {
      setDoc(res.data.document);
      setTitle(`${res.data.document.title} - 签署`);
    }).catch(() => navigate('/documents'));
  }, [docId]);

  const addSigner = () => {
    setSigners([...signers, { name: '', email: '', sign_order: signers.length + 1 }]);
  };

  const removeSigner = (index: number) => {
    if (signers.length <= 1) return;
    const updated = signers.filter((_, i) => i !== index).map((s, i) => ({ ...s, sign_order: i + 1 }));
    setSigners(updated);
  };

  const updateSigner = (index: number, field: keyof SignerInput, value: string) => {
    const updated = [...signers];
    (updated[index] as any)[field] = value;
    setSigners(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    for (const s of signers) {
      if (!s.name || !s.email) {
        setError('请填写所有签署人信息');
        return;
      }
    }

    setLoading(true);
    try {
      const res = await api.post('/signing', {
        document_id: Number(docId),
        title,
        signers,
        expires_at: expiresAt || undefined,
      });
      navigate(`/signing/${res.data.process.id}/edit`);
    } catch (err: any) {
      setError(err.response?.data?.error || '创建失败');
    } finally {
      setLoading(false);
    }
  };

  if (!doc) return <div className="text-center py-12 text-gray-500">加载中...</div>;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">创建签署流程</h1>

      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <p className="text-sm text-gray-500">签署文档</p>
        <p className="font-medium text-gray-800">{doc.title}</p>
      </div>

      {error && <div className="bg-red-50 text-red-600 p-3 rounded mb-4">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">流程标题</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">签署截止日期（可选）</label>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">超过截止日期后，签署链接将自动失效</p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-gray-700">签署人（按顺序签署）</label>
            <button type="button" onClick={addSigner} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700">
              <Plus size={16} /> 添加签署人
            </button>
          </div>

          <div className="space-y-3">
            {signers.map((signer, index) => (
              <div key={index} className="flex items-center gap-3 bg-white border rounded-lg p-3">
                <span className="text-sm font-medium text-gray-500 w-6">{index + 1}.</span>
                <input
                  placeholder="姓名"
                  value={signer.name}
                  onChange={(e) => updateSigner(index, 'name', e.target.value)}
                  className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm"
                  required
                />
                <input
                  type="email"
                  placeholder="邮箱"
                  value={signer.email}
                  onChange={(e) => updateSigner(index, 'email', e.target.value)}
                  className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm"
                  required
                />
                {signers.length > 1 && (
                  <button type="button" onClick={() => removeSigner(index)} className="text-gray-400 hover:text-red-500">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? '创建中...' : (<>下一步：设置签署字段 <ArrowRight size={18} /></>)}
        </button>
      </form>
    </div>
  );
}
