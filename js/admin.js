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
if (currentDateEl) currentDateEl.textContent = new Date().toLocaleDateString('en-US', dateOptions);

// Auth State Observer
auth.onAuthStateChanged((user) => {
    if (user) {
        showDashboard();
        loadDashboardData();
    } else {
        showLogin();
    }
});

// Login Handler
if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('admin-email').value;
        const password = document.getElementById('admin-password').value;

        auth.signInWithEmailAndPassword(email, password)
            .then((userCredential) => {
                console.log("Logged in as:", userCredential.user.email);
            })
            .catch((error) => {
                alert("Error: " + error.message);
            });
    });
}

// Logout Handler
function logout() {
    auth.signOut().then(() => {
        alert("Logged out successfully.");
        window.location.reload();
    }).catch((error) => {
        console.error("Logout error", error);
    });
}

// UI Switchers
function showDashboard() {
    if (loginScreen) loginScreen.style.display = 'none';
    if (dashboardApp) dashboardApp.style.display = 'flex';
}

function showLogin() {
    if (dashboardApp) dashboardApp.style.display = 'none';
    if (loginScreen) loginScreen.style.display = 'flex';
}

function switchView(viewId) {
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.sidebar-nav a').forEach(el => el.classList.remove('active'));

    const target = document.getElementById(`view-${viewId}`);
    if (target) {
        target.style.display = 'block';
    }

    // Highlight nav (simple approximation)
    const navLink = document.querySelector(`.sidebar-nav a[onclick*="${viewId}"]`);
    if (navLink) navLink.classList.add('active');
}

// Data Loading Logic
async function loadDashboardData() {
    console.log("Loading dashboard data...");

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        const ordersSnapshot = await db.collection('orders')
            .orderBy('createdAt', 'desc')
            .limit(20)
            .get();

        let todayCount = 0;
        let productionCount = 0;
        let dispatchCount = 0;
        let weeklyRevenue = 0;
        let bakeList = {};

        const recentOrdersBody = document.getElementById('recent-orders-body');
        if (recentOrdersBody) recentOrdersBody.innerHTML = '';

        ordersSnapshot.forEach(doc => {
            const order = doc.data();
            const orderDate = order.createdAt ? order.createdAt.toDate() : new Date();
            const isToday = orderDate >= today;

            if (isToday) todayCount++;
            if (order.status === 'in_production') productionCount++;
            if (order.status === 'pending' || order.status === 'confirmed') dispatchCount++;

            if (order.totalAmount) weeklyRevenue += order.totalAmount;

            if (['pending', 'confirmed'].includes(order.status)) {
                if (order.items && Array.isArray(order.items)) {
                    order.items.forEach(item => {
                        if (!bakeList[item.name]) {
                            bakeList[item.name] = { qty: 0, orders: 0, orderIds: new Set() };
                        }
                        bakeList[item.name].qty += item.qty;
                        bakeList[item.name].orderIds.add(order.orderId);
                    });
                }
            }

            if (recentOrdersBody) {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>#${order.orderId ? order.orderId.slice(-6) : 'N/A'}</td>
                    <td>${order.customerName}</td>
                    <td>${order.type || 'Retail'}</td>
                    <td>₹${order.totalAmount}</td>
                    <td><span class="status-badge status-${order.status || 'new'}">${order.status || 'New'}</span></td>
                    <td>
                        <button class="btn-small" onclick="viewOrder('${doc.id}')"><i class="fas fa-eye"></i></button>
                        ${order.status === 'pending' ? `<button class="btn-small" onclick="updateStatus('${doc.id}', 'confirmed')"><i class="fas fa-check"></i></button>` : ''}
                    </td>
                `;
                recentOrdersBody.appendChild(tr);
            }
        });

        Object.keys(bakeList).forEach(key => {
            bakeList[key].orders = bakeList[key].orderIds.size;
        });

        if (document.getElementById('kpi-today-count')) document.getElementById('kpi-today-count').textContent = todayCount;
        if (document.getElementById('kpi-production-count')) document.getElementById('kpi-production-count').textContent = productionCount;
        if (document.getElementById('kpi-dispatch-count')) document.getElementById('kpi-dispatch-count').textContent = dispatchCount;
        if (document.getElementById('kpi-revenue')) document.getElementById('kpi-revenue').textContent = '₹' + weeklyRevenue.toLocaleString();

        renderBakeList(bakeList);

    } catch (error) {
        console.log("Error fetching data:", error);
    }
}

function renderBakeList(list) {
    const container = document.getElementById('bake-list-body');
    if (!container) return;
    container.innerHTML = '';

    const keys = Object.keys(list);
    if (keys.length === 0) {
        container.innerHTML = '<tr><td colspan="3" class="empty-cell">No active baking required.</td></tr>';
        return;
    }

    keys.forEach(key => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${key}</td>
            <td style="font-weight:700">${list[key].qty} boxes</td>
            <td>${list[key].orders} orders</td>
        `;
        container.appendChild(tr);
    });
}

function updateStatus(docId, status) {
    if (!confirm('Mark order as ' + status + '?')) return;
    db.collection('orders').doc(docId).update({
        status: status
    }).then(() => {
        loadDashboardData();
    });
}

function printBakeList() {
    window.print();
}

// Order Management Logic
let currentOrderId = null; // Track currently open order

async function loadOrders() {
    console.log("Loading all orders with filters...");
    const statusFilter = document.getElementById('filter-status').value;
    const typeFilter = document.getElementById('filter-type').value;
    const tbody = document.getElementById('orders-table-body');

    if (!tbody) return; // Not on view-orders?

    tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">Loading...</td></tr>';

    try {
        let query = db.collection('orders').orderBy('createdAt', 'desc');

        // Apply filters (Client-side filtering for simplicity if composite indexes missing)
        // Ideally we use .where() clauses but that requires indexes for each combo.
        // For < 1000 orders, client side is fine.

        const snapshot = await query.limit(50).get(); // Limit 50 for performance

        tbody.innerHTML = '';

        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">No orders found.</td></tr>';
            return;
        }

        snapshot.forEach(doc => {
            const order = doc.data();

            // Filter Match Check
            if (statusFilter !== 'all' && order.status !== statusFilter) return;
            if (typeFilter !== 'all' && (order.type || 'Retail') !== typeFilter) return;

            // Simplify Items string
            let itemsSummary = order.items ? order.items.map(i => `${i.qty}x ${i.name.split(' ').slice(-2).join(' ')}`).join(', ') : 'No items';
            if (itemsSummary.length > 30) itemsSummary = itemsSummary.substring(0, 30) + '...';

            const dateStr = order.createdAt ? order.createdAt.toDate().toLocaleDateString() : '-';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>#${order.orderId ? order.orderId.slice(-6) : '...'}</td>
                <td>${dateStr}</td>
                <td>${order.customerName}<br><small>${order.phone || ''}</small></td>
                <td>${order.type || 'Retail'}</td>
                <td><small>${itemsSummary}</small></td>
                <td>₹${order.totalAmount}</td>
                <td><span class="status-badge status-${order.status || 'new'}">${order.status || 'New'}</span></td>
                <td>
                    <button class="btn-small" onclick="viewOrder('${doc.id}')"><i class="fas fa-eye"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (e) {
        console.error("Load orders error:", e);
        tbody.innerHTML = `<tr><td colspan="8" class="empty-cell">Error loading orders: ${e.message}</td></tr>`;
    }
}

async function viewOrder(docId) {
    currentOrderId = docId;
    const modal = document.getElementById('order-modal');

    // Show spinner or loading state if needed

    try {
        const doc = await db.collection('orders').doc(docId).get();
        if (!doc.exists) {
            alert("Order not found!");
            return;
        }

        const order = doc.data();

        // Populate Modal
        document.getElementById('modal-order-id').textContent = 'Order #' + (order.orderId || doc.id);
        document.getElementById('modal-customer-name').textContent = order.customerName || '-';
        document.getElementById('modal-customer-phone').textContent = order.phone || '-';
        document.getElementById('modal-customer-address').textContent = order.address || '-';

        document.getElementById('modal-order-date').textContent = order.createdAt ? order.createdAt.toDate().toLocaleString() : '-';
        document.getElementById('modal-order-type').textContent = order.type || 'Retail';
        document.getElementById('modal-order-status').value = order.status || 'new';
        document.getElementById('modal-notes').textContent = order.notes || 'No notes.';

        // Items
        const itemsBody = document.getElementById('modal-items-body');
        itemsBody.innerHTML = '';
        if (order.items) {
            order.items.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${item.name}</td>
                    <td>${item.qty}</td>
                    <td>₹${item.price}</td>
                    <td>₹${item.price * item.qty}</td>
                `;
                itemsBody.appendChild(tr);
            });
        }

        document.getElementById('modal-total-amount').textContent = '₹' + order.totalAmount;

        // Show Modal
        modal.style.display = 'flex';

    } catch (e) {
        alert("Error fetching order details: " + e.message);
    }
}

function closeModal() {
    document.getElementById('order-modal').style.display = 'none';
    currentOrderId = null;
}

function saveOrderStatus() {
    if (!currentOrderId) return;

    const newStatus = document.getElementById('modal-order-status').value;
    const btn = document.querySelector('#order-modal .btn-primary');
    const originalText = btn.textContent;
    btn.textContent = "Saving...";

    db.collection('orders').doc(currentOrderId).update({
        status: newStatus
    }).then(() => {
        alert("Status updated!");
        closeModal();
        loadOrders(); // Refresh table
        loadDashboardData(); // Refresh dashboard if open
    }).catch(e => {
        alert("Error updating: " + e.message);
    }).finally(() => {
        btn.textContent = originalText;
    });
}

// Global click to close modal
window.onclick = function (event) {
    const modal = document.getElementById('order-modal');
    if (event.target == modal) {
        closeModal();
    }
}
