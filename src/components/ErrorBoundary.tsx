import { Component, type ReactNode } from 'react';

/** Глобальный перехват ошибок рендера: вместо белого экрана — текст ошибки
 *  и кнопка перезагрузки. Детали дублируются в консоль для разработчика. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[ErrorBoundary] Ошибка рендера:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-brand-gray">
          <div className="card-base p-6 max-w-lg w-full">
            <h2 className="text-lg font-bold mb-1">Что-то пошло не так</h2>
            <p className="text-xs text-gray-500 mb-3">Покажите этот текст разработчику — он объяснит, что случилось:</p>
            <pre className="text-[11px] bg-gray-900 text-green-300 p-3 rounded-lg overflow-auto max-h-48 whitespace-pre-wrap">
              {String(this.state.error?.message || this.state.error)}
            </pre>
            <button
              className="btn-primary mt-4 w-full"
              onClick={() => {
                // Восстановление: сброс состояния приложения и перезагрузка
                sessionStorage.clear();
                window.location.reload();
              }}
            >
              Перезагрузить приложение
            </button>
            <p className="text-[10px] text-gray-400 mt-2 text-center">Если ошибка повторяется — очистите кэш сайта (Ctrl+Shift+Delete) или откройте в режиме инкогнито.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
