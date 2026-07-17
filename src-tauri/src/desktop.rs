//! Native desktop integration: config (settings-backed), accelerator validation,
//! and the pop-out/mini window helper. The tray, global shortcut, and autostart
//! plugin are wired in `lib.rs::run()`. Native behavior is verified by
//! `docs/manual-test-checklist.md` (it can't run under Playwright).

use serde::Serialize;
use sqlx::SqlitePool;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

/// Recompute the "Today" count and set the tray tooltip. No-op until the tray
/// exists. Called at startup and on every task-affecting domain event.
pub async fn refresh_tray_tooltip(app: &AppHandle, pool: &SqlitePool) {
    let tz_off = chrono::Local::now().offset().local_minus_utc() / 60;
    let today = (chrono::Utc::now() + chrono::Duration::minutes(tz_off as i64))
        .format("%Y-%m-%d")
        .to_string();
    let Ok(counts) = crate::repo::tasks::smart_counts(pool, &today, tz_off).await else { return };
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(format!("Toodoo — {} due today", counts.today)));
    }
}

use crate::error::Result;
use crate::events::EventBus;
use crate::repo::settings::{get_setting, set_setting};

pub const KEY_HOTKEY: &str = "hotkey.quickAdd";
pub const KEY_AUTOSTART: &str = "autostart.enabled";
pub const KEY_NOTIF: &str = "notif.actions";
pub const DEFAULT_HOTKEY: &str = "CmdOrCtrl+Shift+A";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopConfig {
    pub quick_add_hotkey: String,
    pub autostart: bool,
    pub notif_actions: bool,
}

/// Modifier tokens accepted in an accelerator (Tauri's `CmdOrCtrl` convention).
const MODIFIERS: &[&str] =
    &["CMDORCTRL", "CMD", "COMMAND", "CTRL", "CONTROL", "SHIFT", "ALT", "OPTION", "SUPER", "META"];

/// True for `Modifier[+Modifier…]+Key` (≥1 modifier and exactly one trailing
/// non-modifier key). Guards shortcut registration against a bad settings value.
pub fn valid_accelerator(s: &str) -> bool {
    let parts: Vec<&str> = s.split('+').map(str::trim).filter(|p| !p.is_empty()).collect();
    if parts.len() < 2 {
        return false;
    }
    let Some((key, mods)) = parts.split_last() else { return false };
    let is_mod = |p: &str| MODIFIERS.contains(&p.to_uppercase().as_str());
    if is_mod(key) {
        return false; // last token must be a real key, not a modifier
    }
    mods.iter().all(|m| is_mod(m))
}

pub async fn config(pool: &SqlitePool) -> Result<DesktopConfig> {
    let hotkey = get_setting(pool, KEY_HOTKEY)
        .await?
        .and_then(|v| v.as_str().map(String::from))
        .filter(|s| valid_accelerator(s))
        .unwrap_or_else(|| DEFAULT_HOTKEY.to_string());
    Ok(DesktopConfig {
        quick_add_hotkey: hotkey,
        autostart: get_setting(pool, KEY_AUTOSTART).await?.and_then(|v| v.as_bool()).unwrap_or(false),
        notif_actions: get_setting(pool, KEY_NOTIF).await?.and_then(|v| v.as_bool()).unwrap_or(true),
    })
}

pub async fn set_hotkey(pool: &SqlitePool, bus: &EventBus, accel: &str) -> Result<DesktopConfig> {
    if valid_accelerator(accel) {
        set_setting(pool, bus, KEY_HOTKEY, serde_json::json!(accel)).await?;
    }
    config(pool).await
}

pub async fn set_notif_actions(pool: &SqlitePool, bus: &EventBus, on: bool) -> Result<DesktopConfig> {
    set_setting(pool, bus, KEY_NOTIF, serde_json::json!(on)).await?;
    config(pool).await
}

pub async fn set_autostart_flag(pool: &SqlitePool, bus: &EventBus, on: bool) -> Result<()> {
    set_setting(pool, bus, KEY_AUTOSTART, serde_json::json!(on)).await
}

/// Labels of pop-out windows whose web content has reported its boot beacon.
/// The watchdog in `open_or_focus` destroys any window that never boots, so a
/// content-load failure can't leave a stuck, unclosable white window.
#[derive(Default)]
pub struct WindowWatch(pub std::sync::Mutex<std::collections::HashSet<String>>);

/// Record that `label`'s web content booted (called from the beacon command).
pub fn mark_window_booted(app: &AppHandle, label: &str) {
    if let Some(watch) = app.try_state::<WindowWatch>() {
        watch.0.lock().unwrap().insert(label.to_string());
    }
}

/// How long a pop-out's web content gets to report its boot beacon before the
/// watchdog destroys the window and raises a main-window error toast.
const BOOT_DEADLINE_SECS: u64 = 5;

/// Open (or focus) an always-on-top mini window that loads the SPA with a
/// `?win=<kind>` query the frontend entry branches on. All pop-outs keep
/// native decorations (title bar + close + resize handles) until the packaged
/// content-load path is proven stable — a window must always be closable even
/// if its content never renders. The `decorations` flag is kept for when
/// frameless cosmetics return.
pub fn open_or_focus(
    app: &AppHandle,
    label: &str,
    query: &str,
    title: &str,
    w: f64,
    h: f64,
    decorations: bool,
) -> tauri::Result<()> {
    if let Some(win) = app.get_webview_window(label) {
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }
    // Failsafe: force decorations for now (see doc comment).
    let _ = decorations;

    // A fresh window must boot freshly — drop any stale beacon for this label.
    if let Some(watch) = app.try_state::<WindowWatch>() {
        watch.0.lock().unwrap().remove(label);
    }

    let url = format!("index.html?{query}");
    log::info!("[window] {label}: creating window url={url:?} title={title:?}");
    let build_label = label.to_string();
    let result = WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
        .title(title)
        .inner_size(w, h)
        // Without an explicit position the OS default can spawn the window
        // partially off-screen (observed on the installed build: only the
        // title bar peeking at the bottom edge — indistinguishable from a
        // broken white window). Center it.
        .center()
        .always_on_top(true)
        .decorations(true)
        .resizable(true)
        .on_page_load(move |_webview, payload| {
            let event = match payload.event() {
                tauri::webview::PageLoadEvent::Started => "load started",
                tauri::webview::PageLoadEvent::Finished => "load finished",
            };
            log::info!("[window] {build_label}: page {event} url={}", payload.url());
        })
        .build();
    if let Err(e) = &result {
        log::error!("[window] {label}: window creation FAILED: {e}");
    }
    result?;

    // Watchdog: if the beacon never arrives, destroy the window and tell the
    // main window. A content failure must never require Task Manager.
    let label_owned = label.to_string();
    let watchdog_app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(BOOT_DEADLINE_SECS)).await;
        let booted = watchdog_app
            .try_state::<WindowWatch>()
            .map(|w| w.0.lock().unwrap().contains(&label_owned))
            .unwrap_or(true);
        if booted {
            return;
        }
        log::error!(
            "[window] {label_owned}: no boot beacon within {BOOT_DEADLINE_SECS}s — destroying the window (web content failed to load)"
        );
        if let Some(win) = watchdog_app.get_webview_window(&label_owned) {
            let _ = win.destroy();
        }
        let _ = watchdog_app.emit_to(
            "main",
            "app-error",
            serde_json::json!({
                "message": format!(
                    "The {label_owned} window failed to load and was closed. Details: Settings → Advanced → Open logs folder."
                ),
            }),
        );
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::valid_accelerator;

    #[test]
    fn accepts_modifier_plus_key() {
        assert!(valid_accelerator("CmdOrCtrl+Shift+A"));
        assert!(valid_accelerator("Ctrl+Space"));
        assert!(valid_accelerator("Alt+F1"));
    }

    #[test]
    fn rejects_bad_accelerators() {
        assert!(!valid_accelerator("A")); // no modifier
        assert!(!valid_accelerator("")); // empty
        assert!(!valid_accelerator("Shift+")); // no key
        assert!(!valid_accelerator("Ctrl+Alt")); // key slot is a modifier
        assert!(!valid_accelerator("  ")); // whitespace only
    }
}
