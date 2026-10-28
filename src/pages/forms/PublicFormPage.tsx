import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
// v1.33.1: форма переключена на диспетчер (own → наш /forms, иначе edge function).
// v1.34.0: Supabase вырезан — public-form живёт в нашем API.
import { API_URL } from '@/lib/api';
import { Loader2, AlertCircle, Send, ArrowLeft, ArrowRight } from 'lucide-react';

type EntityType = 'supplier' | 'buyer' | 'ticket';

interface PublicField {
  key: string;
  label: string;
  inputType: 'text' | 'textarea' | 'tel' | 'email' | 'number' | 'select' | 'multiselect';
  required: boolean;
  defaultValue?: string | number; // ТЗ v1.22.31: предзаполнение (торговые точки = 1)
  options?: string[];
}

interface PublicFormConsent {
  label: string;
  documentUrl: string;
  documentLabel: string;
}

interface PublicFormConfig {
  enabled: boolean;
  title: string;
  description?: string;
  successMessage: string;
  errorMessage: string;
  fields: PublicField[];
  consent?: PublicFormConsent; // обязательная галочка ПДн (есть всегда, нет только у старых конфигов)
}

/**
 * Public, unauthenticated form page — this is what actually renders inside
 * the <iframe> that embed.js injects into a third-party site. No CRM
 * login, no sidebar/header, no access to the local CRM data cache: it
 * talks directly to the public-form Edge Function (see
 * supabase/functions/public-form/index.ts), which is the only thing that
 * can see the form's configuration and accept a submission.
 *
 * Reports its rendered height to the parent window via postMessage so
 * embed.js can size the iframe to fit — see the ResizeObserver below.
 *
 * Design: белая карточка-«рамка» (border + скругление + тень) на фоне
 * #f5f5f5 — фон виден снаружи рамки и на ПК, и на мобильных.
 */
export default function PublicFormPage() {
  const { entityType } = useParams<{ entityType: string }>();
  const type = (entityType || '') as EntityType;
  const isValidType = type === 'supplier' || type === 'buyer' || type === 'ticket';

  const [config, setConfig] = useState<PublicFormConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [values, setValues] = useState<Record<string, string | string[]>>({});
  const [honeypot, setHoneypot] = useState('');
  const [consentGiven, setConsentGiven] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [step, setStep] = useState(1); // ТЗ v1.22.34: пошаговый мастер (поставщик/покупатель)
  const [stepError, setStepError] = useState('');
  const renderedAtRef = useRef(Date.now());
  const wrapperRef = useRef<HTMLDivElement>(null);

  // ТЗ v1.22.34: формы поставщика/покупателя делим на два равных шага
  const isWizard = type === 'supplier' || type === 'buyer';
  const halfIdx = config && isWizard ? Math.ceil(config.fields.length / 2) : 0;
  const stepFields = !config
    ? []
    : (isWizard ? (step === 1 ? config.fields.slice(0, halfIdx) : config.fields.slice(halfIdx)) : config.fields);

  useEffect(() => {
    if (!isValidType) { setLoading(false); setLoadError(true); return; }
    fetch(`${`${API_URL}/forms`}?type=${type}`, { headers: { 'Content-Type': 'application/json' } })
      .then(res => res.json())
      .then(data => {
        if (data.error) { setLoadError(true); return; }
        setConfig(data);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [type, isValidType]);

  // Report height to the parent page so embed.js can resize the iframe —
  // otherwise the host site would need to guess a fixed height up front.
  useEffect(() => {
    if (!wrapperRef.current) return;
    const el = wrapperRef.current;
    const report = () => window.parent?.postMessage({ source: 'vz-crm-form', height: el.offsetHeight }, '*');
    const observer = new ResizeObserver(report);
    observer.observe(el);
    report();
    return () => observer.disconnect();
  }, [config, submitted, loading]);

  function setValue(key: string, value: string | string[]) {
    setValues(v => ({ ...v, [key]: value }));
  }

  // ТЗ v1.22.34: переход на шаг 2 с проверкой обязательных полей текущего шага
  const isEmptyVal = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
  const goNext = () => {
    const missing = stepFields.filter(f => f.required && isEmptyVal(values[f.key]));
    if (missing.length) {
      setStepError(`Заполните обязательные поля: ${missing.map(f => f.label).join(', ')}`);
      return;
    }
    setStepError('');
    setStep(2);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;
    setSubmitError('');
    // Согласие на обработку ПДн — обязательное условие отправки
    if (!consentGiven) {
      setSubmitError('Для отправки формы необходимо согласие на обработку персональных данных');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/forms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, values, consent: consentGiven, honeypot, renderedAt: renderedAtRef.current }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setSubmitError(data.error || config.errorMessage);
        return;
      }
      setSubmitted(true);
    } catch {
      setSubmitError(config.errorMessage);
    } finally {
      setSubmitting(false);
    }
  }

  const fieldClass =
    'w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2 text-sm text-gray-900 placeholder-gray-400 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-400 hover:border-gray-300';

  return (
    <div
      className="min-h-screen bg-[#f5f5f5] flex items-start justify-center p-2 sm:p-3"
      style={{ fontFamily: "'Inter', -apple-system, sans-serif" }}
    >
      <div ref={wrapperRef} className="w-full max-w-lg">
        {loading && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col items-center justify-center gap-2 py-8 px-4">
            {/* Красный круговой индикатор загрузки */}
            <div className="w-11 h-11 rounded-full border-4 border-red-100 border-t-red-600 animate-spin" aria-hidden="true" />
            <p className="text-sm text-gray-500 text-center">Подождите пожалуйста, форма загружается…</p>
          </div>
        )}

        {!loading && (loadError || !isValidType) && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col items-center text-center py-8 gap-2">
            <AlertCircle className="text-gray-300" size={34} />
            <p className="text-sm text-gray-400">Форма недоступна</p>
          </div>
        )}

        {!loading && !loadError && config && !config.enabled && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col items-center text-center py-8 gap-2">
            <AlertCircle className="text-gray-300" size={34} />
            <p className="text-sm text-gray-400">Эта форма сейчас отключена</p>
          </div>
        )}

        {!loading && !loadError && config && config.enabled && submitted && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col items-center text-center py-10 px-4 gap-2 animate-fade-in">
            {/* ТЗ v1.22.36: однотонный минималистичный «салют» вместо статичного круга */}
            <div className="salute" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
            <p className="text-sm text-gray-700 leading-relaxed max-w-sm whitespace-pre-line">{config.successMessage}</p>
          </div>
        )}

        {!loading && !loadError && config && config.enabled && !submitted && (
          <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 sm:p-5 space-y-2">
            {isWizard && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Шаг {step} из 2</span>
                <div className="flex gap-1">
                  {[1, 2].map(s => <span key={s} className={`h-1.5 w-6 rounded-full ${s <= step ? 'bg-red-600' : 'bg-gray-200'}`} />)}
                </div>
              </div>
            )}
            {/* Заголовок с красным акцентом */}
            <div className="pb-2.5 border-b border-gray-100">
              <div className="w-8 h-1 rounded-full bg-red-600 mb-2" />
              <h1 className="text-lg font-bold text-gray-900">{config.title}</h1>
              {config.description && <p className="text-sm text-gray-500 mt-1 leading-snug">{config.description}</p>}
            </div>

            {stepFields.map(field => (
              <div key={field.key}>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                  {field.label}{field.required && <span className="text-red-500 normal-case"> *</span>}
                </label>
                {field.inputType === 'textarea' ? (
                  <textarea
                    required={field.required}
                    rows={2}
                    className={fieldClass}
                    value={(values[field.key] !== undefined ? (values[field.key] as string) : String(field.defaultValue ?? ''))}
                    onChange={e => setValue(field.key, e.target.value)}
                  />
                ) : field.inputType === 'select' ? (
                  <select
                    required={field.required}
                    className={fieldClass}
                    value={(values[field.key] !== undefined ? (values[field.key] as string) : String(field.defaultValue ?? ''))}
                    onChange={e => setValue(field.key, e.target.value)}
                  >
                    <option value="">Выберите...</option>
                    {(field.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                ) : field.inputType === 'multiselect' ? (
                  <div className="flex flex-wrap gap-2">
                    {(field.options || []).map(opt => {
                      const selected = ((values[field.key] as string[]) || []).includes(opt);
                      return (
                        <button
                          type="button"
                          key={opt}
                          onClick={() => {
                            const current = (values[field.key] as string[]) || [];
                            setValue(field.key, selected ? current.filter(o => o !== opt) : [...current, opt]);
                          }}
                          className={`text-xs px-3 py-1.5 rounded-full border transition-all duration-150 ${
                            selected
                              ? 'bg-red-50 border-red-300 text-red-700 font-medium'
                              : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <input
                    type={field.inputType === 'number' ? 'number' : field.inputType}
                    required={field.required}
                    className={fieldClass}
                    value={(values[field.key] !== undefined ? (values[field.key] as string) : String(field.defaultValue ?? ''))}
                    onChange={e => setValue(field.key, e.target.value)}
                  />
                )}
              </div>
            ))}

            {/* Honeypot — real users never see or fill this; a bot filling
                every input on the page will. Positioned off-screen rather
                than display:none, since some bots skip hidden fields. */}
            <div style={{ position: 'absolute', left: '-9999px', top: 0 }} aria-hidden="true">
              <label htmlFor="vz-website">Сайт</label>
              <input id="vz-website" type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={e => setHoneypot(e.target.value)} />
            </div>

            {/* Согласие на обработку персональных данных — обязательная галочка */}
            {(!isWizard || step === 2) && (
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5">
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  required
                  checked={consentGiven}
                  onChange={e => setConsentGiven(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 flex-shrink-0"
                />
                <span className="text-xs text-gray-500 leading-relaxed">
                  {(config.consent?.label || 'Я согласен на обработку персональных данных')}
                  {config.consent?.documentUrl && (
                    <> — <a href={config.consent.documentUrl} target="_blank" rel="noopener noreferrer" className="text-red-600 hover:underline">{config.consent.documentLabel || 'документ'}</a></>
                  )}
                  <span className="text-red-500"> *</span>
                </span>
              </label>
            </div>
            )}

            {stepError && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">{stepError}</p>}

            {isWizard && step === 1 && (
              <button
                type="button"
                onClick={goNext}
                className="w-full bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold text-sm rounded-xl py-2 px-4 transition-colors duration-150 flex items-center justify-center gap-2"
              >
                Далее <ArrowRight size={15} />
              </button>
            )}
            {isWizard && step === 2 && (
              <button
                type="button"
                onClick={() => { setStep(1); setStepError(''); }}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold text-sm rounded-xl py-2 px-4 transition-colors duration-150 flex items-center justify-center gap-2"
              >
                <ArrowLeft size={15} /> Назад
              </button>
            )}
            {(!isWizard || step === 2) && (
              <>
                {submitError && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">{submitError}</p>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold text-sm rounded-xl py-2 px-4 transition-colors duration-150 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <><Loader2 className="animate-spin" size={16} /> Отправка...</>
                  ) : (
                    <><Send size={15} /> Отправить</>
                  )}
                </button>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
