// ==========================================
// 1. SUPABASE INITIALIZATION
// ==========================================
const supabaseUrl = 'https://gvlpmnekkxxorunlyarp.supabase.co';
const supabasePublishableKey = 'sb_publishable_ELOwH65FeZdryAuTolif5g_ftxO_Xrf';

const supabaseClient = window.supabase.createClient(supabaseUrl, supabasePublishableKey);

let currentUser = null;
let cart = JSON.parse(localStorage.getItem('dairy_cart')) || [];

// ==========================================
// 2. SESSION & COOKIE MANAGEMENT
// ==========================================
function setAuthCookie() {
  document.cookie = "sb-session=1; path=/; max-age=31536000; Secure; SameSite=Lax";
}

function clearAuthCookie() {
  document.cookie = "sb-session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
}

async function checkUser() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  currentUser = session ? session.user : null;
  console.log("Current User:", currentUser ? currentUser.email : "Guest");

  if (currentUser) {
    setAuthCookie();
    if (cart.length > 0) syncCartToDB();
  } else {
    clearAuthCookie();
  }
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================
function getByAttr(attr, value) {
  return document.querySelector(`[${attr}="${value}"]`);
}

function showMessage(msgEl, text) {
  if (!msgEl) return;
  msgEl.innerText = text;
  msgEl.style.visibility = 'visible';
}

function hideMessage(msgEl) {
  if (!msgEl) return;
  msgEl.style.visibility = 'hidden';
  msgEl.innerText = '';
}

// ==========================================
// 3. AUTHENTICATION (FORM SUBMITS)
// ==========================================
document.addEventListener('submit', async (e) => {

  // --- SIGN UP FLOW ---
  if (e.target.closest('#signup-form')) {
    e.preventDefault();
    const form = e.target;

    const fullName = form.querySelector('input[name="Full Name"]').value;
    const email = form.querySelector('input[type="email"]').value;
    const password = form.querySelector('input[type="password"]').value;

    const btnTextEl = getByAttr('btn-attribute', 'signup');
    const msgEl = getByAttr('message', 'signup');
    const originalBtnText = btnTextEl ? btnTextEl.innerText : '';

    hideMessage(msgEl);

    if (!fullName || !email || !password) {
      showMessage(msgEl, "Please fill in all fields.");
      return;
    }

    if (btnTextEl) btnTextEl.innerText = "Creating...";

    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: 'https://dairy-poc-proxy.afnandeyekaf.workers.dev/login'
      }
    });

    if (error) {
      if (btnTextEl) btnTextEl.innerText = originalBtnText;
      showMessage(msgEl, "Error: " + error.message);
    } else {
      if (btnTextEl) btnTextEl.innerText = originalBtnText;
      form.reset();
      showMessage(msgEl, "✅ Success! Please check your email to verify your account.");
      // Hide message just before redirect
      setTimeout(() => {
        hideMessage(msgEl);
        window.location.href = '/login';
      }, 3000);
    }
    return;
  }

  // --- SIGN IN FLOW ---
  if (e.target.closest('#login-form')) {
    e.preventDefault();
    const form = e.target;

    const email = form.querySelector('input[type="email"]').value;
    const password = form.querySelector('input[type="password"]').value;

    const btnTextEl = getByAttr('btn-attribute', 'login');
    const msgEl = getByAttr('message', 'login');
    const originalBtnText = btnTextEl ? btnTextEl.innerText : '';

    hideMessage(msgEl);

    if (btnTextEl) btnTextEl.innerText = "Logging in...";

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
      if (btnTextEl) btnTextEl.innerText = originalBtnText;
      showMessage(msgEl, "Error: " + error.message);
    } else {
      if (btnTextEl) btnTextEl.innerText = originalBtnText;
      showMessage(msgEl, "✅ Login successful! Redirecting...");
      currentUser = data.user;
      setAuthCookie();
      await syncCartToDB();
      setTimeout(() => {
        hideMessage(msgEl);
        window.location.href = '/dashboard';
      }, 1500);
    }
    return;
  }
});

// ==========================================
// 4. E-COMMERCE & CART LOGIC (CLICKS)
// ==========================================
document.addEventListener('click', async (e) => {

  // --- ADD TO CART INTERCEPT ---
  const addBtn = e.target.closest('[data-product-id]');
  if (addBtn && !e.target.closest('#cart-wrapper')) {
    e.preventDefault();
    const id = addBtn.getAttribute('data-product-id');
    const name = addBtn.getAttribute('data-product-name');
    const basePrice = parseFloat(addBtn.getAttribute('data-product-price'));
    const dPriceAttr = addBtn.getAttribute('data-product-dprice');
    const minQty = parseInt(addBtn.getAttribute('data-product-min-quantity')) || 1;
    const price = (dPriceAttr && !isNaN(parseFloat(dPriceAttr))) ? parseFloat(dPriceAttr) : basePrice;
    addToCart({ id, name, price, quantity: minQty });
  }

  // --- OPEN CART INTERCEPT ---
  const openCartBtn = e.target.closest('#open-cart-btn');
  if (openCartBtn) {
    e.preventDefault();
    const cartWrapper = document.getElementById('cart-wrapper');
    if (cartWrapper) {
      cartWrapper.style.display = cartWrapper.style.display === 'none' ? 'block' : 'none';
    }
  }
});

// ==========================================
// 5. E-COMMERCE & CART FUNCTIONS
// ==========================================
function addToCart(product) {
  const existingItem = cart.find(item => item.id === product.id);
  if (existingItem) {
    existingItem.quantity += product.quantity;
  } else {
    cart.push(product);
  }
  updateCartUI();
  saveCart();
  const cartWrapper = document.getElementById('cart-wrapper');
  if (cartWrapper) cartWrapper.style.display = 'block';
}

function saveCart() {
  localStorage.setItem('dairy_cart', JSON.stringify(cart));
  if (currentUser) syncCartToDB();
}

async function syncCartToDB() {
  if (!currentUser) return;
  await supabaseClient.from('cart_items').delete().eq('user_id', currentUser.id);
  const dbCartItems = cart.map(item => ({
    user_id: currentUser.id,
    product_id: item.id,
    quantity: item.quantity,
    price: item.price
  }));
  const { error } = await supabaseClient.from('cart_items').insert(dbCartItems);
  if (error) console.error("Error syncing cart to DB:", error.message);
}

function updateCartUI() {
  const container = document.getElementById('cart-items-container');
  const subtotalEl = document.getElementById('cart-subtotal-price');
  const totalEl = document.getElementById('cart-total-price');

  if (!container) return;
  container.innerHTML = '';
  let subtotal = 0;

  cart.forEach((item, index) => {
    subtotal += (item.price * item.quantity);
    const itemDiv = document.createElement('div');
    itemDiv.style.borderBottom = "1px solid #ccc";
    itemDiv.style.paddingBottom = "10px";
    itemDiv.style.marginBottom = "10px";
    itemDiv.innerHTML = `
      <strong>${item.name}</strong><br/>
      ₹${item.price} x ${item.quantity}
      <button onclick="removeFromCart(${index})" style="margin-left:10px;color:red;background:none;border:none;cursor:pointer;">Remove</button>
    `;
    container.appendChild(itemDiv);
  });

  if (subtotalEl) subtotalEl.innerText = `₹${subtotal}`;
  if (totalEl) totalEl.innerText = `₹${subtotal}`;
}

window.removeFromCart = function(index) {
  cart.splice(index, 1);
  updateCartUI();
  saveCart();
};

// ==========================================
// INIT
// ==========================================
checkUser();
updateCartUI();
