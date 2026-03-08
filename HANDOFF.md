# Handoff

## Project

Magical Memories by Roswi is a simple order site for custom magnetic memory tiles.

Customers can:

- choose a quantity
- upload one or more photos
- enter shipping/contact details
- submit an order

The backend:

- saves each order as JSON
- saves uploaded photos into an order folder
- attempts to send a seller notification email

## Project Location

- root: `/Users/amummaneni/Desktop/Codex/memory-tiles-shop`
- backend: `/Users/amummaneni/Desktop/Codex/memory-tiles-shop/server.py`
- storefront: `/Users/amummaneni/Desktop/Codex/memory-tiles-shop/static/index.html`
- styles: `/Users/amummaneni/Desktop/Codex/memory-tiles-shop/static/styles.css`
- frontend behavior: `/Users/amummaneni/Desktop/Codex/memory-tiles-shop/static/script.js`
- config template: `/Users/amummaneni/Desktop/Codex/memory-tiles-shop/.env.example`
- order data: `/Users/amummaneni/Desktop/Codex/memory-tiles-shop/data/orders`
- uploaded photos: `/Users/amummaneni/Desktop/Codex/memory-tiles-shop/data/uploads`

## Current Status

- Branding is set to `Magical Memories by Roswi`.
- Product is configured as `Custom Memory Tile`.
- Price is `$8.99` per tile.
- The order form requires customer email.
- The upload guidance changes based on quantity.
- Orders are being saved successfully.
- Public sharing currently uses a temporary tunnel, not a permanent deployment.
- Seller email delivery is not fully configured yet.

## Important Current Blocker

Order notification emails are not sending yet because SMTP sender settings are incomplete.

Configured already:

- `ORDER_NOTIFICATION_TO=roswithamunnangi@gmail.com`

Still missing in `.env`:

- `SMTP_HOST`
- `SMTP_FROM_EMAIL`
- likely `SMTP_USERNAME`
- `SMTP_PASSWORD`

For Gmail, the expected values are:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=roswithamunnangi@gmail.com
SMTP_FROM_EMAIL=roswithamunnangi@gmail.com
SMTP_PASSWORD=GMAIL_APP_PASSWORD
SMTP_USE_TLS=true
SMTP_USE_SSL=false
```

Use a Gmail App Password, not the normal account password.

## Local Run

From `/Users/amummaneni/Desktop/Codex/memory-tiles-shop`:

```sh
python3 server.py
```

Default local URL:

- `http://127.0.0.1:8000`

The app can also be started on another port:

```sh
python3 server.py 8001
```

## Environment Setup

Create a local `.env` from `.env.example` and fill in real values.

Minimum required settings for working orders plus seller email:

```env
HOST=0.0.0.0
PORT=8000
DATA_DIR=./data
STORE_NAME=Magical Memories by Roswi
PRODUCT_NAME=Custom Memory Tile
UNIT_PRICE_USD=8.99
PUBLIC_BASE_URL=https://your-public-site.example.com
ORDER_NOTIFICATION_TO=roswithamunnangi@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=roswithamunnangi@gmail.com
SMTP_PASSWORD=GMAIL_APP_PASSWORD
SMTP_FROM_EMAIL=roswithamunnangi@gmail.com
SMTP_USE_TLS=true
SMTP_USE_SSL=false
```

Do not commit `.env` with real secrets.

## Public Access

The site was exposed through a temporary tunnel during setup. That link can expire at any time and should not be treated as a real production URL.

A stable handoff should use one of:

- Render
- Railway
- a VPS or server you control
- a real custom domain

## Deployment Notes

The app is a plain Python HTTP server with static assets. It can run directly with Python or in Docker.

Docker files already exist:

- `/Users/amummaneni/Desktop/Codex/memory-tiles-shop/Dockerfile`

If deployed publicly, use persistent storage for `DATA_DIR` so order JSON files and uploaded photos are not lost on restart.

## Health Check

Endpoint:

- `GET /api/health`

This currently reports basic store info plus notification readiness booleans.

## Data and Privacy

Be careful when sharing this project with another person.

- `.env` may contain email credentials
- `data/orders` contains customer details
- `data/uploads` contains customer images

If this is a clean code handoff, exclude:

- `.env`
- `data/orders`
- `data/uploads`
- `__pycache__`

## Suggested Next Steps For The New Owner

1. Add the real SMTP settings and test email delivery.
2. Deploy to a stable host instead of using a tunnel.
3. Set `PUBLIC_BASE_URL` to the real live URL.
4. Verify one full test order end-to-end.
5. Decide whether to keep local file storage or move orders/uploads to cloud storage.

## Verification Already Done

These checks passed during setup:

- `python3 -m py_compile server.py`
- `node --check static/script.js`

The order API also saves orders even when email delivery is skipped, so sales are not lost if SMTP is not ready.
