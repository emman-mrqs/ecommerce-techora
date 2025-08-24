
        let currentStep = 1;
        const totalSteps = 4;

        function updateProgress() {
            // Update progress bar
            const progressPercent = ((currentStep - 1) / (totalSteps - 1)) * 100;
            document.getElementById('progress-fill').style.width = progressPercent + '%';

            // Update step circles and titles
            for (let i = 1; i <= totalSteps; i++) {
                const circle = document.getElementById(`step-${i}-circle`);
                const title = document.getElementById(`step-${i}-title`);

                circle.classList.remove('active', 'completed');
                title.classList.remove('active');

                if (i < currentStep) {
                    circle.classList.add('completed');
                    circle.innerHTML = '<i class="fas fa-check"></i>';
                } else if (i === currentStep) {
                    circle.classList.add('active');
                    title.classList.add('active');
                    circle.textContent = i;
                } else {
                    circle.textContent = i;
                }
            }

            // Show/hide step content
            document.querySelectorAll('.step-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`step-${currentStep}`).classList.add('active');
        }

        function nextStep() {
            if (currentStep < totalSteps && validateCurrentStep()) {
                currentStep++;
                updateProgress();
                
                // Update review information when reaching step 3
                if (currentStep === 3) {
                    updateReviewSection();
                }
            }
        }

        function prevStep() {
            if (currentStep > 1) {
                currentStep--;
                updateProgress();
            }
        }

        function validateCurrentStep() {
            // Basic validation - in real app, add proper validation
            if (currentStep === 1) {
                const firstName = document.getElementById('firstName').value;
                const lastName = document.getElementById('lastName').value;
                const address = document.getElementById('address').value;
                
                if (!firstName || !lastName || !address) {
                    alert('Please fill in all required fields');
                    return false;
                }
            }
            return true;
        }

        function selectPayment(type) {
            // Update radio buttons
            document.querySelectorAll('.payment-option').forEach(option => {
                option.classList.remove('selected');
            });
            event.currentTarget.classList.add('selected');
            
            // Show/hide card form
            const cardForm = document.getElementById('card-form');
            if (type === 'card') {
                cardForm.style.display = 'block';
            } else {
                cardForm.style.display = 'none';
            }
        }

        function updateReviewSection() {
            // Update shipping info in review
            const firstName = document.getElementById('firstName').value || 'John';
            const lastName = document.getElementById('lastName').value || 'Doe';
            const address = document.getElementById('address').value || '123 Main Street';
            const city = document.getElementById('city').value || 'Cebu City';
            const province = document.getElementById('province').value || 'Cebu';
            const zipCode = document.getElementById('zipCode').value || '6000';
            const phone = document.getElementById('phone').value || '+63 912 345 6789';
            const email = document.getElementById('email').value || 'john.doe@email.com';

            document.getElementById('review-shipping').innerHTML = `
                <div>${firstName} ${lastName}</div>
                <div>${address}</div>
                <div>${city}, ${province} ${zipCode}</div>
                <div>${phone}</div>
                <div>${email}</div>
            `};

            // // Update payment method
            // const selectedPayment = document.querySelector('input[name="payment"]:checked').value;
            // let paymentText = '';
            // switch(selectedPayment) {
            //     case 'paypal':
            //         paymentText = '<div>PayPal</div><div>Pay securely with your PayPal account</div>';
            //         break;
            //     case 'card':
            //         paymentText = '<div>Credit/Debit Card</div><div>Visa, MasterCard, American Express</div>';
            //         break;
            //     case 'cod':
            //         paymentText = '<div>Cash on Delivery</div><div>Pay when you receive your order</div>';