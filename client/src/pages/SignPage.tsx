import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, AlertCircle, XCircle, Clock, FileText } from 'lucide-react';
import api from '../api';
import PDFViewer from '../components/PDFViewer';
import SignatureCanvas from '../components/SignatureCanvas';

interface FieldData {
  id: number;
  type: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  value: string | null;
  required: number;
}

interface SignerInfo {
  id: number;
  name: string;
  email: string;
  sign_order: number;
  status: string;
  signed_at: string | null;
}

export default function SignPage() {
  const { token } = useParams();
  const [signingData, setSigningData] = useState<any>(null);
  const [fields, setFields] = useState<FieldData[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<number, string>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [showSignature, setShowSignature] = useState<number | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState('');
  const [errorType, setErrorType] = useState<'error' | 'expired' | 'signed'>('error');
  const [completed, setCompleted] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get(`/public/sign/${token}`).then((res) => {
      setSigningData(res.data);
      setFields(res.data.fields);
      const values: Record<number, string> = {};
      res.data.fields.forEach((f: FieldData) => {
        if (f.type === 'date') {
          values[f.id] = new Date().toLocaleDateString('zh-CN');
        }
      });
      setFieldValues(values);
    }).catch((err) => {
      const data = err.response?.data;
      if (data?.alreadySigned) {
        setErrorType('signed');
      } else if (err.response?.status === 410) {
        setErrorType('expired');
      }
      setError(data?.error || '签署链接无效');
    });
  }, [token]);

  const handleFieldClick = (field: FieldData) => {
    if (field.type === 'signature') {
      setShowSignature(field.id);
    }
  };

  const handleSignatureSave = (dataUrl: string) => {
    if (showSignature !== null) {
      setFieldValues({ ...fieldValues, [showSignature]: dataUrl });
      setShowSignature(null);
    }
  };

  const handleTextChange = (fieldId: number, value: string) => {
    setFieldValues({ ...fieldValues, [fieldId]: value });
  };

  const handleSubmit = async () => {
    const requiredFields = fields.filter((f) => f.required);
    for (const f of requiredFields) {
      if (!fieldValues[f.id]) {
        alert('请完成所有必填字段');
        return;
      }
    }

    setSubmitting(true);
    try {
      await api.post(`/public/sign/${token}/complete`, {
        fields: fields.map((f) => ({ id: f.id, value: fieldValues[f.id] || '' })),
      });
      setCompleted(true);
    } catch (err: any) {
      alert(err.response?.data?.error || '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    setSubmitting(true);
    try {
      await api.post(`/public/sign/${token}/reject`, { reason: rejectReason });
      setRejected(true);
      setShowRejectModal(false);
    } catch (err: any) {
      alert(err.response?.data?.error || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (error) {
    const icons = { error: AlertCircle, expired: Clock, signed: CheckCircle };
    const colors = { error: 'text-red-400', expired: 'text-yellow-400', signed: 'text-green-500' };
    const Icon = icons[errorType];
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <Icon size={48} className={`mx-auto ${colors[errorType]} mb-4`} />
          <p className="text-lg text-gray-700">{error}</p>
          {errorType === 'signed' && (
            <p className="text-sm text-gray-400 mt-2">您已完成此文档的签署，无需重复操作。</p>
          )}
        </div>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">签署完成</h2>
          <p className="text-gray-500">感谢您的签署！文档已成功提交。</p>
          <p className="text-xs text-gray-400 mt-4">签署时间: {new Date().toLocaleString('zh-CN')}</p>
        </div>
      </div>
    );
  }

  if (rejected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <XCircle size={48} className="mx-auto text-red-400 mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">已拒绝签署</h2>
          <p className="text-gray-500">您已拒绝此文档的签署，发起方将收到通知。</p>
        </div>
      </div>
    );
  }

  if (!signingData) return <div className="min-h-screen flex items-center justify-center text-gray-500">加载中...</div>;

  const pdfUrl = `/api/public/sign/${token}/file`;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-800">{signingData.process.title}</h1>
              <p className="text-sm text-gray-500 mt-1">
                您好 {signingData.signer.name}，请在下方文档中完成签署。
              </p>
            </div>
            <div className="text-right text-xs text-gray-400">
              <div className="flex items-center gap-1">
                <FileText size={12} />
                {signingData.document.title}
              </div>
              {signingData.process.expires_at && (
                <div className="mt-1 text-yellow-500">
                  截止: {new Date(signingData.process.expires_at).toLocaleString('zh-CN')}
                </div>
              )}
            </div>
          </div>

          {/* Signers progress */}
          {signingData.signers && signingData.signers.length > 1 && (
            <div className="mt-4 pt-3 border-t">
              <div className="flex items-center gap-4 text-xs">
                {signingData.signers.map((s: SignerInfo) => (
                  <div key={s.id} className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${
                      s.status === 'signed' ? 'bg-green-500' :
                      s.id === signingData.signer.id ? 'bg-blue-500 animate-pulse' :
                      'bg-gray-300'
                    }`} />
                    <span className={s.id === signingData.signer.id ? 'font-medium text-blue-600' : 'text-gray-400'}>
                      {s.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* PDF Viewer */}
        <div className="flex justify-center mb-4">
          <PDFViewer
            url={pdfUrl}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            width={600}
            renderOverlay={(pageWidth, pageHeight) => (
              <div className="absolute inset-0" style={{ zIndex: 10 }}>
                {fields
                  .filter((f) => f.page === currentPage)
                  .map((field) => (
                    <div
                      key={field.id}
                      className="absolute border-2 border-blue-500 rounded cursor-pointer hover:bg-blue-50/50 flex items-center justify-center overflow-hidden"
                      style={{
                        left: `${field.x}%`,
                        top: `${field.y}%`,
                        width: `${field.width}%`,
                        height: `${field.height}%`,
                        backgroundColor: fieldValues[field.id] ? '#dcfce7' : '#eff6ff',
                      }}
                      onClick={() => handleFieldClick(field)}
                    >
                      {field.type === 'signature' && fieldValues[field.id] ? (
                        <img src={fieldValues[field.id]} alt="签名" className="w-full h-full object-contain" />
                      ) : field.type === 'signature' ? (
                        <span className="text-xs text-blue-500">点击签名</span>
                      ) : field.type === 'date' ? (
                        <input
                          type="text"
                          value={fieldValues[field.id] || ''}
                          onChange={(e) => handleTextChange(field.id, e.target.value)}
                          className="w-full h-full text-center text-xs bg-transparent outline-none"
                        />
                      ) : (
                        <input
                          type="text"
                          value={fieldValues[field.id] || ''}
                          onChange={(e) => handleTextChange(field.id, e.target.value)}
                          placeholder="输入文本"
                          className="w-full h-full text-center text-xs bg-transparent outline-none"
                        />
                      )}
                    </div>
                  ))}
              </div>
            )}
          />
        </div>

        {/* Action buttons */}
        <div className="flex justify-center gap-4">
          <button
            onClick={() => setShowRejectModal(true)}
            className="bg-white border border-red-300 text-red-600 px-6 py-3 rounded-lg hover:bg-red-50 transition-colors"
          >
            拒绝签署
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-green-600 text-white px-8 py-3 rounded-lg text-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? '提交中...' : '确认签署'}
          </button>
        </div>
      </div>

      {/* Signature canvas modal */}
      {showSignature !== null && (
        <SignatureCanvas
          onSave={handleSignatureSave}
          onCancel={() => setShowSignature(null)}
        />
      )}

      {/* Reject modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-2">拒绝签署</h3>
            <p className="text-sm text-gray-500 mb-4">拒绝后，发起方将收到通知，签署流程将终止。</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="请输入拒绝原因（可选）"
              className="w-full border rounded-lg p-3 text-sm h-24 resize-none focus:outline-none focus:ring-2 focus:ring-red-200"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                取消
              </button>
              <button
                onClick={handleReject}
                disabled={submitting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {submitting ? '处理中...' : '确认拒绝'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
