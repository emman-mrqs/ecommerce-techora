        // Simple JavaScript for interactivity
        document.addEventListener('DOMContentLoaded', function() {
            // Heart icon toggle
            const heartIcons = document.querySelectorAll('.heart-icon');
            heartIcons.forEach(icon => {
                icon.addEventListener('click', function() {
                    if (this.innerHTML === '♡') {
                        this.innerHTML = '❤️';
                        this.style.color = '#CC0000';
                    } else {
                        this.innerHTML = '♡';
                        this.style.color = '';
                    }
                });
            });

            // Search functionality
            const searchInput = document.querySelector('.search-input');
            searchInput.addEventListener('input', function() {
                const searchTerm = this.value.toLowerCase();
                const productCards = document.querySelectorAll('.product-card');
                
                productCards.forEach(card => {
                    const productName = card.querySelector('.product-name').textContent.toLowerCase();
                    if (productName.includes(searchTerm)) {
                        card.style.display = 'block';
                    } else {
                        card.style.display = 'none';
                    }
                });
            });

            // Filter functionality
            const filterCheckboxes = document.querySelectorAll('.filter-option input[type="checkbox"]');
            filterCheckboxes.forEach(checkbox => {
                checkbox.addEventListener('change', function() {
                    // Simple filter logic - in a real app, this would be more sophisticated
                    console.log(`Filter ${this.id} ${this.checked ? 'checked' : 'unchecked'}`);
                });
            });

            // Pagination
            const pageButtons = document.querySelectorAll('.page-btn');
            pageButtons.forEach(btn => {
                btn.addEventListener('click', function() {
                    if (!isNaN(this.textContent)) {
                        pageButtons.forEach(b => b.classList.remove('active'));
                        this.classList.add('active');
                    }
                });
            });

            // Sort functionality
            const sortSelect = document.querySelector('.sort-select');
            sortSelect.addEventListener('change', function() {
                console.log(`Sorting by: ${this.value}`);
                // In a real app, this would sort the products
            });
        });