// ADD NEW PRODUCT VARIANT
function addVariant() {
  const container = document.getElementById("variantContainer");

  const newRow = document.createElement("div");
  newRow.classList.add("variant-row");

  newRow.innerHTML = `
    <div class="variant-input">
      <input type="number" class="form-input" name="storage[]" placeholder="Storage (e.g., 128)" required>
    </div>
    <div class="variant-input">
      <input type="number" class="form-input" name="ram[]" placeholder="RAM (e.g., 6)" required>
    </div>
    <div class="variant-input">
      <input type="text" class="form-input" name="color[]" placeholder="Color (e.g., Black)" required>
    </div>
    <div class="variant-input">
      <input type="number" step="0.01" class="form-input" name="price[]" placeholder="Price (₱)" required>
    </div>
    <div class="variant-input">
      <input type="number" class="form-input" name="stock_quantity[]" placeholder="Stock Qty" required>
    </div>
    <button type="button" class="remove-variant-btn" onclick="removeVariant(this)">
      <i class="fas fa-times"></i>
    </button>
  `;

  container.appendChild(newRow);

  // Refresh dropdowns so new variant shows up
  updateVariantDropdowns();
}

// REMOVE PRODUCT VARIANT
function removeVariant(button) {
  button.parentElement.remove();
  updateVariantDropdowns(); // refresh dropdowns after removing
}

// ADD NEW IMAGE ROW
function addImageField() {
  const container = document.getElementById("imageFields");

  const newRow = document.createElement("div");
  newRow.classList.add("row", "image-row", "align-items-end", "mt-2");

  newRow.innerHTML = `
    <div class="col-md-4">
      <input type="file" class="form-input" name="product_images[]" accept="image/*" required>
    </div>
    <div class="col-md-3">
      <select name="variant_for_image[]" class="form-select">
        <option value="">General (no variant)</option>
      </select>
    </div>
    <div class="col-md-2">
      <select name="is_primary[]" class="form-select" required>
        <option value="">Is Primary?</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    </div>
    <div class="col-md-2">
      <input type="number" class="form-input" name="position[]" placeholder="Position (1,2,3...)" required>
    </div>
    <div class="col-md-1 d-flex justify-content-end">
      <button type="button" class="remove-variant-btn" onclick="removeImageField(this)">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `;

  container.appendChild(newRow);

  // Populate variant dropdown immediately
  updateVariantDropdowns();
}

// REMOVE IMAGE ROW
function removeImageField(button) {
  button.closest(".row").remove();
}

// UPDATE VARIANT DROPDOWNS
function updateVariantDropdowns() {
  const variantRows = document.querySelectorAll("#variantContainer .variant-row");
  const variantOptions = [];

  variantRows.forEach((row, idx) => {
    const color = row.querySelector("input[name='color[]']").value || "Color?";
    const ram = row.querySelector("input[name='ram[]']").value || "?";
    const storage = row.querySelector("input[name='storage[]']").value || "?";
    variantOptions.push({ idx, label: `${color} - ${ram}GB + ${storage}GB` });
  });

  // Update every image dropdown
  document.querySelectorAll("select[name='variant_for_image[]']").forEach(sel => {
    sel.innerHTML = `<option value="">General (no variant)</option>`;
    variantOptions.forEach((opt, i) => {
      sel.innerHTML += `<option value="${i+1}">${opt.label}</option>`;
    });
  });
}

// Auto-update dropdowns when seller edits fields
document.addEventListener("input", (e) => {
  if (e.target.matches("input[name='color[]'], input[name='ram[]'], input[name='storage[]']")) {
    updateVariantDropdowns();
  }
});
