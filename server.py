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
MESSAGES_DIR = DATA_DIR / "messages"
EMAIL_QUEUE_DIR = DATA_DIR / "email_queue"

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
STORE_NAME = os.getenv("STORE_NAME", "Magical Memories by Roswi").strip() or "Magical Memories by Roswi"
PRODUCT_NAME = os.getenv("PRODUCT_NAME", '2.5"x2.5" square magnet').strip() or '2.5"x2.5" square magnet'
UNIT_PRICE_USD = load_decimal_env("UNIT_PRICE_USD", "2.99")
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "").strip().rstrip("/")
PAYMENT_CHECKOUT_URL = os.getenv("PAYMENT_CHECKOUT_URL", "").strip()

SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", "").strip() or SMTP_USERNAME
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").strip().lower() not in {"0", "false", "no"}
SMTP_USE_SSL = os.getenv("SMTP_USE_SSL", "false").strip().lower() in {"1", "true", "yes"}
ORDER_NOTIFICATION_TO = [
    item.strip() for item in os.getenv("ORDER_NOTIFICATION_TO", "").split(",") if item.strip()
]
ORDER_NOTIFICATION_CC = [
    item.strip() for item in os.getenv("ORDER_NOTIFICATION_CC", "").split(",") if item.strip()
]
CONTACT_NOTIFICATION_TO = [
    item.strip() for item in os.getenv("CONTACT_NOTIFICATION_TO", "").split(",") if item.strip()
]

MAX_REQUEST_SIZE = 80 * 1024 * 1024
MAX_FILE_SIZE = 10 * 1024 * 1024
MAX_FILE_COUNT = 40

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

REQUIRED_ORDER_FIELDS = (
    "customer_name",
    "email",
    "street_address",
    "city",
    "state",
    "zip_code",
    "product_quantity",
    "payment_method",
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
                    "payment": payment_readiness(),
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
        path = urlparse(self.path).path

        if path == "/api/orders":
            self.handle_order_create()
            return

        if path == "/api/contact":
            self.handle_contact_create()
            return

        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def handle_order_create(self) -> None:
        try:
            fields, files = self.parse_multipart_form()
            order_record = build_order_record(fields, files)
            order_record["notification"] = send_order_notification(order_record)
            persist_order(order_record)
        except ValidationError as exc:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
            return
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
                "paymentUrl": order_record["payment"].get("checkoutUrl", ""),
            },
        )

    def handle_contact_create(self) -> None:
        try:
            payload = self.parse_json_body()
            message_record = build_contact_message(payload)
            message_record["notification"] = send_contact_notification(message_record)
            persist_contact_message(message_record)
        except ValidationError as exc:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
            return
        except Exception:
            self.send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": "Your message could not be sent right now."},
            )
            return

        self.send_json(
            HTTPStatus.CREATED,
            {
                "message": "Thanks! Your message was sent.",
                "notificationStatus": message_record["notification"]["status"],
                "notificationDetails": message_record["notification"]["details"],
            },
        )

    def parse_json_body(self) -> dict[str, object]:
        content_type = self.headers.get("Content-Type", "")
        content_length = int(self.headers.get("Content-Length", "0"))

        if "application/json" not in content_type:
            raise ValidationError("Please send the contact form as JSON.")

        if content_length <= 0:
            raise ValidationError("The contact payload was empty.")

        body = self.rfile.read(content_length)
        try:
            payload = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise ValidationError("Contact payload was invalid.") from exc

        if not isinstance(payload, dict):
            raise ValidationError("Contact payload was invalid.")

        return payload

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
    missing_fields = [field for field in REQUIRED_ORDER_FIELDS if not fields.get(field)]
    if missing_fields:
        raise ValidationError("Please complete all required customer, payment, and order fields.")

    payment_method = normalize_payment_method(fields.get("payment_method", ""))
    required_photo_count = parse_required_photo_count(fields)

    if len(files) < required_photo_count:
        raise ValidationError(f"Upload at least {required_photo_count} photos for this order.")

    if len(files) > MAX_FILE_COUNT:
        raise ValidationError(f"Upload no more than {MAX_FILE_COUNT} photos at a time.")

    if any(file_info["field_name"] != "photos" for file_info in files):
        raise ValidationError("Unexpected file field received.")

    cart_items = parse_cart_items(fields, required_photo_count)

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

    subtotal_usd = sum(
        (Decimal(item["unitPriceUsd"]) * Decimal(item["quantity"]))
        .quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        for item in cart_items
    )

    if subtotal_usd <= Decimal("0.00"):
        subtotal_usd = (UNIT_PRICE_USD * required_photo_count).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    unit_price_display = (
        format_usd((subtotal_usd / Decimal(required_photo_count)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
        if required_photo_count > 0
        else format_usd(UNIT_PRICE_USD)
    )

    submitted_at = datetime.now(timezone.utc).isoformat()

    return {
        "orderId": order_id,
        "submittedAt": submitted_at,
        "storeName": STORE_NAME,
        "customer": {
            "name": fields["customer_name"],
            "email": fields["email"],
            "phone": fields.get("phone", ""),
            "address": {
                "street": fields["street_address"],
                "city": fields["city"],
                "state": fields["state"],
                "zipCode": fields["zip_code"],
            },
        },
        "order": {
            "productName": PRODUCT_NAME,
            "quantity": required_photo_count,
            "unitPriceUsd": unit_price_display,
            "subtotalUsd": format_usd(subtotal_usd),
            "notes": fields.get("notes", ""),
            "cartItems": cart_items,
        },
        "payment": {
            "method": payment_method,
            "status": "checkout_ready" if payment_method == "online" and PAYMENT_CHECKOUT_URL else "missing_checkout_url",
            "checkoutUrl": PAYMENT_CHECKOUT_URL,
            "details": "Online payment link is configured." if PAYMENT_CHECKOUT_URL else "Set PAYMENT_CHECKOUT_URL to enable online checkout.",
            "updatedAt": submitted_at,
        },
        "photos": saved_photos,
        "notification": build_notification_state("pending", "Notification not attempted yet."),
    }


def build_contact_message(payload: dict[str, object]) -> dict[str, object]:
    name = str(payload.get("name", "")).strip()
    email = str(payload.get("email", "")).strip()
    message = str(payload.get("message", "")).strip()

    if not name or not email or not message:
        raise ValidationError("Please complete name, email, and message.")

    if "@" not in email:
        raise ValidationError("Please provide a valid email address.")

    submitted_at = datetime.now(timezone.utc).isoformat()
    message_id = f"MSG-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"

    return {
        "messageId": message_id,
        "submittedAt": submitted_at,
        "name": name,
        "email": email,
        "message": message,
        "notification": build_notification_state("pending", "Notification not attempted yet."),
    }


def parse_required_photo_count(fields: dict[str, str]) -> int:
    quantity_raw = (fields.get("product_quantity") or "").strip()
    if not quantity_raw.isdigit():
        raise ValidationError("Select at least one magnet before checkout.")

    quantity = int(quantity_raw)
    if quantity < 1 or quantity > 500:
        raise ValidationError("Select a valid magnet quantity.")

    return quantity


def normalize_payment_method(value: str) -> str:
    method = value.strip().lower()
    if method != "online":
        raise ValidationError("Online payment is required for checkout.")
    return method


def parse_cart_items(fields: dict[str, str], required_photo_count: int) -> list[dict[str, object]]:
    raw_cart = (fields.get("cart_items_json") or "").strip()
    if not raw_cart:
        return [
            {
                "productId": "single",
                "name": PRODUCT_NAME,
                "quantity": required_photo_count,
                "magnetsPerUnit": 1,
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
    total_magnets = 0

    for index, raw_item in enumerate(payload, start=1):
        if not isinstance(raw_item, dict):
            raise ValidationError("A cart line item was invalid.")

        name = str(raw_item.get("name", "")).strip()
        product_id = str(raw_item.get("productId", "")).strip() or f"item-{index}"
        quantity_raw = raw_item.get("quantity")
        magnets_per_unit = raw_item.get("magnetsPerUnit", 1)

        if not name:
            raise ValidationError(f"Cart item {index} is missing a product name.")

        if not isinstance(quantity_raw, int) or quantity_raw < 1:
            raise ValidationError(f"Cart item {index} has an invalid quantity.")

        if not isinstance(magnets_per_unit, int) or magnets_per_unit < 1:
            raise ValidationError(f"Cart item {index} has an invalid magnets-per-unit value.")

        price_raw = str(raw_item.get("price", "")).strip()
        try:
            unit_price = Decimal(price_raw).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        except (InvalidOperation, ValueError) as exc:
            raise ValidationError(f"Cart item {index} has an invalid price.") from exc

        if unit_price <= Decimal("0.00"):
            raise ValidationError(f"Cart item {index} has an invalid price.")

        total_magnets += quantity_raw * magnets_per_unit

        normalized.append(
            {
                "productId": product_id,
                "name": name,
                "quantity": quantity_raw,
                "magnetsPerUnit": magnets_per_unit,
                "unitPriceUsd": format_usd(unit_price),
            }
        )

    if total_magnets != required_photo_count:
        raise ValidationError("Cart quantity does not match required photo count.")

    return normalized


def persist_order(order_record: dict[str, object]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    ORDERS_DIR.mkdir(parents=True, exist_ok=True)
    path = ORDERS_DIR / f"{order_record['orderId']}.json"
    path.write_text(json.dumps(order_record, indent=2), encoding="utf-8")


def persist_contact_message(message_record: dict[str, object]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    MESSAGES_DIR.mkdir(parents=True, exist_ok=True)
    path = MESSAGES_DIR / f"{message_record['messageId']}.json"
    path.write_text(json.dumps(message_record, indent=2), encoding="utf-8")


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


def payment_readiness() -> dict[str, object]:
    return {
        "onlinePaymentConfigured": bool(PAYMENT_CHECKOUT_URL),
        "paymentCheckoutUrlConfigured": bool(PAYMENT_CHECKOUT_URL),
    }


def send_order_notification(order_record: dict[str, object]) -> dict[str, object]:
    recipients = ORDER_NOTIFICATION_TO or ([SMTP_USERNAME] if SMTP_USERNAME else [])
    if not recipients:
        return build_notification_state("skipped", "ORDER_NOTIFICATION_TO is not configured.")

    if not SMTP_HOST or not SMTP_FROM_EMAIL:
        return build_notification_state("skipped", "SMTP_HOST and SMTP_FROM_EMAIL are required.")

    message = EmailMessage()
    message["Subject"] = f"{STORE_NAME} order {order_record['orderId']}"
    message["From"] = SMTP_FROM_EMAIL
    message["To"] = ", ".join(recipients)
    if ORDER_NOTIFICATION_CC:
        message["Cc"] = ", ".join(ORDER_NOTIFICATION_CC)

    customer_email = str(order_record["customer"]["email"]).strip()
    if customer_email:
        message["Reply-To"] = customer_email

    message.set_content(build_order_notification_body(order_record))
    return deliver_email(message, recipients + ORDER_NOTIFICATION_CC)


def send_contact_notification(message_record: dict[str, object]) -> dict[str, object]:
    recipients = CONTACT_NOTIFICATION_TO or ORDER_NOTIFICATION_TO or ([SMTP_USERNAME] if SMTP_USERNAME else [])
    if not recipients:
        return build_notification_state("skipped", "CONTACT_NOTIFICATION_TO or ORDER_NOTIFICATION_TO is not configured.")

    if not SMTP_HOST or not SMTP_FROM_EMAIL:
        return build_notification_state("skipped", "SMTP_HOST and SMTP_FROM_EMAIL are required.")

    message = EmailMessage()
    message["Subject"] = f"{STORE_NAME} contact message from {message_record['name']}"
    message["From"] = SMTP_FROM_EMAIL
    message["To"] = ", ".join(recipients)

    sender_email = str(message_record["email"]).strip()
    if sender_email:
        message["Reply-To"] = sender_email

    message.set_content(
        "\n".join(
            [
                f"Store: {STORE_NAME}",
                f"Message ID: {message_record['messageId']}",
                f"Submitted At: {message_record['submittedAt']}",
                "",
                f"Name: {message_record['name']}",
                f"Email: {message_record['email']}",
                "",
                "Message:",
                str(message_record["message"]),
            ]
        )
    )

    return deliver_email(message, recipients)


def build_order_notification_body(order_record: dict[str, object]) -> str:
    customer = order_record["customer"]
    address = customer["address"]
    order = order_record["order"]
    payment = order_record.get("payment", {})

    photo_lines = [
        (
            f"- {photo['storedName']} ({photo['sizeBytes']} bytes) "
            f"[source: {photo['originalName']}] -> {photo['path']}"
        )
        for photo in order_record["photos"]
    ]

    cart_lines = [
        (
            f"- {item['name']} | quantity: {item['quantity']} | "
            f"magnets/unit: {item.get('magnetsPerUnit', 1)} | price: ${item['unitPriceUsd']}"
        )
        for item in order.get("cartItems", [])
    ]

    lines = [
        f"Store: {STORE_NAME}",
        f"Public page: {PUBLIC_BASE_URL or 'Not configured'}",
        "",
        f"Order ID: {order_record['orderId']}",
        f"Submitted At: {order_record['submittedAt']}",
        "",
        "Customer",
        f"- Name: {customer['name']}",
        f"- Email: {customer['email']}",
        f"- Phone: {customer['phone'] or 'Not provided'}",
        f"- Address: {address['street']}, {address['city']}, {address['state']} {address['zipCode']}",
        "",
        "Order",
        f"- Product: {order['productName']}",
        f"- Quantity: {order['quantity']}",
        f"- Unit Price: ${order['unitPriceUsd']}",
        f"- Subtotal: ${order['subtotalUsd']}",
        f"- Notes: {order['notes'] or 'None'}",
        "",
        "Cart Items",
        *cart_lines,
        "",
        "Payment",
        f"- Method: {payment.get('method', 'online')}",
        f"- Status: {payment.get('status', 'unknown')}",
        f"- Checkout URL: {payment.get('checkoutUrl', '') or 'Not configured'}",
        "",
        f"Uploaded Photos ({len(order_record['photos'])})",
        *photo_lines,
    ]

    return "\n".join(lines)


def deliver_email(message: EmailMessage, recipients: list[str]) -> dict[str, object]:
    if not recipients:
        return build_notification_state("skipped", "No recipients configured.")

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
            return build_notification_state("sent", "Email delivered.")

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as server:
            server.ehlo()
            if SMTP_USE_TLS:
                server.starttls(context=ssl.create_default_context())
                server.ehlo()
            if SMTP_USERNAME or SMTP_PASSWORD:
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(message, to_addrs=recipients)
        return build_notification_state("sent", "Email delivered.")
    except Exception as exc:
        details = str(exc)
        if is_network_error(details):
            queue_email_message(message)
            return build_notification_state("queued", f"Network issue. Email queued for retry. Error: {details}")
        return build_notification_state("failed", f"Email send failed: {details}")


def queue_email_message(message: EmailMessage) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    EMAIL_QUEUE_DIR.mkdir(parents=True, exist_ok=True)
    file_name = f"email-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}.eml"
    (EMAIL_QUEUE_DIR / file_name).write_bytes(message.as_bytes())


def build_notification_state(status: str, details: str) -> dict[str, object]:
    return {
        "channel": "email",
        "status": status,
        "details": details,
        "to": ORDER_NOTIFICATION_TO,
        "cc": ORDER_NOTIFICATION_CC,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }


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
    MESSAGES_DIR.mkdir(parents=True, exist_ok=True)
    EMAIL_QUEUE_DIR.mkdir(parents=True, exist_ok=True)

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



