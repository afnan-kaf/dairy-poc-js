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

  updateUsernameDisplay();
  updateAvatarLink();
  updateNavPersonBg();
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

  // --- ADD TO CART ---
  const addBtn = e.target.closest('[data-product-id]');
  if (addBtn && !e.target.closest('#cart-wrapper')) {
    e.preventDefault();
    const id = addBtn.getAttribute('data-product-id');
    const name = addBtn.getAttribute('data-product-name');
    const basePrice = parseFloat(addBtn.getAttribute('data-product-price'));
    const dPriceAttr = addBtn.getAttribute('data-product-dprice');
    const minQty = parseInt(addBtn.getAttribute('data-product-min-quantity')) || 1;
    const price = (dPriceAttr && !isNaN(parseFloat(dPriceAttr))) ? parseFloat(dPriceAttr) : basePrice;

    // Grab image from sibling thumbnail wrapper
    let image = '';
    const productCard = addBtn.closest('[data-product-id]')?.parentElement || addBtn.parentElement;
    const thumbnailWrapper = productCard.querySelector('[product-thumbnail="wrapper"]');
    if (thumbnailWrapper) {
      const imgEl = thumbnailWrapper.querySelector('[product-thumbnail="image"]');
      if (imgEl) {
        image = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '';
      }
    }

    addToCart({ id, name, image, price, quantity: minQty });

    const cartWrapper = document.getElementById('cart-wrapper');
    if (cartWrapper) cartWrapper.style.visibility = 'visible';
    return;
  }

  // --- OPEN CART ---
  const openCartBtn = e.target.closest('#open-cart-btn');
  if (openCartBtn) {
    e.preventDefault();
    const cartWrapper = document.getElementById('cart-wrapper');
    if (cartWrapper) cartWrapper.style.visibility = 'visible';
    return;
  }

  // --- CLOSE CART MODAL ---
  const closeBtn = e.target.closest('#modal-close');
  if (closeBtn) {
    e.preventDefault();
    const cartWrapper = document.getElementById('cart-wrapper');
    if (cartWrapper) cartWrapper.style.visibility = 'hidden';
    return;
  }

  // --- QUANTITY INCREASE ---
  const increaseBtn = e.target.closest('[product-quantity-increase]');
  if (increaseBtn) {
    const itemId = increaseBtn.closest('[data-cart-item-id]')?.getAttribute('data-cart-item-id');
    if (itemId) {
      const item = cart.find(i => i.id === itemId);
      if (item) {
        item.quantity += 1;
        updateCartUI();
        saveCart();
      }
    }
    return;
  }

  // --- QUANTITY DECREASE ---
  const decreaseBtn = e.target.closest('[product-quantity-decrease]');
  if (decreaseBtn) {
    const itemId = decreaseBtn.closest('[data-cart-item-id]')?.getAttribute('data-cart-item-id');
    if (itemId) {
      const item = cart.find(i => i.id === itemId);
      if (item && item.quantity > 1) {
        item.quantity -= 1;
        updateCartUI();
        saveCart();
      }
    }
    return;
  }

  // --- REMOVE ITEM ---
  const removeBtn = e.target.closest('[cart-item-remove]');
  if (removeBtn) {
    const itemId = removeBtn.closest('[data-cart-item-id]')?.getAttribute('data-cart-item-id');
    if (itemId) {
      cart = cart.filter(i => i.id !== itemId);
      updateCartUI();
      saveCart();
    }
    return;
  }
});

// ==========================================
// 5. E-COMMERCE & CART FUNCTIONS
// ==========================================
const TAX_RATE = 0.00;
const SHIPPING_COST = 0.00;

function addToCart(product) {
  const existingItem = cart.find(item => item.id === product.id);
  if (existingItem) {
    existingItem.quantity += product.quantity;
  } else {
    cart.push(product);
  }
  updateCartUI();
  saveCart();
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

let cartItemTemplate = null;

function getCartTemplate() {
  if (cartItemTemplate) return cartItemTemplate;
  const template = document.getElementById('cart_item_wrap');
  if (!template) return null;
  cartItemTemplate = template.cloneNode(true);
  template.style.display = 'none';
  return cartItemTemplate;
}

function updateCartUI() {
  const template = getCartTemplate();
  const container = document.getElementById('cart_item_wrap')?.parentElement;
  const subtotalEl = document.getElementById('cart-subtotal-price');
  const totalEl = document.getElementById('cart-total-price');
  const cartCountEl = document.querySelector('.cart_item_count_number');

  if (!template || !container) return;

  container.querySelectorAll('[data-cart-item-id]').forEach(el => el.remove());

  let subtotal = 0;

  cart.forEach((item) => {
    const itemTotal = item.price * item.quantity;
    subtotal += itemTotal;

    const clone = template.cloneNode(true);
    clone.removeAttribute('id');
    clone.setAttribute('data-cart-item-id', item.id);
    clone.style.display = '';

    // Product Image
    const imgEl = clone.querySelector('[item="image"]');
    if (imgEl && item.image) {
      if (imgEl.tagName === 'IMG') {
        imgEl.src = item.image;
        imgEl.alt = item.name;
      } else {
        imgEl.style.backgroundImage = `url(${item.image})`;
      }
    }

    // Product Name
    const nameEl = clone.querySelector('[item="product-name"]');
    if (nameEl) nameEl.innerText = item.name;

    // Single Item Price
    const singlePriceEl = clone.querySelector('[product-price="single-item"]');
    if (singlePriceEl) singlePriceEl.innerText = `৳${item.price.toFixed(2)}`;

    // Quantity Input
    const qtyInput = clone.querySelector('input[product-quantity="min-one"]');
    if (qtyInput) {
      qtyInput.value = item.quantity;
      qtyInput.min = 1;
      qtyInput.addEventListener('change', () => {
        const newQty = parseInt(qtyInput.value);
        item.quantity = (!isNaN(newQty) && newQty >= 1) ? newQty : 1;
        if (isNaN(newQty) || newQty < 1) qtyInput.value = 1;
        updateCartUI();
        saveCart();
      });
    }

    // Item Total Price
    const itemTotalEl = clone.querySelector('[item-price="total"]');
    if (itemTotalEl) itemTotalEl.innerText = `৳${itemTotal.toFixed(2)}`;

    // Remove Button
    const removeBtn = clone.querySelector('[cart-item-remove]');
    if (removeBtn) removeBtn.setAttribute('cart-item-remove', item.id);

    // Increase/Decrease Buttons
    const increaseBtn = clone.querySelector('[product-quantity-increase]');
    if (increaseBtn) increaseBtn.setAttribute('product-quantity-increase', item.id);

    const decreaseBtn = clone.querySelector('[product-quantity-decrease]');
    if (decreaseBtn) decreaseBtn.setAttribute('product-quantity-decrease', item.id);

    container.appendChild(clone);
  });

  // Subtotal
  if (subtotalEl) subtotalEl.innerText = `৳${subtotal.toFixed(2)}`;

  // Total with tax and shipping
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax + SHIPPING_COST;
  if (totalEl) totalEl.innerText = `৳${total.toFixed(2)}`;

  // Cart count badge
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  if (cartCountEl) cartCountEl.innerText = totalItems;
}

window.removeFromCart = function(id) {
  cart = cart.filter(i => i.id !== id);
  updateCartUI();
  saveCart();
};

// ==========================================
// 6. UI PERSONALIZATION
// ==========================================
function updateUsernameDisplay() {
  const usernameEl = getByAttr('username', 'fname');
  if (!usernameEl) return;
  if (currentUser) {
    const fullName = currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
    usernameEl.innerText = fullName;
  } else {
    usernameEl.innerText = "Guest";
  }
}

function updateAvatarLink() {
  const avatarEl = getByAttr('avatar', 'login');
  if (!avatarEl) return;
  avatarEl.style.cursor = 'pointer';
  avatarEl.replaceWith(avatarEl.cloneNode(true));
  const freshAvatarEl = getByAttr('avatar', 'login');
  freshAvatarEl.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = currentUser ? '/dashboard' : '/login';
  });
}

function updateNavPersonBg() {
  document.querySelectorAll('.nav_person_bg').forEach(el => {
    el.style.color = currentUser
      ? 'var(--swatch--brand-500)'
      : 'var(--swatch--transparent)';
  });
}

// ==========================================
// INIT
// ==========================================
checkUser();
updateCartUI();
