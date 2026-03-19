// ==========================================
// 1. SUPABASE INITIALIZATION (MODERN API)
// ==========================================
const supabaseUrl = 'https://gvlpmnekkxxorunlyarp.supabase.co';
const supabasePublishableKey = 'sb_publishable_ELOwH65FeZdryAuTolif5g_ftxO_Xrf'; 

// FIX: Renamed to supabaseClient to prevent crashing!
const supabaseClient = window.supabase.createClient(supabaseUrl, supabasePublishableKey);

// Global State
let currentUser = null;
let cart = JSON.parse(localStorage.getItem('dairy_cart')) || [];

// ==========================================
// 2. AUTHENTICATION LOGIC (SIGNUP / LOGIN)
// ==========================================
async function checkUser() {
  // Updated to use supabaseClient
  const { data: { session } } = await supabaseClient.auth.getSession();
  currentUser = session ? session.user : null;
  console.log("Current User:", currentUser ? currentUser.email : "Guest");
  
  if (currentUser && cart.length > 0) {
    syncCartToDB();
  }
}

// Event Delegation to handle the button click safely
document.addEventListener('click', async (e) => {
  const authSubmitBtn = e.target.closest('#auth-submit');

  if (authSubmitBtn) {
    e.preventDefault(); // This stops the Webflow form from doing its default behavior
    console.log("Success: Intercepted the auth-submit click!");

    const emailInput = document.getElementById('auth-email');
    const passwordInput = document.getElementById('auth-password');
    const errorMsg = document.getElementById('auth-error-message');

    if (!emailInput || !passwordInput) {
      console.error("Could not find email or password inputs. Check their IDs.");
      return;
    }

    const email = emailInput.value;
    const password = passwordInput.value;

    // Updated to use supabaseClient
    let { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    
    // If user doesn't exist, we sign them up
    if (error && error.message.includes('Invalid login credentials')) {
      console.log("User not found, attempting sign up...");
      const signUpRes = await supabaseClient.auth.signUp({ email, password });
      data = signUpRes.data;
      error = signUpRes.error;
    }

    if (error) {
      console.error("Auth Error:", error.message);
      if (errorMsg) {
        errorMsg.innerText = error.message;
      } else {
        alert("Supabase Error: " + error.message); 
      }
    } else {
      console.log("Auth Success!", data.user.email);
      currentUser = data.user;
      
      await syncCartToDB();
      alert("Authentication successful! You are now signed up.");
      window.location.reload(); 
    }
  }
});

// ==========================================
// DB SYNC LOGIC (Updated to use supabaseClient)
// ==========================================
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

// ==========================================
// 3. CART LOGIC
// ==========================================

// Listen for "Add to Cart" clicks
document.addEventListener('click', (e) => {
  // Check if clicked element or its parent has our custom product ID
  const btn = e.target.closest('[data-product-id]');
  if (btn) {
    e.preventDefault();
    const id = btn.getAttribute('data-product-id');
    const name = btn.getAttribute('data-product-name');
    const basePrice = parseFloat(btn.getAttribute('data-product-price'));
    const dPriceAttr = btn.getAttribute('data-product-dprice');
    const minQty = parseInt(btn.getAttribute('data-product-min-quantity')) || 1;

    // Use discounted price if it exists and is valid, otherwise use base price
    const price = (dPriceAttr && !isNaN(parseFloat(dPriceAttr))) ? parseFloat(dPriceAttr) : basePrice;

    addToCart({ id, name, price, quantity: minQty });
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
  
  // Auto-open cart for better UX during testing
  document.getElementById('cart-wrapper').style.display = 'block';
}

function saveCart() {
  // 1. Always save to LocalStorage for guest persistence
  localStorage.setItem('dairy_cart', JSON.stringify(cart));
  
  // 2. If logged in, sync to Supabase
  if (currentUser) syncCartToDB();
}

async function syncCartToDB() {
  if (!currentUser) return;
  // PoC Hack: Delete old cart items for this user and insert new state to keep it simple
  await supabase.from('cart_items').delete().eq('user_id', currentUser.id);
  
  const dbCartItems = cart.map(item => ({
    user_id: currentUser.id,
    product_id: item.id,
    quantity: item.quantity,
    price: item.price
  }));
  
  const { error } = await supabase.from('cart_items').insert(dbCartItems);
  if (error) console.error("Error syncing cart to DB:", error.message);
}

// ==========================================
// 4. CART UI RENDERING
// ==========================================
const cartWrapper = document.getElementById('cart-wrapper');
const openCartBtn = document.getElementById('open-cart-btn');

if (openCartBtn && cartWrapper) {
  openCartBtn.addEventListener('click', (e) => {
    e.preventDefault();
    cartWrapper.style.display = cartWrapper.style.display === 'none' ? 'block' : 'none';
  });
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
    
    // Build standard divs to represent the cart item
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
  if (totalEl) totalEl.innerText = `₹${subtotal}`; // Add taxes/delivery here later
}

// Make remove function global so inline onclick works
window.removeFromCart = function(index) {
  cart.splice(index, 1);
  updateCartUI();
  saveCart();
};

// Initialize app
checkUser();
updateCartUI();
