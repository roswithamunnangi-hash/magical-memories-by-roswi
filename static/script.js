const STORE_NAME = "Magical Memories by Roswi";
const SUPPORT_EMAIL = "roswithamunnangi@gmail.com";
const ONLINE_PAYMENT_URL = "https://buy.stripe.com/test_placeholder";
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_COUNT = 20;
const previewUrls = [];

const GALLERY_IMAGES = [
  {
    primary: "./assets/photos/magnet-photo-1.png",
    fallback: "https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=80&w=1200",
    alt: "Square baby magnet closeup",
  },
  {
    primary: "./assets/photos/magnet-photo-2.png",
    fallback: "https://images.unsplash.com/photo-1609220136736-443140cffec6?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=80&w=1200",
    alt: "Magnet set on tabletop stand",
  },
  {
    primary: "./assets/photos/magnet-photo-3.png",
    fallback: "https://images.unsplash.com/photo-1471341971476-ae15ff5dd4ea?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=80&w=1200",
    alt: "Magnets on refrigerator",
  },
  {
    primary: "./assets/photos/magnet-photo-4.png",
    fallback: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=80&w=1200",
    alt: "Locker magnets",
  },
  {
    primary: "./assets/photos/magnet-photo-5.png",
    fallback: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=80&w=1200",
    alt: "Beach couple magnet closeup",
  },
];

const PRODUCTS = [
  {
    id: "single-square",
    name: '2.5"x2.5" square magnet',
    description: "Order single custom square magnets.",
    price: 2.99,
    magnetsPerUnit: 1,
    galleryIndex: 0,
  },
  {
    id: "set-nine",
    name: '2.5"x2.5" square magnet (set of 9)',
    description: "Best value bundle for family sets and gifts.",
    price: 25.0,
    magnetsPerUnit: 9,
    galleryIndex: 1,
  },
];

const refs = {};
const cart = new Map();
let carouselIndex = 0;
let carouselTimer = null;

document.addEventListener("DOMContentLoaded", () => {
  cacheRefs();
  bindEvents();
  renderCarousel();
  renderCatalog();
  syncCartAndSummary();
  startCarouselAutoplay();
});

function cacheRefs() {
  refs.orderForm = document.getElementById("orderForm");
  refs.contactForm = document.getElementById("contactForm");
  refs.catalogGrid = document.getElementById("catalogGrid");
  refs.cartItems = document.getElementById("cartItems");
  refs.emptyCartMessage = document.getElementById("emptyCartMessage");
  refs.cartItemCount = document.getElementById("cartItemCount");
  refs.cartSubtotal = document.getElementById("cartSubtotal");
  refs.cartItemsJson = document.getElementById("cartItemsJson");
  refs.productQuantity = document.getElementById("productQuantity");

  refs.carouselTrack = document.getElementById("carouselTrack");
  refs.carouselDots = document.getElementById("carouselDots");
  refs.carouselPrev = document.getElementById("carouselPrev");
  refs.carouselNext = document.getElementById("carouselNext");

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
  refs.contactStatus = document.getElementById("contactStatus");
  refs.contactSubmitButton = document.getElementById("contactSubmitButton");
}

function bindEvents() {
  refs.catalogGrid.addEventListener("click", handleCatalogClick);
  refs.cartItems.addEventListener("click", handleCartClick);
  refs.photos.addEventListener("change", handlePhotosChange);
  refs.orderForm.addEventListener("submit", handleSubmitOrder);
  refs.contactForm.addEventListener("submit", handleSubmitContact);

  refs.carouselPrev.addEventListener("click", () => moveCarousel(-1));
  refs.carouselNext.addEventListener("click", () => moveCarousel(1));
  refs.carouselDots.addEventListener("click", handleDotClick);
  refs.carouselTrack.addEventListener("mouseenter", stopCarouselAutoplay);
  refs.carouselTrack.addEventListener("mouseleave", startCarouselAutoplay);
}

function renderCarousel() {
  refs.carouselTrack.innerHTML = GALLERY_IMAGES.map(
    (image) => `
      <figure class="carousel-slide">
        <img src="${image.primary}" alt="${image.alt}" data-fallback="${image.fallback}" loading="lazy" />
      </figure>
    `
  ).join("");

  refs.carouselDots.innerHTML = GALLERY_IMAGES.map(
    (_, index) => `
      <button type="button" class="carousel-dot ${index === 0 ? "is-active" : ""}" data-dot-index="${index}" aria-label="Go to slide ${index + 1}"></button>
    `
  ).join("");

  applyFallbackImages(refs.carouselTrack);
  updateCarouselPosition();
}

function startCarouselAutoplay() {
  stopCarouselAutoplay();
  carouselTimer = window.setInterval(() => {
    moveCarousel(1);
  }, 3500);
}

function stopCarouselAutoplay() {
  if (carouselTimer) {
    window.clearInterval(carouselTimer);
    carouselTimer = null;
  }
}

function moveCarousel(direction) {
  carouselIndex = (carouselIndex + direction + GALLERY_IMAGES.length) % GALLERY_IMAGES.length;
  updateCarouselPosition();
}

function handleDotClick(event) {
  const button = event.target.closest("[data-dot-index]");
  if (!button) {
    return;
  }

  carouselIndex = Number(button.dataset.dotIndex);
  updateCarouselPosition();
}

function updateCarouselPosition() {
  refs.carouselTrack.style.transform = `translateX(-${carouselIndex * 100}%)`;

  Array.from(refs.carouselDots.querySelectorAll(".carousel-dot")).forEach((dot, index) => {
    dot.classList.toggle("is-active", index === carouselIndex);
  });
}

function renderCatalog() {
  refs.catalogGrid.innerHTML = PRODUCTS.map((product) => {
    const image = GALLERY_IMAGES[product.galleryIndex] || GALLERY_IMAGES[0];
    return `
      <article class="catalog-card">
        <img src="${image.primary}" alt="${product.name}" data-fallback="${image.fallback}" loading="lazy" />
        <div class="catalog-card-body">
          <p class="section-tag">2.5&quot;x2.5&quot; square magnet</p>
          <h3>${product.name}</h3>
          <p>${product.description}</p>
          <div class="catalog-footer">
            <strong>${formatCurrency(product.price)}</strong>
            <button class="button button-primary" type="button" data-add-id="${product.id}">Add to cart</button>
          </div>
        </div>
      </article>
    `;
  }).join("");

  applyFallbackImages(refs.catalogGrid);
}

function applyFallbackImages(parent) {
  parent.querySelectorAll("img[data-fallback]").forEach((image) => {
    image.addEventListener("error", () => {
      if (!image.dataset.failedOnce) {
        image.dataset.failedOnce = "true";
        image.src = image.dataset.fallback;
      }
    });
  });
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
    magnetsPerUnit: product.magnetsPerUnit,
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
  const magnetCount = totalMagnets();
  const subtotal = totalPrice();

  refs.productQuantity.value = String(Math.max(magnetCount, 1));
  refs.cartItemsJson.value = JSON.stringify(items);

  refs.cartItems.innerHTML = items
    .map(
      (item) => `
      <li class="cart-item">
        <div>
          <strong>${item.name}</strong>
          <span>${item.quantity} x ${formatCurrency(item.price)} (${item.quantity * item.magnetsPerUnit} magnets)</span>
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
  refs.cartItemCount.textContent = String(magnetCount);
  refs.cartSubtotal.textContent = formatCurrency(subtotal);

  refs.summaryProduct.textContent = items.length ? `${STORE_NAME} Cart` : '2.5"x2.5" square magnet';
  refs.summaryQuantity.textContent = String(magnetCount);
  refs.summaryUnitPrice.textContent = "From $2.99";
  refs.summaryPhotoMinimum.textContent = `${magnetCount || 1} ${(magnetCount || 1) === 1 ? "image" : "images"}`;
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

async function handleSubmitOrder(event) {
  event.preventDefault();
  clearStatus();

  const validationError = validateOrderForm();
  if (validationError) {
    setStatus(validationError, "error");
    return;
  }

  refs.submitButton.disabled = true;
  refs.submitButton.textContent = "Saving order...";

  try {
    const formData = new FormData(refs.orderForm);
    const paymentMethod = String(formData.get("payment_method") || "pay_later");

    const response = await fetch("/api/orders", {
      method: "POST",
      body: formData,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "The order could not be submitted.");
    }

    const emailNote = payload.notificationStatus === "failed"
      ? " Seller email is temporarily delayed, but your order was saved successfully."
      : payload.notificationStatus === "queued"
      ? " Seller email is queued and will retry automatically."
      : "";

    setStatus(`Order ${payload.orderId} received with ${payload.savedPhotos} uploaded photos.${emailNote}`, "success");

    if (paymentMethod === "online") {
      window.setTimeout(() => {
        window.location.href = ONLINE_PAYMENT_URL;
      }, 1200);
      return;
    }

    refs.orderForm.reset();
    cart.clear();
    refs.photoPreview.innerHTML = "";
    refs.photoCount.textContent = "No photos selected yet";
    clearPreviewUrls();
    syncCartAndSummary();
  } catch (error) {
    setStatus(error.message || "The order could not be submitted.", "error");
  } finally {
    refs.submitButton.disabled = false;
    refs.submitButton.textContent = "Place order";
  }
}

function handleSubmitContact(event) {
  event.preventDefault();
  refs.contactStatus.textContent = "";
  refs.contactStatus.className = "form-status";

  if (!refs.contactForm.reportValidity()) {
    refs.contactStatus.textContent = "Please fill out all fields before sending.";
    refs.contactStatus.classList.add("is-error");
    return;
  }

  const name = refs.contactForm.elements.name.value;
  const email = refs.contactForm.elements.email.value;
  const message = refs.contactForm.elements.message.value;

  const subject = encodeURIComponent(`${STORE_NAME} customer question from ${name}`);
  const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\nQuestion:\n${message}`);

  window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  refs.contactStatus.textContent = "Your email app is opening to send the message.";
  refs.contactStatus.classList.add("is-success");
}

function validateOrderForm() {
  const requiredPhotoCount = totalMagnets();
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

  if (ONLINE_PAYMENT_URL.includes("test_placeholder") && selectedPaymentMethod() === "online") {
    return "Set your real payment link in static/script.js (ONLINE_PAYMENT_URL) before accepting online payments.";
  }

  return "";
}

function selectedPaymentMethod() {
  const selected = refs.orderForm.querySelector('input[name="payment_method"]:checked');
  return selected ? selected.value : "pay_later";
}

function syncUploadGuidance(files = Array.from(refs.photos.files || [])) {
  const quantity = Math.max(totalMagnets(), 1);
  const missingPhotos = Math.max(quantity - files.length, 0);

  refs.photoHint.textContent = `Upload at least ${quantity} ${quantity === 1 ? "image" : "images"} for the cart total.`;
  refs.photoRequirement.textContent = `${quantity} ${quantity === 1 ? "photo required" : "photos required"}`;

  if (!totalMagnets()) {
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

function totalMagnets() {
  return Array.from(cart.values()).reduce((sum, item) => sum + item.quantity * item.magnetsPerUnit, 0);
}

function totalPrice() {
  return Array.from(cart.values()).reduce((sum, item) => sum + item.quantity * item.price, 0);
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
