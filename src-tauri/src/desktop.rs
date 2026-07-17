//! Native desktop integration: config (settings-backed), accelerator validation,
//! and the pop-out/mini window helper. The tray, global shortcut, and autostart
//! plugin are wired in `lib.rs::run()`. Native behavior is verified by
//! `docs/manual-test-checklist.md` (it can't run under Playwright).

use serde::Serialize;
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

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

/// Open (or focus) an always-on-top mini window that loads the SPA with a
/// `?win=<kind>` query the frontend entry branches on. `decorations` gives the
/// window a title bar + OS resize handles (focus/sticky want it so they can be
/// moved and resized; the transient quick-add window stays frameless).
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
    WebviewWindowBuilder::new(app, label, WebviewUrl::App(format!("index.html?{query}").into()))
        .title(title)
        .inner_size(w, h)
        .always_on_top(true)
        .decorations(decorations)
        .resizable(true)
        .build()?;
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
