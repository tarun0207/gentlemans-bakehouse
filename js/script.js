document.addEventListener('DOMContentLoaded', () => {
    // Mobile Menu Toggle
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const nav = document.querySelector('nav');

    if (menuBtn) {
        menuBtn.addEventListener('click', () => {
            nav.classList.toggle('active');
        });
    }

    // Smooth Scroll for Anchor Links (Backup for CSS smooth-scroll)
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth'
                });
                // Close mobile menu if open
                if (nav.classList.contains('active')) {
                    nav.classList.remove('active');
                }
            }
        });
    });
});

// WhatsApp Integration
function orderItem(itemName) {
    const phoneNumber = "8105487345"; // Placeholder number
    const message = `Hello, I would like to place an order for: ${itemName}. Please confirm availability.`;
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;

    window.open(whatsappUrl, '_blank');
}
