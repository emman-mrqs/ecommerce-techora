        // Filter and Sort Functionality
        const categoryFilter = document.getElementById('categoryFilter');
        const sortFilter = document.getElementById('sortFilter');
        const priceRange = document.getElementById('priceRange');
        const priceDisplay = document.getElementById('priceDisplay');
        const colorOptions = document.querySelectorAll('.color-option');
        const sizeOptions = document.querySelectorAll('.size-option');
        const productCategories = document.querySelectorAll('.product-category');

        let selectedColors = [];
        let selectedSizes = [];

        // Price Range Update
        priceRange.addEventListener('input', function() {
            const maxPrice = this.value;
            priceDisplay.textContent = `₱0 - ₱${maxPrice}`;
            filterProducts();
        });

        // Category Filter
        categoryFilter.addEventListener('change', filterProducts);
        
        // Sort Filter
        sortFilter.addEventListener('change', sortProducts);

        // Color Filter
        colorOptions.forEach(option => {
            option.addEventListener('click', function() {
                const color = this.dataset.color;
                this.classList.toggle('active');
                
                if (selectedColors.includes(color)) {
                    selectedColors = selectedColors.filter(c => c !== color);
                } else {
                    selectedColors.push(color);
                }
                filterProducts();
            });
        });

        // Size Filter
        sizeOptions.forEach(option => {
            option.addEventListener('click', function() {
                const size = this.dataset.size;
                this.classList.toggle('active');
                
                if (selectedSizes.includes(size)) {
                    selectedSizes = selectedSizes.filter(s => s !== size);
                } else {
                    selectedSizes.push(size);
                }
                filterProducts();
            });
        });

        function filterProducts() {
            const selectedCategory = categoryFilter.value;
            const maxPrice = parseInt(priceRange.value);

            productCategories.forEach(category => {
                const categoryType = category.dataset.category;
                const productCard = category.querySelector('.product-card');
                const productPrice = parseInt(productCard.dataset.price);

                let showCategory = true;

                // Category filter
                if (selectedCategory !== 'all' && categoryType !== selectedCategory) {
                    showCategory = false;
                }

                // Price filter
                if (productPrice > maxPrice) {
                    showCategory = false;
                }

                category.style.display = showCategory ? 'block' : 'none';
            });
        }

        function sortProducts() {
            const sortBy = sortFilter.value;
            const grid = document.querySelector('.products-grid');
            const categories = Array.from(productCategories);

            categories.sort((a, b) => {
                const cardA = a.querySelector('.product-card');
                const cardB = b.querySelector('.product-card');

                switch (sortBy) {
                    case 'price-low':
                        return parseInt(cardA.dataset.price) - parseInt(cardB.dataset.price);
                    case 'price-high':
                        return parseInt(cardB.dataset.price) - parseInt(cardA.dataset.price);
                    case 'name':
                        return cardA.dataset.name.localeCompare(cardB.dataset.name);
                    case 'popularity':
                        return parseInt(cardB.dataset.popularity) - parseInt(cardA.dataset.popularity);
                    case 'newest':
                        return new Date(cardB.dataset.date) - new Date(cardA.dataset.date);
                    default:
                        return 0;
                }
            });

            categories.forEach(category => {
                grid.appendChild(category);
            });
        }

        function clearAllFilters() {
            categoryFilter.value = 'all';
            sortFilter.value = 'featured';
            priceRange.value = 500;
            priceDisplay.textContent = '₱0 - ₱500';
            
            selectedColors = [];
            selectedSizes = [];
            
            colorOptions.forEach(option => option.classList.remove('active'));
            sizeOptions.forEach(option => option.classList.remove('active'));
            
            filterProducts();
            sortProducts();
        }

        // Add to cart functionality
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('add-to-cart')) {
                const productName = e.target.previousElementSibling.previousElementSibling.textContent;
                alert(`${productName} added to cart!`);
            }
        });