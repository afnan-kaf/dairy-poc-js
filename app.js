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
  const previousUser = currentUser;
  currentUser = session ? session.user : null;
  console.log("Current User:", currentUser ? currentUser.email : "Guest");

  if (currentUser) {
    setAuthCookie();
    if (!previousUser && cart.length > 0) {
      // Guest just logged in with items in cart — merge
      await mergeGuestCartToDB();
    } else if (cart.length === 0) {
      // Returning logged-in user with empty local cart — load from DB
      await loadCartFromDB();
    }
  } else {
    clearAuthCookie();
  }

  await updateUsernameDisplay();
  updateAvatarLink();
  updateNavPersonBg();
  updateCartUI();
}

// ==========================================
// 3. HELPER FUNCTIONS
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

function openCart() {
  const cartWrapper = document.getElementById('cart-wrapper');
  if (cartWrapper) {
    cartWrapper.style.display = 'flex';
    cartWrapper.style.flexDirection = 'column';
  }
}

function closeCart() {
  const cartWrapper = document.getElementById('cart-wrapper');
  if (cartWrapper) cartWrapper.style.display = 'none';
}

// ==========================================
// 4. AUTHENTICATION (FORM SUBMITS)
// ==========================================
document.addEventListener('submit', async (e) => {

  // --- SIGN UP ---
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

  // --- SIGN IN ---
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

      // Merge guest cart if any items exist
      if (cart.length > 0) {
        await mergeGuestCartToDB();
      } else {
        await loadCartFromDB();
      }

      setTimeout(() => {
        hideMessage(msgEl);
        window.location.href = '/dashboard';
      }, 1500);
    }
    return;
  }
});

// ==========================================
// 5. CLICK HANDLER
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
    openCart();
    return;
  }

  // --- OPEN CART ---
  const openCartBtn = e.target.closest('#open-cart-btn');
  if (openCartBtn) {
    e.preventDefault();
    openCart();
    return;
  }

  // --- CLOSE CART ---
  const closeBtn = e.target.closest('#modal-close');
  if (closeBtn) {
    e.preventDefault();
    closeCart();
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

  // --- REMOVE CART ITEM ---
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
// 6. CART FUNCTIONS
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
    name: item.name,
    image: item.image,
    quantity: item.quantity,
    price: item.price
  }));
  const { error } = await supabaseClient.from('cart_items').insert(dbCartItems);
  if (error) console.error("Error syncing cart:", error.message);
}

async function loadCartFromDB() {
  if (!currentUser) return;
  const { data, error } = await supabaseClient
    .from('cart_items')
    .select('*')
    .eq('user_id', currentUser.id);

  if (error) { console.error("Error loading cart:", error.message); return; }

  if (data && data.length > 0) {
    cart = data.map(row => ({
      id: row.product_id,
      name: row.name || '',
      image: row.image || '',
      price: row.price,
      quantity: row.quantity
    }));
    localStorage.setItem('dairy_cart', JSON.stringify(cart));
    updateCartUI();
    console.log("Cart loaded from DB:", cart.length, "items");
  }
}

async function mergeGuestCartToDB() {
  if (!currentUser) return;

  const { data: dbCart, error } = await supabaseClient
    .from('cart_items')
    .select('*')
    .eq('user_id', currentUser.id);

  if (error) { console.error("Error fetching DB cart:", error.message); return; }

  const mergedCart = [...cart];

  if (dbCart && dbCart.length > 0) {
    dbCart.forEach(dbItem => {
      const localItem = mergedCart.find(i => i.id === dbItem.product_id);
      if (localItem) {
        localItem.quantity += dbItem.quantity;
      } else {
        mergedCart.push({
          id: dbItem.product_id,
          name: dbItem.name || '',
          image: dbItem.image || '',
          price: dbItem.price,
          quantity: dbItem.quantity
        });
      }
    });
  }

  cart = mergedCart;
  localStorage.setItem('dairy_cart', JSON.stringify(cart));
  await syncCartToDB();
  updateCartUI();
  console.log("Cart merged:", cart.length, "items");
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
  // Show container only when cart has items
  if (container) {
    container.style.display = cart.length > 0 ? '' : 'none';
  }

  const subtotalEl = document.getElementById('cart-subtotal-price');
  const totalEl = document.getElementById('cart-total-price');
  const cartCountEl = document.querySelector('.cart_item_count_number');

  if (!template || !container) return;

  // Clear previously rendered items
  container.querySelectorAll('[data-cart-item-id]').forEach(el => el.remove());

  let subtotal = 0;

  cart.forEach((item) => {
    const itemTotal = item.price * item.quantity;
    subtotal += itemTotal;

    const clone = template.cloneNode(true);
    clone.removeAttribute('id');
    clone.setAttribute('data-cart-item-id', item.id);
    clone.style.display = '';

    // Image
    const imgEl = clone.querySelector('[item="image"]');
    if (imgEl && item.image) {
      if (imgEl.tagName === 'IMG') {
        imgEl.src = item.image;
        imgEl.alt = item.name;
      } else {
        imgEl.style.backgroundImage = `url(${item.image})`;
      }
    }

    // Name
    const nameEl = clone.querySelector('[item="product-name"]');
    if (nameEl) nameEl.innerText = item.name;

    // Single price
    const singlePriceEl = clone.querySelector('[product-price="single-item"]');
    if (singlePriceEl) singlePriceEl.innerText = `৳${item.price.toFixed(2)}`;

    // Quantity input
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

    // Item total
    const itemTotalEl = clone.querySelector('[item-price="total"]');
    if (itemTotalEl) itemTotalEl.innerText = `৳${itemTotal.toFixed(2)}`;

    // Buttons
    const rmBtn = clone.querySelector('[cart-item-remove]');
    if (rmBtn) rmBtn.setAttribute('cart-item-remove', item.id);

    const incBtn = clone.querySelector('[product-quantity-increase]');
    if (incBtn) incBtn.setAttribute('product-quantity-increase', item.id);

    const decBtn = clone.querySelector('[product-quantity-decrease]');
    if (decBtn) decBtn.setAttribute('product-quantity-decrease', item.id);

    container.appendChild(clone);
  });

  // Subtotal
  if (subtotalEl) subtotalEl.innerText = `৳${subtotal.toFixed(2)}`;

  // Total
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax + SHIPPING_COST;
  if (totalEl) totalEl.innerText = `৳${total.toFixed(2)}`;


  // Cart badge count
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  if (cartCountEl) cartCountEl.innerText = totalItems;

  // cart-item-count text element
  const cartItemCountEl = document.getElementById('cart-item-count');
  if (cartItemCountEl) cartItemCountEl.innerText = totalItems;

}

window.removeFromCart = function(id) {
  cart = cart.filter(i => i.id !== id);
  updateCartUI();
  saveCart();
};

// ==========================================
// 7. UI PERSONALIZATION
// ==========================================

// PROFILE FUNCTIONS
async function getUserProfile() {
  if (!currentUser) return null;
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  if (error) { console.error("Error fetching profile:", error.message); return null; }
  return data;
}

async function updateUsernameDisplay() {
  const usernameEl = getByAttr('username', 'fname');
  if (!usernameEl) return;

  if (currentUser) {
    // First try getting name from profiles table (most accurate)
    const profile = await getUserProfile();
    const fullName = profile?.full_name
      || currentUser.user_metadata?.full_name
      || currentUser.email.split('@')[0];
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
