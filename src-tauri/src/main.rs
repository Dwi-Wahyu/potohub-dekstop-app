// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Prevent WebKitGTK / GStreamer from timing out on PipeWire remote connection if not needed
    if std::env::var("GST_PLUGIN_FEATURE_DISABLE").is_err() {
        std::env::set_var("GST_PLUGIN_FEATURE_DISABLE", "pipewire");
    }
    // Pastikan WebView2 tidak pernah membuka DevTools otomatis dari environment argument
    if let Ok(args) = std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS") {
        let filtered: Vec<&str> = args
            .split_whitespace()
            .filter(|arg| *arg != "--auto-open-devtools-for-tabs")
            .collect();
        if filtered.is_empty() {
            std::env::remove_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS");
        } else {
            std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", filtered.join(" "));
        }
    }
    photobooth_dekstop_app_lib::run()
}
