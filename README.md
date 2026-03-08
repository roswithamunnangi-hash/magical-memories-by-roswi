# Magical Memories by Roswi Shop

## Updated Features

- Custom hero text:
  - Heading: **Handcrafted custom Magnets**
  - Subheader: **Some memories deserve more than your camerca roll**
- Top-right navigation with:
  - About Me page link
  - Cart icon/page link
  - Instagram link
- Magnet catalog + cart with pricing:
  - 2.5"x2.5" square magnet: **$2.99 each**
  - 2.5"x2.5" square magnet (set of 9): **$25**
- Catalog image zoom-out styling for better visibility
- Photo upload crop tools:
  - Auto-crop to square option
  - Manual "Crop selected photos now" button
- Checkout is now **online payment only**
- Contact form posts to backend API and sends email notifications
- Order emails + contact emails use the same SMTP server settings
- Network SMTP outages are handled as `queued` so orders/messages are still saved

## Logo File

Website now looks for this logo file first:

`static/assets/logo-attached.png`

If missing, it falls back to `static/assets/logo.svg`.

Place your attached logo image at:

`static/assets/logo-attached.png`

## Required Configuration (Render Environment Variables)

Set these variables in Render for emails and payments:

- `HOST=0.0.0.0`
- `PORT=10000`
- `DATA_DIR=./data`
- `STORE_NAME=Magical Memories by Roswi`
- `PRODUCT_NAME=2.5"x2.5" square magnet`
- `UNIT_PRICE_USD=2.99`
- `PUBLIC_BASE_URL=https://YOUR-SERVICE.onrender.com`
- `PAYMENT_CHECKOUT_URL=https://YOUR-PAYMENT-LINK`

Email settings (required for order + contact emails):

- `ORDER_NOTIFICATION_TO=youremail@gmail.com`
- `CONTACT_NOTIFICATION_TO=youremail@gmail.com` (optional; falls back to ORDER_NOTIFICATION_TO)
- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=587`
- `SMTP_USERNAME=youremail@gmail.com`
- `SMTP_PASSWORD=YOUR_APP_PASSWORD`
- `SMTP_FROM_EMAIL=youremail@gmail.com`
- `SMTP_USE_TLS=true`
- `SMTP_USE_SSL=false`

## Gmail Note

If using Gmail, use a Google **App Password** (not your normal account password).

## APIs

- `POST /api/orders`
- `POST /api/contact`
- `GET /api/health`

## Files Updated

- `static/index.html`
- `static/styles.css`
- `static/script.js`
- `server.py`
- `README.md`

## Redeploy Steps

1. Commit and push:

```powershell
git add .
git commit -m "Update logo/nav/crop/contact/email/payment flow"
git push
```

2. In Render:
- Open your service
- Add/update environment variables above
- Click **Manual Deploy** -> **Deploy latest commit**

3. Test:
- Place one order
- Submit one contact message
- Verify emails received in your inbox
