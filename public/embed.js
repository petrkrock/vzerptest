/**
 * ВсемЗапчасти ERP — публичная форма, скрипт для вставки на сторонний сайт.
 *
 * Использование (код выдаётся в Настройки → Формы):
 *   <script src="https://ваш-crm-домен/embed.js"
 *           data-vz-form="supplier"
 *           data-vz-base="https://ваш-crm-домен"></script>
 *
 * Ничего, кроме вставки iframe и авто-подгонки его высоты под контент,
 * этот файл не делает — вся логика формы (поля, отправка, сообщения)
 * находится внутри самого CRM-приложения (см. src/pages/forms/PublicFormPage.tsx),
 * загружаемого внутри iframe. Это специально: обновление формы (поля,
 * тексты) в Настройках CRM применяется сразу на всех сайтах, где вставлен
 * этот код, без переустановки скрипта.
 */
(function () {
  var currentScript = document.currentScript;
  if (!currentScript) return;

  var formType = currentScript.getAttribute('data-vz-form');
  var base = currentScript.getAttribute('data-vz-base');
  if (!formType || !base) {
    console.error('[vz-crm-form] Не заданы data-vz-form / data-vz-base');
    return;
  }
  base = base.replace(/\/$/, '');

  var iframe = document.createElement('iframe');
  iframe.src = base + '/forms/' + formType;
  iframe.style.width = '100%';
  iframe.style.border = 'none';
  iframe.style.minHeight = '200px';
  iframe.style.display = 'block';
  iframe.setAttribute('title', 'Форма');
  iframe.setAttribute('scrolling', 'no');

  currentScript.parentNode.insertBefore(iframe, currentScript);

  // Auto-resize: PublicFormPage.tsx reports its rendered height via
  // postMessage whenever it changes (new fields shown, validation error,
  // success message, etc.) — this listens and applies it, so the host
  // page never needs a fixed/guessed height or a scrollbar.
  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || data.source !== 'vz-crm-form' || typeof data.height !== 'number') return;
    // Only react to messages from THIS embed's iframe, in case a page
    // embeds more than one form.
    if (event.source !== iframe.contentWindow) return;
    iframe.style.height = data.height + 'px';
  });
})();
