// ==========================================
// 1. SUPABASE INITIALIZATION (MODERN API)
// ==========================================
const supabaseUrl = 'https://gvlpmnekkxxorunlyarp.supabase.co';
const supabasePublishableKey = 'sb_publishable_ELOwH65FeZdryAuTolif5g_ftxO_Xrf'; 

const supabaseClient = window.supabase.createClient(supabaseUrl, supabasePublishableKey);

// Global State
let currentUser = null;
let cart = JSON.parse(localStorage.getItem('dairy_cart')) || [];

// ==========================================
// 2. AUTHENTICATION & GLOBAL CLICK LISTENER
// ==========================================
async function checkUser() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  currentUser = session ? session.user : null;
  console.log("Current User:", currentUser ? currentUser.email : "Guest");
  
  if (currentUser && cart.length > 0) {
    syncCartToDB();
  }
}

// We use one massive Event Listener to handle all clicks safely (Auth, Add to Cart, Open Cart)
document.addEventListener('click', async (e) => {
  
  // --- AUTHENTICATION SUBMIT INTERCEPT ---
  const authSubmitBtn = e.target.closest('#auth-submit');
  if (authSubmitBtn) {
    e.preventDefault(); 
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

    let { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    
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
      alert("Authentication successful!");
      window.location.reload(); 
    }
  }

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
// 3. CART DATA LOGIC
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

// ==========================================
// 4. CART UI RENDERING
// ==========================================
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
