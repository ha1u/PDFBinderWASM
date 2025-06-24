package main

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"io"
	"syscall/js"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
)

func mergePDFs(this js.Value, args []js.Value) interface{} {
	handler := js.FuncOf(func(this js.Value, pArgs []js.Value) interface{} {
		resolve := pArgs[0]
		reject := pArgs[1]

		go func() {
			jsPDFs := args[0]
			if jsPDFs.IsNull() || jsPDFs.IsUndefined() || jsPDFs.Length() == 0 {
				err := fmt.Errorf("PDFファイルがありません。")
				reject.Invoke(js.ValueOf(err.Error()))
				return
			}

			var readers []io.ReadSeeker
			for i := 0; i < jsPDFs.Length(); i++ {
				pdfDataB64 := jsPDFs.Index(i).Get("data").String()
				pdfBytes, err := base64.StdEncoding.DecodeString(pdfDataB64)
				if err != nil {
					err = fmt.Errorf("ファイルのデコードに失敗しました (ファイル %d): %w", i+1, err)
					reject.Invoke(js.ValueOf(err.Error()))
					return
				}
				readers = append(readers, bytes.NewReader(pdfBytes))
			}

			outBuffer := new(bytes.Buffer)

			// --- ★★★ ここが最終修正点 ★★★ ---
			// v0.11.0 の仕様に合わせ、設定構造体を直接初期化します。
			// これにより、ファイルアクセスを伴わずに安全に設定オブジェクトを作成できます。
			conf := &model.Configuration{}
			// --- ★★★ 修正ここまで ★★★ ---

			// あなたの環境のpdfcpu v0.11.0 に合わせて、bool型の引数を追加します。
			err := api.MergeRaw(readers, outBuffer, false, conf)
			if err != nil {
				err = fmt.Errorf("PDFの結合に失敗しました: %w", err)
				reject.Invoke(js.ValueOf(err.Error()))
				return
			}

			mergedPDFB64 := base64.StdEncoding.EncodeToString(outBuffer.Bytes())
			resolve.Invoke(js.ValueOf(mergedPDFB64))
		}()

		return nil
	})

	promiseConstructor := js.Global().Get("Promise")
	return promiseConstructor.New(handler)
}
