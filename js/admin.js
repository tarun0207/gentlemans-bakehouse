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

function switchView(viewId, event) {
    if (event) event.preventDefault();

    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.sidebar-nav a').forEach(el => el.classList.remove('active'));

    const target = document.getElementById(`view-${viewId}`);
    if (target) {
        target.style.display = 'block';
    }

    // Highlight nav
    const navLink = document.querySelector(`.sidebar-nav a[onclick*="${viewId}"]`);
    if (navLink) navLink.classList.add('active');

    // Auto-load data
    if (viewId === 'orders') loadOrders();
    if (viewId === 'products') loadProducts();
    if (viewId === 'inventory') switchInventoryTab('ingredients');
    if (viewId === 'corporate') loadCorporateLeads();
    if (viewId === 'customers') loadCustomers();
    if (viewId === 'settings') loadSettings();
    if (viewId === 'overview') loadDashboardData();
}

// Data Loading Logic (Dashboard Overview)
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

        // Convert bake list sets to counts
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
let currentOrderId = null;

async function loadOrders() {
    console.log("Loading all orders with filters...");
    const statusFilter = document.getElementById('filter-status').value;
    const typeFilter = document.getElementById('filter-type').value;
    const tbody = document.getElementById('orders-table-body');

    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">Loading...</td></tr>';

    try {
        let query = db.collection('orders').orderBy('createdAt', 'desc');

        const snapshot = await query.limit(50).get();

        tbody.innerHTML = '';

        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">No orders found.</td></tr>';
            return;
        }

        snapshot.forEach(doc => {
            const order = doc.data();

            // Client-side Filter
            if (statusFilter !== 'all' && order.status !== statusFilter) return;
            if (typeFilter !== 'all' && (order.type || 'Retail') !== typeFilter) return;

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

    try {
        const doc = await db.collection('orders').doc(docId).get();
        if (!doc.exists) {
            alert("Order not found!");
            return;
        }

        const order = doc.data();

        document.getElementById('modal-order-id').textContent = 'Order #' + (order.orderId || doc.id);
        document.getElementById('modal-customer-name').textContent = order.customerName || '-';
        document.getElementById('modal-customer-phone').textContent = order.phone || '-';
        document.getElementById('modal-customer-email').textContent = order.email || '-';
        document.getElementById('modal-customer-address').textContent = order.address || '-';

        document.getElementById('modal-status').value = order.status || 'pending';
        document.getElementById('modal-notes').textContent = order.notes || 'No notes.';

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
        loadOrders();
        loadDashboardData();
    }).catch(e => {
        alert("Error updating: " + e.message);
    }).finally(() => {
        btn.textContent = originalText;
    });
}

// Global click to close modal
// Global click to close modal
window.onclick = function (event) {
    const modal = document.getElementById('order-modal');
    const prodModal = document.getElementById('product-modal');
    const invModal = document.getElementById('inventory-modal');
    if (event.target == modal) closeModal();
    if (event.target == prodModal) closeProductModal();
    if (event.target == invModal) closeInventoryModal();
}

// Product Management Logic
let currentProductId = null;

async function loadProducts() {
    const tbody = document.getElementById('products-table-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">Loading products...</td></tr>';

    try {
        const snapshot = await db.collection('products').get();
        tbody.innerHTML = '';

        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">No products found. Add one!</td></tr>';
            return;
        }

        snapshot.forEach(doc => {
            const prod = doc.data();
            const tr = document.createElement('tr');

            const thumb = prod.image || 'https://via.placeholder.com/50';
            const statusClass = prod.status ? 'status-delivered' : 'status-in_production';
            const statusText = prod.status ? 'Active' : 'Disabled';

            tr.innerHTML = `
                <td><img src="${thumb}" class="product-thumb"></td>
                <td><strong>${prod.name}</strong><br><small>${prod.shortDesc || ''}</small></td>
                <td>${prod.category}</td>
                <td>${prod.packSize || '-'}</td>
                <td>₹${prod.price}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>
                    <button class="table-action-btn" onclick="editProduct('${doc.id}')"><i class="fas fa-edit"></i></button>
                    <button class="table-action-btn delete" onclick="toggleProductStatus('${doc.id}', ${!prod.status})"><i class="fas fa-power-off"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (e) {
        console.error("Load products error:", e);
        tbody.innerHTML = `<tr><td colspan="7" class="empty-cell">Error: ${e.message}</td></tr>`;
    }
}

function openProductModal() {
    currentProductId = null;
    document.getElementById('product-form').reset();
    document.getElementById('product-modal-title').textContent = "Add New Cookie";
    document.getElementById('product-modal').style.display = 'flex';
}

function closeProductModal() {
    document.getElementById('product-modal').style.display = 'none';
}

async function editProduct(docId) {
    currentProductId = docId;
    try {
        const doc = await db.collection('products').doc(docId).get();
        if (!doc.exists) return;

        const data = doc.data();
        document.getElementById('product-modal-title').textContent = "Edit " + data.name;

        document.getElementById('prod-name').value = data.name || '';
        document.getElementById('prod-category').value = data.category || 'Signature';
        document.getElementById('prod-price').value = data.price || '';
        document.getElementById('prod-pack').value = data.packSize || '';
        document.getElementById('prod-short-desc').value = data.shortDesc || '';
        document.getElementById('prod-image').value = data.image || '';
        document.getElementById('prod-status').checked = data.status !== false;

        // Tags
        document.getElementById('tag-bestseller').checked = (data.tags || []).includes('bestseller');
        document.getElementById('tag-new').checked = (data.tags || []).includes('new');

        document.getElementById('product-modal').style.display = 'flex';
    } catch (e) {
        alert("Error loading product: " + e.message);
    }
}

async function saveProduct() {
    const btn = document.querySelector('#product-modal .btn-primary');
    btn.textContent = "Saving...";

    const data = {
        name: document.getElementById('prod-name').value,
        category: document.getElementById('prod-category').value,
        price: Number(document.getElementById('prod-price').value),
        packSize: document.getElementById('prod-pack').value,
        shortDesc: document.getElementById('prod-short-desc').value,
        image: document.getElementById('prod-image').value,
        status: document.getElementById('prod-status').checked,
        tags: [],
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (document.getElementById('tag-bestseller').checked) data.tags.push('bestseller');
    if (document.getElementById('tag-new').checked) data.tags.push('new');

    try {
        if (currentProductId) {
            await db.collection('products').doc(currentProductId).update(data);
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('products').add(data);
        }
        closeProductModal();
        loadProducts();
    } catch (e) {
        alert("Error saving: " + e.message);
    } finally {
        btn.textContent = "Save Cookie";
    }
}

async function toggleProductStatus(docId, newStatus) {
    if (!confirm("Change status?")) return;
    try {
        await db.collection('products').doc(docId).update({ status: newStatus });
        loadProducts();
    } catch (e) {
        alert("Error: " + e.message);
    }
}

// Inventory Management Logic
let currentInvId = null;
let currentInvType = 'ingredients'; // ingredients or packaging

function switchInventoryTab(tab) {
    currentInvType = tab;
    // UI toggle
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.tab-btn[onclick*="${tab}"]`).classList.add('active');

    document.querySelectorAll('.inventory-tab-content').forEach(content => content.style.display = 'none');
    document.getElementById(`tab-${tab}`).style.display = 'block';

    // Load data
    loadInventory(tab);
}

async function loadInventory(type) {
    const tbody = document.getElementById(`${type}-table-body`);
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" class="empty-cell">Loading ${type}...</td></tr>`;

    try {
        // Query the 'inventory' collection and filter by type field
        const snapshot = await db.collection('inventory')
            .where('type', '==', type === 'ingredients' ? 'ingredient' : 'packaging')
            .orderBy('name')
            .get();

        tbody.innerHTML = '';

        let lowStockCount = 0;

        if (snapshot.empty) {
            tbody.innerHTML = `<tr><td colspan="6" class="empty-cell">No items found. Add some!</td></tr>`;
        } else {
            snapshot.forEach(doc => {
                const item = doc.data();
                const isLow = item.currentStock <= (item.minLevel || 0);
                if (isLow) lowStockCount++;

                const tr = document.createElement('tr');
                if (isLow) tr.classList.add('low-stock-row');

                const lastUpdated = item.updatedAt ? item.updatedAt.toDate().toLocaleDateString() : '-';

                tr.innerHTML = `
                    <td><strong>${item.name}</strong></td>
                    <td>${item.category || '-'}</td>
                    <td>
                        <button class="stock-adjust-btn" onclick="adjustStock('${doc.id}', -1)">-</button>
                        <span style="display:inline-block; width:60px; text-align:center; font-weight:bold;">${item.currentStock} ${item.unit}</span>
                        <button class="stock-adjust-btn" onclick="adjustStock('${doc.id}', 1)">+</button>
                    </td>
                    <td>${item.minLevel || 0} ${item.unit}</td>
                    <td>${lastUpdated}</td>
                    <td>
                        <button class="table-action-btn" onclick="editInventory('${type}', '${doc.id}')"><i class="fas fa-edit"></i></button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        // Update Summary Pill
        const pillId = type === 'ingredients' ? 'low-stock-ingredients' : 'low-stock-packaging';
        const countId = type === 'ingredients' ? 'count-low-ing' : 'count-low-pack';
        const pill = document.getElementById(pillId);
        if (pill) {
            if (document.getElementById(countId)) document.getElementById(countId).textContent = lowStockCount;

            if (lowStockCount > 0) {
                pill.style.display = 'inline-flex';
            } else {
                pill.style.display = 'none';
            }
        }

    } catch (e) {
        console.error("Load inventory error:", e);
        tbody.innerHTML = `<tr><td colspan="6" class="empty-cell">Error: ${e.message}</td></tr>`;
    }
}

function openInventoryModal(type) {
    currentInvType = type;
    currentInvId = null;
    document.getElementById('inventory-form').reset();
    document.getElementById('inv-type').value = type;
    document.getElementById('inv-modal-title').textContent = type === 'ingredients' ? "Add Ingredient" : "Add Packaging";

    // Populate Categories
    const catSelect = document.getElementById('inv-category');
    catSelect.innerHTML = '';
    const cats = type === 'ingredients'
        ? ['Flour', 'Fat', 'Sugar', 'Add-ons', 'Flavouring']
        : ['Box', 'Pouch', 'Sticker', 'Label', 'Other'];

    cats.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        catSelect.appendChild(opt);
    });

    document.getElementById('inventory-modal').style.display = 'flex';
}

function closeInventoryModal() {
    document.getElementById('inventory-modal').style.display = 'none';
}

async function editInventory(type, docId) {
    currentInvId = docId;
    currentInvType = type;

    try {
        const doc = await db.collection('inventory').doc(docId).get();
        if (!doc.exists) return;

        const data = doc.data();
        openInventoryModal(type);
        document.getElementById('inv-modal-title').textContent = "Edit " + data.name;

        document.getElementById('inv-name').value = data.name;
        document.getElementById('inv-category').value = data.category;
        document.getElementById('inv-supplier').value = data.supplier || '';
        document.getElementById('inv-stock').value = data.currentStock;
        document.getElementById('inv-unit').value = data.unit;
        document.getElementById('inv-min').value = data.minLevel;

    } catch (e) {
        alert("Error: " + e.message);
    }
}

async function saveInventoryItem() {
    const btn = document.querySelector('#inventory-modal .btn-primary');
    btn.textContent = "Saving...";

    const type = currentInvType;
    const data = {
        name: document.getElementById('inv-name').value,
        type: type === 'ingredients' ? 'ingredient' : 'packaging',
        category: document.getElementById('inv-category').value,
        supplier: document.getElementById('inv-supplier').value,
        currentStock: Number(document.getElementById('inv-stock').value),
        unit: document.getElementById('inv-unit').value,
        minLevel: Number(document.getElementById('inv-min').value),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        if (currentInvId) {
            await db.collection('inventory').doc(currentInvId).update(data);
        } else {
            await db.collection('inventory').add(data);
        }
        closeInventoryModal();
        loadInventory(type);
    } catch (e) {
        alert("Error saving: " + e.message);
    } finally {
        btn.textContent = "Save Item";
    }
}

async function adjustStock(docId, change) {
    try {
        const docRef = db.collection('inventory').doc(docId);
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(docRef);
            if (!doc.exists) return;

            const newStock = (doc.data().currentStock || 0) + change;
            if (newStock < 0) return;

            transaction.update(docRef, {
                currentStock: newStock,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });

        // Reload both tabs since we don't know which one we're on
        loadInventory('ingredients');
        loadInventory('packaging');
    } catch (e) {
        console.error("Adjustment failed:", e);
    }
}

/* ============================
   CORPORATE / LEAD MANAGEMENT
   ============================ */

let currentLeadId = null;

async function loadCorporateLeads() {
    const tbody = document.getElementById('corporate-table-body');
    const statusFilter = document.getElementById('corp-filter-status').value;
    const dateFilter = document.getElementById('corp-filter-date').value;

    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">Loading leads...</td></tr>';

    try {
        let query = db.collection('leads').orderBy('createdAt', 'desc');

        if (statusFilter !== 'all') {
            query = query.where('status', '==', statusFilter);
        }

        const snapshot = await query.limit(50).get();

        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">No leads found.</td></tr>';
            return;
        }

        let html = '';
        snapshot.forEach(doc => {
            const lead = doc.data();
            // Client-side date filter (Firestore simple queries limit advanced date logic mixed with status)
            // TODO: Enhance this with complex queries if needed

            html += `
                <tr>
                    <td>${lead.companyName || '-'}</td>
                    <td>
                        <div>${lead.contactName}</div>
                        <small style="color:#666;">${lead.email}</small>
                    </td>
                    <td>${lead.eventDate || '-'}</td>
                    <td>${lead.budget ? '₹' + lead.budget : '-'}</td>
                    <td><span class="status-badge status-${(lead.status || 'New').toLowerCase().replace(' ', '-')}">${lead.status || 'New'}</span></td>
                    <td>${lead.createdAt ? new Date(lead.createdAt.seconds * 1000).toLocaleDateString() : '-'}</td>
                    <td>
                        <button class="btn-small btn-primary" onclick="openLeadModal('${doc.id}')">View</button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;

    } catch (e) {
        console.error("Error loading leads:", e);
        tbody.innerHTML = `<tr><td colspan="7" class="empty-cell" style="color:red;">Error: ${e.message}</td></tr>`;
    }
}

async function addMockLead() {
    try {
        await db.collection('leads').add({
            companyName: "TechCorp Inc.",
            contactName: "John Doe",
            email: "john@techcorp.com",
            phone: "9876543210",
            eventDate: "2025-12-25",
            budget: 50000,
            estimatedQty: 100,
            message: "Need 100 gift boxes for Christmas party. Custom branding required.",
            status: "New",
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        loadCorporateLeads();
        // alert("Mock lead added!");
    } catch (e) {
        alert("Error: " + e.message);
    }
}

async function openLeadModal(leadId) {
    currentLeadId = leadId;
    const modal = document.getElementById('lead-modal');
    modal.style.display = 'flex'; // Show immediately

    // Fetch details
    try {
        const doc = await db.collection('leads').doc(leadId).get();
        if (!doc.exists) return; // Should handle error
        const data = doc.data();

        document.getElementById('lead-company').innerText = data.companyName || '-';
        document.getElementById('lead-contact').innerText = data.contactName || '-';
        document.getElementById('lead-email').innerText = data.email || '-';
        document.getElementById('lead-phone').innerText = data.phone || '-';

        document.getElementById('lead-date').innerText = data.eventDate || '-';
        document.getElementById('lead-budget').innerText = data.budget ? '₹' + data.budget : '-';
        document.getElementById('lead-qty').innerText = data.estimatedQty || '-';

        document.getElementById('lead-message').innerText = data.message || '(No message)';

        // Editable fields
        document.getElementById('lead-status').value = data.status || 'New';
        document.getElementById('lead-quote-ref').value = data.quoteRef || '';
        document.getElementById('lead-notes').value = data.internalNotes || '';

    } catch (e) {
        console.error(e);
        alert("Failed to load lead details.");
    }
}

function closeLeadModal() {
    document.getElementById('lead-modal').style.display = 'none';
    currentLeadId = null;
}

async function saveLeadNotes() {
    if (!currentLeadId) return;

    const btn = document.querySelector('#lead-modal .btn-primary');
    const originalText = btn.textContent;
    btn.textContent = "Saving...";

    const updates = {
        status: document.getElementById('lead-status').value,
        quoteRef: document.getElementById('lead-quote-ref').value,
        internalNotes: document.getElementById('lead-notes').value,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        await db.collection('leads').doc(currentLeadId).update(updates);
        loadCorporateLeads();
        closeLeadModal();
    } catch (e) {
        alert("Error saving: " + e.message);
    } finally {
        btn.textContent = originalText;
    }
}

async function convertLeadToOrder() {
    if (!confirm("Create a new Order from this Lead? This will mark the lead as Converted.")) return;

    try {
        const leadDoc = await db.collection('leads').doc(currentLeadId).get();
        const lead = leadDoc.data();

        const newOrder = {
            customerName: lead.companyName ? `${lead.companyName} (${lead.contactName})` : lead.contactName,
            customerPhone: lead.phone,
            customerAddress: "Corporate Address (Update Later)",
            customerEmail: lead.email,
            items: [],
            totalAmount: lead.budget || 0,
            status: "new",
            type: "Corporate",
            leadId: currentLeadId,
            orderDate: firebase.firestore.FieldValue.serverTimestamp(),
            notes: `Converted from Lead. Event Date: ${lead.eventDate}. Requirements: ${lead.message}`
        };

        // Batch write: Create order, update lead
        const batch = db.batch();
        const orderRef = db.collection('orders').doc();
        const leadRef = db.collection('leads').doc(currentLeadId);

        batch.set(orderRef, newOrder);
        batch.update(leadRef, { status: "Converted" });

        await batch.commit();

        closeLeadModal();
        switchView('orders'); // Jump to orders to see it
        alert("Lead converted successfully!");

    } catch (e) {
        alert("Conversion failed: " + e.message);
    }
}

/* ============================
   CUSTOMER MANAGEMENT
   ============================ */
let currentCustomerId = null;

async function loadCustomers() {
    const tbody = document.getElementById('customers-table-body');
    const search = document.getElementById('cust-search').value.toLowerCase();

    tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">Loading...</td></tr>';

    try {
        let query = db.collection('customers').orderBy('totalSpend', 'desc').limit(50);
        const snapshot = await query.get();

        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">No customers found. Try "Sync Data" first.</td></tr>';
            return;
        }

        let html = '';
        snapshot.forEach(doc => {
            const c = doc.data();
            // Client-side search (Firestore lacks simple partial text search)
            if (search && !c.name.toLowerCase().includes(search) && !c.phone.includes(search)) return;

            html += `
                <tr>
                    <td>${c.name}</td>
                    <td>${c.phone}</td>
                    <td>${c.tags && c.tags.includes('Corporate') ? 'Corporate' : 'Retail'}</td>
                    <td>${c.totalOrders}</td>
                    <td>₹${c.totalSpend.toLocaleString()}</td>
                    <td>${c.lastOrderDate ? new Date(c.lastOrderDate.seconds * 1000).toLocaleDateString() : '-'}</td>
                    <td>${c.tags ? c.tags.map(t => `<span class="status-badge" style="background:#ddd; color:#333;">${t}</span>`).join(' ') : ''}</td>
                    <td>
                        <button class="btn-small btn-primary" onclick="viewCustomer('${doc.id}')">View</button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html || '<tr><td colspan="8" class="empty-cell">No matching results.</td></tr>';

    } catch (e) {
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="8" class="empty-cell" style="color:red;">Error: ${e.message}</td></tr>`;
    }
}

async function syncCustomers() {
    if (!confirm("Scan all past orders to build Customer Database? This might take a moment.")) return;

    const btn = document.querySelector('.filters-bar .btn-primary[onclick="syncCustomers()"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';
    btn.disabled = true;

    try {
        const ordersSnap = await db.collection('orders').get();
        const customersMap = {};

        // Aggregate Data
        ordersSnap.forEach(doc => {
            const order = doc.data();
            const phone = order.phone || order.customerPhone || 'Unknown';
            // Normalize phone if possible, but for key use as-is

            if (phone === 'Unknown') return;

            if (!customersMap[phone]) {
                customersMap[phone] = {
                    name: order.customerName,
                    phone: phone,
                    email: order.customerEmail || '',
                    address: order.address || order.customerAddress || '',
                    totalOrders: 0,
                    totalSpend: 0,
                    lastOrderDate: null,
                    tags: []
                };
            }

            const c = customersMap[phone];
            c.totalOrders++;
            c.totalSpend += (order.totalAmount || 0);

            const oDate = order.createdAt || order.orderDate; // handled as Firestore timestamp
            if (oDate) {
                if (!c.lastOrderDate || oDate.seconds > c.lastOrderDate.seconds) {
                    c.lastOrderDate = oDate;
                }
            }
            if (order.type === 'Corporate' && !c.tags.includes('Corporate')) c.tags.push('Corporate');
        });

        // Batch Write
        const batch = db.batch();
        Object.values(customersMap).forEach(c => {
            // Use phone as Doc ID to prevent dupes
            const ref = db.collection('customers').doc(c.phone);
            batch.set(ref, c, { merge: true });
        });

        await batch.commit();
        alert("Sync Complete! Customer database updated.");
        loadCustomers();

    } catch (e) {
        alert("Sync failed: " + e.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function viewCustomer(id) {
    currentCustomerId = id;
    const modal = document.getElementById('customer-modal');
    modal.style.display = 'flex';

    try {
        const doc = await db.collection('customers').doc(id).get();
        if (!doc.exists) return;
        const c = doc.data();

        document.getElementById('cust-name').innerText = c.name;
        document.getElementById('cust-phone').innerText = c.phone;
        document.getElementById('cust-email').innerText = c.email || '-';
        document.getElementById('cust-address').innerText = c.address || '-';

        document.getElementById('cust-spend').innerText = '₹' + c.totalSpend.toLocaleString();
        document.getElementById('cust-orders').innerText = c.totalOrders;
        document.getElementById('cust-last-date').innerText = c.lastOrderDate ? new Date(c.lastOrderDate.seconds * 1000).toDateString() : '-';

        document.getElementById('cust-tags').value = c.tags ? c.tags.join(', ') : '';
        document.getElementById('cust-notes').value = c.internalNotes || '';

        // Load History (Separate Query)
        const historyBody = document.getElementById('cust-history-body');
        historyBody.innerHTML = '<tr><td colspan="4">Loading history...</td></tr>';

        const ordersSnap = await db.collection('orders')
            .where('customerPhone', '==', c.phone) // Assuming strict match
            .orderBy('createdAt', 'desc')
            .limit(10)
            .get();

        let histHtml = '';
        if (ordersSnap.empty) {
            // Fallback for older schema where phone might be just 'phone'
            // Real implementation might need OR query or client filter if schema varies
            histHtml = '<tr><td colspan="4">No recent orders found via exact phone match.</td></tr>';
        } else {
            ordersSnap.forEach(oDoc => {
                const o = oDoc.data();
                histHtml += `
                    <tr>
                        <td>${o.createdAt ? new Date(o.createdAt.seconds * 1000).toLocaleDateString() : '-'}</td>
                        <td>#${o.orderId ? o.orderId.slice(-6) : '...'}</td>
                        <td>₹${o.totalAmount}</td>
                        <td>${o.status}</td>
                    </tr>
                `;
            });
        }
        historyBody.innerHTML = histHtml;

    } catch (e) {
        console.error(e);
        alert("Error loading profile");
    }
}

function closeCustomerModal() {
    document.getElementById('customer-modal').style.display = 'none';
    currentCustomerId = null;
}

async function saveCustomerDetails() {
    if (!currentCustomerId) return;

    const tagsStr = document.getElementById('cust-tags').value;
    const notes = document.getElementById('cust-notes').value;
    const tags = tagsStr.split(',').map(t => t.trim()).filter(t => t);

    try {
        await db.collection('customers').doc(currentCustomerId).update({
            tags: tags,
            internalNotes: notes,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        closeCustomerModal();
        loadCustomers();
    } catch (e) {
        alert("Save failed: " + e.message);
    }
}


/* ============================
   SETTINGS & USER MANAGEMENT
   ============================ */

async function loadSettings() {
    loadUsers(); // Load users table too

    try {
        const doc = await db.collection('settings').doc('general').get();
        if (!doc.exists) return;
        const data = doc.data();

        // Business Info
        document.getElementById('set-bus-name').value = data.businessName || '';
        document.getElementById('set-bus-logo').value = data.logoUrl || '';
        document.getElementById('set-bus-phone').value = data.contactPhone || '';
        document.getElementById('set-bus-address').value = data.address || '';

        // Orders
        document.getElementById('set-prep-time').value = data.prepTime || 24;
        document.getElementById('set-del-charge').value = data.deliveryCharge || 0;
        document.getElementById('set-del-slots').value = data.deliverySlots || '';

        // Notifications
        document.getElementById('set-notif-order').checked = data.notifyOnOrder || false;
        document.getElementById('set-notif-lead').checked = data.notifyOnLead || false;

    } catch (e) {
        console.error("Error loading settings:", e);
    }
}

async function saveSettings() {
    const btn = document.querySelector('#view-settings .btn-primary');
    const originalText = btn.textContent;
    btn.textContent = "Saving...";

    const data = {
        businessName: document.getElementById('set-bus-name').value,
        logoUrl: document.getElementById('set-bus-logo').value,
        contactPhone: document.getElementById('set-bus-phone').value,
        address: document.getElementById('set-bus-address').value,

        prepTime: Number(document.getElementById('set-prep-time').value),
        deliveryCharge: Number(document.getElementById('set-del-charge').value),
        deliverySlots: document.getElementById('set-del-slots').value,

        notifyOnOrder: document.getElementById('set-notif-order').checked,
        notifyOnLead: document.getElementById('set-notif-lead').checked,

        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        await db.collection('settings').doc('general').set(data, { merge: true });
        alert("Settings saved successfully!");
    } catch (e) {
        alert("Error saving: " + e.message);
    } finally {
        btn.textContent = originalText;
    }
}

/* User Management */

async function loadUsers() {
    const tbody = document.getElementById('users-table-body');
    tbody.innerHTML = '<tr><td colspan="3">Loading...</td></tr>';

    try {
        const snapshot = await db.collection('users').orderBy('email').get();

        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="3">No extra users found.</td></tr>';
            return;
        }

        let html = '';
        snapshot.forEach(doc => {
            const u = doc.data();
            html += `
                <tr>
                    <td>${u.email}</td>
                    <td><span class="status-badge" style="background:#eee; color:#333;">${u.role}</span></td>
                    <td>
                        <button class="btn-small" onclick="deleteUser('${doc.id}')" style="color:red;"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;

    } catch (e) {
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="3" style="color:red;">Error: ${e.message}</td></tr>`;
    }
}

function openUserModal() {
    document.getElementById('user-modal').style.display = 'flex';
}

function closeUserModal() {
    document.getElementById('user-modal').style.display = 'none';
    document.getElementById('user-email').value = '';
}

async function saveUser() {
    const email = document.getElementById('user-email').value;
    const role = document.getElementById('user-role').value;

    if (!email) return alert("Email is required");

    try {
        await db.collection('users').add({
            email: email,
            role: role,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        closeUserModal();
        loadUsers();
    } catch (e) {
        alert("Error adding user: " + e.message);
    }
}

async function deleteUser(id) {
    if (!confirm("Remove this user access?")) return;
    try {
        await db.collection('users').doc(id).delete();
        loadUsers();
    } catch (e) {
        alert("Delete failed: " + e.message);
    }
}

