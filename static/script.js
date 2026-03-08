const STORE_NAME = "Magical Memories by Roswi";
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_COUNT = 20;
const previewUrls = [];

const GALLERY_IMAGES = [
  { primary: "./assets/photos/magnet-photo-1.png", fallback: "https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=80&w=1200", alt: "Square baby magnet closeup" },
  { primary: "./assets/photos/magnet-photo-2.png", fallback: "https://images.unsplash.com/photo-1609220136736-443140cffec6?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=80&w=1200", alt: "Magnet set on tabletop stand" },
  { primary: "./assets/photos/magnet-photo-3.png", fallback: "https://images.unsplash.com/photo-1471341971476-ae15ff5dd4ea?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=80&w=1200", alt: "Magnets on refrigerator" },
  { primary: "./assets/photos/magnet-photo-4.png", fallback: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=80&w=1200", alt: "Locker magnets" },
  { primary: "./assets/photos/magnet-photo-5.png", fallback: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=80&w=1200", alt: "Beach couple magnet closeup" },
];

const PRODUCTS = [
  { id: "single-square", name: '2.5"x2.5" square magnet', description: "Order single custom square magnets.", price: 2.99, magnetsPerUnit: 1, galleryIndex: 0 },
  { id: "set-nine", name: '2.5"x2.5" square magnet (set of 9)', description: "Best value bundle for family sets and gifts.", price: 25.0, magnetsPerUnit: 9, galleryIndex: 1 },
];

const refs = {};
const cart = new Map();
let carouselIndex = 0;
let carouselTimer = null;
let selectedFiles = [];
const cropState = {
  activeIndex: -1,
  image: null,
  imageUrl: "",
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
};

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
  refs.cropNowButton = document.getElementById("cropNowButton");
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

  refs.cropModal = document.getElementById("cropModal");
  refs.cropCanvas = document.getElementById("cropCanvas");
  refs.cropZoom = document.getElementById("cropZoom");
  refs.cropX = document.getElementById("cropX");
  refs.cropY = document.getElementById("cropY");
  refs.cropApply = document.getElementById("cropApply");
  refs.cropCancel = document.getElementById("cropCancel");
}

function bindEvents() {
  refs.catalogGrid.addEventListener("click", handleCatalogClick);
  refs.cartItems.addEventListener("click", handleCartClick);
  refs.photos.addEventListener("change", handlePhotosChange);
  refs.cropNowButton.addEventListener("click", handleCropNowClick);
  refs.photoPreview.addEventListener("click", handlePreviewClick);
  refs.orderForm.addEventListener("submit", handleSubmitOrder);
  refs.contactForm.addEventListener("submit", handleSubmitContact);

  refs.carouselPrev.addEventListener("click", () => moveCarousel(-1));
  refs.carouselNext.addEventListener("click", () => moveCarousel(1));
  refs.carouselDots.addEventListener("click", handleDotClick);
  refs.carouselTrack.addEventListener("mouseenter", stopCarouselAutoplay);
  refs.carouselTrack.addEventListener("mouseleave", startCarouselAutoplay);

  refs.cropZoom.addEventListener("input", updateCropPreviewFromControls);
  refs.cropX.addEventListener("input", updateCropPreviewFromControls);
  refs.cropY.addEventListener("input", updateCropPreviewFromControls);
  refs.cropApply.addEventListener("click", applyManualCrop);
  refs.cropCancel.addEventListener("click", closeCropModal);
}

function renderCarousel() {
  refs.carouselTrack.innerHTML = GALLERY_IMAGES.map(
    (image) => `<figure class="carousel-slide"><img src="${image.primary}" alt="${image.alt}" data-fallback="${image.fallback}" loading="lazy" /></figure>`
  ).join("");

  refs.carouselDots.innerHTML = GALLERY_IMAGES.map(
    (_, index) => `<button type="button" class="carousel-dot ${index === 0 ? "is-active" : ""}" data-dot-index="${index}" aria-label="Go to slide ${index + 1}"></button>`
  ).join("");

  applyFallbackImages(refs.carouselTrack);
  updateCarouselPosition();
}

function startCarouselAutoplay() {
  stopCarouselAutoplay();
  carouselTimer = window.setInterval(() => moveCarousel(1), 3500);
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
  if (!button) return;
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
  if (!addButton) return;

  const product = PRODUCTS.find((item) => item.id === addButton.dataset.addId);
  if (!product) return;

  const existing = cart.get(product.id) || {
    productId: product.id,
    name: product.name,
    price: product.price,
    quantity: 0,
    magnetsPerUnit: product.magnetsPerUnit,
  };

  existing.quantity += 1;
  cart.set(product.id, existing);
  syncCartAndSummary();
}

function handleCartClick(event) {
  const removeButton = event.target.closest("[data-remove-id]");
  if (!removeButton) return;

  const item = cart.get(removeButton.dataset.removeId);
  if (!item) return;

  if (item.quantity <= 1) {
    cart.delete(removeButton.dataset.removeId);
  } else {
    item.quantity -= 1;
    cart.set(removeButton.dataset.removeId, item);
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
      </li>`
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
  selectedFiles = Array.from(refs.photos.files || []);
  renderPhotoPreview();
}

function handleCropNowClick() {
  if (!selectedFiles.length) {
    setStatus("Select photos first, then crop.", "error");
    return;
  }

  openCropModal(0);
}

function handlePreviewClick(event) {
  const cropButton = event.target.closest("[data-crop-index]");
  if (!cropButton) return;
  openCropModal(Number(cropButton.dataset.cropIndex));
}

function openCropModal(index) {
  if (!selectedFiles[index]) return;

  const file = selectedFiles[index];
  if (!file.type.startsWith("image/")) {
    setStatus("Only image files can be cropped.", "error");
    return;
  }

  if (cropState.imageUrl) {
    URL.revokeObjectURL(cropState.imageUrl);
  }

  cropState.activeIndex = index;
  cropState.zoom = 1;
  cropState.offsetX = 0;
  cropState.offsetY = 0;
  refs.cropZoom.value = "100";
  refs.cropX.value = "0";
  refs.cropY.value = "0";

  const imageUrl = URL.createObjectURL(file);
  cropState.imageUrl = imageUrl;

  const image = new Image();
  image.onload = () => {
    cropState.image = image;
    refs.cropModal.classList.add("is-open");
    refs.cropModal.setAttribute("aria-hidden", "false");
    drawCropPreview();
  };
  image.onerror = () => {
    setStatus("Unable to open this image for cropping.", "error");
  };
  image.src = imageUrl;
}

function updateCropPreviewFromControls() {
  cropState.zoom = Number(refs.cropZoom.value) / 100;
  cropState.offsetX = Number(refs.cropX.value);
  cropState.offsetY = Number(refs.cropY.value);
  drawCropPreview();
}

function drawCropPreview() {
  const image = cropState.image;
  const canvas = refs.cropCanvas;
  if (!image || !canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const minSide = Math.min(image.naturalWidth, image.naturalHeight);
  const cropSize = minSide / cropState.zoom;
  const maxPanX = Math.max((image.naturalWidth - cropSize) / 2, 0);
  const maxPanY = Math.max((image.naturalHeight - cropSize) / 2, 0);

  const centerX = image.naturalWidth / 2 + (cropState.offsetX / 100) * maxPanX;
  const centerY = image.naturalHeight / 2 + (cropState.offsetY / 100) * maxPanY;

  let sx = centerX - cropSize / 2;
  let sy = centerY - cropSize / 2;

  sx = Math.max(0, Math.min(sx, image.naturalWidth - cropSize));
  sy = Math.max(0, Math.min(sy, image.naturalHeight - cropSize));

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, sx, sy, cropSize, cropSize, 0, 0, canvas.width, canvas.height);
}

function applyManualCrop() {
  const index = cropState.activeIndex;
  if (index < 0 || !selectedFiles[index] || !cropState.image) {
    closeCropModal();
    return;
  }

  const sourceFile = selectedFiles[index];
  const canvas = refs.cropCanvas;
  const outputType = sourceFile.type && sourceFile.type.startsWith("image/") ? sourceFile.type : "image/jpeg";

  canvas.toBlob(
    (blob) => {
      if (!blob) {
        setStatus("Could not apply crop.", "error");
        return;
      }

      const baseName = sourceFile.name.replace(/\.[^.]+$/, "");
      const extension = (sourceFile.name.split(".").pop() || "jpg").toLowerCase();
      const croppedFile = new File([blob], `${baseName}-square.${extension}`, {
        type: outputType,
        lastModified: Date.now(),
      });

      selectedFiles[index] = croppedFile;
      syncInputWithSelectedFiles();
      renderPhotoPreview();
      closeCropModal();
    },
    outputType,
    0.95
  );
}

function closeCropModal() {
  refs.cropModal.classList.remove("is-open");
  refs.cropModal.setAttribute("aria-hidden", "true");
  cropState.activeIndex = -1;
  cropState.image = null;
  if (cropState.imageUrl) {
    URL.revokeObjectURL(cropState.imageUrl);
    cropState.imageUrl = "";
  }
}

function syncInputWithSelectedFiles() {
  const transfer = new DataTransfer();
  selectedFiles.forEach((file) => transfer.items.add(file));
  refs.photos.files = transfer.files;
}

function renderPhotoPreview() {
  clearPreviewUrls();
  const files = selectedFiles;
  refs.photoPreview.innerHTML = "";
  syncUploadGuidance(files);

  if (!files.length) {
    refs.photoCount.textContent = "No photos selected yet";
    return;
  }

  refs.photoCount.textContent = `${files.length} photo${files.length === 1 ? "" : "s"} selected`;

  files.forEach((file, index) => {
    const previewUrl = URL.createObjectURL(file);
    previewUrls.push(previewUrl);

    const card = document.createElement("li");
    const image = document.createElement("img");
    const title = document.createElement("strong");
    const meta = document.createElement("span");
    const cropButton = document.createElement("button");

    image.src = previewUrl;
    image.alt = file.name;
    title.textContent = truncate(file.name, 22);
    meta.textContent = `${formatMegabytes(file.size)} MB`;

    cropButton.type = "button";
    cropButton.className = "button button-secondary preview-crop-button";
    cropButton.dataset.cropIndex = String(index);
    cropButton.textContent = "Crop this photo";

    card.append(image, title, meta, cropButton);
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
    syncInputWithSelectedFiles();

    const response = await fetch("/api/orders", {
      method: "POST",
      body: new FormData(refs.orderForm),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "The order could not be submitted.");
    }

    const emailNote = payload.notificationStatus === "sent"
      ? " Seller email sent."
      : payload.notificationStatus === "queued"
      ? " Seller email queued (temporary network issue)."
      : payload.notificationDetails
      ? ` Email note: ${payload.notificationDetails}`
      : "";

    setStatus(`Order ${payload.orderId} received with ${payload.savedPhotos} uploaded photos.${emailNote}`, "success");

    if (payload.paymentUrl) {
      window.setTimeout(() => {
        window.location.href = payload.paymentUrl;
      }, 1200);
      return;
    }

    refs.orderForm.reset();
    cart.clear();
    selectedFiles = [];
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

async function handleSubmitContact(event) {
  event.preventDefault();
  refs.contactStatus.textContent = "";
  refs.contactStatus.className = "form-status";

  if (!refs.contactForm.reportValidity()) {
    refs.contactStatus.textContent = "Please fill out all fields before sending.";
    refs.contactStatus.classList.add("is-error");
    return;
  }

  refs.contactSubmitButton.disabled = true;
  refs.contactSubmitButton.textContent = "Sending...";

  try {
    const payload = {
      name: refs.contactForm.elements.name.value,
      email: refs.contactForm.elements.email.value,
      message: refs.contactForm.elements.message.value,
    };

    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Message could not be sent right now.");
    }

    const note = data.notificationStatus === "sent"
      ? ""
      : data.notificationStatus === "queued"
      ? " Email is queued due to temporary network issue."
      : data.notificationDetails
      ? ` ${data.notificationDetails}`
      : "";

    refs.contactForm.reset();
    refs.contactStatus.textContent = `${data.message || "Message sent."}${note}`;
    refs.contactStatus.classList.add("is-success");
  } catch (error) {
    refs.contactStatus.textContent = error.message || "Message could not be sent right now.";
    refs.contactStatus.classList.add("is-error");
  } finally {
    refs.contactSubmitButton.disabled = false;
    refs.contactSubmitButton.textContent = "Send message";
  }
}

function validateOrderForm() {
  const requiredPhotoCount = totalMagnets();
  const files = selectedFiles;

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

function syncUploadGuidance(files = selectedFiles) {
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
