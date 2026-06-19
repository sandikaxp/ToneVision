use local_ip_address::local_ip;
use fast_qr::convert::svg::SvgBuilder;
use fast_qr::qr::QRBuilder;

pub fn get_local_ip() -> String {
    local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string())
}

pub fn generate_qr_svg(url: &str) -> Result<String, String> {
    let qrcode = QRBuilder::new(url.to_string())
        .build()
        .map_err(|e| format!("QR build error: {:?}", e))?;
    
    let svg = SvgBuilder::default().to_str(&qrcode);
    Ok(svg)
}
