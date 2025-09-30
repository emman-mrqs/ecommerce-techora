/*********************************************************
 * Small helpers (unchanged behavior)
 *********************************************************/
function readDraftVariants() {
  const rows = [...document.querySelectorAll("#variantContainer .variant-row")];
  return rows.map((row, idx) => {
    const storage = (row.querySelector("input[name='storage[]']")?.value ?? "").trim();
    const ram     = (row.querySelector("input[name='ram[]']")?.value ?? "").trim();
    const color   = (row.querySelector("input[name='color[]']")?.value ?? "").trim();
    return {
      idx: idx + 1,
      storage, ram, color,
      // Shown label: already includes color + RAM + storage
      label: `${color || "?"} - ${ram || "?"}GB + ${storage || "?"}GB`
    };
  });
}

/*********************************************************
 * Image rows: one compact line with all controls
 * Using a SKU checkbox menu (no Ctrl/Cmd multi-select)
 * IMPORTANT: No Bootstrap row/col classes here—CSS grid drives layout.
 *********************************************************/
function buildImageRow() {
  const row = document.createElement("div");
  row.className = "image-row"; // <- no "row" class

  row.innerHTML = `
    <!-- File -->
    <div class="field-file">
      <input type="file" class="form-input form-control" name="product_images[]" accept="image/*" required>
    </div>

    <!-- SKU picker -->
    <div class="field-sku">
      <div class="sku-picker">
        <button type="button" class="btn btn-outline-dark w-100 sku-toggle">Choose Specific SKU(s)</button>
        <div class="sku-menu border rounded mt-2 p-2" style="display:none; max-height:220px; overflow:auto;"></div>
        <small class="text-muted d-block mt-1 selected-summary">No SKUs selected</small>
      </div>
    </div>

    <!-- Primary -->
    <div class="field-primary">
      <select name="is_primary[]" class="form-select" required>
        <option value="">Is Primary?</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    </div>

    <!-- Position -->
    <div class="field-pos">
      <input type="number" class="form-input form-control" name="position[]" placeholder="Pos." required>
    </div>

    <!-- Remove -->
    <div class="field-remove d-flex justify-content-end">
      <button type="button" class="remove-variant-btn btn btn-outline-secondary" onclick="removeImageField(this)">
        <i class="fas fa-times"></i>
      </button>
    </div>

    <!-- Backend linkage -->
    <input type="hidden" name="variant_link_spec[]" class="variant-link-spec" value="">
  `;
  return row;
}

/*********************************************************
 * Populate the SKU checkbox menu for a row
 *********************************************************/
function hydrateImageRow(row) {
  const variants = readDraftVariants();

  const menu    = row.querySelector('.sku-menu');
  const toggle  = row.querySelector('.sku-toggle');
  const summary = row.querySelector('.selected-summary');

  // Build flat list of SKUs (labels already show color + RAM + storage)
  menu.innerHTML = variants.length
    ? variants.map(v => `
        <label class="d-flex align-items-center gap-2 py-1">
          <input type="checkbox" class="form-check-input sku-check" data-idx="${v.idx}">
          <span>${v.label}</span>
        </label>
      `).join("")
    : `<div class="text-muted small">Add variants first to link images to specific SKUs.</div>`;

  // Toggle open/close
  toggle.onclick = () => {
    menu.style.display = (menu.style.display === 'none' ? '' : 'none');
  };

  // Live summary + validation
  menu.addEventListener('change', () => {
    const checked = [...menu.querySelectorAll('.sku-check:checked')];
    summary.textContent = checked.length ? `${checked.length} SKU(s) selected` : 'No SKUs selected';
    validateImageRows();
  });
}

/*********************************************************
 * Show/Hide the whole Product Images block
 *********************************************************/
function showImageSectionIfHidden() {
  const imgGroup = document.getElementById("imageFields")?.closest(".form-group");
  if (imgGroup) {
    const label = imgGroup.querySelector("label.form-label");
    if (label) label.style.display = "";
    const fields = imgGroup.querySelector("#imageFields");
    if (fields) fields.style.display = "";
  }
}
function hideImageSectionIfEmpty() {
  const fields = document.getElementById("imageFields");
  if (!fields) return;
  const hasRows = !!fields.querySelector(".image-row");
  const imgGroup = fields.closest(".form-group");
  if (imgGroup) {
    const label = imgGroup.querySelector("label.form-label");
    if (label) label.style.display = hasRows ? "" : "none";
    fields.style.display = hasRows ? "" : "none";
  }
}

/*********************************************************
 * Add / Remove image rows
 *********************************************************/
function addImageField() {
  const container = document.getElementById("imageFields");
  const row = buildImageRow();
  container.appendChild(row);
  hydrateImageRow(row);
  showImageSectionIfHidden();
  validateImageRows();
}
function removeImageField(btn) {
  btn.closest(".image-row").remove();
  hideImageSectionIfEmpty();
  validateImageRows();
}

/*********************************************************
 * Validation: require at least one SKU if variants exist
 * AND allow ONLY ONE Primary across all images
 *********************************************************/
function validateImageRows() {
  const rows = [...document.querySelectorAll("#imageFields .image-row")];
  const variants = readDraftVariants();
  const hasVariants = variants.length > 0;
  let errors = [];

  // Map variant idx -> color (for future per-color rules, if needed)
  const idxToColor = new Map(variants.map(v => [String(v.idx), (v.color || "").toLowerCase()]));

  // Enforce exactly one Primary overall
  let firstPrimaryIndex = null;

  rows.forEach((row, i) => {
    const posInput  = row.querySelector("input[name='position[]']");
    const primaryEl = row.querySelector("select[name='is_primary[]']");
    const toggleBtn = row.querySelector('.sku-toggle');

    // reset styles
    [posInput, primaryEl, toggleBtn].forEach(el => el?.classList.remove("is-invalid"));

    // Position >= 1
    const pos = parseInt(String(posInput.value || "").trim(), 10);
    if (isNaN(pos) || pos < 1) {
      errors.push(`Image ${i + 1}: Position must be >= 1.`);
      posInput.classList.add("is-invalid");
    }

    // SKUs required if variants exist
    const pickedIdxs = [...row.querySelectorAll('.sku-menu .sku-check:checked')].map(cb => cb.dataset.idx);
    if (hasVariants && pickedIdxs.length === 0) {
      errors.push(`Image ${i + 1}: choose at least one Specific SKU.`);
      toggleBtn.classList.add("is-invalid");
    }

    // Only one Primary total
    if (primaryEl.value === "true") {
      if (firstPrimaryIndex === null) {
        firstPrimaryIndex = i;
      } else {
        errors.push(`Only one image can be marked as Primary. Image ${firstPrimaryIndex + 1} and Image ${i + 1} are both set to Primary.`);
        primaryEl.classList.add("is-invalid");
        const firstEl = rows[firstPrimaryIndex].querySelector("select[name='is_primary[]']");
        firstEl?.classList.add("is-invalid");
      }
    }
  });

  // Single-image convenience
  if (rows.length === 1) {
    const pri = rows[0].querySelector("select[name='is_primary[]']");
    const pos = parseInt(String(rows[0].querySelector("input[name='position[]']").value || "").trim(), 10);
    if (pri && pri.value !== "true") {
      errors.push("If only one product image is added, it must be set as Primary.");
      pri.classList.add("is-invalid");
    }
    if (pos !== 1) {
      errors.push("If only one product image is added, its position must be 1.");
      rows[0].querySelector("input[name='position[]']").classList.add("is-invalid");
    }
  }

  const box = document.getElementById("imageValidationErrors");
  if (box) box.innerHTML = errors.length ? "⚠️ " + errors.join("<br>") : "";

  const saveBtn = document.querySelector("#addProductForm button[type='submit']");
  if (saveBtn) saveBtn.disabled = errors.length > 0;

  return errors.length === 0;
}

/*********************************************************
 * Serialize for backend (same contract):
 *   variant_link_spec[] = "sku:1|3|5"
 *********************************************************/
function serializeImageLinksForSubmit() {
  let ok = true;

  document.querySelectorAll("#imageFields .image-row").forEach(row => {
    const spec = row.querySelector(".variant-link-spec");
    const idxs = [...row.querySelectorAll('.sku-menu .sku-check:checked')].map(cb => cb.dataset.idx);
    spec.value = idxs.length ? `sku:${idxs.join('|')}` : "";
    if (!spec.value) ok = false;
  });

  return ok;
}

/*********************************************************
 * Submit handler (unchanged flow)
 *********************************************************/
document.getElementById("addProductForm").addEventListener("submit", async function (e) {
  e.preventDefault();

  if (!this.checkValidity()) {
    this.classList.add("was-validated");
    alert("❌ Please fill out all required fields.");
    return;
  }
  if (!validateImageRows()) {
    alert("❌ Please fix image validation errors before saving.");
    return;
  }
  if (!serializeImageLinksForSubmit()) {
    alert("❌ Please choose one or more Specific SKUs for each image.");
    return;
  }

  try {
    const formData = new FormData(this);
    const res = await fetch(this.action, { method: "POST", body: formData });
    const data = await res.json();
    if (res.ok) {
      new bootstrap.Modal(document.getElementById("productSuccessModal")).show();
    } else {
      alert(data.error || "❌ Failed to save product.");
    }
  } catch (err) {
    console.error("Save error:", err);
    alert("❌ An unexpected error occurred.");
  }
});

/*********************************************************
 * Variant add/remove (FULL implementations preserved)
 *********************************************************/
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
  updateVariantDropdowns(); // refresh image SKU menus
}
function removeVariant(button) {
  button.parentElement.remove();
  updateVariantDropdowns();
}

/*********************************************************
 * Keep image controls in sync with variant edits
 *********************************************************/
function updateImageControlsForAllRows() {
  document.querySelectorAll("#imageFields .image-row").forEach(hydrateImageRow);
  validateImageRows();
}
function updateVariantDropdowns() {
  updateImageControlsForAllRows();
}

/*********************************************************
 * Live validation on change/input inside image fields
 *********************************************************/
document.getElementById("imageFields").addEventListener("change", validateImageRows);
document.getElementById("imageFields").addEventListener("input", validateImageRows);

/*********************************************************
 * Boot: hide image area until first row, or hydrate existing rows
 *********************************************************/
document.addEventListener("DOMContentLoaded", () => {
  // Hide Product Images block until there is at least one row
  hideImageSectionIfEmpty();

  const hasRows = !!document.querySelector("#imageFields .image-row");
  if (hasRows) {
    document.querySelectorAll("#imageFields .image-row").forEach(hydrateImageRow);
    validateImageRows();
  }
});
