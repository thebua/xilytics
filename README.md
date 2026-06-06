# Xilytics — İlk 11 & Diziliş Oluşturucu

Statik web sitesi. Backend gerekmez.

## Dosyalar
- `index.html` — açılış / landing sayfası (7 dilli)
- `app.html` — diziliş aracı
- `xilytics-favicon.svg` — tarayıcı sekmesi ikonu
- `xilytics-icon-dark.svg`, `xilytics-wordmark-*.svg`, `xilytics-avatar.svg` — logo varyantları

## Yayınlama (GitHub Pages)
1. Bu dosyaları repo'ya yükle (hepsi kök dizinde olmalı).
2. Settings → Pages → Source: Branch `main`, klasör `/ (root)` → Save.
3. Birkaç dakika sonra `https://kullanici.github.io/repo/` adresinde yayında.

## Alan adı (xilytics.com)
Settings → Pages → Custom domain: `xilytics.com`
Namecheap → Advanced DNS:
- A kayıtları: 185.199.108.153 / 109.153 / 110.153 / 111.153
- CNAME: www → kullanici.github.io
GitHub Pages'te "Enforce HTTPS" işaretle.

Not: Tüm dosyalar aynı klasörde olmalı; isimlerini değiştirme.
