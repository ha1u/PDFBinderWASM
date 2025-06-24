document.addEventListener('DOMContentLoaded', () => {
    // WASMの初期化
    const go = new Go();

    // DOM要素の取得
    const uploadContainer = document.getElementById('upload-container');
    const fileInput = document.getElementById('file-input');
    const fileList = document.getElementById('file-list');
    const mergeButton = document.getElementById('merge-button');
    const clearButton = document.getElementById('clear-button');
    const statusContainer = document.getElementById('status-container');
    
    // --- ★★★ 修正点1: UIを初期状態で無効化 ★★★ ---
    mergeButton.disabled = true;
    clearButton.disabled = true;
    fileInput.disabled = true;
    uploadContainer.style.cursor = 'wait'; // カーソルを変更して待機中であることを示す
    const uploadLabel = uploadContainer.querySelector('.upload-label p');
    const originalLabelText = uploadLabel.innerHTML;
    uploadLabel.innerHTML = "<strong>アプリケーションを読み込み中...</strong>";


    WebAssembly.instantiateStreaming(fetch('main.wasm'), go.importObject).then((result) => {
        go.run(result.instance);
        console.log("WASM PDF Binder Initialized (JS)");

        // --- ★★★ 修正点2: 初期化成功後にUIを有効化 ★★★ ---
        fileInput.disabled = false;
        uploadContainer.style.cursor = 'pointer';
        uploadLabel.innerHTML = originalLabelText; // ラベルテキストを元に戻す
        updateButtonsState(); // ファイル数に応じてボタンの状態を更新

    }).catch(err => {
        console.error("WASM initialization failed:", err);
        // エラー時もUIの状態は無効のままか、エラーメッセージを表示
        uploadContainer.style.cursor = 'default';
        uploadLabel.innerHTML = "<strong>読み込みに失敗しました</strong>";
        updateStatus("アプリケーションの読み込みに失敗しました。ページを再読み込みしてください。", "error");
    });


    // ファイルを管理する配列
    let uploadedFiles = [];

    // --- ファイル処理 ---
    const handleFiles = (files) => {
        for (const file of files) {
            if (file.type !== 'application/pdf' || uploadedFiles.some(f => f.name === file.name)) {
                continue; // PDF以外、または同名ファイルは無視
            }
            
            const reader = new FileReader();
            reader.onload = (e) => {
                // Base64エンコードされたデータ
                const base64Data = e.target.result.split(',')[1];
                uploadedFiles.push({
                    name: file.name,
                    size: file.size,
                    data: base64Data // Base64データを保持
                });
                renderFileList();
            };
            reader.readAsDataURL(file);
        }
    };

    // --- UI更新 ---
    const renderFileList = () => {
        fileList.innerHTML = '';
        uploadedFiles.forEach((file, index) => {
            const li = document.createElement('li');
            li.className = 'file-list-item';
            li.dataset.index = index;
            li.draggable = true;

            const sizeInKB = (file.size / 1024).toFixed(1);

            li.innerHTML = `
                <span class="file-name">${file.name}</span>
                <span class="file-size">${sizeInKB} KB</span>
                <button class="remove-btn" data-index="${index}">&times;</button>
            `;
            fileList.appendChild(li);
        });
        updateButtonsState();
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
    uploadContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadContainer.classList.add('dragover');
    });
    uploadContainer.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadContainer.classList.remove('dragover');
    });
    uploadContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadContainer.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });

    // ファイルリストの削除ボタン
    fileList.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-btn')) {
            const index = parseInt(e.target.dataset.index, 10);
            uploadedFiles.splice(index, 1);
            renderFileList();
        }
    });

    // ファイルリストのドラッグ＆ドロップによる順序変更
    let draggedItem = null;
    fileList.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('file-list-item')) {
            draggedItem = e.target;
            setTimeout(() => {
                e.target.classList.add('dragging');
            }, 0);
        }
    });
    fileList.addEventListener('dragend', (e) => {
        if(draggedItem) {
            draggedItem.classList.remove('dragging');
            draggedItem = null;
        }
    });
    fileList.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(fileList, e.clientY);
        const currentDragged = document.querySelector('.dragging');
        if (afterElement == null) {
            fileList.appendChild(currentDragged);
        } else {
            fileList.insertBefore(currentDragged, afterElement);
        }
    });
    fileList.addEventListener('drop', (e) => {
        e.preventDefault();
        // UIの順序に基づいてuploadedFiles配列を並び替える
        const newOrder = Array.from(fileList.querySelectorAll('.file-list-item'))
                               .map(item => uploadedFiles[parseInt(item.dataset.index, 10)]);
        uploadedFiles = newOrder;
        renderFileList(); // インデックスを再割り当てして再描画
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
    clearButton.addEventListener('click', () => {
        uploadedFiles = [];
        fileInput.value = ''; // inputの値をリセット
        renderFileList();
        clearStatus();
    });

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
            // グローバルスコープのmergePDFs関数を呼び出す
            const mergedPDFB64 = await mergePDFs(uploadedFiles);
            downloadPDF(mergedPDFB64, "merged.pdf");
            updateStatus("PDFの結合が完了しました！", "success");
        } catch (error) {
            console.error("Merge failed:", error);
            updateStatus(`エラー: ${error}`, "error");
        } finally {
            mergeButton.disabled = false;
            clearButton.disabled = false;
        }
    });

    // --- ヘルパー関数 ---
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
    clearStatus();
});