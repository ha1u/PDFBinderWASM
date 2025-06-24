package main

import (
	"fmt"
	"syscall/js"
)

func main() {
	c := make(chan struct{}, 0)
	fmt.Println("WASM PDF Binder Initialized (Go)")

	// JavaScriptにGoの関数を公開
	js.Global().Set("mergePDFs", js.FuncOf(mergePDFs))

	<-c // プログラムが終了しないように待機
}
