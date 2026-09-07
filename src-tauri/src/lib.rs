// 在线聊天转语音 — Tauri 2 桌面壳（极薄：仅窗口 + 默认权限，无自定义 IPC）
// 前端全部逻辑在 dist/index.html（即 demo.html），WebView2 原样运行。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running ChatTTS desktop");
}