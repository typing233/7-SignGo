import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, AlertCircle } from 'lucide-react';
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

export default function SignPage() {
  const { token } = useParams();
  const [signingData, setSigningData] = useState<any>(null);
  const [fields, setFields] = useState<FieldData[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<number, string>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [showSignature, setShowSignature] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState(false);
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
      setError(err.response?.data?.error || '签署链接无效');
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
        alert(`请完成所有必填字段`);
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

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <AlertCircle size={48} className="mx-auto text-red-400 mb-4" />
          <p className="text-lg text-gray-700">{error}</p>
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
          <p className="text-gray-500">感谢您的签署！</p>
        </div>
      </div>
    );
  }

  if (!signingData) return <div className="min-h-screen flex items-center justify-center text-gray-500">加载中...</div>;

  const pdfUrl = `/api/public/sign/${token}/file`;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
          <h1 className="text-xl font-bold text-gray-800">{signingData.process.title}</h1>
          <p className="text-sm text-gray-500 mt-1">
            您好 {signingData.signer.name}，请在下方文档中完成签署。
          </p>
        </div>

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

        <div className="flex justify-center">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-green-600 text-white px-8 py-3 rounded-lg text-lg hover:bg-green-700 disabled:opacity-50"
          >
            {submitting ? '提交中...' : '确认签署'}
          </button>
        </div>
      </div>

      {showSignature !== null && (
        <SignatureCanvas
          onSave={handleSignatureSave}
          onCancel={() => setShowSignature(null)}
        />
      )}
    </div>
  );
}
