(async () => {
const $ = id => document.getElementById(id);
const base = new URL('vendor/pdfjs/', location.href).href;
let library, documentPdf, loadingTask, current = 1, revision = 0, opening = 0;
let zoom = 100;
$('mode').value = window.matchMedia('(max-width: 767px) and (pointer: coarse)').matches ? 'single' : 'spread';
const status = message => { $('status').textContent = message; };
function first(page) {
  if ($('mode').value === 'single') return page;
  if ($('cover').checked) return page === 1 ? 1 : page - (page % 2);
  return page - ((page - 1) % 2);
}
function pages() {
  if (!documentPdf) return [];
  const start = first(current);
  return $('mode').value === 'single' || ($('cover').checked && start === 1) || start === documentPdf.numPages ? [start] : [start, start + 1];
}
function controls() {
  const visible = pages();
  $('zoom-out').disabled = zoom <= 50;
  $('zoom-in').disabled = zoom >= 300;
  $('cover').disabled = $('mode').value !== 'spread';
  $('position').disabled = !documentPdf;
  $('previous').disabled = !documentPdf || first(current) === 1;
  $('next').disabled = !documentPdf || visible.at(-1) === documentPdf.numPages;
  if (!documentPdf) return;
  $('position').max = documentPdf.numPages;
  $('position').value = current;
  const label = `${visible.join('–')} / ${documentPdf.numPages}`;
  $('count').textContent = label;
  $('position').setAttribute('aria-valuetext', label + ' ページ');
}
async function render() {
  const token = ++revision;
  controls();
  if (!documentPdf) return;
  const pdf = documentPdf;
  const visible = pages();
  $('stage').setAttribute('aria-busy', 'true');
  try {
    const width = Math.max(80, ($('stage').clientWidth - 32 - (visible.length - 1) * 8) / visible.length);
    const height = Math.max(80, $('stage').clientHeight - 32);
    const canvases = await Promise.all(visible.map(async number => {
      const page = await pdf.getPage(number);
      if (token !== revision) return null;
      const normal = page.getViewport({ scale: 1 });
      const scale = Math.min(width / normal.width, height / normal.height) * zoom / 100;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: scale * ratio });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      canvas.style.width = `${viewport.width / ratio}px`;
      canvas.style.height = `${viewport.height / ratio}px`;
      canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `${number}ページ`);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      return canvas;
    }));
    if (token !== revision) return;
    $('pages').replaceChildren(...canvases);
    status('');
  } catch (error) {
    if (token === revision) status('ページを表示できませんでした。別のページへ移動するか、PDFを開き直してください。');
  } finally {
    if (token === revision) $('stage').setAttribute('aria-busy', 'false');
  }
}
function go(page) {
  if (!documentPdf) return;
  current = first(Math.max(1, Math.min(documentPdf.numPages, page)));
  render();
}
function next() { if (documentPdf) go(pages().at(-1) + 1); }
function previous() { go(first(current) - 1); }
async function openPdf(source, title) {
  const token = ++opening;
  ++revision;
  const previousTask = loadingTask;
  loadingTask = null; documentPdf = null;
  controls(); $('pages').replaceChildren(); $('stage').setAttribute('aria-busy', 'false');
  status('PDFを読み込んでいます…');
  try {
    if (previousTask) await previousTask.destroy();
    library ||= import(base + 'build/pdf.mjs').catch(cause => {
      library = null;
      const error = new Error('PDF表示用ファイル vendor/pdfjs/build/pdf.mjs を読み込めません。vendorフォルダー全体を公開先へ配置してください。');
      error.name = 'PDFLibraryError'; error.cause = cause; throw error;
    });
    const pdfjs = await library;
    if (token !== opening) return;
    pdfjs.GlobalWorkerOptions.workerSrc = base + 'build/pdf.worker.mjs';
    loadingTask = pdfjs.getDocument({ ...source, cMapUrl: base + 'cmaps/', cMapPacked: true, standardFontDataUrl: base + 'standard_fonts/' });
    const pdf = await loadingTask.promise;
    if (token !== opening) return;
    documentPdf = pdf; current = 1; zoom = 100; $('zoom').value = zoom; $('title').textContent = title;
    await render();
  } catch (error) {
    if (token === opening) {
      console.error('PDF loading failed:', error);
      const reason = error.name === 'PDFLibraryError' ? error.message : /worker/i.test(error.message || '') ? 'PDF処理用ファイルを読み込めません。vendor/pdfjs/build/pdf.worker.mjs が公開されているか確認してください。' : error.name === 'PasswordException' ? 'パスワード付きPDFは解除してから開いてください。' : error.name === 'MissingPDFException' ? 'PDFファイルが見つかりません。pdfフォルダー内のPDFも公開先へ配置してください。' : error.name === 'InvalidPDFException' ? 'PDFファイルの形式を確認してください。' : 'PDFまたは表示用ファイルを読み込めませんでした。';
      status('PDFを開けませんでした。' + reason);
    }
  }
}
function setZoom(value) {
  const number = Number(value);
  zoom = Number.isFinite(number) ? Math.max(50, Math.min(300, Math.round(number))) : 100;
  $('zoom').value = zoom;
  $('zoom-out').disabled = zoom <= 50;
  $('zoom-in').disabled = zoom >= 300;
  render();
}
$('zoom').addEventListener('change', () => setZoom($('zoom').value || 100));
$('zoom-out').addEventListener('click', () => setZoom(zoom - 10));
$('zoom-in').addEventListener('click', () => setZoom(zoom + 10));
$('zoom-reset').addEventListener('click', () => setZoom(100));
let touchTimer;
function showTouchControls() {
  document.body.classList.add('touch-controls');
  clearTimeout(touchTimer);
  touchTimer = setTimeout(() => document.body.classList.remove('touch-controls'), 4000);
}
document.addEventListener('pointermove', event => {
  if (event.pointerType === 'touch') return;
  const topHeight = document.querySelector('.reader-top').getBoundingClientRect().bottom;
  document.body.classList.toggle('near-top', event.clientY <= Math.max(64, topHeight + 20));
  document.body.classList.toggle('near-bottom', event.clientY >= window.innerHeight - 160);
  document.body.classList.toggle('near-left', event.clientX <= 90);
  document.body.classList.toggle('near-right', event.clientX >= window.innerWidth - 90);
});
document.addEventListener('pointerleave', () => {
  document.body.classList.remove('near-top', 'near-bottom', 'near-left', 'near-right');
});
$('stage').addEventListener('pointerup', event => {
  if (event.pointerType !== 'touch') return;
  if (document.body.classList.contains('touch-controls')) {
    document.body.classList.remove('touch-controls'); clearTimeout(touchTimer);
  } else showTouchControls();
});
document.querySelectorAll('.reader-top, .page-controls, .edge-zone').forEach(panel => {
  panel.addEventListener('pointerdown', event => { if (event.pointerType === 'touch') showTouchControls(); });
});
// One page turn per wheel gesture; ignore momentum until the gesture ends.
let wheelTotal = 0, wheelDirection = 0, wheelLocked = false, wheelIdleTimer;
$('stage').addEventListener('wheel', event => {
  if (!documentPdf || event.ctrlKey || event.metaKey || event.shiftKey) return;
  event.preventDefault();
  clearTimeout(wheelIdleTimer);
  wheelIdleTimer = setTimeout(() => {
    wheelTotal = 0; wheelDirection = 0; wheelLocked = false;
  }, 220);
  if (wheelLocked) return;
  const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : -event.deltaX;
  const direction = Math.sign(delta);
  if (!direction) return;
  if (direction !== wheelDirection) wheelTotal = 0;
  wheelDirection = direction;
  const pixels = Math.abs(delta) * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? $('stage').clientHeight : 1);
  wheelTotal += pixels;
  if (wheelTotal < 40) return;
  wheelLocked = true;
  if (direction > 0) next(); else previous();
}, { passive: false });
$('next').addEventListener('click', next);
$('previous').addEventListener('click', previous);
for (const id of ['mode', 'cover']) $(id).addEventListener('change', () => go(current));
let frame;
$('position').addEventListener('input', () => {
  const page = Number($('position').value);
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => go(page));
});
$('file').addEventListener('change', async () => {
  const file = $('file').files[0];
  if (!file) return;
  $('books').value = '';
  try {
    await openPdf({ data: new Uint8Array(await file.arrayBuffer()) }, file.name.replace(/\.pdf$/i, ''));
  } catch (error) {
    console.error('Local PDF read failed:', error);
    status('選択したファイルを読み取れませんでした。ファイルを選び直してください。');
  } finally { $('file').value = ''; }
});
$('books').addEventListener('change', () => {
  if ($('books').value) openPdf({ url: $('books').value }, $('books').selectedOptions[0].textContent);
});
document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName) || event.target.isContentEditable || !documentPdf) return;
  if (['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'].includes(event.key)) {
    event.preventDefault();
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next(); else previous();
  }
});
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 150); });
controls();
if (location.protocol === 'file:') {
  status('この画面を直接開くとブラウザーの制限でPDFを読み込めません。サイトのURL、または「サイトを確認.cmd」で起動したURLから開いてください。');
} else try {
  const response = await fetch('pdf/catalog.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error('pdf/catalog.json を取得できません（HTTP ' + response.status + '）。pdfフォルダー全体を公開先へ配置してください。');
  let books;
  try { books = await response.json(); }
  catch { throw new Error('pdf/catalog.json が正しいJSONではありません。ファイルの内容を確認してください。'); }
  if (!Array.isArray(books) || books.some(book => !book || typeof book.title !== 'string' || typeof book.file !== 'string')) throw new Error('pdf/catalog.json の作品名・PDFパスの形式を確認してください。');
  for (const book of books) {
    const url = new URL(book.file, location.href);
    if (url.origin !== location.origin || !url.pathname.toLowerCase().endsWith('.pdf')) continue;
    const option = document.createElement('option'); option.value = url.href; option.textContent = book.title;
    $('books').append(option);
  }
  const requestedBook = new URLSearchParams(location.search).get('book');
  const selected = books.find(book => book.file === requestedBook) || books[0];
  if (selected) {
    const url = new URL(selected.file, location.href);
    if ([...$('books').options].some(option => option.value === url.href)) {
      $('books').value = url.href;
      await openPdf({ url: url.href }, selected.title);
    }
  }
  if (!books.length) $('books').selectedOptions[0].textContent = '公開PDFは準備中';
} catch (error) {
  console.error('PDF catalog failed:', error);
  status('公開作品一覧を読み込めませんでした。' + (error.message || 'pdf/catalog.json の配置を確認してください。'));
}

})();
