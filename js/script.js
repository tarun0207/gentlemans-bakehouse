// Initialize Firebase (Config is loaded from firebase-config.js)
// We assume firebase-app and firebase-firestore are loaded via CDN in index.html
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Shopping Cart Logic
let cart = []; // Array of {name, price, qty}

function toggleCart() {
    document.getElementById('cartSidebar').classList.toggle('active');
    document.getElementById('overlay').classList.toggle('active');
}

// Overlay Click Handler (Closes both Cart and Checkout Modal)
document.getElementById('overlay').addEventListener('click', () => {
    document.getElementById('cartSidebar').classList.remove('active');
    document.getElementById('overlay').classList.remove('active');
    document.getElementById('checkout-modal').style.display = 'none';
});

// Mobile Menu Logic
document.addEventListener('DOMContentLoaded', () => {
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const nav = document.querySelector('nav');

    if (menuBtn) {
        menuBtn.addEventListener('click', () => {
            nav.classList.toggle('active');
        });
    }
});

function updateQuantity(name, price, change) {
    const existingItem = cart.find(item => item.name === name);

    if (existingItem) {
        existingItem.qty += change;
        if (existingItem.qty <= 0) {
            cart = cart.filter(item => item.name !== name);
        }
    } else if (change > 0) {
        cart.push({ name, price, qty: 1 });
    }

    updateUI();
}

function updateUI() {
    updateCartUI();
    updateCatalogUI();
}

function updateCatalogUI() {
    const products = ['Classic Choc Chip', 'Double Fudge', 'White Choc Macadamia', 'Oatmeal Raisin Spice'];

    products.forEach(name => {
        const container = document.getElementById(`action-${name}`);
        const item = cart.find(i => i.name === name);

        if (item) {
            // Show Counter
            container.innerHTML = `
                <div class="qty-control-catalog">
                    <button onclick="updateQuantity('${name}', ${item.price}, -1)">-</button>
                    <span>${item.qty}</span>
                    <button onclick="updateQuantity('${name}', ${item.price}, 1)">+</button>
                </div>
            `;
        } else {
            // Show Add Button
            let price = 250;
            if (name === 'Double Fudge') price = 300;
            if (name === 'White Choc Macadamia') price = 350;

            container.innerHTML = `
                <button class="btn-add" onclick="updateQuantity('${name}', ${price}, 1)">
                    <i class="fas fa-plus"></i> Add to Cart
                </button>
            `;
        }
    });
}

function updateCartUI() {
    const itemsContainer = document.getElementById('cartItems');
    const countSpan = document.getElementById('cartCount');
    const totalSpan = document.getElementById('cartTotal');

    // Update Count
    const totalQty = cart.reduce((sum, item) => sum + item.qty, 0);
    countSpan.textContent = totalQty;

    // Render Items
    itemsContainer.innerHTML = '';
    let total = 0;

    if (cart.length === 0) {
        itemsContainer.innerHTML = '<p style="text-align:center; color:#888; margin-top:2rem;">Your cart is empty.</p>';
    } else {
        cart.forEach((item) => {
            total += item.price * item.qty;
            const itemEl = document.createElement('div');
            itemEl.classList.add('cart-item');
            itemEl.innerHTML = `
                <div class="item-info">
                    <h4>${item.name}</h4>
                    <span class="item-price">₹${item.price} x ${item.qty}</span>
                </div>
                <div class="qty-control-cart">
                    <button onclick="updateQuantity('${item.name}', ${item.price}, -1)">-</button>
                    <span>${item.qty}</span>
                    <button onclick="updateQuantity('${item.name}', ${item.price}, 1)">+</button>
                </div>
            `;
            itemsContainer.appendChild(itemEl);
        });
    }

    // Update Total
    totalSpan.textContent = '₹' + total.toFixed(2);
}

// ---------------------------------------------
// NEW CHECKOUT LOGIC WITH FIREBASE
// ---------------------------------------------

function checkoutWhatsApp() {
    if (cart.length === 0) {
        alert("Your cart is empty!");
        return;
    }
    // New: Open Modal instead of direct WhatsApp
    toggleCart(); // Close sidebar
    document.getElementById('checkout-modal').style.display = 'block';
    document.getElementById('overlay').classList.add('active'); // Keep overlay for modal
}

function closeCheckout() {
    document.getElementById('checkout-modal').style.display = 'none';
    document.getElementById('overlay').classList.remove('active');
}

async function finalizeOrder(e) {
    e.preventDefault();

    const name = document.getElementById('cust-name').value;
    const phone = document.getElementById('cust-phone').value;
    const address = document.getElementById('cust-address').value;
    const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const orderId = 'ORD-' + Date.now().toString().slice(-6); // Simple ID: ORD-123456

    const orderData = {
        orderId: orderId,
        customerName: name,
        phone: phone,
        address: address,
        items: cart,
        totalAmount: totalAmount,
        status: 'pending', // pending, confirmed, delivered
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const submitBtn = e.target.querySelector('button');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    submitBtn.disabled = true;

    try {
        // 1. Save to Firestore
        await db.collection('orders').add(orderData);

        // 2. Clear Cart
        cart = [];
        updateUI();
        closeCheckout();

        // 3. Redirect to WhatsApp
        const phoneNumber = "918105487345";
        let message = `*New Order: ${orderId}* %0A`;
        message += `Name: ${name}%0A`;
        message += `Address: ${address}%0A%0A`;
        message += `*Items:*%0A`;

        orderData.items.forEach(item => {
            message += `${item.qty} x ${item.name} = ₹${item.price * item.qty}%0A`;
        });

        message += `%0A*Total to Pay: ₹${totalAmount}*`;
        message += `%0A%0A(I have placed this order on your website. Please check Admin Panel.)`;

        window.open(`https://wa.me/${phoneNumber}?text=${message}`, '_blank');

        // Reset Button (in case they come back)
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;

    } catch (error) {
        console.error("Error saving order: ", error);
        alert("Something went wrong saving your order. Please try again.");
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

function submitCorporateInquiry(e) {
    e.preventDefault();
    const name = document.getElementById('c_name').value;
    const company = document.getElementById('c_company').value;
    const event = document.getElementById('c_event').value;
    const qty = document.getElementById('c_qty').value;

    const phoneNumber = "918105487345";
    let message = `*Corporate Inquiry* %0A%0A`;
    message += `Name: ${name}%0A`;
    message += `Company: ${company}%0A`;
    message += `Event: ${event}%0A`;
    message += `Est. Quantity: ${qty}%0A`;
    message += `%0AHello! I'd like to plan a corporate order.`;

    window.open(`https://wa.me/${phoneNumber}?text=${message}`, '_blank');
}
