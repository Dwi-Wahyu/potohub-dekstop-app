// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Prevent WebKitGTK / GStreamer from timing out on PipeWire remote connection if not needed
    if std::env::var("GST_PLUGIN_FEATURE_DISABLE").is_err() {
        std::env::set_var("GST_PLUGIN_FEATURE_DISABLE", "pipewire");
    }
    photobooth_dekstop_app_lib::run()
}
