#!/usr/bin/env python3

from __future__ import annotations

import json
import os
import re
import smtplib
import ssl
import sys
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from email import policy
from email.message import EmailMessage
from email.parser import BytesParser
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent


def load_local_env(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        name, value = line.split("=", 1)
        key = name.strip()
        cleaned = value.strip().strip('"').strip("'")
        if key:
            os.environ.setdefault(key, cleaned)


load_local_env(BASE_DIR / ".env")


def load_decimal_env(name: str, default: str) -> Decimal:
    raw_value = os.getenv(name, default).strip() or default
    try:
        return Decimal(raw_value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except InvalidOperation:
        return Decimal(default).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

STATIC_DIR = BASE_DIR / "static"
DATA_DIR = Path(os.getenv("DATA_DIR", str(BASE_DIR / "data"))).expanduser().resolve()
ORDERS_DIR = DATA_DIR / "orders"
UPLOADS_DIR = DATA_DIR / "uploads"

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
STORE_NAME = os.getenv("STORE_NAME", "Magical Memories by Roswi").strip() or "Magical Memories by Roswi"
PRODUCT_NAME = os.getenv("PRODUCT_NAME", "Custom Memory Tile").strip() or "Custom Memory Tile"
UNIT_PRICE_USD = load_decimal_env("UNIT_PRICE_USD", "8.99")
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "").strip().rstrip("/")

SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", "").strip()
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").strip().lower() not in {"0", "false", "no"}
SMTP_USE_SSL = os.getenv("SMTP_USE_SSL", "false").strip().lower() in {"1", "true", "yes"}
ORDER_NOTIFICATION_TO = [
    item.strip() for item in os.getenv("ORDER_NOTIFICATION_TO", "").split(",") if item.strip()
]
ORDER_NOTIFICATION_CC = [
    item.strip() for item in os.getenv("ORDER_NOTIFICATION_CC", "").split(",") if item.strip()
]

MAX_REQUEST_SIZE = 80 * 1024 * 1024
MAX_FILE_SIZE = 10 * 1024 * 1024
MAX_FILE_COUNT = 20

ALLOWED_IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
    ".heic",
    ".heif",
}

ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",
}

REQUIRED_FIELDS = (
    "customer_name",
    "email",
    "street_address",
    "city",
    "state",
    "zip_code",
    "product_quantity",
)


class ValidationError(Exception):
    pass


class NotificationError(Exception):
    pass


class MemoryTilesHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def do_GET(self) -> None:
        if urlparse(self.path).path == "/api/health":
            self.send_json(
                HTTPStatus.OK,
                {
                    "status": "ok",
                    "store": STORE_NAME,
                    "publicBaseUrl": PUBLIC_BASE_URL or "",
                    "notification": notification_readiness(),
                },
            )
            return

        super().do_GET()

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/api/orders":
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return

        try:
            fields, files = self.parse_multipart_form()
            order_record = build_order_record(fields, files)
            order_record["notification"] = build_notification_state(
                status="pending",
                details="Waiting to send seller email.",
            )
            persist_order(order_record)
            notification = send_order_notification(order_record)
            order_record["notification"] = notification
            persist_order(order_record)
        except ValidationError as exc:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
            return
        except NotificationError as exc:
            details = str(exc)
            if is_network_error(details):
                order_record["notification"] = build_notification_state(
                    status="queued",
                    details=f"Network issue detected. Seller email queued for retry. Original error: {details}",
                )
            else:
                order_record["notification"] = build_notification_state(
                    status="failed",
                    details=details,
                )
            persist_order(order_record)
            print(f"Email notification issue for {order_record['orderId']}: {details}", file=sys.stderr)
        except Exception:
            self.send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": "The order could not be saved right now."},
            )
            return

        self.send_json(
            HTTPStatus.CREATED,
            {
                "message": "Order received",
                "orderId": order_record["orderId"],
                "savedPhotos": len(order_record["photos"]),
                "notificationStatus": order_record["notification"]["status"],
                "notificationDetails": order_record["notification"]["details"],
            },
        )

    def parse_multipart_form(self) -> tuple[dict[str, str], list[dict[str, object]]]:
        content_type = self.headers.get("Content-Type", "")
        content_length = int(self.headers.get("Content-Length", "0"))

        if not content_type.startswith("multipart/form-data"):
            raise ValidationError("Please submit the order with attached photos.")

        if content_length <= 0:
            raise ValidationError("The order payload was empty.")

        if content_length > MAX_REQUEST_SIZE:
            raise ValidationError("The upload is too large. Keep the total under 80 MB.")

        body = self.rfile.read(content_length)
        header_block = (
            f"Content-Type: {content_type}\r\n"
            "MIME-Version: 1.0\r\n"
            "\r\n"
        ).encode("utf-8")

        message = BytesParser(policy=policy.default).parsebytes(header_block + body)
        if not message.is_multipart():
            raise ValidationError("The upload format was not recognized.")

        fields: dict[str, str] = {}
        files: list[dict[str, object]] = []

        for part in message.iter_parts():
            if part.get_content_disposition() != "form-data":
                continue

            field_name = part.get_param("name", header="content-disposition")
            if not field_name:
                continue

            filename = part.get_filename()
            payload = part.get_payload(decode=True) or b""

            if filename:
                files.append(
                    {
                        "field_name": field_name,
                        "filename": filename,
                        "content_type": part.get_content_type(),
                        "content": payload,
                    }
                )
                continue

            charset = part.get_content_charset() or "utf-8"
            fields[field_name] = payload.decode(charset, errors="replace").strip()

        return fields, files

    def send_json(self, status: HTTPStatus, payload: dict[str, object]) -> None:
        response = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response)


def build_order_record(fields: dict[str, str], files: list[dict[str, object]]) -> dict[str, object]:
    missing_fields = [field for field in REQUIRED_FIELDS if not fields.get(field)]
    if missing_fields:
        raise ValidationError("Please complete all required customer and order fields.")

    required_photo_count = parse_required_photo_count(fields)
    if len(files) < required_photo_count:
        raise ValidationError(
            f"Upload at least {required_photo_count} photos for this order."
        )

    if len(files) > MAX_FILE_COUNT:
        raise ValidationError(f"Upload no more than {MAX_FILE_COUNT} photos at a time.")

    if any(file_info["field_name"] != "photos" for file_info in files):
        raise ValidationError("Unexpected file field received.")

    total_bytes = 0
    pending_photos: list[dict[str, object]] = []
    saved_photos: list[dict[str, object]] = []
    order_id = f"MT-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"

    for index, file_info in enumerate(files, start=1):
        filename = str(file_info["filename"])
        content_type = str(file_info["content_type"]).lower()
        content = bytes(file_info["content"])

        total_bytes += len(content)
        if len(content) > MAX_FILE_SIZE:
            raise ValidationError("Each photo must be 10 MB or smaller.")

        suffix = Path(filename).suffix.lower()
        if suffix not in ALLOWED_IMAGE_EXTENSIONS and content_type not in ALLOWED_IMAGE_TYPES:
            raise ValidationError("Only image files can be uploaded.")

        safe_stem = sanitize_name(Path(filename).stem) or f"photo-{index:02d}"
        safe_suffix = suffix if suffix in ALLOWED_IMAGE_EXTENSIONS else ".jpg"
        saved_name = f"{index:02d}-{safe_stem}{safe_suffix}"
        pending_photos.append(
            {
                "originalName": filename,
                "storedName": saved_name,
                "contentType": content_type or "application/octet-stream",
                "sizeBytes": len(content),
                "content": content,
            }
        )

    if total_bytes > MAX_REQUEST_SIZE:
        raise ValidationError("The upload is too large. Keep the total under 80 MB.")

    upload_dir = UPLOADS_DIR / order_id
    upload_dir.mkdir(parents=True, exist_ok=True)

    for photo in pending_photos:
        saved_path = upload_dir / str(photo["storedName"])
        saved_path.write_bytes(bytes(photo["content"]))
        saved_photos.append(
            {
                "originalName": photo["originalName"],
                "storedName": photo["storedName"],
                "contentType": photo["contentType"],
                "sizeBytes": photo["sizeBytes"],
                "path": str(saved_path.relative_to(BASE_DIR)),
            }
        )

    submitted_at = datetime.now(timezone.utc).isoformat()
    notes = fields.get("notes", "")
    phone = fields.get("phone", "")
    cart_items = parse_cart_items(fields, required_photo_count)
    subtotal_usd = sum(
        (Decimal(item["unitPriceUsd"]) * int(item["quantity"])).quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        )
        for item in cart_items
    )
    if subtotal_usd == Decimal("0.00"):
        subtotal_usd = (UNIT_PRICE_USD * required_photo_count).quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        )

    unit_price_display = (
        format_usd(subtotal_usd / Decimal(required_photo_count))
        if required_photo_count > 0
        else format_usd(UNIT_PRICE_USD)
    )

    subtotal_usd = subtotal_usd.quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )

    order_record = {
        "orderId": order_id,
        "submittedAt": submitted_at,
        "storeName": STORE_NAME,
        "customer": {
            "name": fields["customer_name"],
            "email": fields["email"],
            "phone": phone,
            "address": {
                "street": fields["street_address"],
                "city": fields["city"],
                "state": fields["state"],
                "zipCode": fields["zip_code"],
            },
        },
        "order": {
            "productName": '2.5"x2.5" Square Magnet',
            "quantity": required_photo_count,
            "unitPriceUsd": unit_price_display,
            "subtotalUsd": format_usd(subtotal_usd),
            "notes": notes,
            "cartItems": cart_items,
        },
        "photos": saved_photos,
        "notification": build_notification_state(
            status="pending",
            details="Order saved before seller notification was attempted.",
        ),
    }

    return order_record


def persist_order(order_record: dict[str, object]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    ORDERS_DIR.mkdir(parents=True, exist_ok=True)
    order_path = ORDERS_DIR / f"{order_record['orderId']}.json"
    order_path.write_text(json.dumps(order_record, indent=2), encoding="utf-8")


def parse_required_photo_count(fields: dict[str, str]) -> int:
    quantity_raw = (fields.get("product_quantity") or "").strip()
    if not quantity_raw.isdigit():
        raise ValidationError("Select at least one magnet before checkout.")

    quantity = int(quantity_raw)
    if quantity < 1 or quantity > 200:
        raise ValidationError("Select a valid magnet quantity.")

    return quantity


def parse_cart_items(fields: dict[str, str], required_photo_count: int) -> list[dict[str, object]]:
    raw_cart = (fields.get("cart_items_json") or "").strip()
    if not raw_cart:
        return [
            {
                "productId": "default-square-magnet",
                "name": PRODUCT_NAME,
                "quantity": required_photo_count,
                "unitPriceUsd": format_usd(UNIT_PRICE_USD),
            }
        ]

    try:
        payload = json.loads(raw_cart)
    except json.JSONDecodeError as exc:
        raise ValidationError("The cart details could not be read.") from exc

    if not isinstance(payload, list) or not payload:
        raise ValidationError("Add at least one product to cart before checkout.")

    normalized: list[dict[str, object]] = []
    running_quantity = 0

    for index, raw_item in enumerate(payload, start=1):
        if not isinstance(raw_item, dict):
            raise ValidationError("A cart line item was invalid.")

        name = str(raw_item.get("name", "")).strip()
        if not name:
            raise ValidationError(f"Cart item {index} is missing a product name.")

        product_id = str(raw_item.get("productId", "")).strip() or f"item-{index}"
        quantity_raw = raw_item.get("quantity")
        if not isinstance(quantity_raw, int) or quantity_raw < 1:
            raise ValidationError(f"Cart item {index} has an invalid quantity.")

        price_raw = str(raw_item.get("price", "")).strip()
        try:
            unit_price = Decimal(price_raw).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        except (InvalidOperation, ValueError) as exc:
            raise ValidationError(f"Cart item {index} has an invalid price.") from exc

        if unit_price <= Decimal("0.00"):
            raise ValidationError(f"Cart item {index} has an invalid price.")

        running_quantity += quantity_raw
        normalized.append(
            {
                "productId": product_id,
                "name": name,
                "quantity": quantity_raw,
                "unitPriceUsd": format_usd(unit_price),
            }
        )

    if running_quantity != required_photo_count:
        raise ValidationError("Cart quantity does not match the checkout quantity.")

    return normalized


def build_notification_state(status: str, details: str) -> dict[str, object]:
    return {
        "channel": "email",
        "status": status,
        "details": details,
        "to": ORDER_NOTIFICATION_TO,
        "cc": ORDER_NOTIFICATION_CC,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }


def notification_readiness() -> dict[str, object]:
    return {
        "channel": "email",
        "ready": bool(ORDER_NOTIFICATION_TO and SMTP_HOST and SMTP_FROM_EMAIL),
        "recipientConfigured": bool(ORDER_NOTIFICATION_TO),
        "smtpHostConfigured": bool(SMTP_HOST),
        "smtpFromEmailConfigured": bool(SMTP_FROM_EMAIL),
        "smtpUsernameConfigured": bool(SMTP_USERNAME),
        "smtpPasswordConfigured": bool(SMTP_PASSWORD),
    }


def send_order_notification(order_record: dict[str, object]) -> dict[str, object]:
    if not ORDER_NOTIFICATION_TO:
        return build_notification_state(
            status="skipped",
            details="ORDER_NOTIFICATION_TO is not configured.",
        )

    if not SMTP_HOST or not SMTP_FROM_EMAIL:
        return build_notification_state(
            status="skipped",
            details="SMTP_HOST and SMTP_FROM_EMAIL are required for seller email alerts.",
        )

    message = EmailMessage()
    message["Subject"] = build_notification_subject(order_record)
    message["From"] = SMTP_FROM_EMAIL
    message["To"] = ", ".join(ORDER_NOTIFICATION_TO)
    if ORDER_NOTIFICATION_CC:
        message["Cc"] = ", ".join(ORDER_NOTIFICATION_CC)

    customer_email = str(order_record["customer"]["email"]).strip()
    if customer_email:
        message["Reply-To"] = customer_email

    message.set_content(build_notification_body(order_record))
    deliver_email(message)

    return build_notification_state(
        status="sent",
        details="Seller notification email sent.",
    )


def build_notification_subject(order_record: dict[str, object]) -> str:
    customer_name = str(order_record["customer"]["name"]).strip()
    return f"{STORE_NAME} order {order_record['orderId']} from {customer_name}"


def build_notification_body(order_record: dict[str, object]) -> str:
    customer = order_record["customer"]
    address = customer["address"]
    order = order_record["order"]
    photo_lines = [
        (
            f"- {photo['storedName']} ({photo['sizeBytes']} bytes) "
            f"[source: {photo['originalName']}] -> {photo['path']}"
        )
        for photo in order_record["photos"]
    ]
    site_line = PUBLIC_BASE_URL if PUBLIC_BASE_URL else "Not configured"
    phone = customer["phone"] or "Not provided"
    notes = order["notes"] or "None"

    lines = [
        f"Store: {STORE_NAME}",
        f"Public page: {site_line}",
        "",
        f"Order ID: {order_record['orderId']}",
        f"Submitted At: {order_record['submittedAt']}",
        "",
        "Customer",
        f"- Name: {customer['name']}",
        f"- Email: {customer['email']}",
        f"- Phone: {phone}",
        f"- Address: {address['street']}, {address['city']}, {address['state']} {address['zipCode']}",
        "",
        "Order",
        f"- Product: {order['productName']}",
        f"- Quantity: {order['quantity']}",
        f"- Unit Price: ${order['unitPriceUsd']}",
        f"- Subtotal: ${order['subtotalUsd']}",
        f"- Notes: {notes}",
        "",
        f"Uploaded Photos ({len(order_record['photos'])})",
        *photo_lines,
    ]

    return "\n".join(lines)


def deliver_email(message: EmailMessage) -> None:
    recipients = ORDER_NOTIFICATION_TO + ORDER_NOTIFICATION_CC
    if not recipients:
        raise NotificationError("No recipients were configured for seller email alerts.")

    try:
        if SMTP_USE_SSL:
            with smtplib.SMTP_SSL(
                SMTP_HOST,
                SMTP_PORT,
                timeout=20,
                context=ssl.create_default_context(),
            ) as server:
                if SMTP_USERNAME or SMTP_PASSWORD:
                    server.login(SMTP_USERNAME, SMTP_PASSWORD)
                server.send_message(message, to_addrs=recipients)
            return

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as server:
            server.ehlo()
            if SMTP_USE_TLS:
                server.starttls(context=ssl.create_default_context())
                server.ehlo()
            if SMTP_USERNAME or SMTP_PASSWORD:
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(message, to_addrs=recipients)
    except Exception as exc:
        raise NotificationError(f"Seller email was not delivered: {exc}") from exc

def is_network_error(error_text: str) -> bool:
    lowered = error_text.lower()
    return any(
        marker in lowered
        for marker in (
            "network is unreachable",
            "name or service not known",
            "temporary failure",
            "connection timed out",
            "timed out",
            "no route to host",
        )
    )

def sanitize_name(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]+", "-", value).strip("-_").lower()


def format_usd(amount: Decimal) -> str:
    return f"{amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP):.2f}"


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    ORDERS_DIR.mkdir(parents=True, exist_ok=True)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

    port = PORT
    if len(sys.argv) > 1:
        port = int(sys.argv[1])

    server = ThreadingHTTPServer((HOST, port), MemoryTilesHandler)
    host_display = PUBLIC_BASE_URL or f"http://{HOST}:{port}"
    print(f"Serving {STORE_NAME} on {host_display}")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()







