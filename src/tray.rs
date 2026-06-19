#[cfg(target_os = "windows")]
use tray_icon::{
    TrayIconBuilder,
    menu::{Menu, MenuItem, PredefinedMenuItem, MenuEvent},
    Icon,
};

#[cfg(target_os = "windows")]
pub fn init_tray(port: u16) {
    std::thread::spawn(move || {
        // 1. Create the menu items
        let menu = Menu::new();
        let open_item = MenuItem::new("Open ToneVision", true, None);
        let admin_item = MenuItem::new("Open Admin Console", true, None);
        let quit_item = MenuItem::new("Quit", true, None);

        let open_id = open_item.id().clone();
        let admin_id = admin_item.id().clone();
        let quit_id = quit_item.id().clone();

        menu.append_items(&[
            &open_item,
            &admin_item,
            &PredefinedMenuItem::separator(),
            &quit_item,
        ]).unwrap();

        // 2. Load the embedded 32x32 RGBA icon (Icon 4)
        let icon_bytes = include_bytes!("icon.rgba").to_vec();
        let icon = Icon::from_rgba(icon_bytes, 32, 32).unwrap();

        // 3. Build the tray icon
        let _tray_icon = TrayIconBuilder::new()
            .with_menu(Box::new(menu))
            .with_tooltip("ToneVision Local Server")
            .with_icon(icon)
            .build()
            .unwrap();

        // 4. Spawn a background thread to handle menu events
        let menu_channel = MenuEvent::receiver();
        std::thread::spawn(move || {
            while let Ok(event) = menu_channel.recv() {
                if event.id == open_id {
                    let _ = open::that(&format!("http://localhost:{}", port));
                } else if event.id == admin_id {
                    let _ = open::that(&format!("http://localhost:{}/admin/index.html", port));
                } else if event.id == quit_id {
                    println!("Quit selected. Shutting down server...");
                    std::process::exit(0);
                }
            }
        });

        // 5. Run the Win32 message pump for the tray icon
        unsafe {
            use windows_sys::Win32::UI::WindowsAndMessaging::{GetMessageW, TranslateMessage, DispatchMessageW, MSG};
            let mut msg: MSG = std::mem::zeroed();
            while GetMessageW(&mut msg, 0, 0, 0) > 0 {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }
    });
}

#[cfg(not(target_os = "windows"))]
pub fn init_tray(_port: u16) {
    // No-op for non-Windows platforms
}
