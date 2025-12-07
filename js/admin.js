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
                const ordersSnapshot = await db.collection('orders')
                    .orderBy('createdAt', 'desc')
                    .limit(20) // Limit for recent list
                    .get();

                let todayCount = 0;
                let productionCount = 0;
                let dispatchCount = 0;
                let weeklyRevenue = 0;
                let bakeList = {}; // { 'Choc Chip': { qty: 20, orders: 2 } }

                const recentOrdersBody = document.getElementById('recent-orders-body');
                recentOrdersBody.innerHTML = '';

                ordersSnapshot.forEach(doc => {
                    const order = doc.data();
                    const orderDate = order.createdAt ? order.createdAt.toDate() : new Date();
                    const isToday = orderDate >= today;

                    // Counts
                    if (isToday) todayCount++;
                    if (order.status === 'in_production') productionCount++;
                    if (order.status === 'pending' || order.status === 'confirmed') dispatchCount++; // Assuming pending need action

                    // Revenue (Simple Week logic - for now just all fetched)
                    if (order.totalAmount) weeklyRevenue += order.totalAmount;

                    // Bake List Logic (Pending/Confirmed orders)
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

                    // Populate Recent Orders Table
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
                });

                // Calculate actual order count for bake list
                Object.keys(bakeList).forEach(key => {
                    bakeList[key].orders = bakeList[key].orderIds.size;
                });

                // Update Stats UI
                document.getElementById('kpi-today-count').textContent = todayCount;
                document.getElementById('kpi-production-count').textContent = productionCount;
                document.getElementById('kpi-dispatch-count').textContent = dispatchCount;
                document.getElementById('kpi-revenue').textContent = '₹' + weeklyRevenue.toLocaleString();

                // Update Bake List UI
                renderBakeList(bakeList);

            } catch (error) {
                console.log("Error fetching data:", error);
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
            const container = document.getElementById('bake-list-body');
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
                loadDashboardData(); // Refresh
            });
        }


        function printBakeList() {
            window.print();
        }
