const API = "";

let currentUser = null;
let currentToken = sessionStorage.getItem("access_token");
let authMode = "login";
let orderProduct = null;
let toastTimer = null;
const productNames = new Map();

const $ = (id) => document.getElementById(id);

const PRODUCT_COLORS = ["#1c58a6", "#1e7a4c", "#8a3b12", "#5b3e96", "#0f6e74", "#a1305e", "#3d4f6b"];

function productColor(name) {
    let hash = 0;
    for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return PRODUCT_COLORS[hash % PRODUCT_COLORS.length];
}

function slugify(text) {
    return text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function formatPrice(value) {
    return Number(value).toLocaleString("fr-TN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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
    document.querySelector(".hero").classList.toggle("hidden", sectionId !== "catalog-section");

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

    window.scrollTo({ top: 0, behavior: "smooth" });
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
    $("password-hint").classList.add("hidden");
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
    $("password-hint").classList.remove("hidden");
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
            setMessage("catalog-message", "");
            const empty = document.createElement("p");
            empty.className = "empty-state";
            empty.textContent = "Le catalogue est vide. Un administrateur peut ajouter des produits depuis l'onglet Administration.";
            container.appendChild(empty);
            return;
        }

        setMessage(
            "catalog-message",
            products.length === 1 ? "1 produit disponible." : `${products.length} produits disponibles.`
        );

        products.forEach(product => {
            productNames.set(product.id, product.name);

            const card = document.createElement("article");
            card.className = "product-card";

            const visual = document.createElement("div");
            visual.className = "product-visual";
            visual.style.setProperty("--c", productColor(product.name));
            const initial = document.createElement("span");
            initial.className = "product-initial";
            initial.textContent = product.name.trim().charAt(0).toUpperCase();

            const photo = document.createElement("img");
            photo.className = "product-photo";
            photo.alt = product.name;
            photo.loading = "lazy";
            photo.decoding = "async";
            photo.addEventListener("load", () => visual.classList.add("has-photo"));
            photo.addEventListener("error", () => photo.remove());
            photo.src = `/images/${slugify(product.name)}.jpg`;

            visual.append(initial, photo);

            const badge = document.createElement("span");
            badge.className = "stock-badge";
            if (product.stock <= 0) {
                badge.classList.add("out");
                badge.textContent = "Épuisé";
            } else if (product.stock <= 5) {
                badge.classList.add("low");
                badge.textContent = `Plus que ${product.stock}`;
            } else {
                badge.textContent = `En stock (${product.stock})`;
            }
            visual.appendChild(badge);

            const body = document.createElement("div");
            body.className = "product-body";

            const name = document.createElement("h3");
            name.textContent = product.name;

            const description = document.createElement("p");
            description.className = "product-description";
            description.textContent = product.description || "Aucune description.";

            const footer = document.createElement("div");
            footer.className = "product-footer";

            const price = document.createElement("div");
            price.className = "product-price";
            price.textContent = formatPrice(product.price);
            const currency = document.createElement("small");
            currency.textContent = "TND";
            price.appendChild(currency);

            const orderButton = document.createElement("button");
            orderButton.className = "btn btn-primary";
            orderButton.textContent = product.stock > 0 ? "Commander" : "Indisponible";
            orderButton.disabled = product.stock <= 0;

            orderButton.addEventListener("click", () => {
                placeOrder(product);
            });

            footer.append(price, orderButton);
            body.append(name, description, footer);
            card.append(visual, body);
            container.appendChild(card);
        });
    } catch (error) {
        setMessage("catalog-message", error.message, "error");
    }
}

function placeOrder(product) {
    if (!currentToken) {
        openLogin();
        setMessage("auth-message", "Connectez-vous pour passer une commande.");
        return;
    }

    orderProduct = product;
    const max = Math.min(product.stock, 1000);
    $("order-dialog-title").textContent = `Commander ${product.name}`;
    $("order-dialog-product").textContent =
        `${formatPrice(product.price)} TND l'unité, ${product.stock} en stock.`;
    $("order-quantity").value = 1;
    $("order-quantity").max = max;
    setMessage("order-message", "");
    updateOrderTotal();
    $("order-dialog").showModal();
}

function updateOrderTotal() {
    if (!orderProduct) return;
    const quantity = Number($("order-quantity").value) || 0;
    $("order-total").textContent = `${formatPrice(quantity * Number(orderProduct.price))} TND`;
}

function changeQuantity(delta) {
    const input = $("order-quantity");
    const max = Number(input.max) || 1000;
    const next = Math.min(Math.max((Number(input.value) || 1) + delta, 1), max);
    input.value = next;
    updateOrderTotal();
}

async function confirmOrder(event) {
    event.preventDefault();
    const quantity = Number($("order-quantity").value);
    const max = Number($("order-quantity").max) || 1000;

    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > max) {
        setMessage("order-message", `Choisissez une quantité entière entre 1 et ${max}.`, "error");
        return;
    }

    $("order-confirm").disabled = true;

    try {
        const order = await apiRequest("/orders", {
            method: "POST",
            body: JSON.stringify({
                product_id: orderProduct.id,
                quantity
            })
        });

        $("order-dialog").close();
        showToast(`Commande n° ${order.id} confirmée.`, "success");
        loadProducts();
    } catch (error) {
        setMessage("order-message", error.message, "error");
    } finally {
        $("order-confirm").disabled = false;
    }
}

function showToast(message, type = "") {
    const toast = $("toast");
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 4000);
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

        setMessage("orders-message", orders.length === 1 ? "1 commande." : `${orders.length} commandes.`);

        orders.forEach(order => {
            const card = document.createElement("article");
            card.className = "order-card";

            const details = document.createElement("div");

            const title = document.createElement("h3");
            title.textContent = `Commande n° ${order.id}`;

            const description = document.createElement("p");
            const productName = productNames.get(order.product_id) || `Produit n° ${order.product_id}`;
            description.textContent = `${productName}, quantité ${order.quantity}`;

            const total = document.createElement("strong");
            total.textContent = `${formatPrice(order.total_price)} TND`;

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
        setMessage("admin-message", "");
        showToast("Produit ajouté au catalogue.", "success");
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

$("order-form").addEventListener("submit", confirmOrder);
$("order-cancel").addEventListener("click", () => $("order-dialog").close());
$("qty-minus").addEventListener("click", () => changeQuantity(-1));
$("qty-plus").addEventListener("click", () => changeQuantity(1));
$("order-quantity").addEventListener("input", updateOrderTotal);

restoreSession();
updateNavigation();
loadProducts();
