    (function () {
      const form = document.getElementById("settingsForm");
      const inputs = form.querySelectorAll("input, textarea, select");

      const btnEdit = document.getElementById("btnToggleEdit");
      const btnSave = document.getElementById("btnSave");
      const btnCancel = document.getElementById("btnCancel");
      const btnDeleteLogo = document.getElementById("btnDeleteLogo");

      const logoInput = document.getElementById("logoUpload");
      const logoPreviewFallback = document.getElementById("logoPreviewFallback");
      let logoPreview = document.getElementById("logoPreview");

      function setEditMode(enabled) {
        inputs.forEach(el => {
          if (el.id !== "currency") el.disabled = !enabled;
        });
        btnEdit.classList.toggle("d-none", enabled);
        btnSave.classList.toggle("d-none", !enabled);
        btnCancel.classList.toggle("d-none", !enabled);
        btnDeleteLogo?.classList.toggle("d-none", !enabled);
      }

      // initial: view mode
      setEditMode(false);

      btnEdit?.addEventListener("click", () => setEditMode(true));
      btnCancel?.addEventListener("click", () => {
        setEditMode(false);
        location.reload(); // discard unsaved edits
      });

      // Live logo preview
      logoInput?.addEventListener("change", () => {
        const file = logoInput.files?.[0];
        if (!file) return;
        const url = URL.createObjectURL(file);

        if (!logoPreview) {
          const holder = logoInput.closest(".row")?.querySelector(".position-relative.p-2.border.rounded");
          if (holder) {
            if (logoPreviewFallback) logoPreviewFallback.remove();
            holder.innerHTML = `
              <button type="button" class="btn btn-danger btn-sm position-absolute top-0 end-0 m-2" id="btnDeleteLogo" title="Delete logo" aria-label="Delete logo">
                <i class="fa fa-trash"></i>
              </button>
              <img id="logoPreview" style="max-height:100px;max-width:100%;object-fit:contain;">
            `;
            logoPreview = holder.querySelector("#logoPreview");
          }
        }
        if (logoPreview) logoPreview.src = url;
      });

      // Save (multipart)
      form?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        try {
          const res = await fetch("/admin/settings/update", { method: "POST", body: fd });
          const json = await res.json();
          if (json?.success) {
            alert(json.message || "Saved.");
            location.reload();
          } else {
            alert(json?.message || "Failed to save settings.");
          }
        } catch (err) {
          console.error(err);
          alert("Failed to save settings.");
        }
      });

      // Delete logo
      btnDeleteLogo?.addEventListener("click", async () => {
        if (!confirm("Are you sure you want to delete the current logo?")) return;
        try {
          const res = await fetch("/admin/settings/logo", { method: "DELETE" });
          const j = await res.json();
          if (j?.success) {
            alert(j.message);
            location.reload();
          } else {
            alert(j?.message || "Failed to delete logo.");
          }
        } catch (err) {
          console.error(err);
          alert("Error deleting logo.");
        }
      });
    })();


    document.addEventListener('DOMContentLoaded', () => {
  const shipFlat = document.getElementById('shipFlat');
  const flatAmt  = document.getElementById('flatRateAmount');

  function sync() {
    if (!shipFlat || !flatAmt) return;
    flatAmt.disabled = !shipFlat.checked;
  }

  shipFlat?.addEventListener('change', sync);
  sync();
});
