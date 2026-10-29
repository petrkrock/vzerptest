import { APP_VERSION } from '@/constants';
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { API_URL } from '@/lib/api';
import { uploadLkFile } from '@/lib/lk-upload'; // v1.30.76: загрузка картинок (импорт отсутствовал)
import { toast } from 'sonner'; // v1.30.76: toast был не определён — модалки не закрывались
import { AlertCircle, Boxes, Check, ChevronDown, Copy, Headset, Info, LayoutDashboard, LogOut, Megaphone, Pencil, Plus, Search, Trash2, Truck, Warehouse, X } from 'lucide-react';

interface Wh { id: string; city: string; skuCount: number; verified?: boolean; address?: string; status?: 'Новый' | 'Проверен' | 'Заморожен'; } // ТЗ v1.25.0: +адрес, +статус
interface Cond { city: string; warehouseName: string; representative: string; contacts: string;
  email: string; deliverySchedule: string; orderUnloadSchedule: string; returnConditions: string; officialWarehouse: string;
  status?: string; } // статус условия (Новое/Загружено/Есть изменения) — из CRM

const COND_FIELDS: Array<{ key: keyof Cond; label: string }> = [
  { key: 'representative', label: 'Представитель' },
  { key: 'contacts', label: 'Контакты' },
  { key: 'email', label: 'Email' },
  { key: 'deliverySchedule', label: 'График доставки' },
  { key: 'orderUnloadSchedule', label: 'Условия доставки' }, // ТЗ v1.23.6: переименовано
  { key: 'returnConditions', label: 'Условия возврата товара' },
  { key: 'officialWarehouse', label: 'Официальный склад' },
  { key: 'deliveryTime', label: 'Срок поставки до выбранного города' }, // v_1.9
];

const EMPTY_COND: Cond = { city: '', warehouseName: '', representative: '', contacts: '',
  email: '', deliverySchedule: '', orderUnloadSchedule: '', returnConditions: '', officialWarehouse: '', deliveryTime: '' }; // v_1.9

/**
 * Самообслуживание поставщика по ссылке /s/<token> (вне CRM-оболочки).
 * Сценарий: сначала склады → потом условия сервиса поиска (склад — из
 * выпадающего списка добавленных складов). Защита: токен + опциональный PIN.
 */
const LK_MENU = [
  { key: 'dashboard', label: '', icon: LayoutDashboard },
  { key: 'pricing', label: 'Проценка', icon: Search },
  { key: 'crossdock', label: 'Маркет', icon: Boxes },
  { key: 'promo', label: 'Продвижение', icon: Megaphone },
] as const;

export default function SupplierServicePage() {
  const { token = '' } = useParams<{ token: string }>();

  const [data, setData] = useState<{ companyName: string; inn?: string; hasPin: boolean; warehouses: Wh[]; serviceSearch: Cond[]; availableCities: string[]; multiWarehouse: boolean; status?: string } | null>(null); // v1.30.46: status — активация на платформе
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState('');
  const [pinPassed, setPinPassed] = useState(() => sessionStorage.getItem('dbs_pin_ok') === '1'); // ТЗ v1.23.19: переживает F5
  const [pin, setPin] = useState(() => sessionStorage.getItem('dbs_pin') || ''); // ТЗ v1.23.39: переживает F5
  const [pinError, setPinError] = useState('');
  const [whCity, setWhCity] = useState('');
  const [whAddress, setWhAddress] = useState(''); // ТЗ v1.25.0: адрес склада
  const [whSku, setWhSku] = useState('');
  const [condForm, setCondForm] = useState<Cond>(EMPTY_COND);
  const [tkCarrier, setTkCarrier] = useState(''); // ТЗ v1.23.2: перевозчик для «Срок поставки»
  const [selectedWh, setSelectedWh] = useState(''); // ТЗ v1.23.6: склад, выбранный кнопкой в «Мои склады»
  const [editorOpen, setEditorOpen] = useState(false); // окно условий открывается после выбора города
  const [tkOn, setTkOn] = useState(false); // ТЗ v1.23.6: кнопка ТК
  const [priceHint, setPriceHint] = useState(false);
  const [whModal, setWhModal] = useState(false); // v1.30.0: добавление склада через модалку
  const [whErr, setWhErr] = useState<Record<string, boolean>>({}); // незаполненные поля склада
  const [whMsHint, setWhMsHint] = useState(false); // подсказка мультисклада
  const [faqHint, setFaqHint] = useState(false); // подсказка «Вопрос» в проценке
  const [whSkuHint, setWhSkuHint] = useState(false); // подсказка «Склад» в разделе Склад
  // v1.29.0: единый кабинет
  const [lkTab, setLkTab] = useState<'dashboard' | 'pricing' | 'crossdock' | 'promo' | 'cabinet' | 'wh'>('dashboard');
  const [lkOp, setLkOp] = useState<Record<string, unknown> | null>(null); // v1.30.43: оператор ЛК
  // v1.30.56: окно согласия с офертой (показывается при входе, пока редакция не принята; заново при новой редакции)
  const [offerGate, setOfferGate] = useState<Record<string, unknown> | null>(null);
  const [offerTextOpen, setOfferTextOpen] = useState(false);
  const [lkOffer, setLkOffer] = useState<Record<string, unknown> | null>(null); // v1.30.58: включённая оферта (для чтения из кабинета)
  const [offerView, setOfferView] = useState(false); // v1.30.58: режим чтения из кабинета (без ДА/НЕТ)
  // v1.30.68: Продвижение (ЛК) — договор поставщика, форматы, заявка
  const [lkLinksMap, setLkLinksMap] = useState<Record<string, string>>({}); // v1.30.76: ссылки офер («Подробнее про форматы»)
  const [placements, setPlacements] = useState<Array<Record<string, unknown>>>([]); // v1.30.77: рекламные размещения
  const [adServices, setAdServices] = useState<Array<Record<string, string>>>([]); // v1.30.100: сервисы продаж (code/label)
  const [cabTitle, setCabTitle] = useState(''); // v1.30.103: титул для кабинета

  // v1.30.104: титул кабинета — в названии вкладки браузера
  useEffect(() => {
    if (cabTitle) document.title = cabTitle;
  }, [cabTitle]);
  const [myNews, setMyNews] = useState<Array<Record<string, unknown>>>([]); // v1.30.80: мои новости
  const [showMyNews, setShowMyNews] = useState(false); // v1.30.80: тумблер «Мои»
  // v1.30.81: материал к размещению + подсказка статуса
  const [materialModalId, setMaterialModalId] = useState<string | null>(null);
  const [matDesc, setMatDesc] = useState('');
  const [matImage, setMatImage] = useState('');
  const [matBusy, setMatBusy] = useState(false);
  const [showStatusInfo, setShowStatusInfo] = useState(false); // v1.30.84: справка по статусам в шапке блока
  const [newsEditId, setNewsEditId] = useState<string | null>(null); // v1.30.86: просмотр/редактирование новости из ЛК

  // v1.30.81: расшифровки статусов размещений (иконка-? в строке)
  // v1.30.86: короткие формулировки + карта цветов статусов
  const STATUS_HINTS: Record<string, string> = {
    'Заявка создана': 'Ожидает обработки менеджером',
    'Счёт отправлен': 'Счёт выставлен, ожидается оплата',
    'Опубликовано': 'Размещение активно на платформе',
    'Запланировано': 'Размещение стартует в указанную дату',
    'Отменено': 'Заявка аннулирована, размещение не состоится',
    'Завершается': 'Срок подходит, продлите или место освободится',
    'Выполнено': 'Заказ полностью оказан, размещение закрыто',
  };
  const STATUS_STYLE: Record<string, string> = {
    'Заявка создана': 'bg-amber-100 text-amber-700',
    'Счёт отправлен': 'bg-orange-100 text-orange-700',
    'Опубликовано': 'bg-green-100 text-green-700',
    'Запланировано': 'bg-blue-100 text-blue-700',
    'Отменено': 'bg-gray-100 text-gray-500',
    'Завершается': 'bg-red-100 text-red-600',
    'Выполнено': 'bg-emerald-100 text-emerald-700',
  };
  const [promoContract, setPromoContract] = useState<Record<string, unknown> | null>(null);
  const [adFormats, setAdFormats] = useState<Array<Record<string, unknown>>>([]);
  const [promoFormat, setPromoFormat] = useState<Record<string, unknown> | null>(null); // формат в модалке
  const [promoTariffId, setPromoTariffId] = useState('');
  const [promoBusy, setPromoBusy] = useState(false);
  // v1.30.69: добавление новости рынка из ЛК
  const [newsModalOpen, setNewsModalOpen] = useState(false);
  const [nnTitle, setNnTitle] = useState('');
  const [nnLink, setNnLink] = useState('');
  const [nnText, setNnText] = useState('');
  const [nnImage, setNnImage] = useState('');
  const [nnBusy, setNnBusy] = useState(false);
  // v1.30.70: активация договора из ЛК
  const [activateModalOpen, setActivateModalOpen] = useState(false);
  const [activateBusy, setActivateBusy] = useState(false);
  const [cabinet, setCabinet] = useState<Record<string, unknown> | null>(null); // v1.30.1: данные страницы «Кабинет»
  const [cabEdit, setCabEdit] = useState(false);
  const [dash, setDash] = useState<Record<string, unknown> | null>(null); // v1.30.0: данные дашборда (баннер/новости/счётчики)
  const [newsModal, setNewsModal] = useState<Record<string, string> | null>(null); // полный текст новости
  const [cityHint, setCityHint] = useState(false); // ТЗ v1.23.9: совет по городам
  const [cityFilter, setCityFilter] = useState<'all' | 'covered' | 'empty'>('all'); // пилюли-фильтр городов
  const [statusFilter, setStatusFilter] = useState<'all' | 'Новое' | 'Загружено' | 'Есть изменения'>('all'); // ТЗ v1.23.10: фильтр условий по статусу
  const [statusHint, setStatusHint] = useState(false);
  // v1.30.52: подсказка «Не активирован» — fixed-оверлей поверх всего, якорь под кнопкой (как совет по городам)
  const [actHint, setActHint] = useState<{ top: number; left: number } | null>(null);
  const [pendingCity, setPendingCity] = useState<string | null>(null); // ТЗ v1.23.11: город, ждущий кнопку «Создать условия»
  const [editingWhId, setEditingWhId] = useState<string | null>(null); // ТЗ v1.23.32: редактирование склада (карандаш)
  const [whHint, setWhHint] = useState(false);
  const lastDataJson = useRef(''); // ТЗ v1.23.41: не перерисовываемся, если данные не изменились
  const [missing, setMissing] = useState<string[]>([]); // ТЗ v1.23.23: незаполненные обязательные поля (подсветка)
  const fldM = (k: string) => fld + (missing.includes(k) ? ' !border-red-400 !ring-2 !ring-red-200' : '');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  // ТЗ v1.23.55: тост гаснет сам через 4с
    // данные кабинета при входе/старте
  useEffect(() => { if (pinPassed) loadLkInfo(); }, [pinPassed]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice]);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!true || !/^[a-f0-9]{32}$/.test(token)) { setLoading(false); setFatal('Недействительная ссылка'); return; }
    fetch(`${API_URL}/lk?token=${token}`, { headers: {'Content-Type': 'application/json'} })
      .then(r => r.json())
      .then(d => { if (d.error) setFatal(d.error); else { setData(prev => prev ? {
        ...prev,
        // ТЗ v1.23.52: мерджим ТОЛЬКО скаляры — GET-метаданные содержат пустые массивы,
        // которые затирали загруженные условия/склады после F5.
        companyName: d.companyName ?? prev.companyName,
        hasPin: d.hasPin ?? prev.hasPin,
        inn: d.inn ?? prev.inn,
        contactName: d.contactName ?? prev.contactName,
        contactPhone: d.contactPhone ?? prev.contactPhone,
        contactEmail: d.contactEmail ?? prev.contactEmail,
        multiWarehouse: d.multiWarehouse ?? prev.multiWarehouse,
        status: d.status ?? prev.status,
      } : d); if (sessionStorage.getItem('dbs_pin_ok') !== '1') setPinPassed(false); } }) // ТЗ v1.23.41: МЕРДЖ — иначе GET затирал условия после F5
      .catch(() => setFatal('Не удалось загрузить данные'))
      .finally(() => setLoading(false));
  }, [token]);

  // ТЗ v1.23.54: полные данные грузим ОДИН РАЗ после прохождения PIN-гейта —
  // независимо от пути (ввод PIN или сессия после F5). Раньше эффект срабатывал
  // только при hasPin === false, поэтому после F5 данные ждали поллинга 45с
  // и условия «исчезали» до следующего цикла.
  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (initialLoadDone.current) return;
    // ТЗ v1.23.55: при живой сессии грузим данные НЕМЕДЛЕННО, не дожидаясь GET-метаданных —
    // убирает видимую задержку «условия появляются не сразу».
    if (pinPassed) { initialLoadDone.current = true; post({}).then(err => { if (err) { if (/пин|pin|недейств|токен|token/i.test(String(err))) { initialLoadDone.current = false; setNotice(err); sessionStorage.removeItem('dbs_pin_ok'); sessionStorage.removeItem('dbs_pin'); setPinPassed(false); } else { setTimeout(() => post({}).catch(() => {}), 2000); } } }); return; } // v1.30.95: сетевые сбои не выкидывают из ЛК
    if (!data) return;                    // hasPin ещё неизвестен — ждём GET
    if (data.hasPin) return;              // ждём ввод PIN
    initialLoadDone.current = true;
    post({}).then(err => {
      if (err) { initialLoadDone.current = false; setNotice(err); return; }
      sessionStorage.setItem('dbs_pin_ok', '1');
      if (pin) sessionStorage.setItem('dbs_pin', pin);
      setPinPassed(true);
      loadLkInfo(); // v1.30.87: данные ЛК (менеджер, новости, форматы) — сразу, без ожидания эффекта
    });
  }, [data, pinPassed]);

  // ТЗ v1.23.35: автообновление данных из CRM каждые 20 сек — изменения менеджера видны без ручного F5
  useEffect(() => {
    if (!pinPassed) return;
    const t = setInterval(() => { post({}, true).catch(() => {}); }, 45000);
    return () => clearInterval(t);
  }, [pinPassed]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const report = () => window.parent?.postMessage({ source: 'vz-crm-form', height: el.offsetHeight }, '*');
    const ro = new ResizeObserver(report);
    ro.observe(el); report();
    return () => ro.disconnect();
  }, [data, pinPassed, loading]);

  async function loadLkInfo() {
    try {
      const pinCode = sessionStorage.getItem('dbs_pin') || '';
      const r = await fetch(`${API_URL}/lk`, {
        method: 'POST',
        headers: { ...{'Content-Type': 'application/json'}, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pin: pinCode }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d?.offer !== undefined) {
        const oc = d.offer as Record<string, unknown> | null;
        setLkOffer(oc);
        setOfferGate(oc && String(oc.edition || '') !== String(d.offerAcceptedEdition || '') ? oc : null);
      }
      if (r.ok && d?.mediaContract !== undefined) setPromoContract(d.mediaContract);
      if (r.ok && Array.isArray(d?.adFormats)) setAdFormats(d.adFormats);
      if (r.ok && Array.isArray(d?.myNews)) setMyNews(d.myNews);
      // v1.31.11: титул домена в приоритете, иначе общий cabinetTitle
      if (r.ok && d?.lkDomain?.title) setCabTitle(String(d.lkDomain.title));
      else if (r.ok && d?.cabinetTitle !== undefined) setCabTitle(String(d.cabinetTitle));
      if (r.ok && Array.isArray(d?.services)) setAdServices(d.services);
      if (r.ok && Array.isArray(d?.placements)) setPlacements(d.placements);
      if (r.ok && d?.dashboard?.lkLinks) setLkLinksMap(d.dashboard.lkLinks as Record<string, string>);
      if (r.ok && d?.lkOperator !== undefined) setLkOp(d.lkOperator);
      if (r.ok && d?.dashboard) { setDash(d.dashboard); setData((prev: Record<string, unknown> | null) => prev && prev.phone !== d.phone ? { ...prev, phone: d.phone } : prev); } // v1.30.94: стабильная ссылка — без петли эффектов
      if (r.ok && d?.cabinet) setCabinet(d.cabinet);
    } catch { /* останется null — покажем «—» */ }
  }

  // v1.30.56: принятие оферты — фиксируем редакцию на сервере
  async function acceptOffer() {
    try {
      const pinCode = sessionStorage.getItem('dbs_pin') || '';
      await fetch(`${API_URL}/lk`, {
        method: 'POST',
        headers: { ...{'Content-Type': 'application/json'}, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pin: pinCode, acceptOfferEdition: offerGate?.edition || '' }),
      });
      setOfferGate(null); setOfferTextOpen(false);
    } catch { /* остаёмся на окне — повторный клик */ }
  }
  // НЕТ — функция кнопки «Выход»: на экран ввода PIN (data не трогаем — PIN-экрану нужны метаданные)
  function declineOffer() {
    sessionStorage.removeItem('dbs_pin_ok');
    sessionStorage.removeItem('dbs_pin');
    setPinPassed(false); setOfferGate(null); setOfferTextOpen(false);
  }

  // v1.30.68: отправка заявки на продвижение из ЛК
  async function sendPromoRequest() {
    if (!promoFormat || !promoTariffId) return;
    setPromoBusy(true);
    try {
      const pinCode = sessionStorage.getItem('dbs_pin') || '';
      const r = await fetch(`${API_URL}/lk`, {
        method: 'POST',
        headers: { ...{'Content-Type': 'application/json'}, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pin: pinCode, mediaRequest: { adTypeId: promoFormat.id, durationOptionId: promoTariffId } }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        toast.success('Заявка отправлена');
        setPromoFormat(null); setPromoTariffId('');
        loadLkInfo(); // v1.30.87: размещение сразу в списке
      } else {
        toast.error(String(d?.error || 'Не удалось отправить заявку'));
      }
    } catch {
      toast.error('Не удалось отправить заявку');
    } finally { setPromoBusy(false); }
  }

  // v1.30.69: загрузка картинки новости (тот же бакет lk-assets)
  async function uploadNewsImageLk(file: File) {
    setNnBusy(true);
    try {
      const imageName = `market-news-${Date.now()}-${file.name.replace(/[^\w.]/g, '_')}`;
      const url = await uploadLkFile(file, imageName);
      setNnImage(url);
    } catch { toast.error('Ошибка загрузки файла'); }
    finally { setNnBusy(false); }
  }
  // Отправка новости в раздел «Новости рынка»
  async function sendMarketNews() {
    if (!nnTitle.trim()) { toast.error('Введите заголовок новости'); return; }
    setNnBusy(true);
    try {
      const pinCode = sessionStorage.getItem('dbs_pin') || '';
      const r = await fetch(`${API_URL}/lk`, {
        method: 'POST',
        headers: { ...{'Content-Type': 'application/json'}, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pin: pinCode, marketNewsRequest: { title: nnTitle.trim(), link: nnLink.trim(), text: nnText, imageUrl: nnImage } }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        toast.success('Новость отправлена');
        setNewsModalOpen(false); setNnTitle(''); setNnLink(''); setNnText(''); setNnImage('');
        loadLkInfo(); // v1.30.87: новость сразу в «Мои новости»
      } else {
        toast.error(String(d?.error || 'Не удалось отправить новость'));
      }
    } catch {
      toast.error('Не удалось отправить новость');
    } finally { setNnBusy(false); }
  }

  // v1.30.81: загрузка картинки материала
  async function uploadMaterialImage(file: File) {
    setMatBusy(true);
    try {
      const imageName = `media-materials-${Date.now()}-${file.name.replace(/[^\w.]/g, '_')}`;
      const url = await uploadLkFile(file, imageName);
      setMatImage(url);
    } catch { toast.error('Ошибка загрузки файла'); }
    finally { setMatBusy(false); }
  }
  async function sendMaterial() {
    if (!materialModalId) return;
    setMatBusy(true);
    try {
      const pinCode = sessionStorage.getItem('dbs_pin') || '';
      const r = await fetch(`${API_URL}/lk`, {
        method: 'POST',
        headers: { ...{'Content-Type': 'application/json'}, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pin: pinCode, materialRequest: { recordId: materialModalId, description: matDesc, imageUrl: matImage } }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        toast.success('Материал отправлен');
        setMaterialModalId(null); setMatDesc(''); setMatImage('');
        loadLkInfo(); // v1.30.87: статус материала обновится на кнопке
      } else {
        toast.error(String(d?.error || 'Не удалось сохранить материал'));
      }
    } catch {
      toast.error('Не удалось сохранить материал');
    } finally { setMatBusy(false); }
  }

  // v1.30.86: сохранение отредактированной новости
  async function sendNewsUpdate() {
    if (!newsEditId) return;
    if (!nnTitle.trim()) { toast.error('Введите заголовок новости'); return; }
    setNnBusy(true);
    try {
      const pinCode = sessionStorage.getItem('dbs_pin') || '';
      const r = await fetch(`${API_URL}/lk`, {
        method: 'POST',
        headers: { ...{'Content-Type': 'application/json'}, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pin: pinCode, newsUpdate: { id: newsEditId, title: nnTitle.trim(), link: nnLink.trim(), text: nnText, imageUrl: nnImage } }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        toast.success('Новость обновлена');
        setNewsEditId(null);
        loadLkInfo();
      } else {
        toast.error(String(d?.error || 'Не удалось сохранить новость'));
      }
    } catch {
      toast.error('Не удалось сохранить новость');
    } finally { setNnBusy(false); }
  }

  // v1.30.70: активация договора (без № и даты — статус «Активный»)
  async function activateMediaContract() {
    setActivateBusy(true);
    try {
      const pinCode = sessionStorage.getItem('dbs_pin') || '';
      const r = await fetch(`${API_URL}/lk`, {
        method: 'POST',
        headers: { ...{'Content-Type': 'application/json'}, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pin: pinCode, activateMediaContract: true }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        toast.success('Договор активирован');
        setActivateModalOpen(false);
        loadLkInfo();
      } else {
        toast.error(String(d?.error || 'Не удалось активировать договор'));
      }
    } catch {
      toast.error('Не удалось активировать договор');
    } finally { setActivateBusy(false); }
  }

  async function post(payload: Record<string, unknown>, silent = false): Promise<string | null> {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/lk`, {
        method: 'POST',
        headers: { ...{'Content-Type': 'application/json'}, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pin, ...payload }),
      });
      const d = await res.json();
      if (!res.ok || d.error) return d.error || 'Ошибка сохранения';
      // ТЗ v1.23.41: дедупликация — одинаковые данные не вызывают перерисовку (ЛК тормозил)
      const key = JSON.stringify([d.warehouses, d.serviceSearch, d.contactName, d.contactPhone, d.contactEmail, d.multiWarehouse, d.availableCities]);
      if (key !== lastDataJson.current) {
        lastDataJson.current = key;
        // ТЗ v1.23.53: null-safe merge — при F5 POST может ответить РАНЬШЕ GET-метаданных,
        // и data ещё null: data! кидал исключение, загрузка молча падала, условия пропадали.
        setData(prev => ({
          companyName: prev?.companyName ?? d.companyName ?? '',
          hasPin: prev?.hasPin ?? d.hasPin ?? false,
          warehouses: d.warehouses, serviceSearch: d.serviceSearch,
          availableCities: d.availableCities ?? prev?.availableCities ?? [],
          multiWarehouse: d.multiWarehouse ?? prev?.multiWarehouse ?? false,
          inn: d.inn ?? prev?.inn,
          contactName: d.contactName ?? prev?.contactName,
          contactPhone: d.contactPhone ?? prev?.contactPhone,
          contactEmail: d.contactEmail ?? prev?.contactEmail,
        }));
      }
      if (!silent) setNotice('✓ Сохранено');
      setTimeout(() => setNotice(''), 2500);
      return null;
    } catch { return 'Ошибка сохранения. Проверьте интернет.'; }
    finally { setSaving(false); }
  }

  async function submitPin() {
    setPinError('');
    const err = await post({}); // пустой PATCH — сервер проверит PIN (403 при неверном)
    if (err) { setPinError(err); setPin(''); }
    else {
      sessionStorage.setItem('dbs_pin_ok','1');
      sessionStorage.setItem('dbs_pin', pin);
      setPinPassed(true);
      loadLkInfo(); // v1.30.87: сразу после входа
    }
  }

  async function addWarehouse() {
    if (!whCity.trim()) { setNotice('Укажите город склада'); return; }
    if (!whAddress.trim()) { setNotice('Укажите адрес склада'); return; } // ТЗ v1.25.0: адрес обязателен
    if (!whSku.trim()) { setNotice('Укажите примерное кол-во SKU'); return; } // ТЗ v1.23.19: обе ячейки обязательны
    // ТЗ v1.25.7: лимит мультисклада решает СЕРВЕР (функция читает флаг из базы = зеркало CRM)
    // ТЗ v1.23.32: карандаш — обновление существующего склада, иначе добавление
    const err = editingWhId
      ? await post({ warehouses: (data?.warehouses || []).map(w => w.id === editingWhId ? { ...w, city: whCity.trim(), skuCount: Number(whSku) || 0, address: whAddress.trim() } : w) })
      : await post({ warehouses: [...(data?.warehouses || []), { id: crypto.randomUUID(), city: whCity.trim(), skuCount: Number(whSku) || 0, address: whAddress.trim() }] }); // ТЗ v1.23.19: id обязателен
    if (!err) { setWhCity(''); setWhSku(''); setWhAddress(''); setEditingWhId(null); }
    else setNotice(err);
  }

  async function removeWarehouse(id: string) {
    const err = await post({ warehouses: (data?.warehouses || []).filter(w => w.id !== id) });
    if (err) setNotice(err);
  }

  async function saveCondition(): Promise<boolean> { // ТЗ v1.23.24: true = сохранено (кнопка закрывает форму только тогда)
    if (!condForm.city.trim()) { setNotice('Город показов обязателен'); return false; }
    // ТЗ v1.23.19: обязательные поля условия
    // ТЗ v1.23.23: форма НЕ закрывается и данные не стираются — пустые поля подсвечиваются
    const NAMES: Record<string, string> = { deliveryTime: 'Срок поставки', deliverySchedule: 'График доставки', orderUnloadSchedule: 'Условия доставки', returnConditions: 'Условия возврата товара', representative: 'Представитель', contacts: 'Контакты', email: 'Email' };
    const missingKeys: string[] = [];
    if (!condForm.deliveryTime?.trim()) missingKeys.push('deliveryTime');
    if (!condForm.deliverySchedule?.trim()) missingKeys.push('deliverySchedule');
    if (!condForm.orderUnloadSchedule?.trim()) missingKeys.push('orderUnloadSchedule');
    if (!condForm.returnConditions?.trim()) missingKeys.push('returnConditions');
    if (!condForm.representative?.trim()) missingKeys.push('representative');
    if (!condForm.contacts?.trim()) missingKeys.push('contacts');
    if (!condForm.email?.trim()) missingKeys.push('email');
    if (missingKeys.length) { setNotice('Заполните обязательные поля: ' + missingKeys.map(k => NAMES[k]).join(', ')); setMissing(missingKeys); return false; }
    // ТЗ v1.25.7: дубль-проверка по паре склад+город
    if (editingIdx === null && (data?.serviceSearch || []).some(x => (x.city || '').toLowerCase() === condForm.city.trim().toLowerCase() && (x.warehouseName || '') === condForm.warehouseName)) {
      setNotice('Условие для этого склада и города уже есть — откройте его в таблице'); return false;
    }
    // ТЗ v1.23.19: id обязателен у каждого условия — иначе в карточке CRM правка одного меняла все
    const cond = { ...condForm, id: condForm.id || crypto.randomUUID() };
    const list = [...(data?.serviceSearch || [])].map(c => c.id ? c : { ...c, id: crypto.randomUUID() });
    if (editingIdx !== null) list[editingIdx] = cond; else list.push(cond);
    const err = await post({ serviceSearch: list });
    if (err) { setNotice(err); return false; }
    setCondForm(EMPTY_COND); setEditingIdx(null); setMissing([]);
    setEditorOpen(false); // ТЗ v1.25.13: после успешного сохранения модалка закрывается сама
    return true;
  }

  async function applyToAllCities() {
    const cities = data?.availableCities || [];
    if (!cities.length) { setNotice('Список доступных городов не настроен — уточните у менеджера'); return; }
    if ((data?.warehouses || []).length === 0) { setNotice('Сначала добавьте хотя бы один склад'); return; }
    // ТЗ v1.25.7: «во все города» = города без условия ДЛЯ ТЕКУЩЕГО склада
    const existing = new Set((data?.serviceSearch || []).filter(c => (c.warehouseName || '') === condForm.warehouseName).map(c => (c.city || '').toLowerCase()));
    const template = { ...condForm, city: '' };
    const additions = cities.filter(c => !existing.has(c.toLowerCase())).map(c => ({ ...template, id: crypto.randomUUID(), city: c })); // ТЗ v1.23.19
    if (!additions.length) { setNotice('Для этого склада все доступные города уже добавлены'); return; }
    const normalized = [...(data?.serviceSearch || [])].map(c => c.id ? c : { ...c, id: crypto.randomUUID() });
    const err = await post({ serviceSearch: [...normalized, ...additions] });
    if (!err) setCondForm(EMPTY_COND); else setNotice(err);
  }

  async function removeCondition(idx: number) {
    const err = await post({ serviceSearch: (data?.serviceSearch || []).filter((_, i) => i !== idx) });
    if (err) setNotice(err);
  }

  // ТЗ v1.23.28: «удаление» = статус «Удаление» (мягкое удаление)
  async function markDeleted(idx: number) {
    const c = (data?.serviceSearch || [])[idx];
    if (!c) return;
    if (!window.confirm(`Вы точно хотите удалить проценку склада ${c.warehouseName || '—'} из города ${c.city}? Данные удаляются навсегда, без возможности восстановить.`)) return;
    const list = [...(data?.serviceSearch || [])];
    list[idx] = { ...c, status: 'Удаление' };
    const err = await post({ serviceSearch: list });
    if (err) { setNotice(err); return; }
    setData(d => d ? { ...d, serviceSearch: list } : d);
  }

  const fld = 'w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 transition-all focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-400';

  // ТЗ v1.23.0: экран ввода PIN — по центру, как страница входа в приложение
  const pinScreen = !loading && !fatal && data && !pinPassed;

  return (
    <div className={`min-h-screen bg-[#f5f5f5] flex ${pinScreen ? 'items-center' : 'items-start'} justify-center p-3 sm:p-6 md:p-10`}>
      <div ref={wrapperRef} className={`w-full ${pinPassed ? 'max-w-[1160px]' : 'max-w-xl'} py-2`}>
        {loading && (
          <div className="bg-white border border-gray-200 rounded-2xl flex flex-col items-center justify-center gap-4 py-16 px-6">
            <div className="w-11 h-11 rounded-full border-4 border-red-100 border-t-red-600 animate-spin" aria-hidden="true" />
            <p className="text-sm text-gray-500 text-center">Кабинет поставщика загружается, пожалуйста подождите.</p>
          </div>
        )}

        {!loading && fatal && (
          <div className="bg-white border border-gray-200 rounded-2xl flex flex-col items-center text-center py-12 gap-3">
            <AlertCircle className="text-gray-300" size={34} />
            <p className="text-sm text-gray-400">{fatal}</p>
          </div>
        )}

        {pinScreen && (
          <div className="flex flex-col items-center" style={{ marginBottom: '4.5rem' }}>
            <img src="/logo.png" alt="ВСЕМЗАПЧАСТИ" className="w-[333px] h-auto mb-3" />
            <p className="text-sm font-normal text-gray-900 tracking-wide text-center">КАБИНЕТ ПОСТАВЩИКА</p>
            <p className="text-[10px] text-gray-300 text-center mt-1">v{APP_VERSION}</p>
          </div>
        )}

        {!loading && !fatal && data && !pinPassed && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8">
            <p className="text-sm text-gray-500 mt-1.5 text-center">{data.companyName}{data.inn ? ` (ИНН ${data.inn})` : ''}</p>
            <hr className="border-gray-100 my-5" />
            <div className="text-center">
              <p className="text-sm text-gray-700 mb-4">Введите PIN-код из сообщения от менеджера</p>
              <input inputMode="numeric" maxLength={6} value={pin} autoFocus
                onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && submitPin()}
                className="w-40 text-center text-xl tracking-[0.4em] border border-gray-200 rounded-xl py-2.5 outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-400" />
              {pinError && <p className="text-xs text-red-600 mt-3">{pinError}</p>}
              <button onClick={submitPin} disabled={saving}
                className="w-full mt-4 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm rounded-xl py-3 transition-colors disabled:opacity-60">
                Продолжить
              </button>
              <p className="text-xs text-gray-400 mt-4">Ссылка индивидуальная. PIN потерян — обратитесь к менеджеру.</p>
            </div>
          </div>
        )}

        {!loading && !fatal && data && pinPassed && (
          <div className="space-y-4 w-full max-w-[1160px]" style={{ maxWidth: 1160 }}>

            {/* ШАПКА ЛК: логотип + Продвижение/Выход */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm px-4 sm:px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
              <button type="button" onClick={() => setLkTab('dashboard')} title="На дашборд" className="shrink-0">
                <img src="/logo.png" alt="ВСЕМЗАПЧАСТИ" className="w-[130px] sm:w-[180px] h-auto" />
              </button>
              <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
                <nav className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
                  {LK_MENU.map(m => (
                    <button key={m.key} type="button" onClick={() => setLkTab(m.key)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${lkTab === m.key ? 'bg-red-600 text-white shadow-md' : 'text-gray-700 hover:bg-gray-200'}`}>
                      <m.icon size={15} />{m.label ? ' ' + m.label : ''}
                    </button>
                  ))}
                </nav>
                <button onClick={() => { sessionStorage.removeItem('dbs_pin_ok'); sessionStorage.removeItem('dbs_pin'); setPinPassed(false); setPin(''); }} title="Выход"
                  className="w-9 h-9 rounded-full bg-white border border-gray-300 text-gray-500 hover:text-red-600 hover:border-red-300  flex items-center justify-center transition-colors shrink-0">
                  <LogOut size={16} />
                </button>
              </div>
            </div>

            {/* МЕНЮ КАБИНЕТА */}
            {/* МОДАЛКА ДОБАВЛЕНИЯ СКЛАДА (v1.30.0) */}
            {whModal && (
              <div className="fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-3 sm:p-6" onClick={() => setWhModal(false)}>
                <div className="w-full max-w-lg rounded-2xl shadow-2xl ring-1 ring-white/40 border border-white/30" onClick={e => e.stopPropagation()}>
                  <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 sm:p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-bold text-gray-900">{editingWhId ? 'Редактировать склад' : 'Добавить склад'}</h2>
                      <button type="button" onClick={() => setWhModal(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-semibold text-gray-600">Город (название) склада</label>
                        <input className={`form-input text-xs mt-1 ${whErr.city ? '!border-red-400 !bg-red-50/40' : ''}`} placeholder="Город склада" value={whCity} onChange={e => { setWhCity(e.target.value); setWhErr(e2 => ({ ...e2, city: false })); }} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600">Адрес склада включая Город</label>
                        <input className={`form-input text-xs mt-1 ${whErr.address ? '!border-red-400 !bg-red-50/40' : ''}`} placeholder="Улица, дом" value={whAddress} onChange={e => { setWhAddress(e.target.value); setWhErr(e2 => ({ ...e2, address: false })); }} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600">Примерное кол-во SKU</label>
                        <input className={`form-input text-xs mt-1 ${whErr.sku ? '!border-red-400 !bg-red-50/40' : ''}`} inputMode="numeric" placeholder="Примерно" value={whSku} onChange={e => { setWhSku(e.target.value.replace(/\D/g, '')); setWhErr(e2 => ({ ...e2, sku: false })); }} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={async () => {
                        const errs: Record<string, boolean> = { city: !whCity.trim(), address: !whAddress.trim(), sku: !whSku.trim() };
                        setWhErr(errs);
                        if (errs.city || errs.address || errs.sku) { setNotice('Заполните все поля'); return; }
                        if (!editingWhId && !data?.multiWarehouse && (data?.warehouses || []).length >= 1) { setNotice('Мультисклад не подключён. Для добавления второго склада обратитесь в поддержку.'); return; }
                        await addWarehouse();
                        setWhModal(false); setWhErr({}); setEditingWhId(null);
                      }} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors">Сохранить</button>
                      <button type="button" onClick={() => { setWhModal(false); setWhErr({}); }} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors">Отмена</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

              {/* МОДАЛКА ТАРИФА (v1.30.29) */}

            {lkTab === 'dashboard' && (() => {
              const banner = (dash?.banner as Record<string, string>) || { image: '', link: '' };
              const lkLinks = (dash?.lkLinks as Record<string, string>) || {};
              const news = (dash?.news as Array<Record<string, string>>) || [];
              const counters = (dash?.counters as Record<string, unknown>) || {};
              const covered = new Set((data?.serviceSearch || []).map((c: { city: string }) => c.city).filter(Boolean)).size;
              return (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* БАННЕР */}
                    {/* v1.31.6: блоки дашборда — одинаковой высоты (banner = ВЗ ЧАТ = О компании) */}
                    <div className="h-full flex flex-col">
                      {banner.image ? (
                        <a href={banner.link || undefined} target={banner.link ? '_blank' : undefined} rel="noreferrer"
                          className="block bg-white border border-gray-200 rounded-2xl overflow-hidden w-full flex-1 min-h-0">
                          <img src={banner.image} alt="Баннер" className="w-full h-full object-cover" />
                        </a>
                      ) : (
                        <div className="bg-white border border-gray-200 rounded-2xl w-full flex-1 min-h-40 flex items-center justify-center">
                          <p className="text-gray-300 font-bold text-3xl tracking-widest select-none">БАННЕР</p>
                        </div>
                      )}
                    </div>

                    {/* VZ ЧАТ */}
                    <div>
                      <div className="bg-white border border-gray-200 rounded-2xl p-5 pt-[1.85rem] space-y-3 h-full relative">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-base font-bold text-gray-900">ВЗ ЧАТ</h3>
                          <a href="https://vsemzapchasti.ru/support" target="_blank" rel="noreferrer" title="Поддержка"
                            className="w-8 h-8 rounded-full bg-white border border-gray-300 hover:border-red-600 hover:text-red-600 text-gray-500 flex items-center justify-center transition-colors">
                            <Headset size={15} />
                          </a>
                        </div>
                        <div className="h-1" />
                        <div className="flex items-center gap-4 text-sm text-gray-700">
                          <span>Непрочитанные: <span className="bg-gray-100 rounded-md px-1.5 py-0.5 text-gray-900 font-semibold tabular-nums">0</span></span>
                          <span>Новые контакты: <span className="bg-gray-100 rounded-md px-1.5 py-0.5 text-gray-900 font-semibold tabular-nums">0</span></span>
                        </div>
                        <button type="button"
                          className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-semibold rounded-xl py-2.5 transition-colors">
                          Открыть ЧАТ
                        </button>
                        {lkOp?.name ? (
                          <div className="flex items-center gap-3 border border-dashed border-gray-200 rounded-xl p-3 bg-white">
                            {lkOp.avatar
                              ? <img src={String(lkOp.avatar)} alt="" className="w-[55px] h-[55px] rounded-full object-cover border border-gray-200 shrink-0" onError={ev => (ev.currentTarget.style.display = 'none')} />
                              : <span className="w-[55px] h-[55px] rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold shrink-0">{String(lkOp.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('')}</span>}
                            <div className="min-w-0 flex-1">
                              <p className="text-[10px] font-semibold text-gray-400">Персональный менеджер</p>
                              <p className="text-sm font-bold text-gray-900 truncate">{String(lkOp.name)}</p>
                              <div className="flex items-center gap-1.5 mt-1.5 whitespace-nowrap">
                                {lkOp.phone && (
                                  <button type="button" title="Скопировать номер"
                                    onClick={() => { navigator.clipboard?.writeText(String(lkOp.phone)); setNotice('Номер скопирован'); }}
                                    className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
                                    Телефон
                                  </button>
                                )}
                                {lkOp.email && (
                                  <a href={`mailto:${String(lkOp.email)}`} title="Написать письмо"
                                    className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
                                    Почта
                                  </a>
                                )}
                                {lkOp.maxLink && (
                                  <a href={String(lkOp.maxLink)} target="_blank" rel="noreferrer" title="Открыть аккаунт в MAX"
                                    className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
                                    MAX
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="border border-dashed border-gray-200 rounded-xl p-3 text-center">
                            <p className="text-[11px] text-gray-400">Персональный менеджер доступен при активных услугах платформы.</p>
                          </div>
                        )}
                      </div>
                    </div>
                                        {/* СВОДКА ПО ПОСТАВЩИКУ */}
                    <div>
                      <div className="relative overflow-hidden bg-white border border-gray-200 rounded-2xl p-5 h-full">
                        <div className="absolute inset-0 opacity-[0.5] pointer-events-none"
                          style={{ backgroundImage: 'linear-gradient(#f1f5f9 1px, transparent 1px), linear-gradient(90deg, #f1f5f9 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
                        <div className="relative space-y-4">
                        <button type="button" onClick={() => setLkTab('cabinet')} title="Личный кабинет"
                        className="w-full flex items-center justify-between gap-3 bg-gray-100 hover:bg-gray-200 rounded-xl px-4 py-2.5 transition-colors text-left">
                        <span className="text-xs font-semibold text-gray-800 uppercase tracking-wide truncate">{data?.companyName}</span>
                        <span role="button" tabIndex={0}
                          onClick={e => { e.stopPropagation(); setLkTab('wh'); }}
                          onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); setLkTab('wh'); } }}
                          className="flex items-center gap-1.5 bg-green-600 hover:bg-green-800 rounded-lg px-3 py-1.5 text-xs font-bold text-white transition-colors shrink-0 cursor-pointer"
                          title="Склад">
                          <Warehouse size={13} /> СКЛАД
                        </span>
                      </button>
                      <div className="divide-y divide-gray-100 text-[13px]">
                          <div className="py-2 flex gap-3">
                            <span className="w-[130px] shrink-0 text-[11px] font-semibold uppercase tracking-wider text-gray-400 pt-1">Проценка</span>
                            <div className="space-y-1.5 text-gray-600">
                              <p>Подключено: <span className="bg-gray-100 rounded-md px-1.5 py-0.5 text-gray-900 font-semibold tabular-nums">{covered}</span> <span className="text-gray-400 text-xs">(из {(data?.availableCities || []).length})</span></p>
                            </div>
                          </div>
                          {/* v1.30.46: статус активации на платформе (отдельно от статуса условий поставки) */}
                          <div className="py-2 flex gap-3">
                            <span className="w-[130px] shrink-0 text-[11px] font-semibold uppercase tracking-wider text-gray-400 pt-1">Поставщик</span>
                            <div className="flex-1">
                              {/* v1.30.47: «Не активирован» — кнопка с подсказкой по клику (паттерн «Совет по городам»), радиус как у «Подробнее» */}
                              {(data?.status || '') === 'Активный' ? (
                                <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-md bg-green-50 text-green-700">Активирован</span>
                              ) : (
                                <>
                                  {/* v1.30.52: окно поверх всего — fixed, не обрезается overflow-hidden карточки; позиция под кнопкой */}
                                  <button type="button" onClick={e => {
                                    const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                    setActHint(p => p ? null : { top: r.bottom + 8, left: r.left });
                                  }} title="Как активироваться?"
                                    className="text-xs font-semibold px-2.5 py-1 rounded-md bg-red-50 text-red-700 transition-colors">Не активирован</button>
                                  {actHint && (
                                    <div className="fixed z-50 w-96 max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-xl shadow-lg p-4 text-xs text-gray-600 leading-relaxed" style={{ top: actHint.top, left: actHint.left }}>
                                      Для активации на платформе создайте свой склад в разделе «Склады» и добавьте Условия для сервиса проценки. После модерации ваш склад станет активным.
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                          <div className="py-2 flex gap-3">
                            <span className="w-[130px] shrink-0 text-[11px] font-semibold uppercase tracking-wider text-gray-400 pt-1">Маркет</span>
                            <p className="flex items-center gap-1.5"><button type="button" onClick={() => lkLinks['crossdock'] && window.open(lkLinks['crossdock'], '_blank', 'noreferrer')} title={lkLinks['crossdock'] ? 'Открыть' : 'Ссылка не задана (Настройки → ЛК Поставщик → Ссылки офер)'}
                                className="text-xs font-semibold px-2.5 py-1 rounded-md bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">Подробнее</button><button type="button" title="Активировать"
                                className="text-xs font-semibold px-2.5 py-1 rounded-md bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">+</button></p>
                          </div>
                          <div className="py-2 flex gap-3">
                            {/* v1.30.90: «Продвижение» → «Медиа сервис»; + — модалка активации; при договоре — статус */}
                            <span className="w-[130px] shrink-0 text-[11px] font-semibold uppercase tracking-wider text-gray-400 pt-1">Сервис рекламы</span>
                            <p className="flex items-center gap-1.5">
                              {promoContract ? (
                                /* v1.30.91: договор найден — только статус-кнопка; v1.30.96: размер и радиус как у «Подробнее»; цвета мягкие */
                                <span className={`text-xs font-semibold px-2.5 py-1 rounded-md ${String(promoContract.status) === 'Активный' ? 'bg-green-100 text-green-700' : String(promoContract.status) === 'Новый' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{String(promoContract.status) === 'Новый' ? 'в работе' : String(promoContract.status || '—')}</span>
                              ) : (
                                <>
                                  <button type="button" onClick={() => lkLinks['promo'] && window.open(lkLinks['promo'], '_blank', 'noreferrer')} title={lkLinks['promo'] ? 'Открыть' : 'Ссылка не задана (Настройки → ЛК Поставщик → Ссылки офер)'}
                                    className="text-xs font-semibold px-2.5 py-1 rounded-md bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">Подробнее</button>
                                  <button type="button" onClick={() => setActivateModalOpen(true)} title="Активировать договор на размещение рекламы"
                                    className="text-xs font-semibold px-2.5 py-1 rounded-md bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">+</button>
                                </>
                              )}</p>
                          </div>
                        </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* СЧЁТЧИКИ — B2B-дашборд */}
                  <div className="relative overflow-hidden rounded-2xl bg-white border border-gray-200 ">
                    <div className="absolute inset-0 opacity-[0.5] pointer-events-none"
                      style={{ backgroundImage: 'linear-gradient(#f1f5f9 1px, transparent 1px), linear-gradient(90deg, #f1f5f9 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
                    <div className="relative px-6 py-5">
                      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-x-6 gap-y-5">
                        {[
                          { label: 'Магазинов и СТО', value: (counters.buyersMode === 'db' ? Number(dash?.dbBuyers ?? 0) : Number(counters.buyersCount ?? 0)) },
                          { label: 'Запросов в день', value: Number(counters.requestsPerDay ?? 1000) },
                          { label: 'Складов', value: (counters.warehousesMode === 'db' ? Number(dash?.warehousesTotal ?? 0) : Number(counters.warehousesCount ?? 0)) },
                          { label: 'SKU на платформе', value: (counters.skuMode === 'db' ? Number(dash?.skuTotal ?? 0) : Number(counters.skuCount ?? 350000)) },
                          { label: 'Городов проценки', value: (data?.availableCities || []).length },
                        ].map((m, i) => (
                          <div key={m.label} className="relative pl-3 border-l border-gray-200">
                            <p className="text-[17px] leading-none font-bold text-gray-900 tabular-nums tracking-tight">
                              {m.value.toLocaleString('ru-RU')}
                            </p>
                            <p className="mt-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-400 leading-tight">{m.label}</p>
                            <span className="absolute -left-px top-0 h-5 w-[2px] bg-red-500 rounded-full" style={{ opacity: 0.35 + i * 0.12 }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>


                  {/* НОВОСТИ */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-gray-600">Новости платформы</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {news.map(n => {
                        const inner = (
                          <>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-gray-100 text-gray-500">{n.tag || 'Новая функция'}</span>
                              <span className="text-[11px] text-gray-400">{n.date}</span>
                            </div>
                            <p className="text-sm font-bold text-gray-900 leading-snug">{n.title}</p>
                            <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{n.text}</p>
                          </>
                        );
                        const openN = n.link
                          ? () => window.open(n.link, '_blank', 'noreferrer')
                          : () => setNewsModal(n);
                        return (
                          <button key={n.id} type="button" onClick={openN}
                            className="block w-full text-left bg-[#eef3fb] rounded-2xl p-4 space-y-2 transition-colors hover:shadow-md">
                            {inner}
                          </button>
                        );
                      })}
                      {!news.length && <p className="text-xs text-gray-400 md:col-span-3">Новости появятся после публикации (Настройки → ЛК Поставщик → Новости).</p>}
                    </div>
                  </div>

                  {/* ОТ ПОСТАВЩИКОВ ПОСТАВЩИКАМ — слайдер */}
                  {(() => {
                    const vendorNews = (dash?.vendorNews as Array<Record<string, string>>) || [];
                    const card = (n: Record<string, string>, clamp = 'line-clamp-2') => {
                      const inner = (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-gray-100 text-gray-500">{n.tag || 'Новая функция'}</span>
                            <span className="text-[11px] text-gray-400">{n.date}</span>
                          </div>
                          <p className="text-sm font-bold text-gray-900 leading-snug">{n.title}</p>
                          <p className={`text-xs text-gray-500 leading-relaxed ${clamp}`}>{n.text}</p>
                        </>
                      );
                      const cls = "block bg-[#e7fcf9] rounded-2xl p-4 space-y-2 transition-colors hover:shadow-md h-full";
                      const open = n.link
                        ? () => window.open(n.link, '_blank', 'noreferrer')
                        : () => setNewsModal(n);
                      return <button key={n.id} type="button" onClick={open} className={cls + ' text-left w-full'}>{inner}</button>;
                    };
                    return (
                      <div className="space-y-3">
                        <h3 className="text-sm font-medium text-gray-600">Новости рынка</h3>
                        {vendorNews.length ? (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {vendorNews.slice(0, 3).map(n => card(n, 'line-clamp-3'))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400">Материалы появятся после публикации.</p>
                        )}
                      </div>
                    );
                  })()}





              {/* МОДАЛКА ПОЛНОГО ТЕКСТА НОВОСТИ */}
              {newsModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setNewsModal(null)}>
                  <div className="absolute inset-0 bg-black/40" />
                  <div className="relative bg-slate-100 rounded-2xl max-w-2xl w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-gray-100 text-gray-500">{newsModal.tag || 'Новая функция'}</span>
                        <h3 className="text-base font-bold text-gray-900 mt-2">{newsModal.title}</h3>
                        <p className="text-[11px] text-gray-400 mt-1">{newsModal.date}</p>
                      </div>
                      <button type="button" onClick={() => setNewsModal(null)}
                        className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">✕</button>
                    </div>
                    {newsModal.fullText
                      ? <div className="text-sm text-gray-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: newsModal.fullText }} />
                      : <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{newsModal.text}</p>}
                  </div>
                </div>
              )}
                </>
              );
            })()}

            {lkTab === 'crossdock' && (
              <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center space-y-3">
                <p className="text-sm font-semibold text-gray-700">Маркет</p>
                <p className="text-xs text-gray-400">Раздел появится в следующих обновлениях.</p>
              </div>
            )}

            {/* v1.30.68: Продвижение (ЛК) — договор + форматы + заявка */}
            {lkTab === 'promo' && (
              <div className="space-y-4">
                {/* Блок 1: Договор — v1.30.79: без заголовка, «не найден» в одну строку с кнопками */}
                <div className="bg-white border border-gray-200 rounded-2xl p-5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    {promoContract ? (
                      <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
                        <p className="text-gray-600">№ договора: <b className="text-gray-900">{String(promoContract.contractNo || '—')}</b></p>
                        <p className="text-gray-600">Дата: <b className="text-gray-900">{String(promoContract.contractDate || '').split('-').reverse().join('.') || '—'}</b></p>
                        {/* v1.30.74: статус — цветной фон, без обводки */}
                        {/* v1.30.95: «в работе» + мягкий цвет (единый везде) */}
                        <p className="text-gray-600">Статус:{' '}
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${String(promoContract.status) === 'Активный' ? 'bg-green-100 text-green-700' : String(promoContract.status) === 'Новый' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{String(promoContract.status) === 'Новый' ? 'в работе' : String(promoContract.status || '—')}</span>
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">Договор не найден — Активируйте Договор на размещение рекламы.</p>
                    )}
                    {/* v1.30.75: стиль чипов ЛК (rounded-full, обводка); активация — зелёный фон */}
                    <div className="flex gap-2">
                      {!promoContract && <button type="button" onClick={() => setActivateModalOpen(true)} className="text-xs px-3 py-1.5 rounded-full border transition-colors bg-green-600 border-green-600 text-white hover:bg-green-700 inline-flex items-center gap-1"><Plus size={13} /> Активировать договор</button>}
                      <button type="button" disabled={!promoContract} onClick={() => { setNnTitle(''); setNnLink(''); setNnText(''); setNnImage(''); setNewsModalOpen(true); }} title={promoContract ? '' : 'Активируйте договор'} className={`text-xs px-3 py-1.5 rounded-full border transition-colors inline-flex items-center gap-1 ${promoContract ? 'bg-white border-gray-200 text-gray-600 hover:border-red-300' : 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'}`}><Plus size={13} /> Добавить новость</button>
                      {/* v1.30.80: тумблер «Мои» — мои новости вместо сервисов и размещений */}
                      <button type="button" disabled={!promoContract} onClick={() => setShowMyNews(v => !v)} title={promoContract ? '' : 'Активируйте договор'} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${!promoContract ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed' : showMyNews ? 'bg-red-600 border-red-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-red-300'}`}>Мои новости</button>
                    </div>
                  </div>
                </div>
                {/* Блок 2: Форматы — белая подложка, сдержанный стиль (v1.30.70); v1.30.80: тумблер «Мои» */}
                {!showMyNews && (<>
                <div className="bg-white border border-gray-200 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Рекламные форматы</p>
                    {/* v1.30.76: ссылка «Подробнее про форматы» из Ссылки офер */}
                    {lkLinksMap.formats ? (
                      <a href={lkLinksMap.formats} target="_blank" rel="noreferrer" className="text-xs px-3 py-1.5 rounded-full border transition-colors bg-white border-gray-200 text-gray-600 hover:border-red-300 inline-flex items-center gap-1">Подробнее про форматы</a>
                    ) : null}
                  </div>
                  {adFormats.length ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {/* v1.30.71: описание с подложкой, hover — только тень */}
                      {/* v1.30.80: выбор формата недоступен без договора */}
                      {adFormats.map(f => (
                        <button key={String(f.id)} type="button" disabled={!promoContract} onClick={() => { setPromoFormat(f); setPromoTariffId(''); }}
                          className={`bg-white border border-gray-200 rounded-xl p-4 text-left shadow-sm transition-shadow h-full flex flex-col ${promoContract ? 'hover:shadow-lg' : 'opacity-50 cursor-not-allowed'}`}>
                          <p className="text-sm font-semibold text-gray-900">{String(f.name || '')}</p>
                          {f.description ? <p className="text-xs text-gray-600 mt-2 leading-relaxed line-clamp-3 flex-1 bg-gray-50 border border-gray-100 rounded-lg p-2.5">{String(f.description)}</p> : null}
                          <p className="text-[11px] text-gray-400 mt-3 pt-2 border-t border-gray-100">от {Number(f.pricePerMonth || 0).toLocaleString('ru')} ₽/мес.</p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">Форматы не настроены.</p>
                  )}

  </div>

                {/* v1.30.78: Рекламные размещения — отдельная подложка, фон как у условий DBS */}
                <div className="relative bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 h-full">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Рекламные размещения</p>
                    {/* v1.30.84: справка по статусам — кнопка в шапке блока */}
                    <button type="button" onClick={() => setShowStatusInfo(v => !v)} title="Статусы размещений"
                      className={`w-9 h-9 rounded-full border flex items-center justify-center transition-colors ${showStatusInfo ? 'bg-red-600 border-red-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-red-400 hover:text-red-600'}`}>
                      <Info size={16} />
                    </button>
                  </div>
                  {/* v1.30.85: попап — как «Статусы условий» в проценке (absolute-карточка) */}
                  {showStatusInfo && (
                    <div className="absolute right-4 top-12 z-30 w-96 max-w-[calc(100%-2rem)] bg-white border border-gray-200 rounded-xl shadow-lg p-4 text-xs text-gray-600 leading-relaxed space-y-2" onClick={e => e.stopPropagation()}>
                      <p><b className="text-amber-700">Заявка создана</b> — {STATUS_HINTS['Заявка создана']}.</p>
                      <p><b className="text-orange-700">Счёт отправлен</b> — {STATUS_HINTS['Счёт отправлен']}.</p>
                      <p><b className="text-green-700">Опубликовано</b> — {STATUS_HINTS['Опубликовано']}.</p>
                      <p><b className="text-blue-700">Запланировано</b> — {STATUS_HINTS['Запланировано']}.</p>
                      <p><b className="text-gray-600">Отменено</b> — {STATUS_HINTS['Отменено']}.</p>
                      <p><b className="text-red-600">Завершается</b> — {STATUS_HINTS['Завершается']}.</p>
                      <p><b className="text-emerald-700">Выполнено</b> — {STATUS_HINTS['Выполнено']}.</p>
                    </div>
                  )}
                  {/* v1.30.79: без подписей, строки — bg-gray-50 rounded-xl как в DBS */}
                  {placements.length ? (
                    <div className="space-y-2">
                      {/* v1.30.80: пропорции — тариф шире, статус уже; тариф в стиле CRM */}
                      {/* v1.30.81: тонкий шрифт text-xs, «дата не назначена», материал, хинт статуса */}
                      {/* v1.30.83: тип и тариф — шрифт как в 1.30.80; дата — мелкая тонкая */}
                      {placements.map((p, i2) => (
                        <div key={i2} className="bg-gray-50 rounded-xl px-3 py-2.5 grid grid-cols-2 sm:grid-cols-[1.1fr_1.9fr_0.7fr_1fr_auto] gap-2 text-sm items-center">
                          <b className="text-gray-900">{String(p.ad_type_name || '—')}</b>
                          <p className="text-gray-600 whitespace-nowrap">{String(p.duration_label || '—')}{p.price_per_month ? ` · ${Number(p.price_per_month).toLocaleString('ru')} ₽/мес.` : ''}{p.discount ? <span className="ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600">−{Number(p.discount)}%</span> : null}{p.total_price ? <b className="ml-1 text-gray-900">{Number(p.total_price).toLocaleString('ru')} ₽</b> : null}</p>
                          <span className="relative">
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[String(p.status)] || 'bg-amber-100 text-amber-700'}`}>{String(p.status || '—')}</span>
                          </span>
                          <span className="text-[11px] text-gray-400 whitespace-nowrap font-normal">{p.start_date && p.end_date ? `${String(p.start_date).split('-').reverse().join('.')} — ${String(p.end_date).split('-').reverse().join('.')}` : 'дата не назначена'}</span>
                          {/* v1.30.83: hover — фон темнее; если материал есть — видно по кнопке */}
                          {/* v1.30.84: добавлен — просто зелёный фон, без галочки и выделения */}
                          <button type="button" onClick={() => { setMaterialModalId(String(p.id)); setMatDesc(''); setMatImage(''); }}
                            title={p.material && ((p.material as { description?: string; files?: string[] }).description || (p.material as { files?: string[] }).files?.length) ? 'Материал добавлен — можно обновить' : 'Добавить материал'}
                            className={`text-xs px-2.5 py-1 rounded-md transition-colors whitespace-nowrap ${p.material && ((p.material as { description?: string; files?: string[] }).description || (p.material as { files?: string[] }).files?.length) ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                            Материал
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">Размещений нет.</p>
                  )}
                </div>
                </>)}

                {/* v1.30.80: Мои новости — дизайн как «Рекламные размещения» */}
                {showMyNews && (
                  <div className="relative bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 h-full">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Мои новости</p>
                    {myNews.length ? (
                      <div className="space-y-2">
                        {/* v1.30.86: клик по строке — просмотр/редактирование; заголовок + текст одной строкой */}
                        {myNews.map((n2, i2) => (
                          <div key={i2} onClick={() => { setNewsEditId(String(n2.id)); setNnTitle(String(n2.title || '')); setNnLink(String(n2.link || '')); setNnText(String(n2.text || '')); setNnImage(String(n2.imageUrl || '')); }}
                            className="bg-gray-50 hover:bg-gray-100 rounded-xl px-3 py-2.5 grid grid-cols-[1.6fr_1fr_0.7fr_0.7fr] gap-2 text-sm items-center cursor-pointer">
                            <p className="truncate text-gray-900"><b>{String(n2.title || '—')}</b>{n2.text ? <span className="text-gray-500 font-normal"> — {String(n2.text)}</span> : null}</p>
                            {n2.link ? <a href={String(n2.link)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-blue-600 hover:underline text-xs truncate">{String(n2.link)}</a> : <span className="text-gray-300 text-xs">—</span>}
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full w-fit ${String(n2.status) === 'Опубликована' ? 'bg-green-100 text-green-700' : String(n2.status) === 'Аннулирована' ? 'bg-gray-100 text-gray-500' : 'bg-amber-100 text-amber-700'}`}>{String(n2.status || '—')}</span>
                            <b className="text-gray-900 whitespace-nowrap">{String(n2.date || '').split('-').reverse().join('.') || '—'}</b>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">Новостей нет.</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* v1.30.68: модалка заявки на продвижение */}
            {/* v1.30.81: модалка материала размещения */}
            {materialModalId && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/50" onClick={() => { if (!matBusy) setMaterialModalId(null); }} />
                <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-3 animate-fade-in">
                  <h3 className="text-base font-bold text-gray-900">Материал размещения</h3>
                  <div>
                    <label className="form-label text-xs">Описание</label>
                    <textarea className="form-input text-xs" rows={3} value={matDesc} onChange={e => setMatDesc(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label text-xs">Картинка</label>
                    <div className="flex items-center gap-2">
                      {matImage ? <img src={matImage} alt="" className="h-10 w-10 object-cover rounded-lg border border-gray-200" /> : null}
                      <label className={`text-xs font-semibold px-2.5 py-1 rounded-md bg-gray-100 text-gray-600 cursor-pointer ${matBusy ? 'opacity-50' : 'hover:bg-gray-200'}`}>
                        {matBusy ? 'Загрузка…' : matImage ? 'Заменить' : 'Загрузить'}
                        <input type="file" accept="image/*" className="hidden" disabled={matBusy} onChange={e => { const f = e.target.files?.[0]; if (f) uploadMaterialImage(f); e.target.value = ''; }} />
                      </label>
                      {matImage && <button type="button" onClick={() => setMatImage('')} className="text-xs text-gray-400 hover:text-red-600">Убрать</button>}
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button type="button" disabled={matBusy} onClick={sendMaterial} className="flex-1 text-sm font-semibold px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      {matBusy ? 'Отправка...' : 'Отправить'}
                    </button>
                    <button type="button" disabled={matBusy} onClick={() => setMaterialModalId(null)} className="text-sm font-semibold px-4 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">Отмена</button>
                  </div>
                </div>
              </div>
            )}

            {/* v1.30.86: модалка просмотра/редактирования новости */}
            {newsEditId && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/50" onClick={() => { if (!nnBusy) setNewsEditId(null); }} />
                <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-3 animate-fade-in">
                  <h3 className="text-base font-bold text-gray-900">Редактирование новости</h3>
                  <div>
                    <label className="form-label text-xs">Заголовок *</label>
                    <input className="form-input text-xs" value={nnTitle} onChange={e => setNnTitle(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label text-xs">Ссылка</label>
                    <input className="form-input text-xs" value={nnLink} onChange={e => setNnLink(e.target.value)} placeholder="https://" />
                  </div>
                  <div>
                    <label className="form-label text-xs">Текст</label>
                    <textarea className="form-input text-xs" rows={3} value={nnText} onChange={e => setNnText(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label text-xs">Материал (картинка)</label>
                    <div className="flex items-center gap-2">
                      {nnImage ? <img src={nnImage} alt="" className="h-10 w-10 object-cover rounded-lg border border-gray-200" /> : null}
                      <label className={`text-xs font-semibold px-2.5 py-1 rounded-md bg-gray-100 text-gray-600 cursor-pointer ${nnBusy ? 'opacity-50' : 'hover:bg-gray-200'}`}>
                        {nnBusy ? 'Загрузка…' : nnImage ? 'Заменить' : 'Загрузить'}
                        <input type="file" accept="image/*" className="hidden" disabled={nnBusy} onChange={e => { const f = e.target.files?.[0]; if (f) uploadNewsImageLk(f); e.target.value = ''; }} />
                      </label>
                      {nnImage && <button type="button" onClick={() => setNnImage('')} className="text-xs text-gray-400 hover:text-red-600">Убрать</button>}
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button type="button" disabled={nnBusy} onClick={sendNewsUpdate}
                      className="flex-1 text-sm font-semibold px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      {nnBusy ? 'Сохранение...' : 'Сохранить'}
                    </button>
                    <button type="button" disabled={nnBusy} onClick={() => setNewsEditId(null)}
                      className="text-sm font-semibold px-4 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">Отмена</button>
                  </div>
                </div>
              </div>
            )}

            {/* v1.30.70: модалка активации договора */}
            {activateModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/50" onClick={() => { if (!activateBusy) setActivateModalOpen(false); }} />
                <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4 animate-fade-in">
                  <h3 className="text-base font-bold text-gray-900">Активация договора</h3>
                  {/* v1.30.71: текст в контуре с подложкой */}
                  <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 border border-gray-100 rounded-xl p-3">
                    Активация договора на размещение материала на платформе ни к чему вас не обязывает.
                    Подписание договора происходит посредством ЭДО. Добавьте свой идентификатор ЭДО в личном кабинете.
                  </p>
                  <div className="flex gap-2 pt-1">
                    <button type="button" disabled={activateBusy} onClick={activateMediaContract}
                      className="flex-1 text-sm font-semibold px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      {activateBusy ? 'Активация...' : 'Активировать'}
                    </button>
                    <button type="button" disabled={activateBusy} onClick={() => setActivateModalOpen(false)}
                      className="flex-1 text-sm font-semibold px-4 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">Отменить</button>
                  </div>
                </div>
              </div>
            )}

            {/* v1.30.69: модалка «Добавить новость» */}
            {newsModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/50" onClick={() => { if (!nnBusy) setNewsModalOpen(false); }} />
                <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-3 animate-fade-in">
                  <h3 className="text-base font-bold text-gray-900">Добавить новость</h3>
                  <div>
                    <label className="form-label text-xs">Заголовок *</label>
                    <input className="form-input text-xs" value={nnTitle} onChange={e => setNnTitle(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label text-xs">Ссылка</label>
                    <input className="form-input text-xs" value={nnLink} onChange={e => setNnLink(e.target.value)} placeholder="https://" />
                  </div>
                  <div>
                    <label className="form-label text-xs">Текст</label>
                    <textarea className="form-input text-xs" rows={3} value={nnText} onChange={e => setNnText(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label text-xs">Материал (картинка)</label>
                    <div className="flex items-center gap-2">
                      {nnImage ? <img src={nnImage} alt="" className="h-10 w-10 object-cover rounded-lg border border-gray-200" /> : null}
                      <label className={`text-xs font-semibold px-2.5 py-1 rounded-md bg-gray-100 text-gray-600 cursor-pointer ${nnBusy ? 'opacity-50' : 'hover:bg-gray-200'}`}>
                        {nnBusy ? 'Загрузка…' : nnImage ? 'Заменить' : 'Загрузить'}
                        <input type="file" accept="image/*" className="hidden" disabled={nnBusy} onChange={e => { const f = e.target.files?.[0]; if (f) uploadNewsImageLk(f); e.target.value = ''; }} />
                      </label>
                      {nnImage && <button type="button" onClick={() => setNnImage('')} className="text-xs text-gray-400 hover:text-red-600">Убрать</button>}
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button type="button" disabled={!nnTitle.trim() || nnBusy} onClick={sendMarketNews}
                      className="flex-1 text-sm font-semibold px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      {nnBusy ? 'Отправка...' : 'Отправить'}
                    </button>
                    <button type="button" disabled={nnBusy} onClick={() => setNewsModalOpen(false)}
                      className="text-sm font-semibold px-4 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">Отмена</button>
                  </div>
                </div>
              </div>
            )}

            {promoFormat && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/50" onClick={() => { if (!promoBusy) { setPromoFormat(null); setPromoTariffId(''); } }} />
                <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4 animate-fade-in">
                  <h3 className="text-base font-bold text-gray-900">{String(promoFormat.name || 'Формат')}</h3>
                  <div>
                    <label className="form-label text-xs">Тариф</label>
                    <select className="form-input text-xs" value={promoTariffId} onChange={e => setPromoTariffId(e.target.value)}>
                      <option value="">Выберите тариф...</option>
                      {((promoFormat.durations as Array<Record<string, unknown>>) || []).map(o => (
                        <option key={String(o.id)} value={String(o.id)}>
                          {String(o.periodLabel || '')} · {Number(o.totalPrice || 0).toLocaleString('ru')} ₽{Number(o.discount || 0) ? ` (−${Number(o.discount)}%)` : ''}
                        </option>
                      ))}
                    </select>
                    {/* v1.30.76: все цены с НДС — на выделенном фоне после тарифа */}
                    <p className="text-xs font-semibold text-green-800 bg-green-100 border border-green-100 rounded-lg px-2.5 py-1.5 mt-2">Все цены указаны с НДС.</p>
                    {/* v1.30.74: блок внимания — всегда */}
                    <p className="text-xs text-gray-600 leading-relaxed bg-gray-50 border border-gray-100 rounded-xl p-3 mt-2">
                      Обращаем ваше внимание: количество мест на каждом рекламном формате ограничено.
                      Чтобы забронировать размещение, пожалуйста, отправьте заявку.
                    </p>
                  </div>
                  <div className="flex gap-2 pt-1">
                    {/* v1.30.71: кнопки как в модалке активации договора */}
                    <button type="button" disabled={!promoTariffId || promoBusy} onClick={sendPromoRequest}
                      className="flex-1 text-sm font-semibold px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      {promoBusy ? 'Отправка...' : 'Отправить заявку'}
                    </button>
                    <button type="button" disabled={promoBusy} onClick={() => { setPromoFormat(null); setPromoTariffId(''); }}
                      className="text-sm font-semibold px-4 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">Отмена</button>
                  </div>
                </div>
              </div>
            )}

            {lkTab === 'wh' && (() => {
              const whs = (data?.warehouses || []) as Array<Record<string, unknown>>;
              return (
                <>


                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* СОЗДАНИЕ СКЛАДА */}
                    <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-gray-600">Создание склада в системе</h3>
                        <span className="relative inline-block">
                          <button type="button" onClick={() => setWhSkuHint(v => !v)} title="Склад"
                            className={`w-9 h-9 rounded-full border flex items-center justify-center transition-colors ${whSkuHint ? 'bg-red-600 border-red-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-red-400 hover:text-red-600'}`}>
                            <Warehouse size={16} />
                          </button>
                          {whSkuHint && (
                            <span className="absolute right-0 top-full mt-2 z-30 w-96 max-w-[calc(100vw-4rem)] bg-white border border-gray-200 rounded-xl shadow-lg p-4 text-xs text-gray-600 leading-relaxed space-y-2 block" onClick={e => e.stopPropagation()}>
                              <p>Указывайте количество SKU на складе, близкое к реальному. Если данные в вашем складе сильно расходятся с загружаемым прайсом, система заблокирует этот склад.</p>
                              <p>Вы можете заморозить склад во всех городах — тогда Личный кабинет будет аннулирован, а проценка перестанет показывать прайсы. Для этого обратитесь в поддержку.</p>
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <button type="button" onClick={() => { setWhCity(''); setWhAddress(''); setWhSku(''); setWhErr({}); setWhModal(true); }}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors">
                          + Добавить склад
                        </button>
                        <span className="text-xs text-gray-500">Мультисклад:{' '}
                          {data?.multiWarehouse
                            ? <span className="bg-green-50 rounded-md px-1.5 py-0.5 text-green-700">включён</span>
                            : (
                              <span className="relative inline-block">
                                <button type="button" onClick={() => setWhMsHint(v => !v)}
                                  className="text-xs font-bold px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                                  title="Нажмите для подсказки">выкл ⓘ</button>
                                {whMsHint && (
                                  <span className="absolute left-0 top-full mt-1.5 z-50 w-64 bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs text-gray-600 leading-relaxed" onClick={e => e.stopPropagation()}>
                                    Для включения функции Мультисклад обратитесь в поддержку, это бесплатно.
                                  </span>
                                )}
                              </span>
                            )}
                        </span>
                      </div>
                    </div>
<div className={`bg-white border border-dashed rounded-2xl p-4 space-y-2 ${cabinet?.priceEmail ? 'border-green-300' : 'border-red-200'}`}>
                      <h3 className="text-sm font-semibold text-gray-800">Email отправки прайсов</h3>
                      <div className="flex items-center gap-2">
                        <input className="form-input text-xs flex-1 min-w-0" placeholder="price@example.ru" value={String(cabinet?.priceEmail || '')} onChange={e => setCabinet({ ...(cabinet || {}), priceEmail: e.target.value })} />
                        <button type="button" onClick={async () => { const err = await post({ priceEmail: cabinet?.priceEmail || '' }); if (err) setNotice(err); else { setNotice('Email для прайсов сохранён'); loadLkInfo(); } }}
                          className="text-[11px] font-semibold px-2.5 h-10 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors whitespace-nowrap">Сохранить</button>
                      </div>
                      <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-600">
                        С указанного Email настройте рассылку прайс-листов на адрес:{' '}
                        <button type="button" title="Скопировать адрес"
                          onClick={() => { navigator.clipboard?.writeText('price@vsemzapchasti.ru'); setNotice('Адрес скопирован'); }}
                          className="inline-flex items-center gap-1 text-gray-800 font-bold hover:text-red-600 transition-colors">
                          price@vsemzapchasti.ru <Copy size={11} />
                        </button>
                      </p>
                    </div>


                  </div>

                  {/* МОИ СКЛАДЫ */}
                  <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-gray-600">Мои склады</h3>
                    {whs.length ? (
                      <div className="space-y-2">
                        {whs.map((w, i) => {
                          const st = (w.status as string) || 'Новый';
                          const stCls = st === 'Проверен' ? 'bg-green-100 text-green-700'
                            : st === 'Заморожен' ? 'bg-gray-100 text-gray-500'
                            : 'bg-blue-100 text-blue-700';
                          return (
                            <div key={w.id || i} className={`border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-4 hover:border-gray-300 transition-colors ${st === 'Проверен' ? 'bg-green-50' : 'bg-white'}`}>
                              <Warehouse size={16} className="text-gray-400 shrink-0" />
                              <p className="text-sm font-semibold text-gray-800 w-36 shrink-0 truncate">{String(w.city || '—')}</p>
                              <p className="text-xs text-gray-500 flex-1 min-w-[140px] truncate">{String(w.address || '—')}</p>
                              <p className="text-sm text-gray-500 w-28 shrink-0 text-right">SKU: <b className="text-gray-800 tabular-nums">{Number(w.skuCount) || 0}</b></p>
                              <span className={`text-[11px] font-semibold px-2 py-1 rounded-md w-24 shrink-0 text-center ${stCls}`}>{st === 'Новый' ? 'в работе' : st}</span>
                              <button type="button"
                                onClick={() => { setEditingWhId((w.id as string) || null); setWhCity(String(w.city || '')); setWhAddress(String(w.address || '')); setWhSku(String(w.skuCount || '')); setWhErr({}); setWhModal(true); }}
                                className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors shrink-0">
                                <Pencil size={10} /> Редактировать
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">Склады не добавлены.</p>
                    )}
                  </div>
                </>
              );
            })()}


            {lkTab === 'cabinet' && (() => {
              const cb = cabinet || {};
              /* v1.30.100: сервисы из настроек (публичные названия) */
              const svc = adServices.length ? adServices : [{ code: 'DBS', label: 'проценка' }, { code: 'MARKET', label: 'маркетплейс' }, { code: 'MEDIA', label: 'реклама' }];
              const activeServices = svc.filter(s => (cb.services as string[] || []).includes(s.code));
              const row = (label: string, value: unknown) => (
                <div className="flex items-baseline gap-3 text-sm py-1.5">
                  <span className="w-40 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
                  <span className="text-gray-800 break-all">{value || '—'}</span>
                </div>
              );
              return (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
<div className={`lg:col-span-2 bg-white border border-dashed rounded-2xl p-5 space-y-3 ${cb.edoOperator && cb.edoToken ? 'border-green-300' : 'border-red-200'}`}>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-800">ЭДО</h3>
                      <span className="text-[10px] text-gray-400">Электронный документооборот — подключите для быстрой работы с документами</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <select className="form-input text-xs w-56" value={String(cb.edoOperator || '')} onChange={e => setCabinet({ ...cb, edoOperator: e.target.value })}>
                        <option value="">— Оператор ЭДО —</option>
                        {((cabinet?.edoOperators as string[]) || []).map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                      <input className="form-input text-[11px] flex-1 min-w-[220px]" placeholder="Идентификатор ЭДО" value={String(cb.edoToken || '')} onChange={e => setCabinet({ ...cb, edoToken: e.target.value })} />
                      <button type="button" onClick={async () => { const err = await post({ edoOperator: cb.edoOperator || '', edoToken: cb.edoToken || '' }); if (err) setNotice(err); else { setNotice('ЭДО сохранено'); loadLkInfo(); } }}
                        className="text-[11px] font-semibold px-2.5 h-10 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors whitespace-nowrap">Сохранить ЭДО</button>
                    </div>
                  </div>
                  {/* О ПОСТАВЩИКЕ */}
                  <div className="relative overflow-hidden bg-white border border-gray-200 rounded-2xl p-5">
                    <div className="absolute inset-0 opacity-[0.5] pointer-events-none"
                      style={{ backgroundImage: 'linear-gradient(#f1f5f9 1px, transparent 1px), linear-gradient(90deg, #f1f5f9 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
                    <div className="relative">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <h3 className="text-sm font-semibold text-gray-600">О поставщике</h3>
                        {cb.active && (
                          <span title="Активирован на платформе" className="w-7 h-7 rounded-full bg-green-500 text-white flex items-center justify-center shadow-sm shrink-0">
                            <Check size={15} strokeWidth={3} />
                          </span>
                        )}
                      </div>
                      {row('Торговое название', String(cb.tradeName || ''))}
                      {row('Город ЦС', String(cb.city || ''))}
                      {row('ИНН', String(cb.inn || ''))}
                      {row('Сайт', cb.website ? <a href={String(cb.website)} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline break-all">{String(cb.website)}</a> : null)}
                      {row('Тип', String(cb.type || ''))}
                    </div>
                  </div>

                  {/* АССОРТИМЕНТ */}
                  <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-gray-600">Ассортимент</h3>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Основные группы товаров</p>
                      <div className="flex flex-wrap gap-1.5">
                        {((cb.productGroups as string[]) || []).map(g => <span key={g} className="text-xs font-medium px-2.5 py-1 rounded-md bg-gray-100 text-gray-600">{g}</span>)}
                        {!(cb.productGroups as string[])?.length && <span className="text-xs text-gray-400">—</span>}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Собственные бренды (СТМ)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {((cb.ownBrands as string[]) || []).map(g => <span key={g} className="text-xs font-medium px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-100">{g}</span>)}
                        {!(cb.ownBrands as string[])?.length && <span className="text-xs text-gray-400">—</span>}
                      </div>
                    </div>
                  </div>

                  {/* АКТИВНЫЕ СЕРВИСЫ */}
                  <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-gray-600">Активные сервисы продаж</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {svc.map(s => (
                        <span key={s.code} className={`text-xs font-semibold px-2.5 py-1 rounded-md border ${activeServices.some(x => x.code === s.code) ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>{s.label}</span>
                      ))}
                    </div>
                    {/* v1.30.58: ссылка на оферту — открывает модалку для чтения */}
                    {lkOffer && (
                      <button type="button" onClick={() => { setOfferView(true); setOfferTextOpen(true); }}
                        className="block text-xs text-gray-500 hover:text-red-600 underline underline-offset-2 decoration-dotted transition-colors text-left">
                        Прочитать оферту: {String(lkOffer.name || 'Договор оферты')} (редакция {String(lkOffer.edition || '—')})
                      </button>
                    )}
                  </div>

                  {/* КОНТАКТЫ ПРЕДСТАВИТЕЛЯ — редактируемо */}
                  <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-gray-600">Представитель поставщика</h3>
                      {!cabEdit ? (
                        <button type="button" onClick={() => setCabEdit(true)}
                          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors shrink-0">
                          <Pencil size={11} /> Редактировать
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button type="button" onClick={async () => { const err = await post({ contactName: cb.contactName || '', contactRole: cb.contactRole || '', phone: cb.contactPhone || '', email: cb.contactEmail || '' }); if (err) setNotice(err); else { setNotice('Контакты сохранены'); setCabEdit(false); } }}
                            className="text-[11px] font-semibold px-2.5 h-10 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors">Сохранить</button>
                          <button type="button" onClick={() => { setCabEdit(false); }}
                            className="btn-secondary text-xs">Отмена</button>
                        </div>
                      )}
                    </div>
                    {cabEdit ? (
                      <div className="grid grid-cols-1 gap-2">
                        <input className="form-input text-xs" placeholder="ФИО" value={String(cb.contactName || '')} onChange={e => setCabinet({ ...cb, contactName: e.target.value })} />
                        <input className="form-input text-xs" placeholder="Телефон" value={String(cb.contactPhone || '')} onChange={e => setCabinet({ ...cb, contactPhone: e.target.value })} />
                        <input className="form-input text-xs" placeholder="Email" value={String(cb.contactEmail || '')} onChange={e => setCabinet({ ...cb, contactEmail: e.target.value })} />
                      </div>
                    ) : (
                      <div className="space-y-1 text-[13px] text-gray-700">
                        <div className="flex items-baseline gap-3"><span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-gray-400">ФИО</span><span className="text-gray-800 break-all">{String(cb.contactName || '—')}</span></div>
                        <div className="flex items-baseline gap-3"><span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Телефон</span><span className="text-gray-800 break-all">{String(cb.contactPhone || '—')}</span></div>
                        <div className="flex items-baseline gap-3"><span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Email</span><span className="text-gray-800 break-all">{String(cb.contactEmail || '—')}</span></div>
                      </div>
                    )}
                    {!cabEdit && <p className="text-[10px] text-gray-400">Остальные данные — через поддержку или персонального менеджера.</p>}
                  </div>

                                    

                  {/* ЭДО — заметное окно, редактируемо */}
                  
                </div>
              );
            })()}

            {lkTab === 'pricing' && (<>
            {/* ШАГ 1: СОЗДАТЬ СКЛАД + КАРТОЧКА КОМПАНИИ */}
                        {/* МОИ СКЛАДЫ */}
            <div className="relative bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 h-full">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-base font-semibold text-gray-800 mb-3">Мои склады ({(data.warehouses || []).length})</h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <button type="button" onClick={() => setLkTab('wh')}
                    className="text-xs px-3 py-1.5 rounded-full border transition-colors bg-white border-gray-200 text-gray-600 hover:border-red-300">
                    + Добавить склад
                  </button>
                  <span className="relative inline-block">
                    <button type="button" onClick={() => setFaqHint(v => !v)} title="Вопрос"
                      className={`w-9 h-9 rounded-full border flex items-center justify-center transition-colors ${faqHint ? 'bg-red-600 border-red-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-red-400 hover:text-red-600'}`}>
                      ?
                    </button>
                    {faqHint && (
                      <span className="absolute right-0 top-full mt-2 z-30 w-96 max-w-[calc(100vw-4rem)] bg-white border border-gray-200 rounded-xl shadow-lg p-4 text-xs text-gray-600 leading-relaxed space-y-2 block" onClick={e => e.stopPropagation()}>
                        <p><b className="text-red-700">Шаг 1.</b> Добавьте свой склад в систему и настройте условия доставки для доступных городов.</p>
                        <p><b className="text-red-700">Шаг 2.</b> Настройте автоматическую рассылку вашего прайс-листа на адрес: <span className="font-semibold text-gray-800">price@vsemzapchasti.ru</span></p>
                        <p><b className="text-red-700">Шаг 3.</b> После прохождения модерации ваш склад станет доступен на платформе.</p>
                      </span>
                    )}
                  </span>
                </div>
              </div>
              {(data.warehouses || []).length === 0 && (
                <p className="text-sm text-gray-800">Шаг 1. Сначала добавьте склад – это необходимо для создания условий в поиске.</p>
              )}
              <div className="flex flex-wrap gap-2">
                {(data.warehouses || []).map(w => {
                    const st = w.status || (w.verified ? 'Проверен' : 'Новый');
                    const borderCls = editingWhId === w.id ? 'border-red-400 ring-2 ring-red-200'
                      : st === 'Заморожен' ? 'border-gray-300 bg-gray-100 opacity-60'
                      : st === 'Проверен' ? (selectedWh === w.city ? 'border-green-500 bg-green-50 ring-2 ring-green-300' : 'border-green-400 bg-green-50 hover:border-green-600')
                      : (selectedWh === w.city ? 'border-blue-300 bg-blue-50' : 'border-blue-200 bg-white hover:border-blue-400');
                    return (
                  <button key={w.id} type="button" onClick={() => setSelectedWh(prev => prev === w.city ? '' : w.city)}
                    className={`inline-flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm transition-colors ${borderCls}`}>
                    <span className="font-semibold text-gray-800">{w.city}</span>
                    <span className="text-gray-800 text-xs">{Number(w.skuCount).toLocaleString('ru-RU')} SKU</span>
                    <span className={`text-xs ${st === 'Проверен' ? 'text-green-600 font-medium' : st === 'Заморожен' ? 'text-gray-800' : 'text-gray-800'}`}>{st}</span>
                    <span onClick={e => e.stopPropagation()} title={w.address ? `Адрес: ${w.address}` : 'Адрес не указан'} className="text-gray-300 hover:text-gray-500 cursor-help inline-flex"><Warehouse size={12} /></span>
                  </button>
                );
                })}
              </div>
            </div>

            {/* ДОСТУПНЫЕ ГОРОДА — список показываем всегда; условия требуют склад */}
            <div className="relative bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 h-full">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <h2 className="text-base font-semibold text-gray-800">Доступные города</h2>
                <div className="flex items-center gap-2">
                  {(['covered', 'empty'] as const).map(f => (
                    <button key={f} type="button" onClick={() => setCityFilter(prev => prev === f ? 'all' : f)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${cityFilter === f ? 'bg-red-600 border-red-600 text-white font-semibold' : 'bg-white border-gray-200 text-gray-500 hover:border-red-300'}`}>
                      {f === 'covered' ? 'Есть условия' : 'Нет условий'}
                    </button>
                  ))}
                  <button type="button" onClick={() => setCityHint(v => !v)} title="Совет по городам"
                    className={`w-9 h-9 rounded-full border flex items-center justify-center transition-colors ${cityHint ? 'bg-red-600 border-red-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-red-400 hover:text-red-600'}`}>
                    <Truck size={16} />
                  </button>
                </div>
              </div>
              {cityHint && (
                <div className="absolute right-8 top-16 z-30 w-96 max-w-[calc(100%-2rem)] bg-white border border-gray-200 rounded-xl shadow-lg p-4 text-xs text-gray-600 leading-relaxed space-y-2" onClick={e => e.stopPropagation()}>
                  Настраивайте склад во всех городах, даже если у вас туда пока нет доставки. При заполнении условий поиска (проценки) обязательно выбирайте пункт «Условия доставки ТК». Клиенты увидят, что постоянной доставки нет, но привыкнут к вашему складу и запомнят Вашу компанию.
                
                </div>
              )}
              {(() => {
                const list = data.serviceSearch || [];
                const cities = data.availableCities || [];
                if (!cities.length) return <p className="text-xs text-gray-800 mt-3">Список доступных городов не настроен — уточните у вашего менеджера.</p>;
                const isCov = (c: string) => list.some(x => (x.city || '').toLowerCase() === c.toLowerCase());
                const filtered = cities.filter(c => cityFilter === 'all' ? true : cityFilter === 'covered' ? isCov(c) : !isCov(c));
                if (!filtered.length) return <p className="text-xs text-gray-800 mt-3">Городов по выбранному фильтру нет.</p>;
                return (
                  <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2 mt-3">
                    {filtered.map(c => {
                      // ТЗ v1.25.7: уникальность ПАРОЙ склад+город — один склад покрывает все города
                      const idx = list.findIndex(x => (x.city || '').toLowerCase() === c.toLowerCase() && (x.warehouseName || '') === selectedWh);
                      const active = idx >= 0;
                      return (
                        <button key={c} type="button"
                          onClick={() => {
                            if ((data.warehouses || []).length === 0 || !selectedWh) {
                              setNotice('Выберите или создайте новый склад в разделе «Мои склады» для добавления условий в сервис проценки.');
                              return;
                            }
                            setNotice('');
                            if (active && idx >= 0) {
                              // ТЗ v1.25.7: покрытый город открывает СВОЁ условие (пара склад+город) на редактирование
                              const cid = (list[idx].c as { id?: string }).id;
                              const real = (data?.serviceSearch || []).findIndex(x => (x as { id?: string }).id === cid);
                              if (real >= 0) {
                                setEditingIdx(real);
                                setCondForm({ ...(data!.serviceSearch![real] as object) } as Cond);
                                setTkOn(String((data!.serviceSearch![real] as { orderUnloadSchedule?: string }).orderUnloadSchedule || '').includes('Условия доставки по согласованию!'));
                                setEditorOpen(true);
                              }
                              setPendingCity(null);
                              return;
                            }
                            setPendingCity(prev => prev === c ? null : c);
                          }}
                          className={`text-sm px-4 py-2 rounded-xl border transition-colors ${active ? 'bg-green-50 border-green-300 text-green-700 font-medium' : 'bg-blue-50/60 border-blue-200 text-gray-700 hover:border-[#64a2ef]'} ${pendingCity === c ? 'ring-2 ring-red-300' : ''}`}>
                          {c}
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
              {pendingCity && !!selectedWh && !(data.serviceSearch || []).some(x => (x.city || '').toLowerCase() === pendingCity.toLowerCase() && (x.warehouseName || '') === selectedWh) && ( // ТЗ v1.25.7: пара склад+город
                <button type="button"
                  onClick={() => {
                    setCondForm({ ...EMPTY_COND, city: pendingCity, warehouseName: selectedWh });
                    setEditingIdx(null); setTkOn(false); setEditorOpen(true); setPendingCity(null);
                  }}
                  className="w-full mt-3 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl px-4 py-3 flex items-center justify-center gap-1.5 transition-colors">
                  <Plus size={15} /> Создать условия для выбранного склада и города
                </button>
              )}
            </div>

            {/* ТЗ v1.23.12: уведомления — всегда под блоком «Доступные города» */}
            {/* ТЗ v1.23.55: всплывающий тост справа сверху вместо полоски в потоке */}
            {/* ТЗ v1.25.19: центровка через flex — анимация больше не «отбирает» transform и тост не прыгает */}
            {notice && (
              <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 pointer-events-none">
                <div className={`w-full max-w-[420px] text-sm font-medium px-4 py-3 rounded-xl shadow-lg border text-center ${notice.startsWith('✓')
                  ? 'bg-green-600 text-white border-green-600 shadow-green-200'
                  : 'bg-red-600 text-white border-red-600 shadow-red-200'}`}>
                  {notice}
                </div>
              </div>
            )}

            {/* ШАГ 3: ОКНО «УСЛОВИЯ СЕРВИСА ПОИСКА» — открывается после выбора города */}
            {editorOpen && (data.warehouses || []).length > 0 && (
              /* ТЗ v1.25.5: редактор — модальное окно: видно целиком, доскролл не нужен */
              <div className="fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-3 sm:p-6" onClick={() => { setEditorOpen(false); setEditingIdx(null); setCondForm(EMPTY_COND); setTkOn(false); }}>
                <div className="w-full max-w-[1080px] max-h-[92vh] overflow-y-auto rounded-2xl shadow-2xl ring-1 ring-white/40 border border-white/30" onClick={e => e.stopPropagation()}>
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold text-gray-800">{editingIdx !== null ? 'Условия сервиса проценки (редактирование)' : 'Условия сервиса проценки'}</h2>
                  <button onClick={() => { setEditorOpen(false); setEditingIdx(null); setCondForm(EMPTY_COND); setTkOn(false); }} className="text-gray-800 hover:text-gray-700" title="Закрыть"><X size={18} /></button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* КОЛОНКА 1: условия сервиса поиска (чипы) */}
                  <div className="flex flex-col gap-2 max-w-[260px]">
                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-800">Склад</label>
                      <div className="text-sm rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-gray-800 mt-0.5">{condForm.warehouseName || 'Склад не выбран'}</div>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-800">Город</label>
                      <div className="text-sm rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-gray-800 mt-0.5">{condForm.city || 'Город не выбран'}</div>
                    </div>
                    {/* ТЗ v1.23.14: подсказка под ячейками склада/города */}
                    <div className="mt-2 rounded-xl border border-yellow-200 bg-yellow-50 p-3.5 text-xs text-gray-600 leading-relaxed">
                      <p className="font-semibold text-gray-800">Нет своей доставки в этот город?</p>
                      <p className="mt-1">Нажмите кнопку «ТК».</p>
                      <p className="mt-2">Не забудьте указать время приёма заказов.</p>
                      <p className="mt-1">Если оставить поле пустым, по умолчанию установится 23:59.</p>
                    </div>
                  </div>

                  {/* КОЛОНКА 2: график/условия доставки, возврат */}
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-gray-600">График доставки <span className="text-red-600">*</span></label>
                      <div className={`flex flex-wrap gap-1.5 mt-2 ${missing.includes('deliverySchedule') ? 'rounded-lg ring-2 ring-red-200 p-1' : ''}`}>
                        {['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].map(d => {
                          const days = (condForm.deliverySchedule || '').split(',').map(x => x.trim()).filter(Boolean);
                          const on = days.includes(d);
                          return (
                            <button key={d} type="button"
                              onClick={() => setCondForm(f => ({ ...f, deliverySchedule: on ? days.filter(x => x !== d).join(', ') : [...days, d].join(', ') }))}
                              className={`w-9 h-9 text-xs rounded-lg border transition-colors ${on ? 'bg-green-600 border-green-600 text-white font-semibold' : 'bg-white border-gray-200 text-gray-600 hover:border-green-500'}`}>
                              {d}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600">Срок поставки и условия доставки <span className="text-red-600">*</span></label>
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <button type="button" onClick={() => {
                          const TK_TEXT = 'Условия доставки по согласованию!';
                          const cur = condForm.orderUnloadSchedule || '';
                          const has = cur.includes(TK_TEXT);
                          const next = has ? cur.replace(TK_TEXT, '').replace(/\s{2,}/g, ' ').trim() : (cur ? `${cur.trim()} ${TK_TEXT}` : TK_TEXT);
                          setCondForm(f => ({ ...f, orderUnloadSchedule: next }));
                          setTkOn(!has);
                        }}
                          className={`w-9 h-9 text-xs font-bold rounded-lg border transition-colors ${tkOn || String(condForm.orderUnloadSchedule || '').includes('Условия доставки по согласованию!') ? 'bg-yellow-300 border-yellow-400 text-gray-800' : 'bg-white border-gray-200 text-gray-600 hover:border-yellow-400'}`}>
                          ТК
                        </button>
                        {['Сегодня', 'Завтра'].map(v => (
                          <button key={v} type="button" onClick={() => { setCondForm(f => ({ ...f, deliveryTime: v })); setMissing(m => m.filter(k => k !== 'deliveryTime')); }} // ТЗ v1.23.33: канонический вид «Сегодня»/«Завтра» — как в CRM
                            className={`text-xs px-3 py-2 rounded-lg border transition-colors ${(condForm.deliveryTime || '').toLowerCase() === v.toLowerCase() ? 'bg-red-600 border-red-600 text-white font-semibold' : 'bg-white border-gray-200 text-gray-600 hover:border-red-300'}`}>
                            {v}
                          </button>
                        ))}
                        <input className={fldM('deliveryTime') + ' flex-1 min-w-[140px] !py-2 text-xs'} placeholder="Например: 2-3 дня"
                          value={condForm.deliveryTime} onChange={e => setCondForm(f => ({ ...f, deliveryTime: e.target.value }))} />
                      </div>
                      {/* ТЗ v1.23.27: ячейка 3 строки; «хвостик» шаблонов в правом углу ячейки; при ТК текст — фиксированный хвост */}
                      <div className="relative mt-2">
                        <textarea rows={3} className={fldM('orderUnloadSchedule') + ' resize-none pr-9'} placeholder="Выберите шаблон (стрелка справа) или введите свой вариант"
                          value={tkOn ? String(condForm.orderUnloadSchedule || '').replace('Условия доставки по согласованию!', '').trim() : condForm.orderUnloadSchedule}
                          onChange={e => {
                            const v = e.target.value;
                            setCondForm(f => ({ ...f, orderUnloadSchedule: tkOn ? (v.trim() ? `${v.trim()} Условия доставки по согласованию!` : 'Условия доставки по согласованию!') : v }));
                            setMissing(m => m.filter(k => k !== 'orderUnloadSchedule'));
                          }} />
                        <select className="absolute right-1.5 top-1.5 w-7 h-7 opacity-0 cursor-pointer z-10" title="Шаблоны доставки"
                          value="" onChange={e => { const t = e.target.value; if (t) { setCondForm(f => ({ ...f, orderUnloadSchedule: tkOn ? `${t} Условия доставки по согласованию!` : t })); setMissing(m => m.filter(k => k !== 'orderUnloadSchedule')); } }}>
                          <option value="" disabled hidden>Шаблон</option>
                          <option value="При заказе до (введите время) доставка на следующий день.">При заказе до (введите время) доставка на следующий день.</option>
                          <option value="При заказе до (введите время) доставка день заказа.">При заказе до (введите время) доставка день заказа.</option>
                          <option value="При заказе до (введите время) доставка по сроку поставки.">При заказе до (введите время) доставка по сроку поставки.</option>
                        </select>
                        <ChevronDown size={15} className="absolute right-2.5 top-2.5 text-gray-800 pointer-events-none" />
                      </div>
                      {tkOn && (
                        <p className="mt-1.5 text-xs font-medium text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-2.5 py-1.5">
                          + Условия доставки по согласованию!
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600">Условия возврата товара <span className="text-red-600">*</span></label>
                      <input list="return-presets" className={fldM('returnConditions') + ' mt-2'} placeholder="Выберите из списка или введите свой вариант"
                        value={condForm.returnConditions} onChange={e => { setCondForm(f => ({ ...f, returnConditions: e.target.value })); setMissing(m => m.filter(k => k !== 'returnConditions')); }} />
                      <datalist id="return-presets">
                        <option value="Возврат без комиссии" />
                        <option value="Возврат с комиссией" />
                        <option value="Нет возврата" />
                      </datalist>
                    </div>
                  </div>

                  {/* КОЛОНКА 3: представитель/контакты/email + кнопка */}
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-gray-600">Представитель <span className="text-red-600">*</span></label>
                        <button type="button" className="text-xs text-red-700 hover:underline"
                          onClick={() => {
                            const d = data as { contactName?: string; contactPhone?: string; contactEmail?: string };
                            if (!d.contactName && !d.contactPhone && !d.contactEmail) {
                              setNotice('В карточке поставщика нет данных представителя — заполните поля вручную.');
                              return;
                            }
                            setNotice('');
                            setCondForm(f => ({
                              ...f,
                              representative: d.contactName || f.representative,
                              contacts: d.contactPhone || f.contacts,
                              email: d.contactEmail || f.email,
                            }));
                          }}>
                          Добавить данные из анкеты
                        </button>
                      </div>
                      <input className={fldM('representative') + ' mt-2'} placeholder="ФИО" value={condForm.representative} onChange={e => { setCondForm(f => ({ ...f, representative: e.target.value })); setMissing(m => m.filter(k => k !== 'representative')); }} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600">Контакты <span className="text-red-600">*</span></label>
                      <input className={fldM('contacts') + ' mt-2'} placeholder="Телефон" value={condForm.contacts} onChange={e => { setCondForm(f => ({ ...f, contacts: e.target.value })); setMissing(m => m.filter(k => k !== 'contacts')); }} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600">Email <span className="text-red-600">*</span></label>
                      <input className={fldM('email') + ' mt-2'} value={condForm.email} onChange={e => { setCondForm(f => ({ ...f, email: e.target.value })); setMissing(m => m.filter(k => k !== 'email')); }} />
                    </div>
                    <button type="button"
                      onClick={async () => {
                        // ТЗ v1.23.24: пустые обязательные поля — подсветка и стоп, форма остаётся открытой
                        const NAMES: Record<string, string> = { deliverySchedule: 'График доставки', orderUnloadSchedule: 'Условия доставки', returnConditions: 'Условия возврата товара', representative: 'Представитель', contacts: 'Контакты', email: 'Email' };
                        const missingKeys = (Object.keys(NAMES) as string[]).filter(k => !(condForm as Record<string, unknown>)[k]);
                        if (missingKeys.length) { setNotice('Заполните обязательные поля: ' + missingKeys.map(k => NAMES[k]).join(', ')); setMissing(missingKeys); return; }
                        if (!window.confirm('Вы точно согласны добавить данное условие для всех доступных городов?')) return;
                        if (!window.confirm('Далее Вы сможете редактировать каждое условие отдельно. Вы даете согласие?')) return;
                        await applyToAllCities();
                        setEditorOpen(false); setEditingIdx(null); setCondForm(EMPTY_COND); setTkOn(false);
                      }}
                      className="w-full text-xs text-red-700 hover:underline mt-6">
                      Добавить условие для всех доступных городов
                    </button>
                    <button onClick={async () => { if (!condForm.city || !condForm.warehouseName) { setNotice('Заполните Город показов и Склад'); return; } setNotice(''); const ok = await saveCondition(); if (!ok) return; setEditorOpen(false); setEditingIdx(null); setCondForm(EMPTY_COND); setTkOn(false); }} disabled={saving}
                      className="w-full bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl px-6 py-3 flex items-center justify-center gap-1 disabled:opacity-60">
                      <Plus size={15} /> {editingIdx !== null ? 'Сохранить условие' : 'Добавить условие'}
                    </button>
                  </div>
                </div>
              </div>
                </div>
              </div>
            )}

            {/* УСЛОВИЯ СЕРВИСА ПОИСКА (DBS) — таблица условий */}
            {(data.serviceSearch || []).length > 0 && (
              <div className="relative bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 h-full">
                <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                  <h2 className="text-base font-semibold text-gray-800">Условия сервиса проценки (DBS)</h2>
                  <div className="flex items-center gap-2">
                    {(['Новое', 'Загружено', 'Есть изменения'] as const).map(st => (
                      <button key={st} type="button" onClick={() => setStatusFilter(p => p === st ? 'all' : st)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${statusFilter === st ? 'bg-red-600 border-red-600 text-white font-semibold' : 'bg-white border-gray-200 text-gray-500 hover:border-red-300'}`}>
                        {st}
                      </button>
                    ))}
                    <button type="button" onClick={() => setStatusHint(v => !v)} title="Статусы условий"
                      className={`w-9 h-9 rounded-full border flex items-center justify-center transition-colors ${statusHint ? 'bg-red-600 border-red-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-red-400 hover:text-red-600'}`}>
                      <Info size={16} />
                    </button>
                  </div>
                </div>
                {statusHint && (
                <div className="absolute right-8 top-16 z-30 w-96 max-w-[calc(100%-2rem)] bg-white border border-gray-200 rounded-xl shadow-lg p-4 text-xs text-gray-600 leading-relaxed space-y-2" onClick={e => e.stopPropagation()}>
                    <p><b className="text-red-700">Новое</b> — Условие создано, но ещё не опубликовано на платформе.</p>
                    <p><b className="text-green-700">Загружено</b> — Склад и его условия поставки доступны в проценке на платформе.</p>
                    <p><b className="text-amber-700">Есть изменения</b> — Вы редактировали одно из условий, оно ждёт очереди на загрузку в платформу.</p>
                    <p><b className="text-gray-600">Удаление</b> — Вы отправили запрос на удаление Вашего склада из проценки выбранного города, в течение 48 часов проценка будет удалена навсегда.</p>
                  
                </div>
              )}
                {(() => {
                  const list = data.serviceSearch || [];
                  const filtered = list.filter(c => (statusFilter === 'all' || (c.status || 'Новое') === statusFilter) && (!selectedWh || c.warehouseName === selectedWh) && (!pendingCity || c.city === pendingCity)); // ТЗ v1.23.23: фильтр склад+город
                  if (!filtered.length) return <p className="text-sm font-semibold text-gray-600 text-center py-8 mt-4">Выберите склад и создайте условия для проценки в данном городе.</p>;
                  const cell = (label: string, value: React.ReactNode) => (
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-gray-800 lg:hidden">{label}</p>
                      <div className="text-sm font-medium text-gray-800">{value || '—'}</div>
                    </div>
                  );
                  const TK = 'Условия доставки по согласованию!';
                  return filtered.map(c => {
                    const realIdx = list.indexOf(c);
                    const tkOn = String(c.orderUnloadSchedule || '').includes(TK);
                    const delivText = [c.deliveryTime, String(c.orderUnloadSchedule || '').replace(TK, '').trim()].filter(Boolean).join(' · ');
                    const days = (c.deliverySchedule || '').split(',').map(x => x.trim()).filter(Boolean);
                    return (
                      <div key={realIdx} className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[180px_210px_minmax(220px,1fr)_170px_110px_44px] items-center gap-x-4 gap-y-2 bg-gray-50 rounded-xl px-4 py-3 text-sm mb-2 transition-colors ${(c.status || 'Новое') === 'Удаление' ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-100'}`} onClick={() => { if ((c.status || 'Новое') === 'Удаление') return; setEditingIdx(realIdx); setCondForm(c); setSelectedWh(c.warehouseName || selectedWh); setTkOn(String(c.orderUnloadSchedule || '').includes('Условия доставки по согласованию!')); setEditorOpen(true); }}>
                        {cell('Склад', <div className="flex flex-col"><span>{c.warehouseName}</span><span className="text-[11px] text-gray-800 font-normal">Город: {c.city}</span></div>)}
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-gray-800 lg:hidden">График доставки</p>
                          <div className="flex gap-1">
                            {['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].map(d => (
                              <span key={d} className={`w-6 h-6 text-[10px] flex items-center justify-center rounded-md border ${days.includes(d) ? 'bg-green-600 border-green-600 text-white font-semibold' : 'bg-white border-gray-200 text-gray-800'}`}>{d}</span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-gray-800 lg:hidden">Условия доставки</p>
                          <div className="flex items-center gap-1.5 max-w-[300px]">
                            {tkOn && <span className="w-7 h-7 text-[10px] font-bold flex items-center justify-center rounded-lg bg-yellow-300 border border-yellow-400 text-gray-800">ТК</span>}
                            <span className="text-xs text-gray-600 truncate" title={delivText}>{delivText || '—'}</span>
                          </div>
                        </div>
                        {cell('Представитель', c.representative)}
                        <span className={`self-center justify-self-center text-[11px] font-medium px-2 py-0.5 rounded-full ${(c.status || 'Новое') === 'Загружено' ? 'bg-green-50 text-green-700' : (c.status || 'Новое') === 'Есть изменения' ? 'bg-amber-50 text-amber-700' : (c.status || 'Новое') === 'Удаление' ? 'bg-gray-200 text-gray-600' : 'bg-red-50 text-red-700'}`}>{c.status || 'Новое'}</span>
                        <button
                          onClick={e => { e.stopPropagation(); markDeleted(realIdx); }}
                          disabled={(c.status || 'Новое') === 'Удаление'}
                          className={`ml-auto w-8 h-8 rounded-full flex items-center justify-center transition-colors ${(c.status || 'Новое') === 'Удаление' ? 'bg-gray-100 text-gray-200 cursor-not-allowed' : 'bg-gray-100 text-gray-800 hover:bg-red-600 hover:text-white'}`}
                          title={(c.status || 'Новое') === 'Удаление' ? 'Удаление уже запрошено' : 'Удалить проценку'}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            </>)}
          </div>
        )}

        {/* v1.30.56: окно согласия с офертой — поверх ЛК, появляется при входе и при смене редакции */}
        {/* v1.30.58: единая модалка оферты — согласие (ДА/НЕТ) при новой редакции, режим чтения из кабинета */}
        {(offerGate || offerView) && (() => {
          const oc = offerGate || lkOffer;
          if (!oc) return null;
          const closeOffer = () => { setOfferGate(null); setOfferView(false); setOfferTextOpen(false); };
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/50" onClick={closeOffer} />
              <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 animate-fade-in">
                <h3 className="text-base font-bold text-gray-800">Согласие с публичной офертой</h3>
                <div className="space-y-3">
                  <p className="text-xs text-gray-500">
                    Прочитать оферту:{' '}
                    <button type="button" onClick={() => setOfferTextOpen(v => !v)} title="Открыть текст оферты"
                      className="text-red-600 font-semibold hover:underline">{String(oc.name || 'Договор оферты')}</button>
                  </p>
                  <div className="bg-gray-50 rounded-xl p-3 space-y-1">
                    <p className="text-xs text-gray-500">Редакция: <b className="text-gray-800">{String(oc.edition || '—')}</b></p>
                    <p className="text-xs text-gray-500">Дата публикации: <b className="text-gray-800">{String(oc.publishedAt || '').split('-').reverse().join('.') || '—'}</b></p>
                    <p className="text-xs text-gray-500">Дата вступления в силу: <b className="text-gray-800">{String(oc.effectiveAt || '').split('-').reverse().join('.') || '—'}</b></p>
                  </div>
                </div>
                {offerTextOpen && (
                  <div className="max-h-96 overflow-y-auto bg-white border border-gray-200 rounded-xl p-4 text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">
                    {String(oc.text || '')}
                  </div>
                )}
                {offerGate ? (
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={acceptOffer} className="flex-1 text-sm font-semibold px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors">ДА</button>
                    <button type="button" onClick={declineOffer} className="flex-1 text-sm font-semibold px-4 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">НЕТ</button>
                  </div>
                ) : (
                  <div className="flex justify-end pt-1">
                    <button type="button" onClick={closeOffer} className="text-sm font-semibold px-4 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">Закрыть</button>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
