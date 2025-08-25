        // Handle window resize
        window.addEventListener('resize', function() {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            
            if (window.innerWidth > 768) {
                sidebar.classList.remove('show');
                overlay.classList.remove('show');
            }
        });
        
        // Filter functionality
        document.querySelector('.filter-select').addEventListener('change', function() {
            // Filter orders by status
            console.log('Filter by status:', this.value);
        });
        
        document.querySelectorAll('.filter-select')[1].addEventListener('change', function() {
            // Filter orders by date range
            console.log('Filter by date range:', this.value);
        });
        
        document.querySelector('.search-input').addEventListener('input', function() {
            // Search orders
            console.log('Search orders:', this.value);
        });
        
        // Action buttons
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const orderRow = this.closest('.order-row');
                const orderId = orderRow.querySelector('.order-id').textContent;
                console.log('View order details for:', orderId);
                // Here you would typically open a modal or navigate to order details page
            });
        });
        
        // Pagination
        document.querySelectorAll('.pagination-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                if (!this.disabled && !this.classList.contains('active')) {
                    // Remove active class from all buttons
                    document.querySelectorAll('.pagination-btn').forEach(b => b.classList.remove('active'));
                    
                    // Add active class to clicked button (if it's a number)
                    if (!this.querySelector('i')) {
                        this.classList.add('active');
                    }
                    
                    console.log('Navigate to page:', this.textContent);
                }
            });
        });