/*================
Delete Product (Bootstrap modal + toast) 
==================*/
document.addEventListener("DOMContentLoaded", () => {
  const modalEl   = document.getElementById("deleteProductModal");
  const idInput   = document.getElementById("deleteProductId");
  const confirmEl = document.getElementById("confirmDeleteProduct");

  // Robustly capture the button that triggered the modal (works even if icon is clicked)
  let lastDeleteBtn = null;
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".action-btn.delete");
    if (btn) lastDeleteBtn = btn;
  });

  // When the modal opens, set the hidden product id from the triggering button
  modalEl.addEventListener("show.bs.modal", (event) => {
    const trigger = event.relatedTarget || lastDeleteBtn;
    idInput.value = trigger?.getAttribute("data-id") || "";
  });

  // Confirm delete -> call API -> hide modal -> toast -> reload
  confirmEl.addEventListener("click", async () => {
    const id = idInput.value;
    if (!id) return;

    try {
      const res  = await fetch(`/seller/products/${id}`, { method: "DELETE" });
      const data = await res.json();

      bootstrap.Modal.getInstance(modalEl)?.hide();

      if (res.ok && data.success) {
        // uses your existing showToast helper
        showToast("Product deleted successfully", "success");
        setTimeout(() => window.location.reload(), 1200);
      } else {
        showToast(data.error || "Failed to delete product", "error");
      }
    } catch {
      showToast("Error deleting product", "error");
    }
  });
});


/*================
Edit products
==================*/
document.addEventListener("DOMContentLoaded", () => {
  // --- Edit product ---
  document.querySelectorAll(".action-btn.edit").forEach(btn => {
    btn.addEventListener("click", async () => {
      const row = btn.closest(".product-row");
      const productId = row.dataset.id;

      // Check if already expanded
      if (row.nextElementSibling && row.nextElementSibling.classList.contains("edit-row")) {
        row.nextElementSibling.remove();
        return;
      }

      // Fetch product details
      const res = await fetch(`/seller/products/${productId}`);
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to load product");
        return;
      }

      // Build edit row
      const editRow = document.createElement("div");
      editRow.className = "edit-row p-3 bg-light border";
      editRow.innerHTML = `
        <form class="edit-form">
          <div class="mb-2">
            <label>Name</label>
            <input type="text" name="name" value="${data.name}" class="form-control">
          </div>
          <div class="mb-2">
            <label>Description</label>
            <input type="text" name="description" value="${data.description}" class="form-control">
          </div>
          <h6>Variants</h6>
          ${data.variants.map(v => `
            <div class="variant-edit mb-3 border rounded p-3">
              <input type="hidden" name="variants[${v.id}][id]" value="${v.id}">

              <div class="row g-3">
                <div class="col-12 col-md-2">
                  <label class="form-label">Storage</label>
                  <input type="number" name="variants[${v.id}][storage]" value="${v.storage}" class="form-control">
                </div>
                <div class="col-12 col-md-2">
                  <label class="form-label">RAM</label>
                  <input type="number" name="variants[${v.id}][ram]" value="${v.ram}" class="form-control">
                </div>
                <div class="col-12 col-md-3">
                  <label class="form-label">Color</label>
                  <input type="text" name="variants[${v.id}][color]" value="${v.color}" class="form-control">
                </div>
                <div class="col-12 col-md-2">
                  <label class="form-label">Price (₱)</label>
                  <input type="number" step="0.01" name="variants[${v.id}][price]" value="${v.price}" class="form-control">
                </div>
                <div class="col-12 col-md-3">
                  <label class="form-label">Stock</label>
                  <input type="number" name="variants[${v.id}][stock_quantity]" value="${v.stock_quantity}" class="form-control">
                </div>
              </div>
            </div>
          `).join("")}
          <button type="submit" class="btn btn-sm btn-success mt-2">Save Changes</button>
        </form>
      `;
      row.insertAdjacentElement("afterend", editRow);

      // Handle save
      const form = editRow.querySelector(".edit-form");
      form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const formData = new FormData(form);
        const payload = {
          name: formData.get("name"),
          description: formData.get("description"),
          variants: data.variants.map(v => ({
            id: v.id,
            storage: formData.get(`variants[${v.id}][storage]`),
            ram: formData.get(`variants[${v.id}][ram]`),
            color: formData.get(`variants[${v.id}][color]`),
            price: formData.get(`variants[${v.id}][price]`),
            stock_quantity: formData.get(`variants[${v.id}][stock_quantity]`)
          }))
        };

        const res = await fetch(`/seller/products/${productId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (res.ok) {
          showToast(result.message, "success");
          setTimeout(() => window.location.reload(), 1500); // reload after toast
        } else {
          showToast(result.error || "Failed to update product", "error");
        }
      });
    });
  });
});

/*================
Ratings dropdown
=================*/
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".action-btn.rating").forEach(btn => {
    btn.addEventListener("click", async () => {
      const row = btn.closest(".product-row");
      const productId = row.dataset.id;

      // Toggle off if already open under this row
      if (row.nextElementSibling && row.nextElementSibling.classList.contains("ratings-row")) {
        row.nextElementSibling.remove();
        return;
      }

      // Close any other open ratings-row first (optional UX)
      document.querySelectorAll(".ratings-row").forEach(r => r.remove());

      // Fetch ratings
      const res = await fetch(`/seller/products/${productId}/ratings`);
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Failed to load ratings", "error");
        return;
      }

      const { summary, reviews } = data;

      // Build distribution rows 5..1
      const distHtml = [5,4,3,2,1].map(star => {
        const count = summary.distribution[String(star)] || 0;
        const pct = summary.count ? Math.round((count / summary.count) * 100) : 0;
        return `
          <tr>
            <td class="fw-semibold">${star} <i class="bi bi-star-fill"></i></td>
            <td>
              <div class="progress" style="height:8px;">
                <div class="progress-bar bg-warning" role="progressbar" style="width:${pct}%;" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"></div>
              </div>
            </td>
            <td class="text-end">${count}</td>
          </tr>
        `;
      }).join("");

      const reviewsHtml = reviews.length ? reviews.map(r => `
        <tr>
          <td>${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</td>
          <td>${r.buyer_name || "—"}</td>
          <td>${new Date(r.created_at).toLocaleDateString()}</td>
          <td>${r.body ? r.body.replace(/</g,"&lt;").replace(/>/g,"&gt;") : ""}</td>
        </tr>
      `).join("") : `
        <tr><td colspan="4" class="text-center text-muted">No reviews yet.</td></tr>
      `;

      const ratingsRow = document.createElement("div");
      ratingsRow.className = "ratings-row p-3 bg-light border rounded";
      ratingsRow.innerHTML = `
        <div class="container-fluid">
          <div class="row g-3">
            <div class="col-12 col-lg-4">
              <div class="p-3 bg-white rounded border h-100">
                <div class="d-flex align-items-center gap-2 mb-2">
                  <i class="bi bi-star-fill text-warning"></i>
                  <h6 class="mb-0">Summary</h6>
                </div>
                <div class="fs-4 fw-bold">${summary.avg} / 5</div>
                <div class="text-muted mb-3">${summary.count} rating(s)</div>
                <table class="table align-middle mb-0">
                  <tbody>${distHtml}</tbody>
                </table>
              </div>
            </div>
            <div class="col-12 col-lg-8">
              <div class="p-3 bg-white rounded border">
                <div class="d-flex align-items-center gap-2 mb-2">
                  <i class="bi bi-chat-left-text"></i>
                  <h6 class="mb-0">Recent Reviews</h6>
                </div>
                <div class="table-responsive">
                  <table class="table table-sm table-hover">
                    <thead>
                      <tr>
                        <th style="width:110px;">Rating</th>
                        <th style="width:160px;">Buyer</th>
                        <th style="width:130px;">Date</th>
                        <th>Comment</th>
                      </tr>
                    </thead>
                    <tbody>${reviewsHtml}</tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>`;
      row.insertAdjacentElement("afterend", ratingsRow);
    });
  });
});



/*==================
Toast helper
===================*/
// ✅ Toast helper
function showToast(message, type = "success") {
  const toastEl = document.getElementById("toastMessage");
  const toastBody = toastEl.querySelector(".toast-body");

  // Reset classes
  toastEl.classList.remove("bg-success", "bg-danger", "bg-dark");
  if (type === "success") toastEl.classList.add("bg-success");
  else if (type === "error") toastEl.classList.add("bg-danger");
  else toastEl.classList.add("bg-dark");

  toastBody.textContent = message;

  const toast = new bootstrap.Toast(toastEl);
  toast.show();
}

/*===============
Filter Section
=================*/

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.querySelector(".search-input");
  const statusFilter = document.querySelector(".filter-dropdown");
  const productRows = document.querySelectorAll(".product-row");

  // Insert "no results" message element
  let noResultsMsg = document.createElement("div");
  noResultsMsg.className = "no-results text-center p-4 text-muted";
  noResultsMsg.textContent = "No products found.";
  noResultsMsg.style.display = "none";
  document.querySelector(".products-table").appendChild(noResultsMsg);

  function filterProducts() {
    const searchText = searchInput.value.toLowerCase().trim();
    const selectedStatus = statusFilter.value;

    let visibleCount = 0;

    productRows.forEach(row => {
      const name = row.querySelector(".product-name")?.textContent.toLowerCase() || "";
      const desc = row.querySelector(".product-category")?.textContent.toLowerCase() || "";
      const status = row.querySelector(".product-status span")?.textContent.trim();

      let matchesSearch = !searchText || name.includes(searchText) || desc.includes(searchText);
      let matchesStatus = (selectedStatus === "All Status") || (status === selectedStatus);

      if (matchesSearch && matchesStatus) {
        row.style.display = "flex";
        visibleCount++;
      } else {
        row.style.display = "none";
      }
    });

    // Show/hide "no results" message
    noResultsMsg.style.display = visibleCount === 0 ? "block" : "none";
  }

  // Attach events
  searchInput.addEventListener("input", filterProducts);
  statusFilter.addEventListener("change", filterProducts);
});
