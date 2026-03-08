const STORE_NAME = "Magical Memories by Roswi";
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_COUNT = 20;
const previewUrls = [];

const PRODUCTS = [
  {
    id: "classic-square",
    name: 'Classic 2.5"x2.5" Magnet',
    description: "Best seller for everyday memories and gift packs.",
    price: 8.99,
    image:
      "https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=80&w=1200",
  },
  {
    id: "gloss-square",
    name: 'Gloss Finish 2.5"x2.5" Magnet',
    description: "Extra shine for colorful photos and celebration moments.",
    price: 9.99,
    image:
      "https://images.unsplash.com/photo-1609220136736-443140cffec6?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=80&w=1200",
  },
  {
    id: "gift-square",
    name: 'Gift Pack 2.5"x2.5" Magnet',
    description: "Curated style for birthdays, baby milestones, and anniversaries.",
    price: 10.99,
    image:
      "https://images.unsplash.com/photo-1471341971476-ae15ff5dd4ea?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=80&w=1200",
  },
];

const refs = {};
const cart = new Map();

document.addEventListener("DOMContentLoaded", () => {
  cacheRefs();
  bindEvents();
  renderCatalog();
  syncCartAndSummary();
});

function cacheRefs() {
  refs.orderForm = document.getElementById("orderForm");
  refs.catalogGrid = document.getElementById("catalogGrid");
  refs.cartItems = document.getElementById("cartItems");
  refs.emptyCartMessage = document.getElementById("emptyCartMessage");
  refs.cartItemCount = document.getElementById("cartItemCount");
  refs.cartSubtotal = document.getElementById("cartSubtotal");
  refs.cartItemsJson = document.getElementById("cartItemsJson");
  refs.productQuantity = document.getElementById("productQuantity");

  refs.photos = document.getElementById("photos");
  refs.photoPreview = document.getElementById("photoPreview");
  refs.photoCount = document.getElementById("photoCount");
  refs.photoHint = document.getElementById("photoHint");
  refs.photoRequirement = document.getElementById("photoRequirement");
  refs.uploadSuggestion = document.getElementById("uploadSuggestion");

  refs.summaryProduct = document.getElementById("summaryProduct");
  refs.summaryQuantity = document.getElementById("summaryQuantity");
  refs.summaryUnitPrice = document.getElementById("summaryUnitPrice");
  refs.summaryPhotoMinimum = document.getElementById("summaryPhotoMinimum");
  refs.summarySubtotal = document.getElementById("summarySubtotal");
  refs.summaryTotal = document.getElementById("summaryTotal");

  refs.formStatus = document.getElementById("formStatus");
  refs.submitButton = document.getElementById("submitButton");
}

function bindEvents() {
  refs.catalogGrid.addEventListener("click", handleCatalogClick);
  refs.cartItems.addEventListener("click", handleCartClick);
  refs.photos.addEventListener("change", handlePhotosChange);
  refs.orderForm.addEventListener("submit", handleSubmit);
}

function renderCatalog() {
  refs.catalogGrid.innerHTML = PRODUCTS.map(
    (product) => `
      <article class="catalog-card">
        <img src="${product.image}" alt="${product.name}" loading="lazy" />
        <div class="catalog-card-body">
          <p class="section-tag">2.5&quot;x2.5&quot; magnet</p>
          <h3>${product.name}</h3>
          <p>${product.description}</p>
          <div class="catalog-footer">
            <strong>${formatCurrency(product.price)}</strong>
            <button class="button button-primary" type="button" data-add-id="${product.id}">Add to cart</button>
          </div>
        </div>
      </article>
    `
  ).join("");
}

function handleCatalogClick(event) {
  const addButton = event.target.closest("[data-add-id]");
  if (!addButton) {
    return;
  }

  const productId = addButton.dataset.addId;
  const product = PRODUCTS.find((item) => item.id === productId);
  if (!product) {
    return;
  }

  const existing = cart.get(productId) || {
    productId,
    name: product.name,
    price: product.price,
    quantity: 0,
  };

  existing.quantity += 1;
  cart.set(productId, existing);
  syncCartAndSummary();
}

function handleCartClick(event) {
  const removeButton = event.target.closest("[data-remove-id]");
  if (!removeButton) {
    return;
  }

  const productId = removeButton.dataset.removeId;
  if (!cart.has(productId)) {
    return;
  }

  const item = cart.get(productId);
  if (item.quantity <= 1) {
    cart.delete(productId);
  } else {
    item.quantity -= 1;
    cart.set(productId, item);
  }

  syncCartAndSummary();
}

function syncCartAndSummary() {
  const items = Array.from(cart.values());
  const itemCount = totalQuantity();
  const subtotal = totalPrice();

  refs.productQuantity.value = String(Math.max(itemCount, 1));
  refs.cartItemsJson.value = JSON.stringify(items);

  refs.cartItems.innerHTML = items
    .map(
      (item) => `
      <li class="cart-item">
        <div>
          <strong>${item.name}</strong>
          <span>${item.quantity} x ${formatCurrency(item.price)}</span>
        </div>
        <div class="cart-item-right">
          <em>${formatCurrency(item.quantity * item.price)}</em>
          <button type="button" class="cart-remove" data-remove-id="${item.productId}">Remove</button>
        </div>
      </li>
    `
    )
    .join("");

  refs.emptyCartMessage.hidden = items.length > 0;
  refs.cartItemCount.textContent = String(itemCount);
  refs.cartSubtotal.textContent = formatCurrency(subtotal);

  refs.summaryProduct.textContent = items.length ? `${STORE_NAME} Cart` : '2.5"x2.5" Square Magnet';
  refs.summaryQuantity.textContent = String(itemCount);
  refs.summaryUnitPrice.textContent = items.length ? `From ${formatCurrency(minUnitPrice())}` : "Varies";
  refs.summaryPhotoMinimum.textContent = `${itemCount || 1} ${(itemCount || 1) === 1 ? "image" : "images"}`;
  refs.summarySubtotal.textContent = formatCurrency(subtotal);
  refs.summaryTotal.textContent = formatCurrency(subtotal);

  syncUploadGuidance();
}

function handlePhotosChange() {
  clearPreviewUrls();

  const files = Array.from(refs.photos.files || []);
  refs.photoPreview.innerHTML = "";
  syncUploadGuidance(files);

  if (!files.length) {
    refs.photoCount.textContent = "No photos selected yet";
    return;
  }

  refs.photoCount.textContent = `${files.length} photo${files.length === 1 ? "" : "s"} selected`;

  files.forEach((file) => {
    const previewUrl = URL.createObjectURL(file);
    previewUrls.push(previewUrl);

    const card = document.createElement("li");
    const image = document.createElement("img");
    const title = document.createElement("strong");
    const meta = document.createElement("span");

    image.src = previewUrl;
    image.alt = file.name;
    title.textContent = truncate(file.name, 22);
    meta.textContent = `${formatMegabytes(file.size)} MB`;

    card.append(image, title, meta);
    refs.photoPreview.appendChild(card);
  });
}

async function handleSubmit(event) {
  event.preventDefault();
  clearStatus();

  const validationError = validateForm();
  if (validationError) {
    setStatus(validationError, "error");
    return;
  }

  refs.submitButton.disabled = true;
  refs.submitButton.textContent = "Sending order...";

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      body: new FormData(refs.orderForm),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "The order could not be submitted.");
    }

    refs.orderForm.reset();
    cart.clear();
    refs.photoPreview.innerHTML = "";
    refs.photoCount.textContent = "No photos selected yet";
    clearPreviewUrls();
    syncCartAndSummary();

    const emailText = payload.notificationStatus === "sent"
      ? " Seller notification email sent."
      : payload.notificationDetails
      ? ` Seller notification email was not sent: ${payload.notificationDetails}`
      : "";

    setStatus(
      `Order ${payload.orderId} was received with ${payload.savedPhotos} uploaded photos.${emailText}`,
      "success"
    );
  } catch (error) {
    setStatus(error.message || "The order could not be submitted.", "error");
  } finally {
    refs.submitButton.disabled = false;
    refs.submitButton.textContent = "Place order";
  }
}

function validateForm() {
  const requiredPhotoCount = totalQuantity();
  const files = Array.from(refs.photos.files || []);

  if (!refs.orderForm.reportValidity()) {
    return "Please complete the required fields before submitting.";
  }

  if (!requiredPhotoCount) {
    return "Please add at least one magnet to cart before checkout.";
  }

  if (files.length < requiredPhotoCount) {
    return `Upload at least ${requiredPhotoCount} ${requiredPhotoCount === 1 ? "photo" : "photos"} for this order.`;
  }

  if (files.length > MAX_FILE_COUNT) {
    return `Please upload no more than ${MAX_FILE_COUNT} photos.`;
  }

  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      return "Only image files can be uploaded.";
    }

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return `Each photo must be ${MAX_FILE_SIZE_MB} MB or smaller.`;
    }
  }

  return "";
}

function syncUploadGuidance(files = Array.from(refs.photos.files || [])) {
  const quantity = Math.max(totalQuantity(), 1);
  const missingPhotos = Math.max(quantity - files.length, 0);

  refs.photoHint.textContent = `Upload at least ${quantity} ${quantity === 1 ? "image" : "images"} for the cart total.`;
  refs.photoRequirement.textContent = `${quantity} ${quantity === 1 ? "photo required" : "photos required"}`;

  if (!totalQuantity()) {
    refs.uploadSuggestion.textContent = "Start by adding magnets to cart so we can calculate required photos.";
    return;
  }

  if (!files.length) {
    refs.uploadSuggestion.textContent = `You selected ${quantity} magnets, so please upload matching photos.`;
    return;
  }

  if (missingPhotos > 0) {
    refs.uploadSuggestion.textContent = `Add ${missingPhotos} more ${missingPhotos === 1 ? "photo" : "photos"} so each magnet has an image.`;
    return;
  }

  refs.uploadSuggestion.textContent = "Great. You have enough attachments for your current cart.";
}

function totalQuantity() {
  return Array.from(cart.values()).reduce((sum, item) => sum + item.quantity, 0);
}

function totalPrice() {
  return Array.from(cart.values()).reduce((sum, item) => sum + item.quantity * item.price, 0);
}

function minUnitPrice() {
  return PRODUCTS.reduce((min, product) => Math.min(min, product.price), PRODUCTS[0].price);
}

function setStatus(message, tone) {
  refs.formStatus.textContent = message;
  refs.formStatus.className = `form-status ${tone === "error" ? "is-error" : "is-success"}`;
}

function clearStatus() {
  refs.formStatus.textContent = "";
  refs.formStatus.className = "form-status";
}

function clearPreviewUrls() {
  while (previewUrls.length) {
    URL.revokeObjectURL(previewUrls.pop());
  }
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatMegabytes(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "");
}

function truncate(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}
