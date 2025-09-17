document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("deleteModal");
  const cancelBtn = document.getElementById("cancelDelete");
  const confirmBtn = document.getElementById("confirmDelete");
  let productIdToDelete = null;

  // Open modal
  document.querySelectorAll(".action-btn.delete").forEach(btn => {
    btn.addEventListener("click", () => {
      productIdToDelete = btn.dataset.id;
      modal.classList.remove("hidden");
    });
  });

  // Cancel delete
  cancelBtn.addEventListener("click", () => {
    modal.classList.add("hidden");
    productIdToDelete = null;
  });

  // Confirm delete
  confirmBtn.addEventListener("click", async () => {
    if (!productIdToDelete) return;

    try {
      const res = await fetch(`/seller/products/${productIdToDelete}`, {
        method: "DELETE"
      });

      const data = await res.json();
      if (data.success) {
        window.location.reload();
      } else {
        alert(data.error || "Failed to delete product");
      }
    } catch (err) {
      console.error(err);
      alert("Error deleting product");
    } finally {
      modal.classList.add("hidden");
    }
  });
});
