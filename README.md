# Magical Memories by Roswi Shop

## Included in this update

- Top nav pages: About Me, Products, Cart
- Instagram icon added before Instagram handle
- Footer social row: "Follow us on social media"
- Removed top text: `CUSTOM 2.5"x2.5" SQUARE MAGNETS`
- Catalog title changed to: `Customize your magnets`
- Removed old trust-card section
- Online payment only (pay-later removed)
- Contact form now sends through backend email API
- Manual photo crop flow added with crop modal (zoom + position sliders)
- Catalog images zoomed out for better visibility

## File paths for your attached images

Place these files in `static/assets/`:

- `logo-attached.png` (your logo image)
- `about-roswitha.jpg` (your profile photo for About Me)

Carousel/catalog photos (already wired):

- `static/assets/photos/magnet-photo-1.png`
- `static/assets/photos/magnet-photo-2.png`
- `static/assets/photos/magnet-photo-3.png`
- `static/assets/photos/magnet-photo-4.png`
- `static/assets/photos/magnet-photo-5.png`

## Required Render environment variables for email + payment

- `ORDER_NOTIFICATION_TO=you@example.com`
- `CONTACT_NOTIFICATION_TO=you@example.com` (optional; fallback uses ORDER_NOTIFICATION_TO)
- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=587`
- `SMTP_USERNAME=you@example.com`
- `SMTP_PASSWORD=YOUR_APP_PASSWORD`
- `SMTP_FROM_EMAIL=you@example.com`
- `SMTP_USE_TLS=true`
- `SMTP_USE_SSL=false`
- `PAYMENT_CHECKOUT_URL=https://your-payment-link`

If using Gmail, `SMTP_PASSWORD` must be a Google App Password.

## APIs

- `POST /api/orders`
- `POST /api/contact`
- `GET /api/health`

## Updated files

- `static/index.html`
- `static/styles.css`
- `static/script.js`
- `server.py`
- `README.md`
