# Magical Memories by Roswi Shop

Custom storefront for **Magical Memories by Roswi** featuring:

- branded landing page
- product catalog with **Add to Cart**
- cart summary and totals
- checkout form with customer shipping info
- customer **photo upload while ordering**
- backend order saving (JSON + uploaded files)
- optional seller email notifications

## Product Focus

- 2.5"x2.5" custom square magnets
- Instagram link included: [@MagicalMemories_byRoswi](https://www.instagram.com/MagicalMemories_byRoswi/)

## Run Locally

From this project folder:

```powershell
py server.py
```

Then open:

- `http://127.0.0.1:8000`

## Important: Google Sites Hosting

Google Sites **cannot run this Python backend directly**. This project needs a backend host for cart checkout + photo uploads.

Use this approach:

1. Deploy this app to a backend-capable host (Render or Railway recommended).
2. Get its live public URL (example: `https://magical-memories-by-roswi.onrender.com`).
3. In Google Sites, either:
   - link users to that URL, or
   - embed that URL inside a page using `Insert -> Embed -> By URL`.

## Fast Public Deployment (Render)

1. Create a GitHub repo and push this folder.
2. In Render: **New + -> Web Service**.
3. Connect repo.
4. Runtime: `Python 3`.
5. Build command: leave empty.
6. Start command:

```bash
python server.py
```

7. Add environment variables (at least):

```env
HOST=0.0.0.0
PORT=10000
DATA_DIR=./data
STORE_NAME=Magical Memories by Roswi
PRODUCT_NAME=2.5"x2.5" Square Magnet
UNIT_PRICE_USD=8.99
PUBLIC_BASE_URL=https://YOUR-RENDER-URL.onrender.com
```

8. Deploy and copy your generated Render URL.

That Render URL is your first public URL.

## Optional Email Notifications

Configure SMTP values in environment variables to receive seller alerts on each order.

## Data Folders

- Order JSON: `data/orders`
- Uploaded customer photos: `data/uploads`

Use persistent storage in production so uploads are not lost between restarts.
