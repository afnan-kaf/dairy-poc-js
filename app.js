// ==========================================
// 1. SUPABASE INITIALIZATION (MODERN API)
// ==========================================
const supabaseUrl = 'https://gvlpmnekkxxorunlyarp.supabase.co';
// Replace with your new key starting with sb_publishable_
const supabasePublishableKey = 'sb_publishable_ELOwH65FeZdryAuTolif5g_ftxO_Xrf'; 

const supabase = window.supabase.createClient(supabaseUrl, supabasePublishableKey);

// Global State
let currentUser = null;
let cart = JSON.parse(localStorage.getItem('dairy_cart')) || [];


// ==========================================
// 2. AUTHENTICATION LOGIC
// ==========================================
async function checkUser() {
  const { data: { session } } = await supabase.auth.getSession();
  currentUser = session ? session.user : null;
  console.log("Current User:", currentUser ? currentUser.email : "Guest");
  
  if (currentUser && cart.length > 0) {
    syncCartToDB();
  }
}

// Using Event Delegation to bypass DOM loading race conditions
document.addEventListener('click', async (e) => {
  // Check if what was clicked (or its parent) is the auth-submit button
  const authSubmitBtn = e.target.closest('#auth-submit');

  if (authSubmitBtn) {
    e.preventDefault(); // Stop the white blank page!
    console.log("Success: Intercepted the auth-submit click!");

    const emailInput = document.getElementById('auth-email');
    const passwordInput = document.getElementById('auth-password');
    const errorMsg = document.getElementById('auth-error-message');

    // Ensure inputs exist before trying to grab their values
    if (!emailInput || !passwordInput) {
      console.error("Could not find email or password inputs. Check their IDs.");
      return;
    }

    const email = emailInput.value;
    const password = passwordInput.value;

    let { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error && error.message.includes('Invalid login credentials')) {
      console.log("User not found, attempting sign up...");
      const signUpRes = await supabase.auth.signUp({ email, password });
      data = signUpRes.data;
      error = signUpRes.error;
    }

    if (error) {
      console.error("Auth Error:", error.message);
      if (errorMsg) errorMsg.innerText = error.message;
    } else {
      console.log("Auth Success!", data.user.email);
      currentUser = data.user;
      
      // Sync cart and REDIRECT (reload the page to show logged-in state)
      await syncCartToDB();
      alert("Authentication successful!");
      window.location.reload(); 
    }
  }
});

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
    cartWrapper.style.display = cartWrapper.style.display === 'none' ? 'flex' : 'none';
    cartWrapper.style.flexDirection = 'column';
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
