// 在线聊天转语音 — Tauri 2 桌面壳（Windows 入口：转发到 lib::run）
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    chat_tts_desktop_lib::run()
}