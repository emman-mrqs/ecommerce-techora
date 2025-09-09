        // Global variables
        let selectedColor = 'Black';
        let currentQuantity = 1;

        // Change main image when thumbnail is clicked
        function changeImage(imageSrc, thumbnailElement) {
            const mainImage = document.getElementById('mainImage');
            mainImage.src = imageSrc;
            
            // Update active thumbnail
            document.querySelectorAll('.thumbnail').forEach(thumb => {
                thumb.classList.remove('active');
            });
            thumbnailElement.classList.add('active');
        }

        // Select color option
        function selectColor(colorElement) {
            document.querySelectorAll('.color-option').forEach(option => {
                option.classList.remove('selected');
            });
            colorElement.classList.add('selected');
            selectedColor = colorElement.dataset.color;
            
            // Update stock status based on color (demo purposes)
            updateStockStatus();
        }

        // Update stock status
        function updateStockStatus() {
            const stockElement = document.getElementById('stockStatus');
            const phoneModel = document.getElementById('phoneModel').value;
            
            if (selectedColor === 'White' && phoneModel === 'samsung-s24') {
                stockElement.innerHTML = '<i class="fas fa-exclamation-triangle me-2"></i>Limited Stock - Only 3 left';
                stockElement.className = 'stock-status';
                stockElement.style.color = '#ff9500';
            } else if (selectedColor === 'Space Gray' && phoneModel === 'pixel-8') {
                stockElement.innerHTML = '<i class="fas fa-times-circle me-2"></i>Out of Stock';
                stockElement.className = 'stock-status out-of-stock';
            } else {
                stockElement.innerHTML = '<i class="fas fa-check-circle me-2"></i>In Stock - Ready to Ship';
                stockElement.className = 'stock-status';
                stockElement.style.color = '#28a745';
            }
        }

        // Change quantity
        function changeQuantity(delta) {
            const quantityInput = document.getElementById('quantity');
            const newQuantity = parseInt(quantityInput.value) + delta;
            
            if (newQuantity >= 1 && newQuantity <= 10) {
                quantityInput.value = newQuantity;
                currentQuantity = newQuantity;
            }
        }

        // Add to cart function
        function addToCart() {
            const phoneModel = document.getElementById('phoneModel').value;
            
            if (!phoneModel) {
                alert('Please select your phone model before adding to cart.');
                return;
            }
            
            const stockElement = document.getElementById('stockStatus');
            if (stockElement.classList.contains('out-of-stock')) {
                alert('Sorry, this item is currently out of stock.');
                return;
            }
            
            // Simulate add to cart
            const cartData = {
                product: 'TechCase Pro Wireless Charging Case',
                color: selectedColor,
                phoneModel: phoneModel,
                quantity: currentQuantity,
                price: 89.99
            };
            
            console.log('Added to cart:', cartData);
            alert(`Added ${currentQuantity}x TechCase Pro (${selectedColor}) to cart!`);
        }

        // Buy now function
        function buyNow() {
            const phoneModel = document.getElementById('phoneModel').value;
            
            if (!phoneModel) {
                alert('Please select your phone model before purchasing.');
                return;
            }
            
            const stockElement = document.getElementById('stockStatus');
            if (stockElement.classList.contains('out-of-stock')) {
                alert('Sorry, this item is currently out of stock.');
                return;
            }
            
            // Simulate buy now
            alert(`Proceeding to checkout with ${currentQuantity}x TechCase Pro (${selectedColor})`);
        }

        // Event listeners
        document.getElementById('quantity').addEventListener('change', function() {
            const value = parseInt(this.value);
            if (value >= 1 && value <= 10) {
                currentQuantity = value;
            } else {
                this.value = currentQuantity;
            }
        });

        document.getElementById('phoneModel').addEventListener('change', updateStockStatus);

        // Initialize
        updateStockStatus();