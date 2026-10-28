import { useNavigate } from 'react-router-dom';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-brand-gray flex items-center justify-center p-4">
      <div className="text-center">
        <p className="text-8xl font-black text-brand-red mb-4">404</p>
        <h1 className="text-2xl font-bold text-brand-black mb-2">Страница не найдена</h1>
        <p className="text-gray-500 mb-6">Запрашиваемый раздел CRM не существует</p>
        <button onClick={() => navigate('/dashboard')} className="btn-primary">На главную</button>
      </div>
    </div>
  );
}
