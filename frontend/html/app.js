const API = "";

let currentUser = null;
let currentToken = sessionStorage.getItem("access_token");
let authMode = "login";

const $ = (id) => document.getElementById(id);

function setMessage(elementId, message, type = "") {
    const element = $(elementId);
    element.textContent = message;
    element.className = `message ${type}`;
}

async function apiRequest(path, options = {}) {
    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    if (currentToken) {
        headers.Authorization = `Bearer ${currentToken}`;
    }

    const response = await fetch(`${API}${path}`, {
        ...options,
        headers
    });

    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
        ? await response.json()
        : await response.text();

    if (!response.ok) {
        const message = typeof data === "object"
            ? data.detail || "Une erreur est survenue."
            : data || "Une erreur est survenue.";

        throw new Error(message);
    }

    return data;
}

function showSection(sectionId) {
    const sections = [
        "catalog-section",
        "auth-section",
        "orders-section",
        "admin-section"
    ];

    sections.forEach(id => $(id).classList.add("hidden"));
    $(sectionId).classList.remove("hidden");

    document.querySelectorAll(".nav-link").forEach(button => {
        button.classList.remove("active");
    });

    if (sectionId === "catalog-section") {
        $("catalog-nav").classList.add("active");
    } else if (sectionId === "orders-section") {
        $("orders-nav").classList.add("active");
    } else if (sectionId === "admin-section") {
        $("admin-nav").classList.add("active");
    }

    if (sectionId !== "auth-section") {
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
}

function updateNavigation() {
    const loggedIn = Boolean(currentToken && currentUser);

    $("login-nav").classList.toggle("hidden", loggedIn);
    $("logout-btn").classList.toggle("hidden", !loggedIn);
    $("user-info").classList.toggle("hidden", !loggedIn);
    $("orders-nav").classList.toggle("hidden", !loggedIn);

    $("admin-nav").classList.toggle(
        "hidden",
        !loggedIn || currentUser.role !== "admin"
    );

    if (loggedIn) {
        $("user-info").textContent = currentUser.full_name;
    }
}

function openLogin() {
    authMode = "login";
    $("auth-title").textContent = "Connexion";
    $("auth-description").textContent = "Connectez-vous à votre compte.";
    $("auth-submit").textContent = "Se connecter";
    $("auth-switch-text").textContent = "Vous n'avez pas de compte ?";
    $("auth-switch-btn").textContent = "Créer un compte";
    $("name-field").classList.add("hidden");
    $("password").setAttribute("autocomplete", "current-password");
    $("password").minLength = 1;
    $("auth-form").reset();
    setMessage("auth-message", "");
    showSection("auth-section");
}

function openRegister() {
    authMode = "register";
    $("auth-title").textContent = "Créer un compte";
    $("auth-description").textContent = "Rejoignez notre boutique en quelques instants.";
    $("auth-submit").textContent = "Créer mon compte";
    $("auth-switch-text").textContent = "Vous avez déjà un compte ?";
    $("auth-switch-btn").textContent = "Se connecter";
    $("name-field").classList.remove("hidden");
    $("password").setAttribute("autocomplete", "new-password");
    $("password").minLength = 8;
    $("auth-form").reset();
    setMessage("auth-message", "");
    showSection("auth-section");
}

async function loadProducts() {
    const container = $("products-list");
    container.replaceChildren();
    setMessage("catalog-message", "Chargement des produits...");

    try {
        const products = await apiRequest("/products");

        if (!products.length) {
            setMessage("catalog-message", "Aucun produit disponible pour le moment.");
            return;
        }

        setMessage("catalog-message", `${products.length} produit(s) disponible(s).`);

        products.forEach(product => {
            const card = document.createElement("article");
            card.className = "product-card";

            const icon = document.createElement("div");
            icon.className = "product-icon";
            icon.textContent = "▣";

            const name = document.createElement("h3");
            name.textContent = product.name;

            const description = document.createElement("p");
            description.className = "product-description";
            description.textContent = product.description || "Aucune description.";

            const price = document.createElement("div");
            price.className = "product-price";
            price.textContent = `${Number(product.price).toFixed(2)} TND`;

            const stock = document.createElement("p");
            stock.className = "product-stock";
            stock.textContent = `Stock : ${product.stock}`;

            const orderButton = document.createElement("button");
            orderButton.className = "btn btn-primary";
            orderButton.textContent = "Commander";
            orderButton.disabled = product.stock <= 0;

            orderButton.addEventListener("click", () => {
                placeOrder(product.id);
            });

            card.append(icon, name, description, price, stock, orderButton);
            container.appendChild(card);
        });
    } catch (error) {
        setMessage("catalog-message", error.message, "error");
    }
}

async function placeOrder(productId) {
    if (!currentToken) {
        openLogin();
        setMessage("auth-message", "Connectez-vous pour passer une commande.");
        return;
    }

    const quantityText = window.prompt("Quelle quantité souhaitez-vous commander ?", "1");

    if (quantityText === null) return;

    const quantity = Number(quantityText);

    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 1000) {
        window.alert("Veuillez saisir une quantité entière valide.");
        return;
    }

    try {
        const order = await apiRequest("/orders", {
            method: "POST",
            body: JSON.stringify({
                product_id: productId,
                quantity
            })
        });

        window.alert(`Commande #${order.id} créée avec succès !`);
        loadProducts();
    } catch (error) {
        window.alert(error.message);
    }
}

async function loadOrders() {
    const container = $("orders-list");
    container.replaceChildren();
    setMessage("orders-message", "Chargement des commandes...");

    try {
        const orders = await apiRequest("/orders");

        if (!orders.length) {
            setMessage("orders-message", "Vous n'avez pas encore de commande.");
            return;
        }

        setMessage("orders-message", `${orders.length} commande(s).`);

        orders.forEach(order => {
            const card = document.createElement("article");
            card.className = "order-card";

            const details = document.createElement("div");

            const title = document.createElement("h3");
            title.textContent = `Commande #${order.id}`;

            const description = document.createElement("p");
            description.textContent =
                `Produit #${order.product_id} · Quantité : ${order.quantity}`;

            const total = document.createElement("strong");
            total.textContent = `${Number(order.total_price).toFixed(2)} TND`;

            details.append(title, description, total);

            const status = document.createElement("span");
            status.className = "order-status";
            status.textContent = order.status;

            card.append(details, status);
            container.appendChild(card);
        });
    } catch (error) {
        setMessage("orders-message", error.message, "error");
    }
}

async function createProduct(event) {
    event.preventDefault();

    const product = {
        name: $("product-name").value.trim(),
        description: $("product-description").value.trim(),
        price: Number($("product-price").value),
        stock: Number($("product-stock").value)
    };

    try {
        await apiRequest("/products", {
            method: "POST",
            body: JSON.stringify(product)
        });

        $("product-form").reset();
        setMessage("admin-message", "Produit ajouté avec succès.", "success");
        loadProducts();
    } catch (error) {
        setMessage("admin-message", error.message, "error");
    }
}

async function handleAuthentication(event) {
    event.preventDefault();

    const email = $("email").value.trim();
    const password = $("password").value;

    try {
        if (authMode === "register") {
            const fullName = $("full-name").value.trim();

            await apiRequest("/users/register", {
                method: "POST",
                body: JSON.stringify({
                    full_name: fullName,
                    email,
                    password
                })
            });

            setMessage(
                "auth-message",
                "Compte créé ! Vous pouvez maintenant vous connecter.",
                "success"
            );

            openLogin();
            $("email").value = email;
            return;
        }

        const result = await apiRequest("/users/login", {
            method: "POST",
            body: JSON.stringify({ email, password })
        });

        currentToken = result.access_token;
        currentUser = result.user;

        sessionStorage.setItem("access_token", currentToken);
        sessionStorage.setItem("user", JSON.stringify(currentUser));

        updateNavigation();
        showSection("catalog-section");
        await loadProducts();
    } catch (error) {
        setMessage("auth-message", error.message, "error");
    }
}

function logout() {
    currentToken = null;
    currentUser = null;

    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("user");

    updateNavigation();
    showSection("catalog-section");
    loadProducts();
}

function restoreSession() {
    const savedUser = sessionStorage.getItem("user");

    if (!currentToken || !savedUser) {
        currentToken = null;
        sessionStorage.removeItem("access_token");
        sessionStorage.removeItem("user");
        return;
    }

    try {
        currentUser = JSON.parse(savedUser);

        if (
            !currentUser ||
            typeof currentUser.full_name !== "string" ||
            !["client", "admin"].includes(currentUser.role)
        ) {
            throw new Error("Session invalide");
        }
    } catch {
        currentToken = null;
        currentUser = null;
        sessionStorage.removeItem("access_token");
        sessionStorage.removeItem("user");
    }
}

$("catalog-nav").addEventListener("click", () => {
    showSection("catalog-section");
    loadProducts();
});

$("login-nav").addEventListener("click", openLogin);

$("orders-nav").addEventListener("click", () => {
    showSection("orders-section");
    loadOrders();
});

$("admin-nav").addEventListener("click", () => {
    if (currentUser?.role !== "admin") return;
    showSection("admin-section");
});

$("logout-btn").addEventListener("click", logout);

$("auth-form").addEventListener("submit", handleAuthentication);

$("auth-switch-btn").addEventListener("click", () => {
    if (authMode === "login") {
        openRegister();
    } else {
        openLogin();
    }
});

$("back-catalog").addEventListener("click", () => {
    showSection("catalog-section");
    loadProducts();
});

$("refresh-products").addEventListener("click", loadProducts);

$("refresh-orders").addEventListener("click", loadOrders);

$("product-form").addEventListener("submit", createProduct);

$("explore-btn").addEventListener("click", () => {
    $("catalog-section").scrollIntoView({ behavior: "smooth" });
});

restoreSession();
updateNavigation();
loadProducts();
