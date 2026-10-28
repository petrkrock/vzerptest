/**
 * Отдельное минимальное приложение для публичных роутов (/forms/*, /s/*).
 * Сознательно НЕ импортирует App/store/auth/supabase-клиент: посетитель
 * чужого сайта, где встроена форма, должен скачать только React + саму
 * форму (~в разы меньше полного бандла CRM). Решение о том, какое
 * приложение запускать, принимает src/main.tsx ДО любых импортов.
 */
import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import ErrorBoundary from '@/components/ErrorBoundary';

const PublicFormPage = lazy(() => import('@/pages/forms/PublicFormPage'));
const SupplierServicePage = lazy(() => import('@/pages/supplier-service/SupplierServicePage'));

const fallback = (
  <div className="min-h-screen bg-[#f5f5f5] flex items-start justify-center p-6">
    <div className="w-full max-w-lg bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col items-center gap-4 py-16">
      <div className="w-11 h-11 rounded-full border-4 border-red-100 border-t-red-600 animate-spin" aria-hidden="true" />
      <p className="text-sm text-gray-500">Загрузка…</p>
    </div>
  </div>
);

export default function PublicApp() {
  return (
    <ErrorBoundary>
      <Suspense fallback={fallback}>
        <Routes>
          <Route path="/forms/:entityType" element={<PublicFormPage />} />
          <Route path="/s/:token" element={<SupplierServicePage />} />
          <Route path="*" element={<PublicFormPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
