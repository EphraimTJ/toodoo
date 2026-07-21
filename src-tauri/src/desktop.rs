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
/// Minutes a notification's Snooze button reschedules by (5/10/30/60 in the UI).
pub const KEY_NOTIF_SNOOZE: &str = "notif.snoozeMin";
/// "Use simple in-app pop-outs": render focus/sticky pop-outs as in-app
/// floating panels instead of native windows (the webview-load fallback).
pub const KEY_SIMPLE_POPOUTS: &str = "popout.simple";
/// Close button hides to the tray instead of quitting (ON by default — the
/// scheduler/reminders keep running).
pub const KEY_CLOSE_TO_TRAY: &str = "tray.closeToTray";
/// Autostart launches start hidden in the tray (sub-setting of launch-at-login).
pub const KEY_START_MINIMIZED: &str = "tray.startMinimized";
/// "Don't show again" was clicked on the still-running-in-tray notice.
pub const KEY_TRAY_NOTICE: &str = "tray.noticeShown";
/// Native pop-out chrome: "pill" | "solid" | "windowed" (style_from_setting).
pub const KEY_POPOUT_STYLE: &str = "popout.style";
pub const DEFAULT_HOTKEY: &str = "CmdOrCtrl+Shift+A";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopConfig {
    pub quick_add_hotkey: String,
    pub autostart: bool,
    pub notif_actions: bool,
    pub notif_snooze_min: i64,
    pub simple_popouts: bool,
    pub popout_style: String,
    pub close_to_tray: bool,
    pub start_minimized: bool,
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
        notif_snooze_min: get_setting(pool, KEY_NOTIF_SNOOZE)
            .await?
            .and_then(|v| v.as_i64())
            .filter(|m| (1..=720).contains(m))
            .unwrap_or(crate::repo::reminders::DEFAULT_SNOOZE_MIN),
        simple_popouts: get_setting(pool, KEY_SIMPLE_POPOUTS)
            .await?
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        popout_style: get_setting(pool, KEY_POPOUT_STYLE)
            .await?
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_else(|| "pill".to_string()),
        close_to_tray: get_setting(pool, KEY_CLOSE_TO_TRAY)
            .await?
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
        start_minimized: get_setting(pool, KEY_START_MINIMIZED)
            .await?
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
    })
}

pub async fn set_close_to_tray(pool: &SqlitePool, bus: &EventBus, on: bool) -> Result<DesktopConfig> {
    set_setting(pool, bus, KEY_CLOSE_TO_TRAY, serde_json::json!(on)).await?;
    config(pool).await
}

pub async fn set_start_minimized(pool: &SqlitePool, bus: &EventBus, on: bool) -> Result<DesktopConfig> {
    set_setting(pool, bus, KEY_START_MINIMIZED, serde_json::json!(on)).await?;
    config(pool).await
}

// ---- Close-to-tray decision logic (pure, unit-tested) -----------------------

/// What the main window's close button should do.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CloseDecision {
    /// Intercept the close: hide to the tray; optionally show the one-time
    /// "still running" notice.
    HideToTray { first_time_notice: bool },
    /// Let the close quit the whole app.
    Exit,
}

/// Decide the close behavior. `notice_pending` = the notice has neither been
/// permanently dismissed (persisted `tray.noticeShown`) nor already shown this
/// run — the notice appears at most once per run until "Don't show again".
pub fn close_decision(close_to_tray: bool, notice_pending: bool) -> CloseDecision {
    if close_to_tray {
        CloseDecision::HideToTray { first_time_notice: notice_pending }
    } else {
        CloseDecision::Exit
    }
}

/// Whether this launch should start hidden in the tray: only an autostart
/// launch (`--autostart`, passed by the login registration) with the
/// start-minimized setting on. A normal double-click always shows the window.
pub fn launched_hidden(args: &[String], start_minimized: bool) -> bool {
    start_minimized && args.iter().any(|a| a == "--autostart")
}

pub async fn set_simple_popouts(pool: &SqlitePool, bus: &EventBus, on: bool) -> Result<DesktopConfig> {
    set_setting(pool, bus, KEY_SIMPLE_POPOUTS, serde_json::json!(on)).await?;
    config(pool).await
}

pub async fn set_popout_style(pool: &SqlitePool, bus: &EventBus, style: &str) -> Result<DesktopConfig> {
    let style = match style {
        "windowed" | "solid" | "pill" => style,
        _ => "pill",
    };
    set_setting(pool, bus, KEY_POPOUT_STYLE, serde_json::json!(style)).await?;
    config(pool).await
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

pub async fn set_notif_snooze_min(pool: &SqlitePool, bus: &EventBus, minutes: i64) -> Result<DesktopConfig> {
    let minutes = minutes.clamp(1, 720);
    set_setting(pool, bus, KEY_NOTIF_SNOOZE, serde_json::json!(minutes)).await?;
    config(pool).await
}

pub async fn set_autostart_flag(pool: &SqlitePool, bus: &EventBus, on: bool) -> Result<()> {
    set_setting(pool, bus, KEY_AUTOSTART, serde_json::json!(on)).await
}

/// Boot-tracking state machine for pop-out windows (plain data, unit-tested):
/// a window is *pending* from the moment creation is requested — **before**
/// `build()` is even called, so a hang inside window creation can never
/// silence the watchdog again (the round-3 log showed exactly that: "creating
/// window" with no page-load/beacon/watchdog lines, ever). The beacon IPC
/// clears the pending mark; expiry fires at most once per registration and
/// tracks consecutive failures per window kind for the in-app fallback.
#[derive(Default)]
pub struct WatchState {
    pending: std::collections::HashSet<String>,
    booted: std::collections::HashSet<String>,
    failures: std::collections::HashMap<String, u32>,
}

/// The fallback-relevant kind of a window label ("sticky-<id>" → "sticky").
pub fn popout_kind(label: &str) -> &str {
    if label.starts_with("sticky") {
        "sticky"
    } else {
        label
    }
}

impl WatchState {
    /// Call when creation is requested (before build). Clears any stale boot.
    pub fn register_pending(&mut self, label: &str) {
        self.booted.remove(label);
        self.pending.insert(label.to_string());
    }
    /// Beacon arrived: the window is healthy; its kind's failure streak resets.
    pub fn mark_booted(&mut self, label: &str) {
        self.pending.remove(label);
        self.booted.insert(label.to_string());
        self.failures.insert(popout_kind(label).to_string(), 0);
    }
    /// Deadline hit: returns `Some(consecutive_failures)` exactly once if the
    /// label was still pending (never booted), `None` otherwise.
    pub fn expire(&mut self, label: &str) -> Option<u32> {
        if !self.pending.remove(label) {
            return None;
        }
        let n = self.failures.entry(popout_kind(label).to_string()).or_insert(0);
        *n += 1;
        Some(*n)
    }
    #[cfg_attr(not(test), allow(dead_code))] // asserted by the unit tests
    pub fn consecutive_failures(&self, kind: &str) -> u32 {
        self.failures.get(kind).copied().unwrap_or(0)
    }
}

/// Managed wrapper around the watch state.
#[derive(Default)]
pub struct WindowWatch(pub std::sync::Mutex<WatchState>);

/// Record that `label`'s web content booted (called from the beacon command).
pub fn mark_window_booted(app: &AppHandle, label: &str) {
    if let Some(watch) = app.try_state::<WindowWatch>() {
        watch.0.lock().unwrap().mark_booted(label);
    }
}

/// How long a pop-out gets from creation request to boot beacon before the
/// watchdog destroys it and raises a main-window error toast. Includes the
/// `build()` call itself — a hanging build is a watchdog hit, not silence.
const BOOT_DEADLINE_SECS: u64 = 5;

/// Pop-out window chrome, from safest to fanciest. The round-3b log proved
/// `build()` hangs machine-dependently for the full pill style while decorated
/// windows build fine — the granular variants let one diag run
/// (`TOODOO_DIAG_WINDOWS=styles`) bisect exactly which flag hangs, and the
/// `popout.style` setting lets the user pick a working chrome without a
/// rebuild.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum PopoutStyle {
    /// Native title bar (quick-add, diagnostics; proven everywhere).
    Decorated,
    /// Frameless but opaque — no transparency/composition involvement.
    FramelessOpaque,
    /// Frameless + transparent, still with default shadow/taskbar flags.
    FramelessTransparent,
    /// Full pill: frameless + transparent + no shadow + skip taskbar.
    Pill,
}

/// The user-selectable `popout.style` values → chrome for focus/sticky pills.
pub fn style_from_setting(value: &str) -> PopoutStyle {
    match value {
        "windowed" => PopoutStyle::Decorated,
        "solid" => PopoutStyle::FramelessOpaque,
        _ => PopoutStyle::Pill,
    }
}

/// Request a pop-out window from any thread/context. Creation is deferred to
/// the **main thread** — the only creation context proven to work on the
/// machine where command/tray-context creation hung (the quick-add window,
/// created from the global-shortcut handler on the main thread, has always
/// worked there). Fire-and-forget: success/failure is reported by the boot
/// beacon / watchdog, never by an IPC reply.
pub fn request_popout(
    app: &AppHandle,
    label: &str,
    query: &str,
    title: &str,
    w: f64,
    h: f64,
    style: PopoutStyle,
) {
    let app2 = app.clone();
    let (label, query, title) = (label.to_string(), query.to_string(), title.to_string());
    let res = app.run_on_main_thread(move || {
        if let Err(e) = open_or_focus(&app2, &label, &query, &title, w, h, style) {
            log::error!("[window] {label}: open_or_focus errored: {e}");
        }
    });
    if let Err(e) = res {
        log::error!("[window] run_on_main_thread failed: {e}");
    }
}

/// Clip a frameless pill window to a rounded-rectangle region. A window with a
/// non-null region is a *shaped* window, and Windows draws no DWM drop shadow
/// around a shaped window — which is the only reliable way to kill the shadow
/// here (`.shadow(false)` / `setShadow(false)` go through the frame-margin path
/// that doesn't take on transparent windows). The region radius is kept a hair
/// larger than the pill's CSS radius so it never clips the visible corners; the
/// caller re-applies it on every resize (dock / menu / restore).
#[cfg(windows)]
fn shape_pill_window(win: &tauri::WebviewWindow) {
    use windows::Win32::Graphics::Gdi::{CreateRoundRectRgn, SetWindowRgn};

    let (Ok(hwnd), Ok(size)) = (win.hwnd(), win.inner_size()) else {
        return;
    };
    let scale = win.scale_factor().unwrap_or(1.0);
    let radius = (14.0 * scale).round() as i32;
    let (w, h) = (size.width as i32, size.height as i32);
    unsafe {
        // GDI region right/bottom edges are exclusive, hence +1. SetWindowRgn
        // takes ownership of the region, so it must not be deleted here.
        let rgn = CreateRoundRectRgn(0, 0, w + 1, h + 1, radius, radius);
        let _ = SetWindowRgn(hwnd, Some(rgn), true);
    }
}

/// Open (or focus) an always-on-top pop-out that loads the SPA with a
/// `?win=<kind>` query the frontend entry branches on. The watchdog is armed
/// **before** `build()` so no failure mode can bypass it.
pub fn open_or_focus(
    app: &AppHandle,
    label: &str,
    query: &str,
    title: &str,
    w: f64,
    h: f64,
    style: PopoutStyle,
) -> tauri::Result<()> {
    if let Some(win) = app.get_webview_window(label) {
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }

    // Arm the watchdog FIRST: pending registration + timer, both independent
    // of whether build() below returns, errors, or hangs.
    if let Some(watch) = app.try_state::<WindowWatch>() {
        watch.0.lock().unwrap().register_pending(label);
    }
    let label_owned = label.to_string();
    let watchdog_app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(BOOT_DEADLINE_SECS)).await;
        let expired = watchdog_app
            .try_state::<WindowWatch>()
            .and_then(|w| w.0.lock().unwrap().expire(&label_owned));
        let Some(failures) = expired else { return };
        log::error!(
            "[window-watchdog] {label_owned}: no boot beacon within {BOOT_DEADLINE_SECS}s — destroying the window (web content never loaded; consecutive {} failures for this kind: {failures})",
            popout_kind(&label_owned)
        );
        if let Some(win) = watchdog_app.get_webview_window(&label_owned) {
            let _ = win.destroy();
        } else {
            log::error!(
                "[window-watchdog] {label_owned}: no window handle to destroy (creation likely hung inside build())"
            );
        }
        // Persist the failure streak so the frontend can auto-fall-back to
        // in-app panels. Read-increment-write: the in-memory streak resets
        // every launch, so overwriting with it kept the persisted counter
        // pinned at 1 across restarts (round-3b log) and the fallback never
        // engaged. The counter only resets when a window of this kind boots.
        let kind = popout_kind(&label_owned).to_string();
        let mut total = failures;
        if let Some(state) = watchdog_app.try_state::<crate::AppState>() {
            let key = format!("popout.failures.{kind}");
            let prior = crate::repo::settings::get_setting(&state.pool, &key)
                .await
                .ok()
                .flatten()
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as u32;
            total = prior + 1;
            if let Err(e) = crate::repo::settings::set_setting(
                &state.pool,
                &state.bus,
                &key,
                serde_json::json!(total),
            )
            .await
            {
                log::error!("[window-watchdog] persisting {key} failed: {e}");
            } else {
                log::error!(
                    "[window-watchdog] {kind}: lifetime consecutive failures now {total} (in-app fallback engages at 2)"
                );
            }
        }
        let _ = watchdog_app.emit_to(
            "main",
            "popout-failed",
            serde_json::json!({ "label": label_owned, "kind": kind, "failures": total }),
        );
        let _ = watchdog_app.emit_to(
            "main",
            "app-error",
            serde_json::json!({
                "message": format!(
                    "The {kind} window failed to load and was closed — switching to the in-app panel. Details: Settings → Advanced → Open logs folder."
                ),
            }),
        );
    });

    let url = format!("index.html?{query}");
    log::info!("[window] {label}: creating window url={url:?} title={title:?}");
    let build_label = label.to_string();
    let nav_label = label.to_string();
    let mut builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
        .title(title)
        .inner_size(w, h)
        // Without an explicit position the OS default can spawn the window
        // partially off-screen (observed on the installed build). Center it;
        // pill windows re-apply their persisted position on boot.
        .center()
        .always_on_top(true)
        .resizable(true);
    log::info!("[window] {label}: style {style:?}");
    builder = match style {
        PopoutStyle::Decorated => builder.decorations(true),
        PopoutStyle::FramelessOpaque => builder.decorations(false),
        PopoutStyle::FramelessTransparent => builder.decorations(false).transparent(true),
        // Frameless pill: no native chrome; Esc + the hover menu close it, and
        // the pre-armed watchdog destroys it if its content never boots.
        PopoutStyle::Pill => builder
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .skip_taskbar(true),
    };
    let result = builder
        .on_navigation(move |url| {
            log::info!("[window] {nav_label}: navigation to {url}");
            true
        })
        .on_page_load(move |_webview, payload| {
            let event = match payload.event() {
                tauri::webview::PageLoadEvent::Started => "load started",
                tauri::webview::PageLoadEvent::Finished => "load finished",
            };
            log::info!("[window] {build_label}: page {event} url={}", payload.url());
        })
        .build();
    match &result {
        Ok(_) => log::info!("[window] {label}: builder.build() returned ok"),
        Err(e) => log::error!("[window] {label}: builder.build() FAILED: {e}"),
    }
    let win = result?;

    // Pill windows: clip to a rounded-rect region so Windows draws no shadow.
    // Re-apply on every resize — docking, the hover menu, and position/size
    // restore all change the window's dimensions.
    #[cfg(windows)]
    if matches!(style, PopoutStyle::Pill) {
        shape_pill_window(&win);
        let reshape = win.clone();
        win.on_window_event(move |ev| {
            if matches!(ev, tauri::WindowEvent::Resized(_)) {
                shape_pill_window(&reshape);
            }
        });
    }
    let _ = &win;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{close_decision, launched_hidden, popout_kind, valid_accelerator, CloseDecision, WatchState};

    #[test]
    fn watchdog_booted_window_never_expires() {
        let mut w = WatchState::default();
        w.register_pending("focus");
        w.mark_booted("focus");
        assert_eq!(w.expire("focus"), None);
        assert_eq!(w.consecutive_failures("focus"), 0);
    }

    #[test]
    fn watchdog_unbooted_window_expires_exactly_once_and_counts() {
        let mut w = WatchState::default();
        w.register_pending("focus");
        assert_eq!(w.expire("focus"), Some(1));
        assert_eq!(w.expire("focus"), None, "second expiry must not double-fire");
        w.register_pending("focus");
        assert_eq!(w.expire("focus"), Some(2), "consecutive failures accumulate");
    }

    #[test]
    fn watchdog_boot_resets_the_failure_streak() {
        let mut w = WatchState::default();
        w.register_pending("focus");
        assert_eq!(w.expire("focus"), Some(1));
        w.register_pending("focus");
        w.mark_booted("focus");
        assert_eq!(w.consecutive_failures("focus"), 0);
        assert_eq!(w.expire("focus"), None);
    }

    #[test]
    fn watchdog_reregistration_clears_a_stale_boot() {
        let mut w = WatchState::default();
        w.register_pending("focus");
        w.mark_booted("focus");
        // The window was closed and reopened: a fresh registration must not be
        // satisfied by the previous boot.
        w.register_pending("focus");
        assert_eq!(w.expire("focus"), Some(1));
    }

    #[test]
    fn sticky_labels_share_one_failure_kind() {
        let mut w = WatchState::default();
        assert_eq!(popout_kind("sticky-abc"), "sticky");
        w.register_pending("sticky-abc");
        assert_eq!(w.expire("sticky-abc"), Some(1));
        w.register_pending("sticky-def");
        assert_eq!(w.expire("sticky-def"), Some(2), "failures aggregate per kind");
    }

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

    #[test]
    fn close_hides_to_tray_with_notice_only_while_pending() {
        assert_eq!(close_decision(true, true), CloseDecision::HideToTray { first_time_notice: true });
        assert_eq!(
            close_decision(true, false),
            CloseDecision::HideToTray { first_time_notice: false }
        );
    }

    #[test]
    fn close_exits_when_the_setting_is_off_regardless_of_notice() {
        assert_eq!(close_decision(false, true), CloseDecision::Exit);
        assert_eq!(close_decision(false, false), CloseDecision::Exit);
    }

    #[test]
    fn only_an_autostart_launch_with_the_setting_starts_hidden() {
        let auto = |s: &str| s.to_string();
        assert!(launched_hidden(&[auto("toodoo.exe"), auto("--autostart")], true));
        assert!(!launched_hidden(&[auto("toodoo.exe"), auto("--autostart")], false));
        assert!(!launched_hidden(&[auto("toodoo.exe")], true), "double-click always shows");
        assert!(!launched_hidden(&[], true));
        assert!(!launched_hidden(&[auto("--autostart-ish")], true), "exact flag only");
    }
}
