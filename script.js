document.addEventListener('DOMContentLoaded', () => {
    // --- pdf.jsのワーカー設定 ---
    // pdf.jsライブラリがワーカーファイルを読み込む場所を指定します。
    // 今回はCDNのパスを直接指定します。
    if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.102/pdf.worker.min.js`;
    }

    // --- WASMの初期化 ---
    const go = new Go();
    const uploadContainer = document.getElementById('upload-container');
    const fileInput = document.getElementById('file-input');
    const uploadLabelText = document.getElementById('upload-label-text');
    const originalLabelText = uploadLabelText.innerHTML;

    // UIを初期状態で無効化
    fileInput.disabled = true;
    uploadContainer.style.cursor = 'wait';
    uploadLabelText.innerHTML = "<strong>アプリケーションを読み込み中...</strong>";

    WebAssembly.instantiateStreaming(fetch('main.wasm'), go.importObject).then((result) => {
        go.run(result.instance);
        console.log("WASM PDF Binder Initialized (JS)");

        // 初期化成功後にUIを有効化
        fileInput.disabled = false;
        uploadContainer.style.cursor = 'pointer';
        uploadLabelText.innerHTML = originalLabelText;
        updateButtonsState();

    }).catch(err => {
        console.error("WASM initialization failed:", err);
        uploadContainer.style.cursor = 'default';
        uploadLabelText.innerHTML = "<strong>読み込みに失敗しました</strong>";
        updateStatus("アプリケーションの読み込みに失敗しました。ページを再読み込みしてください。", "error");
    });
    
    // --- DOM要素の取得 ---
    const fileList = document.getElementById('file-list');
    const mergeButton = document.getElementById('merge-button');
    const clearButton = document.getElementById('clear-button');
    const statusContainer = document.getElementById('status-container');
    
    // --- ファイル管理 ---
    let uploadedFiles = []; // { name, size, data(base64), arrayBuffer }

    const handleFiles = (files) => {
        for (const file of files) {
            if (file.type !== 'application/pdf' || uploadedFiles.some(f => f.name === file.name)) {
                continue;
            }
            
            const readerBase64 = new FileReader();
            const readerBuffer = new FileReader();

            // Base64エンコードされたデータをGoに渡すために読み込む
            readerBase64.onload = (e) => {
                const base64Data = e.target.result.split(',')[1];
                const fileObject = {
                    id: crypto.randomUUID(), // 各ファイルを一意に識別
                    name: file.name,
                    size: file.size,
                    data: base64Data,
                    arrayBuffer: null // 後で設定
                };

                // ArrayBufferをサムネイル生成のために読み込む
                readerBuffer.onload = (e_buffer) => {
                    fileObject.arrayBuffer = e_buffer.target.result;
                    uploadedFiles.push(fileObject);
                    renderFileList();
                };
                readerBuffer.readAsArrayBuffer(file);
            };
            readerBase64.readAsDataURL(file);
        }
    };

    // --- UI更新 ---
    const renderFileList = async () => {
        fileList.innerHTML = '';
        uploadedFiles.forEach((file, index) => {
            const li = document.createElement('li');
            li.className = 'file-list-item';
            li.dataset.id = file.id;
            li.draggable = true;

            const sizeInKB = (file.size / 1024).toFixed(1);

            li.innerHTML = `
                <canvas id="thumb-${file.id}" class="thumbnail-canvas"></canvas>
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
            fileList.appendChild(li);

            // サムネイル生成
            generateThumbnail(file);

            // 矢印ボタンの有効/無効化
            if (index === 0) li.querySelector('.up-btn').disabled = true;
            if (index === uploadedFiles.length - 1) li.querySelector('.down-btn').disabled = true;
        });
        updateButtonsState();
    };

    const generateThumbnail = async (file) => {
        if (!file.arrayBuffer || !window.pdfjsLib) return;

        const canvas = document.getElementById(`thumb-${file.id}`);
        const context = canvas.getContext('2d');

        try {
            const loadingTask = pdfjsLib.getDocument({ data: file.arrayBuffer });
            const pdf = await loadingTask.promise;
            const page = await pdf.getPage(1); // 1ページ目を取得

            const viewport = page.getViewport({ scale: 1 });
            const scale = canvas.width / viewport.width;
            const scaledViewport = page.getViewport({ scale: scale });

            await page.render({
                canvasContext: context,
                viewport: scaledViewport
            }).promise;

        } catch (err) {
            console.error('サムネイルの生成に失敗しました:', file.name, err);
            context.fillStyle = '#ccc';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.fillStyle = '#fff';
            context.font = '10px sans-serif';
            context.textAlign = 'center';
            context.fillText('Error', canvas.width / 2, canvas.height / 2);
        }
    };

    const updateButtonsState = () => {
        const hasFiles = uploadedFiles.length > 0;
        mergeButton.disabled = !hasFiles;
        clearButton.disabled = !hasFiles;
    };
    const updateStatus = (message, type) => {
        statusContainer.className = `status-container ${type}`;
        statusContainer.textContent = message;
    };
    const clearStatus = () => {
        statusContainer.className = 'status-container hidden';
        statusContainer.textContent = '';
    };

    // --- イベントリスナー ---
    uploadContainer.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    // ドラッグ＆ドロップイベント
    uploadContainer.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); uploadContainer.classList.add('dragover'); });
    uploadContainer.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); uploadContainer.classList.remove('dragover'); });
    uploadContainer.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); uploadContainer.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });

    // ファイルリストのボタン（削除、順序変更）
    fileList.addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('remove-btn')) {
            const index = parseInt(target.dataset.index, 10);
            uploadedFiles.splice(index, 1);
            renderFileList();
        } else if (target.classList.contains('arrow-btn')) {
            const index = parseInt(target.dataset.index, 10);
            const direction = target.classList.contains('up-btn') ? -1 : 1;
            const newIndex = index + direction;

            if (newIndex >= 0 && newIndex < uploadedFiles.length) {
                // 配列の要素を入れ替え
                [uploadedFiles[index], uploadedFiles[newIndex]] = [uploadedFiles[newIndex], uploadedFiles[index]];
                renderFileList();
            }
        }
    });

    // ファイルリストのドラッグ＆ドロップによる順序変更
    let draggedId = null;
    fileList.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('file-list-item')) {
            draggedId = e.target.dataset.id;
            setTimeout(() => { e.target.classList.add('dragging'); }, 0);
        }
    });
    fileList.addEventListener('dragend', (e) => {
        if (e.target.classList.contains('file-list-item')) {
            e.target.classList.remove('dragging');
        }
    });
    fileList.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(fileList, e.clientY);
        const currentDragged = document.querySelector('.dragging');
        if (!currentDragged) return;
        if (afterElement == null) {
            fileList.appendChild(currentDragged);
        } else {
            fileList.insertBefore(currentDragged, afterElement);
        }
    });
    fileList.addEventListener('drop', (e) => {
        e.preventDefault();
        const newOrder = Array.from(fileList.querySelectorAll('.file-list-item'))
                               .map(item => uploadedFiles.find(f => f.id === item.dataset.id));
        uploadedFiles = newOrder;
        renderFileList();
    });

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.file-list-item:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    // クリアボタン
    clearButton.addEventListener('click', () => { uploadedFiles = []; fileInput.value = ''; renderFileList(); clearStatus(); });

    // 結合ボタン
    mergeButton.addEventListener('click', async () => {
        if (uploadedFiles.length < 2) {
            updateStatus("結合するにはPDFファイルを2つ以上選択してください。", "error");
            return;
        }
        updateStatus("結合処理中...", "processing");
        mergeButton.disabled = true;
        clearButton.disabled = true;

        try {
            const mergedPDFB64 = await mergePDFs(uploadedFiles);
            const randomFileName = `${crypto.randomUUID()}.pdf`;
            downloadPDF(mergedPDFB64, randomFileName);
            updateStatus("PDFの結合が完了しました！", "success");
        } catch (error) {
            console.error("Merge failed:", error);
            updateStatus(`エラー: ${error}`, "error");
        } finally {
            updateButtonsState();
        }
    });

    // ヘルパー関数
    const downloadPDF = (base64Data, filename) => {
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // 初期状態の設定
    updateButtonsState();
});