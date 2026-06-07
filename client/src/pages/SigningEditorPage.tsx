import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DndContext, DragEndEvent, DragStartEvent, useDraggable, useDroppable } from '@dnd-kit/core';
import { PenTool, Calendar, Type, Trash2, Send } from 'lucide-react';
import api from '../api';
import PDFViewer from '../components/PDFViewer';

interface FieldData {
  id?: number;
  signer_id: number;
  type: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
}

interface Signer {
  id: number;
  name: string;
  email: string;
  sign_order: number;
}

const FIELD_TYPES = [
  { type: 'signature', label: '签名', icon: PenTool, width: 20, height: 8 },
  { type: 'date', label: '日期', icon: Calendar, width: 15, height: 5 },
  { type: 'text', label: '文本', icon: Type, width: 20, height: 5 },
];

const SIGNER_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

function DraggablePaletteItem({ type, label, icon: Icon }: { type: string; label: string; icon: any }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${type}`,
    data: { type, fromPalette: true },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2 px-3 py-2 border rounded cursor-grab bg-white hover:bg-gray-50 ${isDragging ? 'opacity-50' : ''}`}
    >
      <Icon size={16} />
      <span className="text-sm">{label}</span>
    </div>
  );
}

function PlacedField({
  field,
  pageWidth,
  pageHeight,
  signerColor,
  signerName,
  onDelete,
}: {
  field: FieldData;
  pageWidth: number;
  pageHeight: number;
  signerColor: string;
  signerName: string;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
    id: `field-${field.id || Math.random()}`,
    data: { field, fromPalette: false },
  });

  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${field.x}%`,
    top: `${field.y}%`,
    width: `${field.width}%`,
    height: `${field.height}%`,
    border: `2px solid ${signerColor}`,
    backgroundColor: `${signerColor}20`,
    borderRadius: 4,
    cursor: 'grab',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    opacity: isDragging ? 0.5 : 1,
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    zIndex: isDragging ? 1000 : 1,
  };

  const typeLabel = FIELD_TYPES.find((t) => t.type === field.type)?.label || field.type;

  return (
    <div ref={setNodeRef} {...listeners} {...attributes} style={style}>
      <span style={{ color: signerColor }} className="font-medium text-xs truncate px-1">
        {signerName}: {typeLabel}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Trash2 size={10} />
      </button>
    </div>
  );
}

function DroppableCanvas({
  fields,
  currentPage,
  pageWidth,
  pageHeight,
  signers,
  onDeleteField,
}: {
  fields: FieldData[];
  currentPage: number;
  pageWidth: number;
  pageHeight: number;
  signers: Signer[];
  onDeleteField: (index: number) => void;
}) {
  const { setNodeRef } = useDroppable({ id: 'pdf-canvas' });
  const pageFields = fields.filter((f) => f.page === currentPage);

  return (
    <div ref={setNodeRef} className="absolute inset-0" style={{ zIndex: 10 }}>
      {pageFields.map((field, _) => {
        const globalIndex = fields.indexOf(field);
        const signerIndex = signers.findIndex((s) => s.id === field.signer_id);
        const color = SIGNER_COLORS[signerIndex % SIGNER_COLORS.length];
        const signerName = signers[signerIndex]?.name || '?';

        return (
          <PlacedField
            key={globalIndex}
            field={field}
            pageWidth={pageWidth}
            pageHeight={pageHeight}
            signerColor={color}
            signerName={signerName}
            onDelete={() => onDeleteField(globalIndex)}
          />
        );
      })}
    </div>
  );
}

export default function SigningEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [process, setProcess] = useState<any>(null);
  const [signers, setSigners] = useState<Signer[]>([]);
  const [fields, setFields] = useState<FieldData[]>([]);
  const [selectedSigner, setSelectedSigner] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 600, height: 800 });

  useEffect(() => {
    api.get(`/signing/${id}`).then((res) => {
      setProcess(res.data.process);
      setSigners(res.data.signers);
      if (res.data.fields.length > 0) {
        setFields(res.data.fields.map((f: any) => ({
          ...f,
          required: !!f.required,
        })));
      }
    }).catch(() => navigate('/documents'));
  }, [id]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || over.id !== 'pdf-canvas') return;
    if (!canvasRef.current) return;

    const data = active.data.current;

    if (data?.fromPalette) {
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const fieldType = FIELD_TYPES.find((t) => t.type === data.type)!;

      const dropX = ((event as any).activatorEvent.clientX + (event.delta?.x || 0) - canvasRect.left) / canvasRect.width * 100;
      const dropY = ((event as any).activatorEvent.clientY + (event.delta?.y || 0) - canvasRect.top) / canvasRect.height * 100;

      const x = Math.max(0, Math.min(100 - fieldType.width, dropX - fieldType.width / 2));
      const y = Math.max(0, Math.min(100 - fieldType.height, dropY - fieldType.height / 2));

      const newField: FieldData = {
        signer_id: signers[selectedSigner]?.id,
        type: data.type,
        page: currentPage,
        x,
        y,
        width: fieldType.width,
        height: fieldType.height,
        required: true,
      };
      setFields([...fields, newField]);
    } else if (data?.field) {
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const deltaXPercent = (event.delta.x / canvasRect.width) * 100;
      const deltaYPercent = (event.delta.y / canvasRect.height) * 100;

      const fieldIndex = fields.indexOf(data.field);
      if (fieldIndex >= 0) {
        const updated = [...fields];
        updated[fieldIndex] = {
          ...updated[fieldIndex],
          x: Math.max(0, Math.min(100 - updated[fieldIndex].width, updated[fieldIndex].x + deltaXPercent)),
          y: Math.max(0, Math.min(100 - updated[fieldIndex].height, updated[fieldIndex].y + deltaYPercent)),
        };
        setFields(updated);
      }
    }
  };

  const handleDeleteField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/signing/${id}/fields`, { fields });
      alert('字段已保存');
    } catch (err: any) {
      alert(err.response?.data?.error || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async () => {
    if (fields.length === 0) {
      alert('请先添加签署字段');
      return;
    }
    if (!confirm('确定发送签署请求？发送后将无法修改字段。')) return;

    setSending(true);
    try {
      await api.put(`/signing/${id}/fields`, { fields });
      await api.post(`/signing/${id}/send`);
      alert('签署请求已发送！请查看控制台获取签署链接。');
      navigate('/documents');
    } catch (err: any) {
      alert(err.response?.data?.error || '发送失败');
    } finally {
      setSending(false);
    }
  };

  if (!process) return <div className="text-center py-12 text-gray-500">加载中...</div>;

  const pdfUrl = `/api/documents/${process.document_id}/file`;

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="flex gap-6 h-[calc(100vh-120px)]">
        {/* Left sidebar */}
        <div className="w-64 flex-shrink-0 bg-white border rounded-lg p-4 overflow-y-auto">
          <h2 className="font-bold text-gray-800 mb-4">签署字段</h2>

          <div className="mb-4">
            <label className="text-xs text-gray-500 mb-1 block">当前签署人</label>
            <select
              value={selectedSigner}
              onChange={(e) => setSelectedSigner(Number(e.target.value))}
              className="w-full border rounded px-2 py-1.5 text-sm"
            >
              {signers.map((s, i) => (
                <option key={s.id} value={i}>
                  {s.sign_order}. {s.name}
                </option>
              ))}
            </select>
            <div
              className="h-1 rounded mt-1"
              style={{ backgroundColor: SIGNER_COLORS[selectedSigner % SIGNER_COLORS.length] }}
            />
          </div>

          <div className="space-y-2 mb-6">
            {FIELD_TYPES.map((ft) => (
              <DraggablePaletteItem key={ft.type} {...ft} />
            ))}
          </div>

          <p className="text-xs text-gray-400 mb-4">拖拽字段到PDF上放置</p>

          <div className="border-t pt-4 space-y-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-gray-100 text-gray-700 py-2 rounded hover:bg-gray-200 text-sm"
            >
              {saving ? '保存中...' : '保存字段'}
            </button>
            <button
              onClick={handleSend}
              disabled={sending}
              className="w-full flex items-center justify-center gap-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700 text-sm"
            >
              {sending ? '发送中...' : (<><Send size={14} /> 发送签署请求</>)}
            </button>
          </div>
        </div>

        {/* PDF area */}
        <div className="flex-1 overflow-auto flex justify-center" ref={canvasRef}>
          <PDFViewer
            url={pdfUrl}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            onLoadSuccess={setNumPages}
            width={600}
            renderOverlay={(pageWidth, pageHeight) => (
              <DroppableCanvas
                fields={fields}
                currentPage={currentPage}
                pageWidth={pageWidth}
                pageHeight={pageHeight}
                signers={signers}
                onDeleteField={handleDeleteField}
              />
            )}
          />
        </div>
      </div>
    </DndContext>
  );
}
