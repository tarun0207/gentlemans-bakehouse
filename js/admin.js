// Initialize Firebase Services
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const dashboardApp = document.getElementById('dashboard-app');
const loginForm = document.getElementById('login-form');
const currentDateEl = document.getElementById('current-date');

// Set Date
const dateOptions = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' };
currentDateEl.textContent = new Date().toLocaleDateString('en-US', dateOptions);

// Auth State Observer
auth.onAuthStateChanged((user) => {
    if (user) {
        // User is signed in
        showDashboard();
        loadDashboardData();
    } else {
        // No user is signed in
        showLogin();
    }
});

// Login Handler
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('admin-email').value;
    const password = document.getElementById('admin-password').value;

    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // Signed in
            console.log("Logged in as:", userCredential.user.email);
        })
        .catch((error) => {
            alert("Error: " + error.message);
        });
});

// Logout Handler
function logout() {
    auth.signOut().then(() => {
        alert("Logged out successfully.");
    }).catch((error) => {
        console.error("Logout error", error);
    });
}

// UI Switchers
function showDashboard() {
    loginScreen.style.display = 'none';
    dashboardApp.style.display = 'flex';
}

function showLogin() {
    dashboardApp.style.display = 'none';
    loginScreen.style.display = 'flex';
}

function switchView(viewId) {
    // Hide all view sections
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    // Remove active class from nav
    document.querySelectorAll('.sidebar-nav a').forEach(el => el.classList.remove('active'));

    // Show target view
    const target = document.getElementById(`view-${viewId}`);
    if (target) {
        target.style.display = 'block';
        // Highlight nav item (simplified match)
        // In a real app we'd target the specific link element
    }
}

// Data Loading Logic
async function loadDashboardData() {
    console.log("Loading dashboard data...");

    // Get start of today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        // Fetch Today's Orders
        // Note: This requires the 'orders' collection to exist.
        // If empty, it will return 0, which is fine.
        const ordersSnapshot = await db.collection('orders')
            .where('createdAt', '>=', today)
            .get();

        const todayCount = ordersSnapshot.size;
        updateStat('Today\'s Orders', todayCount);

        let pendingCount = 0;
        let deliveredCount = 0;
        let bakeList = {}; // { 'Choc Chip': 120, 'Oats': 60 }

        ordersSnapshot.forEach(doc => {
            const order = doc.data();

            // Count Status
            if (order.status === 'pending') pendingCount++;
            if (order.status === 'delivered') deliveredCount++;

            // Calculate Bake List (only if status is pending or confirmed)
            if (['pending', 'confirmed', 'in_production'].includes(order.status)) {
                if (order.items && Array.isArray(order.items)) {
                    order.items.forEach(item => {
                        // Assuming item structure: { name: "Choc Chip", qty: 2 }
                        // Bake list often needs total PIECES, but user sells BOXES?
                        // If 1 box = 6 cookies, we might need a multiplier.
                        // For now, let's just sum the Quantity field (Boxes).

                        if (bakeList[item.name]) {
                            bakeList[item.name] += item.qty;
                        } else {
                            bakeList[item.name] = item.qty;
                        }
                    });
                }
            }
        });

        // Update Stats UI
        updateStat('Pending', pendingCount);
        updateStat('Delivered', deliveredCount);

        // Update Bake List UI
        renderBakeList(bakeList);

    } catch (error) {
        console.log("Error fetching data:", error);
        // If error is "Missing or insufficient permissions", it means rules are set.
        // New Firestore database mode defaults to locked. User needs to enable rules.
    }
}

function updateStat(label, value) {
    const cards = document.querySelectorAll('.stat-card');
    cards.forEach(card => {
        if (card.querySelector('.stat-label').textContent === label) {
            card.querySelector('.stat-value').textContent = value;
        }
    });
}

function renderBakeList(list) {
    const container = document.querySelector('.bake-list-content');
    container.innerHTML = ''; // Clear default message

    const keys = Object.keys(list);
    if (keys.length === 0) {
        container.innerHTML = '<p class="empty-state">No active orders needing baking.</p>';
        return;
    }

    keys.forEach(key => {
        const div = document.createElement('div');
        div.className = 'bake-item';
        div.innerHTML = `
            <span>${key}</span>
            <span class="bake-count">${list[key]} boxes</span>
        `;
        container.appendChild(div);
    });
}

function printBakeList() {
    window.print();
}
