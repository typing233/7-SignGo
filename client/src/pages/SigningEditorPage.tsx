import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DndContext, DragEndEvent, useDraggable, useDroppable, DragOverlay, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
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
  index,
  signerColor,
  signerName,
  onDelete,
  onMove,
  overlayRect,
}: {
  field: FieldData;
  index: number;
  signerColor: string;
  signerName: string;
  onDelete: () => void;
  onMove: (deltaXPct: number, deltaYPct: number) => void;
  overlayRect: DOMRect | null;
}) {
  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
    id: `field-${index}`,
    data: { fieldIndex: index, fromPalette: false },
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
  onMoveField,
  overlayRect,
}: {
  fields: FieldData[];
  currentPage: number;
  pageWidth: number;
  pageHeight: number;
  signers: Signer[];
  onDeleteField: (index: number) => void;
  onMoveField: (index: number, deltaXPct: number, deltaYPct: number) => void;
  overlayRect: DOMRect | null;
}) {
  const { setNodeRef } = useDroppable({ id: 'pdf-canvas' });

  return (
    <div ref={setNodeRef} className="absolute inset-0" style={{ zIndex: 10 }}>
      {fields.map((field, idx) => {
        if (field.page !== currentPage) return null;
        const signerIndex = signers.findIndex((s) => s.id === field.signer_id);
        const color = SIGNER_COLORS[signerIndex % SIGNER_COLORS.length];
        const signerName = signers[signerIndex]?.name || '?';
        const globalIndex = fields.indexOf(field);

        return (
          <PlacedField
            key={`${globalIndex}-${field.x}-${field.y}`}
            field={field}
            index={globalIndex}
            signerColor={color}
            signerName={signerName}
            onDelete={() => onDeleteField(globalIndex)}
            onMove={(dx, dy) => onMoveField(globalIndex, dx, dy)}
            overlayRect={overlayRect}
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
  const overlayRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

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
    const data = active.data.current;

    if (!overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();

    if (data?.fromPalette) {
      // For palette items: compute final pointer position relative to the overlay
      const activatorEvent = event.activatorEvent as PointerEvent;
      const finalX = activatorEvent.clientX + event.delta.x;
      const finalY = activatorEvent.clientY + event.delta.y;

      const dropXPct = ((finalX - rect.left) / rect.width) * 100;
      const dropYPct = ((finalY - rect.top) / rect.height) * 100;

      // Only place if drop is within the PDF area
      if (dropXPct < 0 || dropXPct > 100 || dropYPct < 0 || dropYPct > 100) return;

      const fieldType = FIELD_TYPES.find((t) => t.type === data.type)!;
      const x = Math.max(0, Math.min(100 - fieldType.width, dropXPct - fieldType.width / 2));
      const y = Math.max(0, Math.min(100 - fieldType.height, dropYPct - fieldType.height / 2));

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
    } else if (data && !data.fromPalette && data.fieldIndex !== undefined) {
      // Moving an existing field: convert pixel delta to percentage of overlay
      const deltaXPct = (event.delta.x / rect.width) * 100;
      const deltaYPct = (event.delta.y / rect.height) * 100;

      const fieldIndex = data.fieldIndex as number;
      const updated = [...fields];
      const field = updated[fieldIndex];
      updated[fieldIndex] = {
        ...field,
        x: Math.max(0, Math.min(100 - field.width, field.x + deltaXPct)),
        y: Math.max(0, Math.min(100 - field.height, field.y + deltaYPct)),
      };
      setFields(updated);
    }
  };

  const handleDeleteField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const handleMoveField = (index: number, deltaXPct: number, deltaYPct: number) => {
    const updated = [...fields];
    const field = updated[index];
    updated[index] = {
      ...field,
      x: Math.max(0, Math.min(100 - field.width, field.x + deltaXPct)),
      y: Math.max(0, Math.min(100 - field.height, field.y + deltaYPct)),
    };
    setFields(updated);
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
      alert('签署请求已发送！签署邮件已发送至签署人邮箱。');
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
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
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
        <div className="flex-1 overflow-auto flex justify-center">
          <PDFViewer
            url={pdfUrl}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            onLoadSuccess={setNumPages}
            width={600}
            overlayRef={overlayRef}
            renderOverlay={(pageWidth, pageHeight) => (
              <DroppableCanvas
                fields={fields}
                currentPage={currentPage}
                pageWidth={pageWidth}
                pageHeight={pageHeight}
                signers={signers}
                onDeleteField={handleDeleteField}
                onMoveField={handleMoveField}
                overlayRect={overlayRef.current?.getBoundingClientRect() || null}
              />
            )}
          />
        </div>
      </div>
    </DndContext>
  );
}
