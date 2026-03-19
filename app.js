// ==========================================
// 1. SUPABASE INITIALIZATION
// ==========================================
const supabaseUrl = 'https://gvlpmnekkxxorunlyarp.supabase.co';
const supabasePublishableKey = 'sb_publishable_ELOwH65FeZdryAuTolif5g_ftxO_Xrf'; 

const supabaseClient = window.supabase.createClient(supabaseUrl, supabasePublishableKey);

// Global State
let currentUser = null;
let cart = JSON.parse(localStorage.getItem('dairy_cart')) || [];

// ==========================================
// 2. SESSION & COOKIE MANAGEMENT
// ==========================================
// Sets a cookie that your Cloudflare Worker can read to protect /dashboard
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
    // If they clicked the verification email link, they arrive back on the site with a session.
    // We must set the cookie here so the Worker knows they are allowed in.
    setAuthCookie();
    
    if (cart.length > 0) {
      syncCartToDB();
    }
  } else {
    clearAuthCookie();
  }
}

// ==========================================
// 3. AUTHENTICATION (FORM SUBMITS)
// ==========================================
document.addEventListener('submit', async (e) => {
  
  // --- SIGN UP FLOW ---
  if (e.target.closest('#signup-form')) {
    e.preventDefault(); 
    const form = e.target;
    // We look inside the specific form for inputs of type email/password
    const email = form.querySelector('input[type="email"]').value;
    const password = form.querySelector('input[type="password"]').value;
    
    // Disable button to prevent double clicks
    const submitBtn = form.querySelector('input[type="submit"], button[type="submit"]');
    if(submitBtn) submitBtn.value = "Sending...";

    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    
    if (error) {
      console.error("Sign Up Error:", error.message);
      alert("Error: " + error.message);
      if(submitBtn) submitBtn.value = "Sign Up";
    } else {
      // With SMTP verification ON, they must check their email.
      alert("Success! Please check your email to verify your account before logging in.");
      form.reset();
      if(submitBtn) submitBtn.value = "Sign Up";
    }
  }

  // --- SIGN IN FLOW ---
  if (e.target.closest('#login-form')) {
    e.preventDefault();
    const form = e.target;
    const email = form.querySelector('input[type="email"]').value;
    const password = form.querySelector('input[type="password"]').value;
    
    const submitBtn = form.querySelector('input[type="submit"], button[type="submit"]');
    if(submitBtn) submitBtn.value = "Logging in...";

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    
    if (error) {
      console.error("Sign In Error:", error.message);
      alert("Error: " + error.message);
      if(submitBtn) submitBtn.value = "Log In";
    } else {
      currentUser = data.user;
      setAuthCookie(); // Tell Cloudflare Worker they are allowed in
      await syncCartToDB();
      window.location.href = '/dashboard'; // Redirect to protected route
    }
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
  if(cartWrapper) cartWrapper.style.display = 'block';
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
      <button onclick="removeFromCart(${index})" style="margin-left: 10px; color: red; background: none; border: none; cursor: pointer;">Remove</button>
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

// Initialize app
checkUser();
updateCartUI();
