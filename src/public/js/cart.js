        // Cart data
        let cartItems = {
            headphones: { quantity: 1, price: 1999, name: "Premium Wireless Headphones" },
            watch: { quantity: 2, price: 3999, name: "Smart Watch" },
            speaker: { quantity: 1, price: 2499, name: "Portable Bluetooth Speaker" }
        };

        function updateQuantity(itemId, change) {
            const item = cartItems[itemId];
            const newQuantity = item.quantity + change;
            
            if (newQuantity < 1) {
                removeItem(itemId);
                return;
            }
            
            item.quantity = newQuantity;
            
            // Update UI
            const cartItem = document.querySelector(`[data-id="${itemId}"]`);
            const quantityInput = cartItem.querySelector('.quantity-input');
            const totalElement = cartItem.querySelector('.item-total');
            
            quantityInput.value = newQuantity;
            totalElement.textContent = `₱${(item.price * newQuantity).toLocaleString()}`;
            
            updateSummary();
        }

        function removeItem(itemId) {
            delete cartItems[itemId];
            
            // Remove from UI
            const cartItem = document.querySelector(`[data-id="${itemId}"]`);
            cartItem.remove();
            
            updateSummary();
            
            // Check if cart is empty
            if (Object.keys(cartItems).length === 0) {
                document.getElementById('cart-items').style.display = 'none';
                document.getElementById('empty-cart').style.display = 'block';
            }
        }

        function updateSummary() {
            const itemCount = Object.values(cartItems).reduce((sum, item) => sum + item.quantity, 0);
            const subtotal = Object.values(cartItems).reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const tax = Math.round(subtotal * 0.05); // 5% tax
            const total = subtotal + tax;
            
            document.getElementById('cart-count').textContent = itemCount;
            document.getElementById('subtotal').textContent = `₱${subtotal.toLocaleString()}`;
            document.getElementById('tax').textContent = `₱${tax.toLocaleString()}`;
            document.getElementById('total').textContent = `₱${total.toLocaleString()}`;
        }

        function proceedToCheckout() {
            const total = document.getElementById('total').textContent;
            alert(`Proceeding to checkout with total: ${total}`);
        }

        function continueShopping() {
            alert('Redirecting to shop...');
        }

        // Initialize
        updateSummary();
  