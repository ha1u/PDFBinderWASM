import './style.css';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

// pdf.jsのワーカーを設定します。Vite環境ではこのように動的importを使うのが一般的です。
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();


// --- 型定義 ---
interface UploadedFile {
  id: string;
  name: string;
  size: number;
  arrayBuffer: ArrayBuffer;
  rotation: 0 | 90 | 180 | 270; // ★★★ 回転角度を保持するプロパティを追加 ★★★
}

// --- DOM要素の取得 ---
const fileInput = document.getElementById('file-input')! as HTMLInputElement;
const uploadContainer = document.getElementById('upload-container')!;
const fileListEl = document.getElementById('file-list')!;
const filenameInput = document.getElementById('filename-input')! as HTMLInputElement;
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
          rotation: 0, // ★★★ rotationを0で初期化 ★★★
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
    
    // ★★★ HTML構造に回転UIを追加 ★★★
    li.innerHTML = `
      <canvas id="thumb-${file.id}" class="thumbnail-canvas" data-index="${index}"></canvas>
      <div class="file-info">
        <span class="file-name">${file.name}</span>
        <span class="file-details">${sizeInKB} KB</span>
      </div>
      <div class="item-actions">
        <div class="rotation-control">
          <button class="rotate-btn" data-index="${index}" title="90度回転">↺</button>
          <span class="rotation-display">${file.rotation}°</span>
        </div>
        <div class="order-controls">
          <button class="arrow-btn up-btn" data-index="${index}" title="上へ">↑</button>
          <button class="arrow-btn down-btn" data-index="${index}" title="下へ">↓</button>
        </div>
        <button class="remove-btn" data-index="${index}" title="削除">&times;</button>
      </div>
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

const generateThumbnail = async (file: UploadedFile) => {
  const canvas = document.getElementById(`thumb-${file.id}`) as HTMLCanvasElement | null;
  if (!canvas) return;
  const context = canvas.getContext('2d')!;
  try {
    const bufferCopy = file.arrayBuffer.slice(0);
    const pdf = await pdfjsLib.getDocument({ data: bufferCopy }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 });
    const scale = canvas.width / viewport.width;
    const scaledViewport = page.getViewport({ scale });
    await page.render({ canvasContext: context, viewport: scaledViewport }).promise;
  } catch (err) {
    console.error('サムネイルの生成に失敗しました:', file.name, err);
    context.fillStyle = '#ccc';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
};

const updateButtonsState = () => {
    mergeButton.disabled = uploadedFiles.length < 2;
    clearButton.disabled = uploadedFiles.length === 0;
};
const updateStatus = (message: string, type: 'processing' | 'success' | 'error') => {
  statusContainer.className = `status-container ${type}`;
  statusContainer.textContent = message;
};
const clearStatus = () => {
  statusContainer.className = 'status-container hidden';
  statusContainer.textContent = '';
};

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
fileInput.addEventListener('change', (e) => handleFiles((e.target as HTMLInputElement).files!));
uploadContainer.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); uploadContainer.classList.add('dragover'); });
uploadContainer.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); uploadContainer.classList.remove('dragover'); });
uploadContainer.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); uploadContainer.classList.remove('dragover'); handleFiles(e.dataTransfer!.files); });

fileListEl.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const indexAttr = target.closest('.file-list-item')?.dataset.index; // 親要素からindexを取得
  if (!indexAttr) return;
  const index = parseInt(indexAttr, 10);
  
  if (target.classList.contains('remove-btn')) {
    uploadedFiles.splice(index, 1);
    renderFileList();
  } else if (target.classList.contains('arrow-btn')) {
    const direction = target.classList.contains('up-btn') ? -1 : 1;
    const newIndex = index + direction;
    if (newIndex >= 0 && newIndex < uploadedFiles.length) {
      [uploadedFiles[index], uploadedFiles[newIndex]] = [uploadedFiles[newIndex], uploadedFiles[index]];
      renderFileList();
    }
  } else if (target.classList.contains('thumbnail-canvas')) {
      showLightbox(index);
  } else if (target.classList.contains('rotate-btn')) { // ★★★ 回転ボタンの処理を追加 ★★★
    const file = uploadedFiles[index];
    file.rotation = ((file.rotation + 90) % 360) as 0 | 90 | 180 | 270;
    renderFileList(); // UIを更新
  }
});

fileListEl.addEventListener('dragstart', (e) => {
    setTimeout(() => (e.target as HTMLElement).classList.add('dragging'), 0);
});
fileListEl.addEventListener('dragend', (e) => {
    const target = e.target as HTMLElement;
    if(target.classList.contains('dragging')) {
      target.classList.remove('dragging');
    }
});
fileListEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    const afterElement = getDragAfterElement(fileListEl, e.clientY);
    const currentDragged = document.querySelector('.dragging');
    if (!currentDragged) return;
    if (afterElement == null) {
        fileListEl.appendChild(currentDragged);
    } else {
        fileListEl.insertBefore(currentDragged, afterElement);
    }
});
fileListEl.addEventListener('drop', () => {
    const newOrder = Array.from(fileListEl.querySelectorAll('.file-list-item')).map(item => uploadedFiles.find(f => f.id === (item as HTMLElement).dataset.id)!);
    uploadedFiles = newOrder;
    renderFileList();
});

function getDragAfterElement(container: HTMLElement, y: number): HTMLElement | null {
    const draggableElements = [...container.querySelectorAll<HTMLElement>('.file-list-item:not(.dragging)')];
    const closest = draggableElements.reduce<{ offset: number; element: HTMLElement | null }>(
        (acc, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > acc.offset) {
                return { offset, element: child };
            } else {
                return acc;
            }
        },
        { offset: Number.NEGATIVE_INFINITY, element: null }
    );
    return closest.element;
}

clearButton.addEventListener('click', () => { 
    uploadedFiles = [];
    fileInput.value = '';
    filenameInput.value = ''; // ファイル名入力欄もクリア
    renderFileList();
    clearStatus();
});

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

      copiedPages.forEach(page => {
        // 保存された回転角度を追加で適用
        const currentRotation = page.getRotation().angle;
        page.setRotation(degrees(currentRotation + file.rotation));
        mergedPdf.addPage(page);
      });
    }
    const mergedPdfBytes = await mergedPdf.save();
    
    let finalFilename: string;
    const userInputFilename = filenameInput.value.trim();

    if (userInputFilename) {
        const sanitizedFilename = userInputFilename.replace(/[<>:"/\\|?*]/g, '_');
        finalFilename = sanitizedFilename.endsWith('.pdf') ? sanitizedFilename : `${sanitizedFilename}.pdf`;
    } else {
        const randomString = Math.random().toString(36).substring(2, 12);
        finalFilename = `merged_${randomString}.pdf`;
    }
    
    downloadPDF(mergedPdfBytes, finalFilename);
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

// 初期状態
updateButtonsState();