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

// Initialize
checkUser();
