# radio-stress-test

**Public** yük testi paketi: çalışan bir [radio-server](../radio-server) örneğine çoklu bot ile ses ve API trafiği gönderir.

> `src/` altındaki bot mantığına planlı değişiklik yapılmaz; yalnızca bu README ve kullanım notları güncellenir.

## Gereksinimler

- Node.js ≥ 22.11
- Ayakta bir radio-server (`GET /health` → `ok: true`)

Sunucu kurulumu: [radio-server README](../radio-server/README.md)

## Kurulum

```bash
cd radio-stress-test
npm ci
```

**.env dosyası zorunlu değildir.** Tüm ayarlar ortam değişkenleri veya varsayılanlarla verilir.

## Çalıştırma

```bash
SERVER_BASE_URL=http://127.0.0.1:8080 npm start
```

mDNS ile Pi:

```bash
SERVER_BASE_URL=http://aksiyonsoft-radio-a1b2c3.local:8080 npm start
```

## Ortam değişkenleri

| Değişken | Varsayılan | Açıklama |
|----------|------------|----------|
| `SERVER_BASE_URL` | `http://127.0.0.1:8080` | Sunucu taban URL |
| `BOT_COUNT` | `50` | Bot sayısı |
| `ADMIN_COUNT` | `1` | Admin bot sayısı (≤ BOT_COUNT) |
| `VOICE_GROUP_ID` | — | Mevcut ses grubu ID (yoksa oluşturulur) |
| `VOICE_GROUP_NAME` | `Stress Test` | Yeni grup adı |
| `BOT_RAMP_MS` | `100` | Bot ramp süresi |
| `SPEAKER_ROTATION_MS` | `30000` | Konuşmacı rotasyonu |
| `FRAME_MS` | `20` | Çerçeve aralığı |
| `PAYLOAD_BYTES` | `640` | UDP yük boyutu |
| `ENABLE_SSE` | `false` | Voice SSE |
| `BOT_PASSWORD` | `bot-pass-123` | Bot şifresi |
| `BOT_NAME_PREFIX` | `stress-bot` | İsim öneki |
| `BOT_EMAIL_PREFIX` | `stress-bot` | E-posta öneki |
| `UDP_BIND_HOST` | `0.0.0.0` | UDP bind |
| `RTP_CLIENT_HOST` | — | İsteğe bağlı RTP client host |

Örnek:

```bash
BOT_COUNT=10 SERVER_BASE_URL=http://192.168.1.50:8080 npm start
```

## İlgili repolar

| Repo | Açıklama |
|------|----------|
| [radio-server](../radio-server) | Sunucu (public) |
| radio-mobile | Resmi mobil (private) |

## Flutter

Desteklenmez; bu paket yalnızca Node.js botları içerir.
