import './style.css';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();


// --- 型定義 ---
interface UploadedFile {
  id: string;
  name: string;
  size: number;
  arrayBuffer: ArrayBuffer;
}

// --- DOM要素の取得 ---
const fileInput = document.getElementById('file-input')! as HTMLInputElement;
const uploadContainer = document.getElementById('upload-container')!;
const fileListEl = document.getElementById('file-list')!;
const mergeButton = document.getElementById('merge-button')! as HTMLButtonElement;
const clearButton = document.getElementById('clear-button')! as HTMLButtonElement;
const statusContainer = document.getElementById('status-container')!;
// Lightbox elements
const lightboxModal = document.getElementById('lightbox-modal')!;
const lightboxCanvas = document.getElementById('lightbox-canvas')! as HTMLCanvasElement;
const lightboxCaption = document.getElementById('lightbox-caption')!;
const lightboxClose = document.querySelector('.lightbox-close')! as HTMLElement;
const lightboxPrev = document.querySelector('.lightbox-nav.prev')! as HTMLElement;
const lightboxNext = document.querySelector('.lightbox-nav.next')! as HTMLElement;


// --- 状態管理 ---
let uploadedFiles: UploadedFile[] = [];
let currentLightboxIndex = -1;


// --- ファイル処理 ---
const handleFiles = (files: FileList) => {
  for (const file of files) {
    if (file.type !== 'application/pdf' || uploadedFiles.some(f => f.name === file.name)) {
      continue;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      if (arrayBuffer) {
        uploadedFiles.push({
          id: crypto.randomUUID(), name: file.name, size: file.size, arrayBuffer,
        });
        renderFileList();
      }
    };
    reader.readAsArrayBuffer(file);
  }
};

// --- UI更新 ---
const renderFileList = () => {
  fileListEl.innerHTML = '';
  uploadedFiles.forEach((file, index) => {
    const li = document.createElement('li');
    li.className = 'file-list-item';
    li.dataset.id = file.id;
    li.dataset.index = String(index);
    li.draggable = true;
    const sizeInKB = (file.size / 1024).toFixed(1);
    li.innerHTML = `
      <canvas id="thumb-${file.id}" class="thumbnail-canvas" data-index="${index}"></canvas>
      <div class="file-info">
        <span class="file-name">${file.name}</span>
        <span class="file-details">${sizeInKB} KB</span>
      </div>
      <div class="order-controls">
        <button class="arrow-btn up-btn" data-index="${index}" title="上へ">↑</button>
        <button class="arrow-btn down-btn" data-index="${index}" title="下へ">↓</button>
      </div>
      <button class="remove-btn" data-index="${index}" title="削除">&times;</button>
    `;
    fileListEl.appendChild(li);
    generateThumbnail(file);
    const upBtn = li.querySelector('.up-btn')! as HTMLButtonElement;
    const downBtn = li.querySelector('.down-btn')! as HTMLButtonElement;
    if (index === 0) upBtn.disabled = true;
    if (index === uploadedFiles.length - 1) downBtn.disabled = true;
  });
  updateButtonsState();
};

const generateThumbnail = async (file: UploadedFile) => { /* ... (変更なし) ... */ };
const updateButtonsState = () => { /* ... (変更なし) ... */ };
const updateStatus = (message: string, type: 'processing' | 'success' | 'error') => { /* ... (変更なし) ... */ };
const clearStatus = () => { /* ... (変更なし) ... */ };

// --- Lightbox (拡大表示) 機能 ---
const showLightbox = (index: number) => {
    if (index < 0 || index >= uploadedFiles.length) return;
    currentLightboxIndex = index;
    lightboxModal.classList.remove('hidden');
    renderLargePreview(uploadedFiles[index]);
};

const hideLightbox = () => {
    lightboxModal.classList.add('hidden');
};

const renderLargePreview = async (file: UploadedFile) => {
    lightboxCaption.textContent = '読み込み中...';
    const context = lightboxCanvas.getContext('2d')!;
    context.clearRect(0, 0, lightboxCanvas.width, lightboxCanvas.height);
    try {
        const bufferCopy = file.arrayBuffer.slice(0);
        const pdf = await pdfjsLib.getDocument({ data: bufferCopy }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.5 }); // 高解像度で表示

        lightboxCanvas.height = viewport.height;
        lightboxCanvas.width = viewport.width;
        await page.render({ canvasContext: context, viewport }).promise;
        lightboxCaption.textContent = `${file.name} (${currentLightboxIndex + 1} / ${uploadedFiles.length})`;
    } catch(err) {
        console.error("拡大プレビューの生成に失敗:", err);
        lightboxCaption.textContent = "プレビューの表示に失敗しました";
    }
};

const showNextImage = () => showLightbox((currentLightboxIndex + 1) % uploadedFiles.length);
const showPrevImage = () => showLightbox((currentLightboxIndex - 1 + uploadedFiles.length) % uploadedFiles.length);


// --- イベントリスナー ---
uploadContainer.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => handleFiles((e.target as HTMLInputElement).files!));
// ... (ドラッグイベントリスナーは変更なし) ...

fileListEl.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const indexAttr = target.dataset.index;
  if (!indexAttr) return;
  const index = parseInt(indexAttr, 10);
  
  if (target.classList.contains('remove-btn')) { /* ... (変更なし) ... */ }
  else if (target.classList.contains('arrow-btn')) { /* ... (変更なし) ... */ }
  else if (target.classList.contains('thumbnail-canvas')) { // サムネイルクリック
      showLightbox(index);
  }
});

// ... (他のイベントリスナーは変更なし) ...

// Lightboxイベントリスナー
lightboxClose.addEventListener('click', hideLightbox);
lightboxModal.addEventListener('click', (e) => { if (e.target === lightboxModal) hideLightbox(); });
lightboxNext.addEventListener('click', showNextImage);
lightboxPrev.addEventListener('click', showPrevImage);
document.addEventListener('keydown', (e) => {
    if (lightboxModal.classList.contains('hidden')) return;
    if (e.key === 'Escape') hideLightbox();
    if (e.key === 'ArrowRight') showNextImage();
    if (e.key === 'ArrowLeft') showPrevImage();
});


// ★★★ ファイル名生成ロジックを修正 ★★★
mergeButton.addEventListener('click', async () => {
  if (uploadedFiles.length < 2) return;
  updateStatus("結合処理中...", "processing");
  mergeButton.disabled = true;
  clearButton.disabled = true;
  try {
    const mergedPdf = await PDFDocument.create();
    for (const file of uploadedFiles) {
      const bufferCopy = file.arrayBuffer.slice(0);
      const pdf = await PDFDocument.load(bufferCopy);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }
    const mergedPdfBytes = await mergedPdf.save();
    
    // ランダムな10文字の英数字を生成
    const randomString = Math.random().toString(36).substring(2, 12);
    downloadPDF(mergedPdfBytes, `merged_${randomString}.pdf`);

    updateStatus("PDFの結合が完了しました！", "success");
  } catch (error) {
    console.error("PDFの結合に失敗しました:", error);
    updateStatus(`エラー: 結合に失敗しました。PDFファイルが破損しているか、パスワードで保護されている可能性があります。`, "error");
  } finally {
    updateButtonsState();
  }
});

const downloadPDF = (bytes: Uint8Array, filename: string) => {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};

// 初期状態
updateButtonsState();