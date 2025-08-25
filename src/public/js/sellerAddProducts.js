        // Handle window resize
        window.addEventListener('resize', function() {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            
            if (window.innerWidth > 768) {
                sidebar.classList.remove('show');
                overlay.classList.remove('show');
            }
        });
        
        // Drag and drop functionality
        const uploadArea = document.querySelector('.upload-area');
        const fileInput = document.getElementById('imageUpload');
        
        uploadArea.addEventListener('dragover', function(e) {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        
        uploadArea.addEventListener('dragleave', function(e) {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
        });
        
        uploadArea.addEventListener('drop', function(e) {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            
            const files = e.dataTransfer.files;
            handleFiles(files);
        });
        
        fileInput.addEventListener('change', function(e) {
            handleFiles(e.target.files);
        });
        
        function handleFiles(files) {
            // Handle file upload logic here
            console.log('Files selected:', files);
        }
        
        // Variant management
        function addVariant() {
            const container = document.getElementById('variantContainer');
            const newVariant = document.createElement('div');
            newVariant.className = 'variant-row';
            newVariant.innerHTML = `
                <div class="variant-input">
                    <input type="text" class="form-input" placeholder="Variant type (e.g., Size, Color)">
                </div>
                <div class="variant-input">
                    <input type="text" class="form-input" placeholder="Variant value (e.g., Large, Red)">
                </div>
                <button type="button" class="remove-variant-btn" onclick="removeVariant(this)">
                    <i class="fas fa-times"></i>
                </button>
            `;
            container.appendChild(newVariant);
            
            // Show remove buttons if more than one variant
            const removeButtons = container.querySelectorAll('.remove-variant-btn');
            if (container.children.length > 1) {
                removeButtons.forEach(btn => btn.style.display = 'block');
            }
        }
        
        function removeVariant(button) {
            const container = document.getElementById('variantContainer');
            const variantRow = button.parentElement;
            
            if (container.children.length > 1) {
                variantRow.remove();
                
                // Hide remove buttons if only one variant left
                if (container.children.length === 1) {
                    const removeBtn = container.querySelector('.remove-variant-btn');
                    removeBtn.style.display = 'none';
                }
            }
        }
        
        // Form submission
        document.getElementById('addProductForm').addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Validate form
            const requiredFields = this.querySelectorAll('[required]');
            let isValid = true;
            
            requiredFields.forEach(field => {
                if (!field.value.trim()) {
                    field.style.borderColor = '#ef4444';
                    isValid = false;
                } else {
                    field.style.borderColor = '#d1d5db';
                }
            });
            
            if (isValid) {
                // Show success message or redirect
                alert('Product added successfully!');
            } else {
                alert('Please fill in all required fields.');
            }
        });