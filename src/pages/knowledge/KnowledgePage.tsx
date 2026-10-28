import { useState, useMemo, useRef } from 'react';
import { getStore, updateStore, useStoreVersion } from '@/lib/store';
import { generateId, formatDate } from '@/lib/utils';
import { getCurrentUser, isAdmin, canSeeKnowledge } from '@/lib/auth';
// v1.34.0: файлы — через свой API (storage-бакеты Supabase вырезаны).
import { apiFilesUploadFile } from '@/lib/api';
import type {KnowledgeItem, KnowledgeItemType, KnowledgeComment} from '@/types';
import {Plus,
  Search,
  X,
  Edit2,
  Trash2,
  FileText,
  Link as LinkIcon,
  StickyNote,
  Download,
  MessageSquare,
  Send,
  ChevronDown,
  ChevronUp,
  BookOpen,
  FolderOpen,
  Tag,
  Save,
  Upload,
  Loader2} from 'lucide-react';
import { toast } from 'sonner';

const TYPE_ICONS: Record<KnowledgeItemType, React.ElementType> = {
  file: FileText,
  link: LinkIcon,
  note: StickyNote,
};
const TYPE_LABELS: Record<KnowledgeItemType, string> = {
  file: 'Файл',
  link: 'Ссылка',
  note: 'Заметка',
};
const TYPE_COLORS: Record<KnowledgeItemType, string> = {
  file: 'bg-blue-50 text-blue-700 border-blue-100',
  link: 'bg-purple-50 text-purple-700 border-purple-100',
  note: 'bg-yellow-50 text-yellow-700 border-yellow-100',
};

function safeKnowledgeUrl(value: string): string | null {
  try {
    const url = new URL(value, window.location.origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch {
    return null;
  }
}

export default function KnowledgePage() {
  const [, forceUpdate] = useState(0);
  useStoreVersion(); // re-render on real-time changes from other users (see src/lib/realtime.ts)
  const store = getStore();

  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterType, setFilterType] = useState<KnowledgeItemType | ''>('');
  const [filterManagers, setFilterManagers] = useState(false); // фильтр «Доступно менеджерам» (ТЗ)
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'author'>('date');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCatManager, setShowCatManager] = useState(false);
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeCategories = useMemo(() => (store.settings.knowledgeCategories || []).filter(c => !c.deletedAt), [store.settings.knowledgeCategories]);

  const emptyForm = (): Partial<KnowledgeItem> & { tagsRaw: string } => ({
    title: '', categoryId: activeCategories[0]?.id || '', categoryName: activeCategories[0]?.name || '',
    type: 'note', description: '', content: '', fileName: '', fileSize: '', fileUrl: '', tags: [], tagsRaw: '',
    availableToManagers: false,   // по умолчанию новые материалы НЕ доступны менеджерам (ТЗ)
  });
  const [form, setForm] = useState<Partial<KnowledgeItem> & { tagsRaw: string }>(emptyForm());

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // v1.34.0: файлы — через свой API, storage не нужен.
    setUploading(true);
    try {
      const url = await apiFilesUploadFile(file);
      setForm(f => ({ ...f, fileUrl: url, fileName: file.name, fileSize: formatFileSize(file.size) }));
      toast.success('Файл загружен');
    } catch (err) {
      toast.error('Не удалось загрузить файл');
      console.error(err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const items = useMemo(() => {
    const cu = getCurrentUser();
    const isManager = cu?.role === 'manager';
    // Менеджеры видят только материалы с флагом «Доступен менеджерам» (ТЗ)
    let list = (store.settings.knowledgeItems || []).filter(i => !i.deletedAt && (!isManager || i.availableToManagers) && canSeeKnowledge(i)); // фильтр категорий менеджера (v1.20.9)
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.title.toLowerCase().includes(q) ||
        (i.description || '').toLowerCase().includes(q) ||
        i.tags.some(t => t.toLowerCase().includes(q)) ||
        (i.content || '').toLowerCase().includes(q)
      );
    }
    if (filterCategory) list = list.filter(i => i.categoryId === filterCategory);
    if (filterManagers) list = list.filter(i => i.availableToManagers);
    if (filterType) list = list.filter(i => i.type === filterType);

    if (sortBy === 'date') list = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    else if (sortBy === 'title') list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    else if (sortBy === 'author') list = [...list].sort((a, b) => a.authorName.localeCompare(b.authorName));

    return list;
  }, [store.settings.knowledgeItems, search, filterCategory, filterType, filterManagers, sortBy]);

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
    setExpandedId(null);
  }

  function openEdit(item: KnowledgeItem) {
    setEditingId(item.id);
    setForm({ ...item, tagsRaw: item.tags.join(', ') });
    setShowForm(true);
    setExpandedId(null);
  }

  function handleCategoryChange(catId: string) {
    const cat = activeCategories.find(c => c.id === catId);
    setForm(f => ({ ...f, categoryId: catId, categoryName: cat?.name || '' }));
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title?.trim()) { toast.error('Введите название'); return; }
    if (!form.categoryId) { toast.error('Выберите категорию'); return; }
    if (form.type === 'file' && !editingId && !form.fileUrl) {
      toast.error('Дождитесь загрузки файла или выберите файл');
      return;
    }
    const u = getCurrentUser()!;
    const now = new Date().toISOString();
    const tags = (form.tagsRaw || '').split(',').map(t => t.trim()).filter(Boolean);

    if (editingId) {
      updateStore(s => ({
        ...s, settings: {
          ...s.settings, knowledgeItems: (s.settings.knowledgeItems || []).map(i =>
            i.id === editingId ? { ...i, ...form as KnowledgeItem, tags, updatedAt: now } : i
          ),
        },
      }));
      toast.success('Материал обновлён');
    } else {
      const item: KnowledgeItem = {
        id: generateId(), title: form.title || '', categoryId: form.categoryId || '',
        categoryName: form.categoryName || '', type: form.type as KnowledgeItemType || 'note',
        description: form.description, content: form.content,
        fileName: form.fileName, fileSize: form.fileSize, fileUrl: form.fileUrl,
        tags, authorId: u.id, authorName: u.name, comments: [],
        availableToManagers: form.availableToManagers || false,
        createdAt: now, updatedAt: now,
      };
      updateStore(s => ({
        ...s, settings: { ...s.settings, knowledgeItems: [...(s.settings.knowledgeItems || []), item] },
      }));
      toast.success('Материал добавлен');
    }
    setShowForm(false); setEditingId(null); forceUpdate(n => n + 1);
  }

  function handleDelete(id: string) {
    if (!isAdmin()) { toast.error('Удаление доступно только администратору'); return; }
    if (!confirm('Удалить материал?')) return;
    updateStore(s => ({
      ...s, settings: {
        ...s.settings,
        knowledgeItems: (s.settings.knowledgeItems || []).map(i => i.id === id ? { ...i, deletedAt: new Date().toISOString() } : i),
      },
    }));
    forceUpdate(n => n + 1); toast.success('Удалено');
    if (expandedId === id) setExpandedId(null);
  }

  function addComment(itemId: string) {
    const text = (commentText[itemId] || '').trim();
    if (!text) return;
    const u = getCurrentUser()!;
    const comment: KnowledgeComment = { id: generateId(), text, authorId: u.id, authorName: u.name, createdAt: new Date().toISOString() };
    updateStore(s => ({
      ...s, settings: {
        ...s.settings,
        knowledgeItems: (s.settings.knowledgeItems || []).map(i =>
          i.id === itemId ? { ...i, comments: [...i.comments, comment] } : i
        ),
      },
    }));
    setCommentText(prev => ({ ...prev, [itemId]: '' }));
    forceUpdate(n => n + 1);
  }

  function deleteComment(itemId: string, commentId: string) {
    updateStore(s => ({
      ...s, settings: {
        ...s.settings,
        knowledgeItems: (s.settings.knowledgeItems || []).map(i =>
          i.id === itemId ? { ...i, comments: i.comments.filter(c => c.id !== commentId) } : i
        ),
      },
    }));
    forceUpdate(n => n + 1);
  }

  // Category management
  function addCategory() {
    const name = newCatName.trim();
    if (!name) return;
    if ((store.settings.knowledgeCategories || []).find(c => c.name === name && !c.deletedAt)) { toast.error('Категория уже существует'); return; }
    updateStore(s => ({
      ...s, settings: {
        ...s.settings,
        knowledgeCategories: [...(s.settings.knowledgeCategories || []), { id: generateId(), name, createdAt: new Date().toISOString() }],
      },
    }));
    setNewCatName(''); forceUpdate(n => n + 1); toast.success('Категория добавлена');
  }

  function deleteCategory(id: string) {
    if (!isAdmin()) { toast.error('Удаление доступно только администратору'); return; }
    if (!confirm('Удалить категорию? Материалы в ней останутся.')) return;
    updateStore(s => ({
      ...s, settings: {
        ...s.settings,
        knowledgeCategories: (s.settings.knowledgeCategories || []).map(c => c.id === id ? { ...c, deletedAt: new Date().toISOString() } : c),
      },
    }));
    forceUpdate(n => n + 1);
  }

  const currentItem = expandedId ? (store.settings.knowledgeItems || []).find(i => i.id === expandedId) : null;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="actions-bar flex items-center justify-start flex-wrap gap-2">
        {/* v1.31.5: иконка-блок удалён */}
        <div className="flex gap-2">
          {isAdmin() && (
            <button onClick={() => setShowCatManager(v => !v)} className={`action-btn text-xs ${showCatManager ? 'bg-gray-200' : ''}`}>
              <FolderOpen size={14} /> Категории
            </button>
          )}
          <button onClick={openAdd} className="action-btn"><Plus size={16} /> Добавить материал</button>
        </div>
      </div>

      {/* Category manager */}
      {showCatManager && isAdmin() && (
        <div className="card-base p-4 animate-fade-in">
          <h3 className="section-title mb-3">Управление категориями</h3>
          <div className="flex gap-2 mb-3">
            <input className="form-input flex-1" placeholder="Название новой категории..." value={newCatName} onChange={e => setNewCatName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCategory()} />
            <button onClick={addCategory} className="btn-primary text-xs"><Plus size={14} /> Добавить</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeCategories.map(c => (
              <span key={c.id} className="inline-flex items-center gap-1 bg-brand-gray border border-brand-gray-mid text-sm px-3 py-1.5 rounded-full">
                {c.name}
                <button onClick={() => deleteCategory(c.id)} className="text-gray-400 hover:text-brand-red ml-1"><X size={12} /></button>
              </span>
            ))}
            {activeCategories.length === 0 && <p className="text-xs text-gray-400">Нет категорий</p>}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card-base p-3 space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="form-input pl-8 py-1.5 text-xs" placeholder="Поиск по названию, тегам, содержимому..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="form-input py-1.5 text-xs w-auto" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
            <option value="">Все категории</option>
            {activeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="form-input py-1.5 text-xs w-auto" value={filterType} onChange={e => setFilterType(e.target.value as KnowledgeItemType | '')}>
            <option value="">Все типы</option>
            <option value="note">Заметка</option>
            <option value="file">Файл</option>
            <option value="link">Ссылка</option>
          </select>
          <select className="form-input py-1.5 text-xs w-auto" value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}>
            <option value="date">По дате</option>
            <option value="title">По названию</option>
            <option value="author">По автору</option>
          </select>
          {(search || filterCategory || filterType) && (
            <button onClick={() => { setSearch(''); setFilterCategory(''); setFilterType(''); }} className="text-xs text-brand-red flex items-center gap-1"><X size={12} /> Сбросить</button>
          )}
        </div>
        {/* Category pills */}
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setFilterCategory('')} className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${filterCategory === '' ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-500'}`}>Все</button>
          {activeCategories.map(c => (
            <button key={c.id} onClick={() => setFilterCategory(filterCategory === c.id ? '' : c.id)}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${filterCategory === c.id ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-500'}`}>
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Всего материалов', value: (store.settings.knowledgeItems || []).filter(i => !i.deletedAt).length },
          { label: 'Категорий', value: activeCategories.length },
          { label: 'Показано', value: items.length },
        ].map(s => (
          <div key={s.label} className="stat-card text-center py-2">
            <p className="text-lg font-bold text-brand-black">{s.value}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
        <button onClick={() => setFilterManagers(v => !v)}
          className={`stat-card text-center py-2 transition-colors ${filterManagers ? 'bg-brand-black text-white' : 'hover:bg-gray-50'}`}
          title="Показать только материалы, доступные менеджерам">
          <p className={`text-lg font-bold ${filterManagers ? 'text-white' : 'text-brand-black'}`}>{(store.settings.knowledgeItems || []).filter(i => !i.deletedAt && i.availableToManagers).length}</p>
          <p className="text-xs text-gray-500">ДОСТУПНО МЕНЕДЖЕРАМ</p>
        </button>
      </div>

      {/* Items grid */}
      {items.length === 0 ? (
        <div className="card-base p-12 text-center">
          <BookOpen size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Материалов не найдено</p>
          <button onClick={openAdd} className="btn-primary mt-4 mx-auto"><Plus size={14} /> Добавить первый материал</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map(item => {
            const Icon = TYPE_ICONS[item.type];
            const isExpanded = expandedId === item.id;
            const currentStore = getStore();
            const freshItem = (currentStore.settings.knowledgeItems || []).find(i => i.id === item.id) || item;

            return (
              <div key={item.id} className="card-base overflow-hidden flex flex-col">
                {/* Card header */}
                <div className="p-4 flex-1">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-brand-gray flex items-center justify-center flex-shrink-0">
                        <Icon size={16} className="text-brand-red" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-brand-black leading-tight line-clamp-2">{item.title}</p>
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {(isAdmin() || item.authorId === getCurrentUser()?.id) && (
                        <button onClick={() => openEdit(item)} className="p-1 text-gray-400 hover:text-brand-black"><Edit2 size={13} /></button>
                      )}
                      {isAdmin() && (
                        <button onClick={() => handleDelete(item.id)} className="p-1 text-gray-300 hover:text-brand-red"><Trash2 size={13} /></button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${TYPE_COLORS[item.type]}`}>{TYPE_LABELS[item.type]}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded border border-brand-gray-mid bg-brand-gray text-gray-600">{item.categoryName}</span>
                  </div>

                  {item.description && <p className="text-xs text-gray-500 line-clamp-2 mb-2">{item.description}</p>}

                  {item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {item.tags.map(tag => (
                        <span key={tag} className="text-xs text-gray-400 flex items-center gap-0.5"><Tag size={9} /> {tag}</span>
                      ))}
                    </div>
                  )}

                  <p className="text-xs text-gray-400">{item.authorName} · {formatDate(item.createdAt)}</p>
                  {freshItem.comments.length > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1"><MessageSquare size={11} /> {freshItem.comments.length} комм.</p>
                  )}
                </div>

                {/* Expand button */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  className="flex items-center justify-center gap-1 py-2 text-xs text-gray-500 hover:bg-brand-gray border-t border-brand-gray-mid transition-colors"
                >
                  {isExpanded ? <><ChevronUp size={13} /> Свернуть</> : <><ChevronDown size={13} /> Открыть</>}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Expanded item detail */}
      {expandedId && currentItem && (
        <div className="card-base p-5 animate-fade-in border-2 border-brand-red/20">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                {(() => { const Icon = TYPE_ICONS[currentItem.type]; return <Icon size={18} className="text-brand-red" />; })()}
                <h2 className="text-lg font-bold text-brand-black">{currentItem.title}</h2>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${TYPE_COLORS[currentItem.type]}`}>{TYPE_LABELS[currentItem.type]}</span>
                <span className="text-xs px-1.5 py-0.5 rounded border border-brand-gray-mid bg-brand-gray text-gray-600">{currentItem.categoryName}</span>
                <span className="text-xs text-gray-400">{currentItem.authorName} · {formatDate(currentItem.createdAt)}</span>
              </div>
            </div>
            <button onClick={() => setExpandedId(null)} className="text-gray-400 hover:text-brand-red p-1"><X size={18} /></button>
          </div>

          {currentItem.description && (
            <div className="mb-4 p-3 bg-brand-gray rounded-lg">
              <p className="text-sm text-gray-600">{currentItem.description}</p>
            </div>
          )}

          {/* Content */}
          <div className="mb-4">
            {currentItem.type === 'note' && currentItem.content && (
              <div className="prose prose-sm max-w-none">
                <pre className="whitespace-pre-wrap text-sm text-brand-black bg-brand-gray p-4 rounded-lg overflow-auto">{currentItem.content}</pre>
              </div>
            )}
            {currentItem.type === 'link' && currentItem.content && (
              <a href={safeKnowledgeUrl(currentItem.content) || undefined} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-blue-600 hover:bg-blue-100 transition-colors">
                <LinkIcon size={16} />
                <span className="text-sm font-medium truncate">{currentItem.content}</span>
              </a>
            )}
            {currentItem.type === 'file' && (
              <div className="flex items-center gap-3 p-3 bg-brand-gray border border-brand-gray-mid rounded-lg">
                <FileText size={24} className="text-blue-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-brand-black truncate">{currentItem.fileName || 'Файл'}</p>
                  {currentItem.fileSize && <p className="text-xs text-gray-400">{currentItem.fileSize}</p>}
                </div>
                {currentItem.fileUrl ? (
                  <a href={currentItem.fileUrl} target="_blank" rel="noopener noreferrer" download className="btn-secondary text-xs flex items-center gap-1">
                    <Download size={13} /> Скачать
                  </a>
                ) : (
                  <button className="btn-secondary text-xs flex items-center gap-1" onClick={() => toast.info('Файл не был загружен в хранилище — сохранены только метаданные')}>
                    <Download size={13} /> Скачать
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Tags */}
          {currentItem.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {currentItem.tags.map(tag => (
                <span key={tag} className="text-xs px-2 py-0.5 bg-brand-gray border border-brand-gray-mid rounded-full text-gray-600 flex items-center gap-1"><Tag size={10} /> {tag}</span>
              ))}
            </div>
          )}

          {/* Comments */}
          <div className="border-t border-brand-gray-mid pt-4">
            <h3 className="text-sm font-semibold text-brand-black mb-3 flex items-center gap-2">
              <MessageSquare size={15} className="text-brand-red" /> Комментарии ({currentItem.comments.length})
            </h3>
            <div className="space-y-2 mb-3">
              {currentItem.comments.map(c => (
                <div key={c.id} className="flex gap-2">
                  <div className="w-7 h-7 rounded-full bg-brand-red flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{c.authorName.charAt(0)}</div>
                  <div className="flex-1 bg-brand-gray rounded-lg p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold">{c.authorName} · {formatDate(c.createdAt)}</p>
                      {(isAdmin() || c.authorId === getCurrentUser()?.id) && (
                        <button onClick={() => deleteComment(currentItem.id, c.id)} className="text-gray-300 hover:text-brand-red p-0.5"><X size={11} /></button>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">{c.text}</p>
                  </div>
                </div>
              ))}
              {currentItem.comments.length === 0 && <p className="text-xs text-gray-400 text-center py-2">Комментариев нет</p>}
            </div>
            <div className="flex gap-2">
              <input
                className="form-input flex-1 text-xs"
                placeholder="Написать комментарий..."
                value={commentText[currentItem.id] || ''}
                onChange={e => setCommentText(prev => ({ ...prev, [currentItem.id]: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addComment(currentItem.id)}
              />
              <button onClick={() => addComment(currentItem.id)} className="btn-primary text-xs px-3"><Send size={14} /></button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="card-base w-full max-w-lg my-8 animate-fade-in">
            <div className="flex items-center justify-between p-5 border-b border-brand-gray-mid">
              <h2 className="section-title">{editingId ? 'Редактировать материал' : 'Новый материал'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-brand-red"><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              {/* Type selector */}
              <div>
                <label className="form-label">Тип материала *</label>
                <div className="flex gap-2">
                  {(['note', 'link', 'file'] as KnowledgeItemType[]).map(t => {
                    const Icon = TYPE_ICONS[t];
                    return (
                      <button key={t} type="button"
                        onClick={() => setForm(f => ({ ...f, type: t }))}
                        className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border-2 text-xs font-medium transition-colors ${form.type === t ? 'border-brand-red bg-red-50 text-brand-red' : 'border-brand-gray-mid text-gray-500 hover:border-gray-300'}`}>
                        <Icon size={16} />
                        {TYPE_LABELS[t]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="form-label">Название *</label>
                <input required className="form-input" value={form.title || ''} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Название материала" />
              </div>

              <div>
                <label className="form-label">Категория *</label>
                <select required className="form-input" value={form.categoryId || ''} onChange={e => handleCategoryChange(e.target.value)}>
                  <option value="">Выберите категорию...</option>
                  {activeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!form.availableToManagers} onChange={e => setForm(f => ({ ...f, availableToManagers: e.target.checked }))} className="rounded" />
                <span className="text-sm">Доступен пользователям — МЕНЕДЖЕР</span>
              </label>

              <div>
                <label className="form-label">Краткое описание</label>
                <textarea className="form-input resize-none" rows={2} value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Опишите содержимое..." />
              </div>

              {form.type === 'note' && (
                <div>
                  <label className="form-label">Текст / содержимое</label>
                  <textarea className="form-input resize-y min-h-[120px]" value={form.content || ''} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} placeholder="Введите текст заметки..." />
                </div>
              )}

              {form.type === 'link' && (
                <div>
                  <label className="form-label">URL *</label>
                  <input className="form-input" type="url" value={form.content || ''} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} placeholder="https://..." />
                </div>
              )}

              {form.type === 'file' && (
                <div className="space-y-2">
                  {!editingId ? (<div>
                      <label className="form-label">Файл *</label>
                      <input ref={fileInputRef} type="file" className="hidden" id="knowledge-file-input" onChange={handleFileSelect} disabled={uploading} />
                      <label
                        htmlFor="knowledge-file-input"
                        className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-lg py-4 cursor-pointer transition-colors ${uploading ? 'border-gray-200 text-gray-300' : 'border-brand-gray-mid text-gray-500 hover:border-brand-red hover:text-brand-red'}`}
                      >
                        {uploading ? (
                          <><Loader2 size={16} className="animate-spin" /> Загрузка...</>
                        ) : (
                          <><Upload size={16} /> Выбрать файл</>
                        )}
                      </label>
                      {form.fileName && (
                        <div className="flex items-center gap-2 mt-2 p-2 bg-brand-gray rounded-lg">
                          <FileText size={14} className="text-blue-500 flex-shrink-0" />
                          <span className="text-xs text-brand-black truncate flex-1">{form.fileName}</span>
                          {form.fileSize && <span className="text-xs text-gray-400 flex-shrink-0">{form.fileSize}</span>}
                          {form.fileUrl && <span className="text-xs text-green-600 flex-shrink-0">✓ загружен</span>}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="form-label">Название файла</label>
                        <input className="form-input" value={form.fileName || ''} onChange={e => setForm(f => ({ ...f, fileName: e.target.value }))} placeholder="document.pdf" />
                      </div>
                      <div>
                        <label className="form-label">Размер</label>
                        <input className="form-input" value={form.fileSize || ''} onChange={e => setForm(f => ({ ...f, fileSize: e.target.value }))} placeholder="2.4 МБ" />
                      </div>
                      <p className="text-xs text-orange-500 bg-orange-50 p-2 rounded">
                        Файл хранится на нашем сервере.
                      </p>
                    </>
                  )}
                </div>
              )}

              <div>
                <label className="form-label">Теги (через запятую)</label>
                <input className="form-input" value={form.tagsRaw || ''} onChange={e => setForm(f => ({ ...f, tagsRaw: e.target.value }))} placeholder="онбординг, инструкция, CRM" />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-brand-gray-mid">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Отмена</button>
                <button type="submit" className="btn-primary"><Save size={14} /> {editingId ? 'Сохранить' : 'Добавить'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
