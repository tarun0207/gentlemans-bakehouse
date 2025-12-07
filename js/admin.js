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

function viewOrder(docId) {
    alert("View Order details feature coming soon! ID: " + docId);
}
