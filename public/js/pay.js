// public/js/pay.js
class MpesaPayment {
    constructor() {
        this.baseUrl = 'https://your-domain.com'; // Replace with your production domain
        this.phoneInput = document.getElementById('phone-number');
        this.amountInput = document.getElementById('amount');
        this.payButton = document.getElementById('Pay Now');
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.payButton.addEventListener('click', () => this.initiatePayment());
    }

    async initiatePayment() {
        try {
            const phone = this.phoneInput.value.trim();
            const amount = this.amountInput.value.trim();

            // Basic validation
            if (!phone || !amount) {
                alert('Please enter phone number and amount');
                return;
            }

            if (!this.validatePhone(phone)) {
                alert('Please enter a valid phone number (e.g., 2547XXXXXXXX)');
                return;
            }

            if (amount <= 0) {
                alert('Amount must be greater than 0');
                return;
            }

            this.payButton.disabled = true;
            this.payButton.textContent = 'Processing...';

            const response = await fetch(`${this.baseUrl}/api/payments/initiate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    phoneNumber: phone,
                    amount: amount
                })
            });

            const data = await response.json();

            if (response.ok) {
                this.checkPaymentStatus(data.CheckoutRequestID);
            } else {
                throw new Error(data.error || 'Payment initiation failed');
            }
        } catch (error) {
            alert(`Error: ${error.message}`);
            this.resetButton();
        }
    }

    validatePhone(phone) {
        const phoneRegex = /^2547\d{8}$/;
        return phoneRegex.test(phone);
    }

    async checkPaymentStatus(checkoutRequestID) {
        try {
            const maxAttempts = 10;
            let attempts = 0;
            const interval = setInterval(async () => {
                attempts++;
                const response = await fetch(`${this.baseUrl}/api/payments/status`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ checkoutRequestID })
                });

                const statusData = await response.json();

                if (response.ok && statusData.status === 'completed') {
                    clearInterval(interval);
                    alert('Payment successful!');
                    window.location.href = '/success';
                } else if (statusData.status === 'failed') {
                    clearInterval(interval);
                    throw new Error('Payment failed');
                }

                if (attempts >= maxAttempts) {
                    clearInterval(interval);
                    throw new Error('Payment timeout');
                }
            }, 3000); // Check every 3 seconds
        } catch (error) {
            alert(`Error: ${error.message}`);
            this.resetButton();
        }
    }

    resetButton() {
        this.payButton.disabled = false;
        this.payButton.textContent = 'Pay Now';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MpesaPayment();
});