

// ======================================================
// MSA ADMIN SECURE API
// ======================================================

const MSA_ADMIN_SECURE_FETCH = true;

(function() {

    const originalFetch =
        window.fetch.bind(window);

    window.fetch = function(
        input,
        options
    ) {

        options = options || {};

        let url = "";

        if (typeof input === "string") {
            url = input;
        } else if (input && input.url) {
            url = input.url;
        }

        if (
            url.indexOf("/api/admin/login") === -1
        ) {

            const token =
                localStorage.getItem(
                    "MSA_ADMIN_TOKEN"
                );

            if (token) {

                const headers =
                    new Headers(
                        options.headers || {}
                    );

                headers.set(
                    "Authorization",
                    "Bearer " + token
                );

                options.headers = headers;
            }
        }

        return originalFetch(
            input,
            options
        ).then(function(response) {

            if (
                response.status === 401
                &&
                url.indexOf(
                    "/api/admin/login"
                ) === -1
            ) {

                localStorage.removeItem(
                    "MSA_ADMIN_TOKEN"
                );

                alert(
                    "Administrator session expired. Please log in again."
                );

                window.location.reload();
            }

            return response;
        });
    };

})();

const API = "/api";

// ======================================================
// ======================================================
// ADMINISTRATOR NAME SEARCH
// ======================================================

let MSA_ADMIN_LOGIN_USERS = [];

function msaEscapeAdminSearch(value) {

    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function msaHighlightAdminMatch(text, query) {

    const value = String(text || "");
    const search = String(query || "").trim();

    if (!search) {
        return msaEscapeAdminSearch(value);
    }

    const escaped =
        search.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );

    const regex =
        new RegExp("(" + escaped + ")", "gi");

    let output = "";
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(value)) !== null) {

        output += msaEscapeAdminSearch(
            value.slice(lastIndex, match.index)
        );

        output +=
            '<span class="msa-admin-search-highlight">' +
            msaEscapeAdminSearch(match[0]) +
            "</span>";

        lastIndex =
            match.index + match[0].length;
    }

    output += msaEscapeAdminSearch(
        value.slice(lastIndex)
    );

    return output;
}

async function msaLoadAdminLoginUsers() {

    try {

        const response =
            await fetch("/api/admin/login-users");

        const data =
            await response.json();

        if (!response.ok || !data.ok) {
            return;
        }

        MSA_ADMIN_LOGIN_USERS =
            Array.isArray(data.users)
                ? data.users
                : [];

    } catch (error) {

        console.error(
            "ADMIN NAME SEARCH ERROR:",
            error
        );
    }
}

function msaShowAdminSuggestions(value) {
    const input = document.getElementById("adminUsername");
    const box = document.getElementById("adminUsernameSuggestions");

    if (!input || !box) return;

    const search = String(value || "").trim().toLowerCase();

    if (!search) {
        box.innerHTML = "";
        box.classList.remove("msa-admin-search-results-visible");
        box.setAttribute("aria-hidden", "true");
        return;
    }

    const matches = (Array.isArray(MSA_ADMIN_LOGIN_USERS) ? MSA_ADMIN_LOGIN_USERS : [])
        .filter(function(admin) {
            const username = String(admin.username || "").toLowerCase();
            const name = String(admin.display_name || "").toLowerCase();
            return username.includes(search) || name.includes(search);
        });

    if (matches.length) {
        box.innerHTML = `
            <div class="msa-admin-search-empty">
                ✓ Administrator found
            </div>
        `;
    } else {
        box.innerHTML = `
            <div class="msa-admin-search-empty">
                No matching administrator found
            </div>
        `;
    }

    box.classList.add("msa-admin-search-results-visible");
    box.setAttribute("aria-hidden", "false");
}

function startAdminUsernameSearch() {

    const input =
        document.getElementById(
            "adminUsername"
        );

    if (!input) {
        return;
    }

    input.addEventListener(
        "input",
        function() {

            msaShowAdminSuggestions(
                input.value
            );
        }
    );

    input.addEventListener(
        "focus",
        function() {

            if (input.value.trim()) {

                msaShowAdminSuggestions(
                    input.value
                );
            }
        }
    );

    document.addEventListener(
        "click",
        function(event) {

            const box =
                document.getElementById(
                    "adminUsernameSuggestions"
                );

            if (!box) {
                return;
            }

            if (
                event.target !== input &&
                !box.contains(event.target)
            ) {

                box.classList.remove(
                    "msa-admin-search-results-visible"
                );

                box.setAttribute(
                    "aria-hidden",
                    "true"
                );
            }
        }
    );

    msaLoadAdminLoginUsers();
}

document.addEventListener(
    "DOMContentLoaded",
    startAdminUsernameSearch
);

let students = [];
let results = JSON.parse(localStorage.getItem("msa_results") || "[]");



// ======================================================
// ADMIN LOGIN WELCOME SCREEN
// ======================================================

function showAdminWelcome(admin, afterWelcome) {

    const adminData = admin || {};

    const cleanName =
        String(
            adminData.display_name ||
            adminData.username ||
            "Administrator"
        ).trim() || "Administrator";

    const welcomeKey =
        "MSA_PORTAL_ADMIN_WELCOME_SEEN_" +
        String(
            adminData.id ||
            adminData.username ||
            cleanName
        ).toUpperCase();

    let returningAdmin = false;

    try {

        returningAdmin =
            localStorage.getItem(welcomeKey) === "1";

        localStorage.setItem(
            welcomeKey,
            "1"
        );

    } catch (error) {

        console.warn(
            "MSA: Admin welcome state unavailable.",
            error
        );
    }

    const heading =
        returningAdmin
            ? "WELCOME BACK"
            : "WELCOME TO MSA PORTAL";

    const overlay =
        document.createElement("div");

    overlay.className =
        "msa-admin-welcome-overlay";

    const safeName =
        cleanName
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

    overlay.innerHTML = `
        <div class="msa-admin-welcome-glow"></div>

        <div class="msa-admin-welcome-card">

            <div class="msa-admin-welcome-logo-wrap">

                <img
                    src="/assets/mwashita_logo.jpg"
                    class="msa-admin-welcome-logo"
                    alt="MSA PORTAL"
                >

            </div>

            <div class="msa-admin-welcome-line"></div>

            <div class="msa-admin-welcome-heading">
                ${heading}
            </div>

            <div class="msa-admin-welcome-name">
                ${safeName}
            </div>

            <div class="msa-admin-welcome-status">
                SIGNING YOU IN...
            </div>

            <div class="msa-admin-welcome-loader">
                <span></span>
            </div>

        </div>
    `;

    document.body.appendChild(overlay);

    window.setTimeout(function() {

        overlay.classList.add(
            "msa-admin-welcome-overlay-hide"
        );

        window.setTimeout(function() {

            if (overlay.parentNode) {
                overlay.parentNode.removeChild(
                    overlay
                );
            }

            if (typeof afterWelcome === "function") {
                afterWelcome();
            }

        }, 350);

    }, 1800);
}

// ======================================================
// ADMIN LOGIN
// ======================================================

async function login() {
    const username =
        document.getElementById("adminUsername");

    const password =
        document.getElementById("adminPassword");

    const message =
        document.getElementById("loginMessage");

    if (!username || !password) {
        alert("Login form is not available.");
        return;
    }

    const user = username.value.trim();
    const pass = password.value.trim();

    if (!user || !pass) {
        if (message) {
            message.textContent =
                "Enter username and password.";
        }
        return;
    }

    try {

        const response = await fetch(
            "/api/admin/login",
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    username: user,
                    password: pass
                })
            }
        );

        const data = await response.json();

        if (!response.ok || !data.ok) {

            if (message) {
                message.textContent =
                    data.message ||
                    "Incorrect username or password.";
                message.style.color =
                    "#f59e0b";
            }

            password.value = "";
            return;
        }

        localStorage.setItem(
            "MSA_ADMIN_TOKEN",
            data.token
        );

        /* Keep the logged-in administrator role for dashboard permissions. */
        if (data.admin) {
            localStorage.setItem(
                "MSA_ADMIN_USER",
                JSON.stringify(data.admin)
            );
        }

        if (message) {
            message.textContent =
                "Login successful.";
            message.style.color =
                "#f5d477";
        }

        const loggedInAdmin =
            data.admin ||
            JSON.parse(
                localStorage.getItem("MSA_ADMIN_USER") || "null"
            );

        if (loggedInAdmin && loggedInAdmin.role === "main_admin") {
            showMainAdminDashboard();
        } else {
            showAdminDashboard();
        }

    } catch (error) {

        console.error(
            "ADMIN LOGIN ERROR:",
            error
        );

        if (message) {
            message.textContent =
                "Unable to connect to server.";
        }
    }
}


// ======================================================
// DASHBOARD
// ======================================================

function showDashboard() {

    let adminUser = null;

    try {
        adminUser = JSON.parse(
            localStorage.getItem("MSA_ADMIN_USER") || "null"
        );
    } catch (error) {
        console.error("ADMIN USER DATA ERROR:", error);
    }

    /*
     * ONE LOGIN AREA
     *
     * Main Administrator:
     *     role = main_admin
     *
     * Admin 1-5:
     *     role = admin
     *
     * The server already identifies the administrator.
     */
    if (
        adminUser &&
        adminUser.role === "main_admin"
    ) {
        showMainAdminDashboard();
        return;
    }

    showAdminDashboard();
}



async function refreshCurrentAdminProfile() {
    const token =
        localStorage.getItem("MSA_ADMIN_TOKEN");

    if (!token) {
        return null;
    }

    try {
        const response = await fetch(
            "/api/admin/current",
            {
                method: "GET",
                headers: {
                    "Authorization":
                        "Bearer " + token
                }
            }
        );

        const data = await response.json();

        if (!response.ok || !data.ok) {

            console.error(
                "CURRENT ADMIN PROFILE ERROR:",
                data.message || "Unable to refresh administrator."
            );

            if (
                response.status === 401 ||
                response.status === 403
            ) {
                localStorage.removeItem(
                    "MSA_ADMIN_TOKEN"
                );

                localStorage.removeItem(
                    "MSA_ADMIN_USER"
                );

                alert(
                    data.message ||
                    "Your administrator access is no longer available."
                );

                location.reload();
            }

            return null;
        }

        if (data.admin) {
            localStorage.setItem(
                "MSA_ADMIN_USER",
                JSON.stringify(data.admin)
            );
        }

        return data.admin || null;

    } catch (error) {

        console.error(
            "CURRENT ADMIN PROFILE REFRESH ERROR:",
            error
        );

        return null;
    }
}


function startAdminProfileRefresh() {

    if (window.MSA_ADMIN_PROFILE_REFRESH_TIMER) {
        clearInterval(
            window.MSA_ADMIN_PROFILE_REFRESH_TIMER
        );
    }

    window.MSA_ADMIN_PROFILE_REFRESH_TIMER =
        setInterval(async () => {

            const admin =
                await refreshCurrentAdminProfile();

            if (!admin) {
                return;
            }

            const welcome =
                document.getElementById(
                    "adminWelcomeName"
                );

            if (welcome) {
                welcome.textContent =
                    admin.display_name ||
                    "Administrator";
            }

        }, 5000);
}




function showAdminDashboard() {
    renderAdminDashboard();
}

function showMainAdminDashboard() {
    renderMainAdminDashboard();
}


function renderAdminDashboard() {

    let adminUser = null;

    try {
        adminUser = JSON.parse(
            localStorage.getItem("MSA_ADMIN_USER") || "null"
        );
    } catch (error) {
        console.error("ADMIN USER DATA ERROR:", error);
    }

    document.body.innerHTML = `
        <div style="
            min-height:100vh;
            background:#07111f;
            color:white;
            font-family:Arial,sans-serif;
        ">

            <header style="
                padding:20px;
                background:#0d1b2e;
                border-bottom:1px solid #203553;
                display:flex;
                justify-content:space-between;
                align-items:center;
                gap:15px;
                flex-wrap:wrap;
            ">
                <div>
                    <h1 style="margin:0;">MSA PORTAL</h1>
                    <p style="margin:5px 0;color:#91a4bd;">
                        Administrator Dashboard
                    </p>
                </div>

                <button onclick="logout()" style="
                    background:#07111f;
                    color:white;
                    border:0;
                    padding:12px 18px;
                    border-radius:9px;
                    font-weight:bold;
                ">
                    LOGOUT
                </button>
            </header>

            <main style="
                max-width:1100px;
                margin:auto;
                padding:20px;
            ">

                <div style="
                    background:#0d1b2e;
                    border:1px solid #203553;
                    border-radius:16px;
                    padding:18px;
                    margin-bottom:25px;
                ">
                    <h2 style="margin:0 0 6px;">
                        Administrator Dashboard
                    </h2>

                    <p style="
                        margin:0;
                        color:#91a4bd;
                    ">
                        Welcome,
                        <span id="adminWelcomeName">
                            ${escapeHtml(
                                adminUser?.display_name || "Administrator"
                            )}
                        </span>
                    </p>
                </div>

                <div style="
                    display:grid;
                    grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
                    gap:15px;
                    margin-bottom:25px;
                ">

                    <div class="stat-card">
                        <strong id="studentCount">0</strong>
                        <span>Students</span>
                    </div>

                    <div class="stat-card">
                        <strong id="resultCount">0</strong>
                        <span>Results</span>
                    </div>

                    <div class="stat-card">
                        <strong id="publishedCount">0</strong>
                        <span>Published</span>
                    </div>

                    <div class="stat-card">
                        <strong id="missingCount">0</strong>
                        <span>Missing</span>
                    </div>

                </div>

                <h2>Administration Menu</h2>

                <div class="dashboard-menu-grid">

                    <button
                        type="button"
                        class="dashboard-menu-card"
                        onclick="showStudentManagementScreen()">
                        <span class="dashboard-menu-icon">👨‍🎓</span>
                        <strong>Student Management</strong>
                        <small>Add, view and manage students</small>
                    </button>

                    <button
                        type="button"
                        class="dashboard-menu-card"
                        onclick="showPasswordResetScreen()">
                        <span class="dashboard-menu-icon">🔐</span>
                        <strong>Password / PIN Reset</strong>
                        <small>Manage password and PIN requests</small>
                    </button>

                    <button
                        type="button"
                        class="dashboard-menu-card"
                        onclick="showResultsManagementScreen()">
                        <span class="dashboard-menu-icon">📄</span>
                        <strong>Results Management</strong>
                        <small>Upload, check and publish results</small>
                    </button>

                    <button
                        type="button"
                        class="dashboard-menu-card"
                        onclick="showAcademicManagementScreen()">
                        <span class="dashboard-menu-icon">📅</span>
                        <strong>Academic Management</strong>
                        <small>Manage academic years</small>
                    </button>

                <button type="button" class="dashboard-menu-card"
                    onclick="showStudentRegistrationManagementScreen()">
                    <span class="dashboard-menu-icon">📝</span>
                    <strong>Student Registration Management</strong>
                    <small>Review and approve student registrations</small>
                </button>

                    <button type="button" class="dashboard-menu-card"
                        onclick="showAnnualPromotionScreen()">
                        <span class="dashboard-menu-icon">🎓</span>
                        <strong>Annual Form Promotion</strong>
                        <small>View yearly promotion settings and history</small>
                    </button>



                </div>

                <div id="adminContent"></div>
                    <footer class="msa-copyright">
                        ©️ <strong>Mwashita Academy</strong> — All Rights Reserved
                    </footer>

            </main>
        </div>
    `;

    addDashboardStyles();
    /*
     * Keep this administrator account synchronized
     * with the server.
     */
    refreshCurrentAdminProfile().then((admin) => {

        if (!admin) {
            return;
        }

        const welcome =
            document.getElementById(
                "adminWelcomeName"
            );

        if (welcome) {
            welcome.textContent =
                admin.display_name ||
                "Administrator";
        }

    });

    startAdminProfileRefresh();


    loadStudents();
    loadStats();
}


function renderMainAdminDashboard() {

    document.body.innerHTML = `
        <div style="
            min-height:100vh;
            background:#07111f;
            color:white;
            font-family:Arial,sans-serif;
        ">

            <header style="
                padding:20px;
                background:#0d1b2e;
                border-bottom:1px solid #203553;
                display:flex;
                justify-content:space-between;
                align-items:center;
                gap:15px;
                flex-wrap:wrap;
            ">
                <div>
                    <h1 style="margin:0;">MSA PORTAL</h1>
                    <p style="margin:5px 0;color:#91a4bd;">
                        Main Administrator Dashboard
                    </p>
                </div>

                <button onclick="logout()" style="
                    background:#07111f;
                    color:white;
                    border:0;
                    padding:12px 18px;
                    border-radius:9px;
                    font-weight:bold;
                ">
                    LOGOUT
                </button>
            </header>

            <main style="
                max-width:1100px;
                margin:auto;
                padding:20px;
            ">

                <div style="
                    background:#0d1b2e;
                    border:1px solid #203553;
                    border-radius:16px;
                    padding:18px;
                    margin-bottom:25px;
                ">
                    <h2 style="margin:0 0 6px;">
                        Main Administrator Dashboard
                    </h2>

                    <p style="
                        margin:0;
                        color:#91a4bd;
                    ">
                        Full system administration
                    </p>
                </div>

                <div style="
                    display:grid;
                    grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
                    gap:15px;
                    margin-bottom:25px;
                ">

                    <div class="stat-card">
                        <strong id="studentCount">0</strong>
                        <span>Students</span>
                    </div>

                    <div class="stat-card">
                        <strong id="resultCount">0</strong>
                        <span>Results</span>
                    </div>

                    <div class="stat-card">
                        <strong id="publishedCount">0</strong>
                        <span>Published</span>
                    </div>

                    <div class="stat-card">
                        <strong id="missingCount">0</strong>
                        <span>Missing</span>
                    </div>

                </div>

                <h2>Administration Menu</h2>

                <div class="dashboard-menu-grid">

                    <button
                        type="button"
                        class="dashboard-menu-card"
                        onclick="showStudentManagementScreen()">
                        <span class="dashboard-menu-icon">👨‍🎓</span>
                        <strong>Student Management</strong>
                        <small>Add, view and manage students</small>
                    </button>

                    <button
                        type="button"
                        class="dashboard-menu-card"
                        onclick="showPasswordResetScreen()">
                        <span class="dashboard-menu-icon">🔐</span>
                        <strong>Password / PIN Reset</strong>
                        <small>Manage password and PIN requests</small>
                    </button>

                    <button
                        type="button"
                        class="dashboard-menu-card"
                        onclick="showResultsManagementScreen()">
                        <span class="dashboard-menu-icon">📄</span>
                        <strong>Results Management</strong>
                        <small>Upload, check and publish results</small>
                    </button>

                    <button
                        type="button"
                        class="dashboard-menu-card"
                        onclick="showAcademicManagementScreen()">
                        <span class="dashboard-menu-icon">📅</span>
                        <strong>Academic Management</strong>
                        <small>Manage academic years</small>
                    </button>

                <button type="button" class="dashboard-menu-card"
                    onclick="showStudentRegistrationManagementScreen()">
                    <span class="dashboard-menu-icon">📝</span>
                    <strong>Student Registration Management</strong>
                    <small>Review and approve student registrations</small>
                </button>

                    <button type="button" class="dashboard-menu-card"
                        onclick="showAnnualPromotionScreen()">
                        <span class="dashboard-menu-icon">🎓</span>
                        <strong>Annual Form Promotion</strong>
                        <small>View yearly promotion settings and history</small>
                    </button>



                </div>

                <div id="mainAdminMenu">
                    <h2>Main Administrator</h2>

                    <button
                        type="button"
                        class="dashboard-menu-card"
                        onclick="showMainAdminPanel()"
                    >
                        <span class="dashboard-menu-icon">👑</span>
                        <strong>Main Administrator</strong>
                        <small>Manage administrator accounts</small>
                    </button>
                </div>

                <div id="adminContent"></div>

            </main>
        </div>
    `;

    addDashboardStyles();

    loadStudents();
    loadStats();
}


// ======================================================
// DASHBOARD STYLES
// ======================================================

function addDashboardStyles() {

    if (document.getElementById("adminStyles")) return;

    const style = document.createElement("style");
    style.id = "adminStyles";

    style.innerHTML = `
        h2 {
            margin-top:30px;
        }

        .stat-card {
            background:#0d1b2e;
            border:1px solid #203553;
            border-radius:14px;
            padding:20px;
        }

        .stat-card strong {
            display:block;
            font-size:30px;
            margin-bottom:8px;
        }

        .stat-card span {
            color:#91a4bd;
        }

        .action-grid {
            display:grid;
            grid-template-columns:
                repeat(auto-fit,minmax(180px,1fr));
            gap:15px;
        }

        .action-card {
            background:#0d1b2e;
            border:1px solid #203553;
            border-radius:14px;
            padding:20px;
            color:white;
            text-align:left;
            cursor:pointer;
            min-height:130px;
        }

        .action-card:hover {
            border-color:#3b82f6;
        }

        .action-card strong,
        .action-card small {
            display:block;
            margin-top:10px;
        }

        .action-card small {
            color:#91a4bd;
        }

        .admin-panel {
            margin-top:25px;
            background:#0d1b2e;
            border:1px solid #203553;
            border-radius:16px;
            padding:20px;
        }

        .admin-input,
        .admin-select {
            width:100%;
            padding:13px;
            margin:7px 0 15px;
            background:#081525;
            color:white;
            border:1px solid #29415f;
            border-radius:9px;
        }

        .admin-button {
            border:0;
            border-radius:9px;
            padding:12px 18px;
            margin:5px;
            background:#2563eb;
            color:white;
            font-weight:bold;
            cursor:pointer;
        }

        .danger {
            background:#07111f;
        }

        .success {
            background:#2563eb;
        }

        .student-row,
        .result-row,
        .year-row {
            background:#081525;
            border:1px solid #203553;
            border-radius:10px;
            padding:15px;
            margin:10px 0;
        }

        .muted {
            color:#91a4bd;
        }
    `;

    document.head.appendChild(style);
}


// ======================================================
// ADD STUDENT
// ======================================================

function showAddStudent() {

    const content = document.getElementById("adminContent");

    content.innerHTML = `
        <div class="admin-panel">

            <h2>Add Student</h2>

            <label>Student Name</label>
            <input id="studentName"
                   class="admin-input"
                   placeholder="Enter student name">

            <label>Form</label>
            <select id="studentForm" class="admin-select">
                <option value="">Select Form</option>
                <option value="1">Form 1</option>
                <option value="2">Form 2</option>
                <option value="3">Form 3</option>
                <option value="4">Form 4</option>
                <option value="5">Form 5</option>
                <option value="6">Form 6</option>
            </select>

            <label>Class</label>
            <input id="studentClass"
                   class="admin-input"
                   placeholder="Example: 3A">

            <label>Password / PIN</label>
            <input id="studentPassword"
                   class="admin-input"
                   type="password"
                   placeholder="Student password">

            <label>Status</label>
            <select id="studentStatus" class="admin-select">
                <option value="Active">Active</option>
                <option value="Disabled">Disabled</option>
            </select>

            <button class="admin-button"
                    onclick="saveStudent()">
                SAVE STUDENT
            </button>

            <button class="admin-button"
                    onclick="clearStudentForm()">
                CLEAR
            </button>

            <div id="studentMessage"></div>

        </div>
    `;
}


// ======================================================
// SAVE STUDENT
// ======================================================

async function saveStudent() {

    const name = document.getElementById("studentName").value.trim();
    const form = document.getElementById("studentForm").value;
    const className = document.getElementById("studentClass").value.trim();
    const password = document.getElementById("studentPassword").value.trim();
    const status = document.getElementById("studentStatus").value;
    const message = document.getElementById("studentMessage");

    if (!name || !form || !className || !password) {
        message.innerHTML =
            `<p style="color:#f59e0b;">
                Please complete all fields.
            </p>`;
        return;
    }

    try {

        const response = await fetch(
            API + "/students",
            {
                method:"POST",
                headers:{
                    "Content-Type":"application/json"
                },
                body:JSON.stringify({
                    name:name,
                    form:Number(form),
                    class_name:className,
                    password:password,
                    status:status
                })
            }
        );

        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(data.message || "Could not save student.");
        }

        message.innerHTML =
            `<p style="color:#f5d477;">
                ✓ Student saved successfully.
                <br>
                <strong style="font-size:16px;">
                    STUDENT ID: ${escapeHtml(data.student_id_code || "CHECK MANAGEMENT")}
                </strong>
            </p>`;

        clearStudentForm();

        loadStudents();
        loadStats();

    } catch(error) {

        message.innerHTML =
            `<p style="color:#f59e0b;">
                Error: ${escapeHtml(error.message)}
            </p>`;
    }
}


function clearStudentForm() {

    const ids = [
        "studentName",
        "studentClass",
        "studentPassword"
    ];

    ids.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.value = "";
    });

    const form = document.getElementById("studentForm");
    if (form) form.value = "";
}


// ======================================================
// LOAD STUDENTS
// ======================================================

async function loadStudents() {

    try {

        const response = await fetch(API + "/students");
        const data = await response.json();

        if (data.ok) {
            students = data.students || data.data || [];
        } else {
            students = [];
        }

    } catch(error) {

        console.log("Student API error:", error);
        students = [];
    }

    renderStudents();
    loadStats();
}


// ======================================================
// STUDENTS PAGE
// ======================================================

function showStudents() {

    const content = document.getElementById("adminContent");

    content.innerHTML = `
        <div class="admin-panel">

            <h2>Students</h2>

            <input
                id="studentSearch"
                class="admin-input"
                placeholder="Search student name..."
                oninput="filterStudents()"
            >

            <div id="studentsList">
                Loading students...
            </div>

        </div>
    `;

    renderStudents();
}


function renderStudents(list) {

    const container =
        document.getElementById("studentsList");

    if (!container) {
        return;
    }

    if (!Array.isArray(list)) {
        list = [];
    }

    if (list.length === 0) {

        container.innerHTML = `
            <p class="muted">
                No students found.
            </p>
        `;

        return;
    }

    container.innerHTML = list.map(student => {

        const status =
            String(student.status || "Active")
                .trim();

        const isDisabled =
            status.toLowerCase() === "disabled";

        const statusButton =
            isDisabled
                ? "ACTIVATE"
                : "DISABLE";

        return `
            <div class="student-row">

                <strong>
                    ${escapeHtml(student.name)}
                    </h3>
                    <div class="msa-student-id-badge">
                        STUDENT ID:
                        ${escapeHtml(student.student_id_code || "NOT ASSIGNED")}
                    </div>
                    <h3>
                </strong>

                <p class="muted">
                    Form ${student.form}
                    • ${escapeHtml(student.class_name || "")}
                </p>

                <p>
                    Status:
                    <strong>
                        ${escapeHtml(status)}
                    </strong>
                </p>

                <button
                    class="admin-button"
                    type="button"
                    onclick="editStudent(${Number(student.id)})"
                >
                    EDIT
                </button>

                <button
                    class="admin-button"
                    type="button"
                    onclick="resetStudentPassword(${Number(student.id)})"
                >
                    RESET PASSWORD
                </button>

                <button
                    class="admin-button"
                    type="button"
                    onclick="toggleStudentStatus(${Number(student.id)})"
                >
                    ${statusButton}
                </button>

                <button
                    class="admin-button danger"
                    type="button"
                    onclick="deleteStudent(${Number(student.id)})"
                >
                    DELETE
                </button>

            </div>
        `;

    }).join("");

}


/* ============================================================
   NEW PASSWORD / PIN RESET ENTRY
   ============================================================ */
function addPasswordPinResetEntry() {

    /*
     * Find the main Admin content area.
     * The reset manager must live inside the normal
     * Admin section instead of being appended to Student Management.
     */
    const possibleContainers = [
        "adminContent",
        "mainContent",
        "content",
        "adminMain",
        "app"
    ];

    let container = null;

    for (const id of possibleContainers) {
        const element = document.getElementById(id);
        if (element) {
            container = element;
            break;
        }
    }

    /*
     * If the Admin page uses the dashboard itself as the
     * section container, use its main visible container.
     */
    if (!container) {
        container =
            document.querySelector("main") ||
            document.querySelector(".admin-content") ||
            document.querySelector(".admin-main") ||
            document.querySelector(".content");
    }

    if (!container) {
        alert("Admin content area could not be found.");
        return;
    }

    /*
     * Hide the current Admin section.
     */
    container
        .querySelectorAll(
            ".admin-section, .dashboard-section, .student-management-section"
        )
        .forEach(section => {
            section.style.display = "none";
        });

    /*
     * Create the reset panel.
     */
    let panel =
        document.getElementById("passwordResetPanel");

    if (!panel) {

        panel =
            document.createElement("section");

        panel.id =
            "passwordResetPanel";

        panel.className =
            "admin-section password-reset-admin-panel";

        container.appendChild(panel);

        panel.innerHTML = `
            <div class="admin-section-header">

                <button
                    type="button"
                    class="admin-button"
                    id="passwordResetBackButton"
                >
                    ← BACK TO ADMIN DASHBOARD
                </button>

                <div style="margin-top:20px;">
                    <h2>
                        🔐 PASSWORD / PIN RESET
                    </h2>

                    <p class="muted">
                        Student password and PIN recovery management
                    </p>
                </div>

            </div>

            <div
                style="
                    margin-top:20px;
                    display:flex;
                    align-items:center;
                    justify-content:space-between;
                    gap:12px;
                    flex-wrap:wrap;
                "
            >

                <div
                    id="resetNewRequestIndicator"
                    class="admin-button"
                    style="
                        display:inline-block;
                        width:auto;
                        margin:0;
                        font-weight:800;
                    "
                >
                    🔴 NEW REQUESTS: 0
                </div>

                <button
                    type="button"
                    class="admin-button"
                    onclick="loadPasswordResetRequests()"
                >
                    🔄 REFRESH REQUESTS
                </button>

            </div>

            
<div style="margin-top:12px;">
    <button type="button"
        class="admin-button"
        onclick="clearAllPasswordResetRecords()">
        🗑 CLEAR ALL
    </button>
</div>
<div id="passwordResetRequests" style="margin-top:20px;">

                <section class="reset-section">
                    <h3>🔴 NEW REQUESTS</h3>
                    <div id="newPasswordResetRequests">
                        Loading new requests...
                    </div>
                </section>

                <section class="reset-section" style="margin-top:24px;">
                    <h3>📁 OLD REQUEST HISTORY</h3>
                    <div id="oldPasswordResetRequests">
                        Loading old request history...
                    </div>
                </section>

                <section class="reset-section" style="margin-top:24px;">
                    <h3>⚠️ NOT APPROVED ATTEMPTS</h3>
                    <div id="failedPasswordResetAttempts">
                        Loading not-approved attempts...
                    </div>
                </section>

            </div>
        `;

        const backButton =
            document.getElementById(
                "passwordResetBackButton"
            );

        if (backButton) {
            backButton.onclick = function () {

                panel.style.display = "none";

                if (
                    typeof showDashboard ===
                    "function"
                ) {
                    showDashboard();
                } else {
                    window.scrollTo({
                        top: 0,
                        behavior: "smooth"
                    });
                }
            };
        }
    }

    /*
     * Show only the Password/PIN Reset section.
     */
    panel.style.display = "block";

    /*
     * Load current and historical requests.
     */
    if (
        typeof loadPasswordResetRequests ===
        "function"
    ) {
        loadPasswordResetRequests();
    }

    /*
     * Automatic refresh every 15 seconds.
     */
    if (window.passwordResetRefresh) {
        clearInterval(
            window.passwordResetRefresh
        );
    }

    window.passwordResetRefresh =
        setInterval(
            loadPasswordResetRequests,
            15000
        );

    panel.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}


function filterStudents() {
    const searchInput =
        document.getElementById("studentSearch");

    const container =
        document.getElementById("studentsList");

    if (!searchInput || !container) {
        return;
    }

    const search =
        searchInput.value
            .toLowerCase()
            .trim();

    // Empty search: never show the full student list.
    if (!search) {
        container.innerHTML = `
            <div class="empty-state">
                Start typing a student name to search.
            </div>
        `;
        return;
    }

    // Instant partial-name search.
    const filtered = students.filter(student =>
        String(student.name || "")
            .toLowerCase()
            .includes(search)
    );

    // Nothing matched.
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                Student not found
            </div>
        `;
        return;
    }

    // Show only matching students.
    renderStudents(filtered);

    // Password/PIN Reset is a Student Management menu option,
    // not part of the student search results.
}
// STUDENT ACTIONS
// ======================================================

async function editStudent(id) {
    const student = students.find(
        s => Number(s.id) === Number(id)
    );

    if (!student) {
        alert("Student not found.");
        return;
    }

    const name = prompt(
        "Student name:",
        student.name || ""
    );

    if (name === null) return;

    const cleanName = name.trim();

    if (!cleanName) {
        alert("Student name is required.");
        return;
    }

    const form = prompt(
        "Form (1-6):",
        student.form
    );

    if (form === null) return;

    const formNumber = Number(form);

    if (
        !Number.isInteger(formNumber) ||
        formNumber < 1 ||
        formNumber > 6
    ) {
        alert("Invalid form. Enter a number from 1 to 6.");
        return;
    }

    const className = prompt(
        "Class:",
        student.class_name || ""
    );

    if (className === null) return;

    const cleanClass = className.trim();

    if (!cleanClass) {
        alert("Class is required.");
        return;
    }

    try {
        const response = await fetch(
            API + "/students/update",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    student_id: Number(student.id),
                    name: cleanName,
                    form: formNumber,
                    class_name: cleanClass
                })
            }
        );

        const data = await response.json();

        if (!response.ok || !data.ok) {
            alert(
                data.message ||
                "Unable to update student."
            );
            return;
        }

        alert("Student updated successfully.");

        if (typeof loadStudents === "function") {
            await loadStudents();
        }

    } catch (error) {
        console.error(error);
        alert(
            "Connection error while updating student."
        );
    }
}

async function resetStudentPassword(id) {
    const student = students.find(
        s => Number(s.id) === Number(id)
    );

    if (!student) {
        alert("Student not found.");
        return;
    }

    const confirmed = confirm(
        "Reset the password/PIN for " +
        student.name +
        "?"
    );

    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(
            API + "/students/reset-password",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    student_id: Number(student.id)
                })
            }
        );

        const data = await response.json();

        if (!response.ok || !data.ok) {
            alert(
                data.message ||
                "Unable to reset password."
            );
            return;
        }

        alert(
            "PASSWORD / PIN RESET SUCCESSFUL\\n\\n" +
            "Student: " +
            student.name +
            "\\n\\n" +
            "Temporary PIN:\\n" +
            data.temporary_pin +
            "\\n\\n" +
            "Give this PIN to the student."
        );

        if (typeof loadStudents === "function") {
            await loadStudents();
        }

    } catch (error) {
        console.error(error);

        alert(
            "Connection error while resetting password."
        );
    }
}


async function toggleStudent(id) {
    return toggleStudentStatus(Number(id));
}

async function deleteStudent(id) {
    const student = students.find(
        s => Number(s.id) === Number(id)
    );

    if (!student) {
        alert("Student not found.");
        return;
    }

    const confirmed = confirm(
        "PERMANENT DELETE\\n\\n" +
        "Student: " +
        student.name +
        "\\n" +
        "Form: " +
        student.form +
        "\\n" +
        "Class: " +
        student.class_name +
        "\\n\\n" +
        "This will permanently remove the student " +
        "account and associated result records.\\n\\n" +
        "This action CANNOT be undone.\\n\\n" +
        "Continue?"
    );

    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(
            API + "/students/delete",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    student_id: Number(student.id)
                })
            }
        );

        const data = await response.json();

        if (!response.ok || !data.ok) {
            alert(
                data.message ||
                "Unable to delete student."
            );
            return;
        }

        alert(
            "Student permanently deleted successfully."
        );

        if (typeof loadStudents === "function") {
            await loadStudents();
        }

    } catch (error) {
        console.error(error);

        alert(
            "Connection error while deleting student."
        );
    }
}


// ======================================================
// UPLOAD RESULTS
// ======================================================

function showUploadResults() {

    const content = document.getElementById("adminContent");

    content.innerHTML = `
        <div class="admin-panel">

            <h2>Upload Results</h2>

            <label>Form</label>

            <select id="resultForm" class="admin-select">
                <option value="">Select Form</option>
                ${[1,2,3,4,5,6].map(f =>
                    `<option value="${f}">
                        Form ${f}
                    </option>`
                ).join("")}
            </select>

            <label>Academic Year</label>

            <select id="resultYear"
                    class="admin-select">
                ${getAcademicYearOptions()}
            </select>

            <label>Term</label>

            <select id="resultTerm"
                    class="admin-select">
                <option>Term 1</option>
                <option>Term 2</option>
                <option>Term 3</option>
            </select>

            <label>Student</label>

            <select id="resultStudent"
                    class="admin-select">
                <option value="">
                    Select student
                </option>
                ${students.map(s => `
                    <option value="${s.id}">
                        ${escapeHtml(s.name)}
                    </option>
                `).join("")}
            </select>

            <label>Result PDF</label>

            <input
                id="resultFile"
                type="file"
                accept=".pdf"
                class="admin-input"
            >

            <button class="admin-button"
                    onclick="uploadResult()">
                UPLOAD RESULT
            </button>

            <div id="resultMessage"></div>

        </div>
    `;
}



async function uploadResult() {
    const studentId = document.getElementById("resultStudent");
    const year = document.getElementById("resultYear");
    const term = document.getElementById("resultTerm");
    const file = document.getElementById("resultFile");

    if (!studentId || !year || !term || !file) {
        alert("Upload form is incomplete.");
        return;
    }

    if (!studentId.value) {
        alert("Please select a student.");
        return;
    }

    if (!file.files || !file.files[0]) {
        alert("Please select a PDF result.");
        return;
    }

    const selectedFile = file.files[0];

    if (selectedFile.type !== "application/pdf") {
        alert("Please select a PDF file.");
        return;
    }

    const reader = new FileReader();

    reader.onload = async function () {
        try {
            const base64 = reader.result.split(",")[1];

            const response = await fetch("/api/results", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    student_id: Number(studentId.value),
                    academic_year: Number(year.value),
                    term: term.value,
                    file_name: selectedFile.name,
                    file_data: base64
                })
            });

            const data = await response.json();

            if (!response.ok || !data.ok) {
                alert(data.message || "Result upload failed.");
                return;
            }

            alert("✓ Result uploaded successfully.");

            file.value = "";

            if (typeof loadResults === "function") {
                await loadResults();
            }

            if (typeof loadStats === "function") {
                loadStats();
            }

            if (typeof showResultStatus === "function") {
                showResultStatus();
            }

        } catch (error) {
            console.error(error);
            alert("Could not connect to the MSA PORTAL backend.");
        }
    };

    reader.readAsDataURL(selectedFile);
}

async function loadResults() {
    try {
        const response = await fetch("/api/results");
        const data = await response.json();

        if (response.ok && data.ok) {
            results = data.results || [];

            localStorage.setItem(
                "msa_results",
                JSON.stringify(results)
            );

            return true;
        }

        console.error(
            data.message || "Could not load results."
        );

        return false;

    } catch (error) {
        console.error(
            "Could not load results:",
            error
        );

        return false;
    }
}


async function showResultStatus() {

    await loadResults();

    const content =
        document.getElementById("adminContent");

    content.innerHTML = `
        <div class="admin-panel">

            <h2>Result Status</h2>

            <div id="resultStatusList">
                ${renderResultsHtml()}
            </div>

        </div>
    `;
}


function renderResultsHtml() {

    if (!results.length) {
        return `
            <p class="muted">
                No results uploaded yet.
            </p>
        `;
    }

    return results.map(result => `

        <div class="result-row">

            <strong>
                ${escapeHtml(result.student_name)}
            </strong>

            <p class="muted">
                ${result.academic_year}
                • ${escapeHtml(result.term)}
            </p>

            <p>
                File:
                ${escapeHtml(result.file_name)}
            </p>

            <p>
                Status:
                <strong>
                    ${result.published ?
                        "Published" :
                        "Draft"}
                </strong>
            </p>

        </div>

    `).join("");
}


// ======================================================
// PUBLISH RESULTS
// ======================================================

async function showPublishResults() {

    await loadResults();

    const content =
        document.getElementById("adminContent");

    content.innerHTML = `
        <div class="admin-panel">

            <h2>Publish Results</h2>

            <p class="muted">
                Publish uploaded results so students
                can view them.
            </p>

            <div id="publishList">
                ${renderPublishList()}
            </div>

        </div>
    `;
}


function renderPublishList() {

    if (!results.length) {

        return `
            <p class="muted">
                No results available.
            </p>
        `;
    }

    return results.map(result => `

        <div class="result-row">

            <strong>
                ${escapeHtml(result.student_name)}
            </strong>

            <p>
                ${result.academic_year}
                • ${escapeHtml(result.term)}
            </p>

            ${
                result.published
                ?
                `<button class="admin-button success"
                         disabled>
                    PUBLISHED
                </button>`
                :
                `<button class="admin-button"
                         onclick="publishResult(${result.id})">
                    PUBLISH
                </button>`
            }

        </div>

    `).join("");
}



async function publishResult(id) {
    if (!id) {
        alert("Invalid result ID.");
        return;
    }

    if (!confirm("Publish this result? The student will be able to view it.")) {
        return;
    }

    try {
        const response = await fetch(
            "/api/results/" + id + "/publish",
            {
                method: "POST"
            }
        );

        const data = await response.json();

        if (!response.ok || !data.ok) {
            alert(data.message || "Could not publish result.");
            return;
        }

        alert("✓ Result published successfully.");

        await loadResults();

        if (typeof loadStats === "function") {
            loadStats();
        }

        if (typeof showPublishResults === "function") {
            await showPublishResults();
        }

    } catch (error) {
        console.error(error);
        alert("Could not connect to the MSA PORTAL backend.");
    }
}

function getStoredAcademicYears() {

    const saved =
        localStorage.getItem("msa_academic_years");

    if (saved) {
        try {
            return JSON.parse(saved);
        } catch(error) {}
    }

    const years = [];

    for (let year = 2026; year <= 2100; year++) {

        years.push({
            year:year,
            active:year === 2026
        });
    }

    localStorage.setItem(
        "msa_academic_years",
        JSON.stringify(years)
    );

    return years;
}


function getAcademicYearOptions() {

    return getStoredAcademicYears()
        .map(item =>
            `<option value="${item.year}"
                ${item.active ? "selected" : ""}>
                ${item.year}
            </option>`
        )
        .join("");
}


function showAcademicYears() {

    const content =
        document.getElementById("adminContent");

    content.innerHTML = `
        <div class="admin-panel">

            <h2>Academic Years</h2>

            <p class="muted">
                Manage the academic years used by MSA PORTAL.
            </p>

            <div style="display:flex;gap:10px;flex-wrap:wrap;">
                <input
                    id="newAcademicYear"
                    class="admin-input"
                    style="max-width:200px;"
                    type="number"
                    placeholder="Example: 2027"
                >

                <button class="admin-button"
                        onclick="addAcademicYear()">
                    ADD YEAR
                </button>
            </div>

            <div id="academicYearsList">
                ${renderAcademicYears()}
            </div>

        </div>
    `;
}


function renderAcademicYears() {

    const years = getStoredAcademicYears();

    return years.map(item => `

        <div class="year-row">

            <strong>
                ${item.year}
            </strong>

            ${
                item.active
                ?
                `<span style="color:#f5d477;">
                    ACTIVE
                </span>`
                :
                `<button class="admin-button"
                         onclick="setActiveAcademicYear(${item.year})">
                    SET ACTIVE
                </button>`
            }

            <button class="admin-button"
                    onclick="editAcademicYear(${item.year})">
                EDIT
            </button>

            <button class="admin-button danger"
                    onclick="deleteAcademicYear(${item.year})">
                DELETE
            </button>

        </div>

    `).join("");
}


function saveAcademicYears(years) {

    localStorage.setItem(
        "msa_academic_years",
        JSON.stringify(years)
    );
}


function addAcademicYear() {

    const input =
        document.getElementById("newAcademicYear");

    const year =
        Number(input.value);

    if (!year || year < 2026) {

        alert(
            "Enter a valid year from 2026 onward."
        );

        return;
    }

    const years =
        getStoredAcademicYears();

    if (years.some(item =>
        Number(item.year) === year
    )) {

        alert("That academic year already exists.");
        return;
    }

    years.push({
        year:year,
        active:false
    });

    years.sort((a,b) =>
        Number(a.year) - Number(b.year)
    );

    saveAcademicYears(years);

    showAcademicYears();
}


function editAcademicYear(year) {

    const newYear =
        Number(prompt(
            "Enter new academic year:",
            year
        ));

    if (!newYear || newYear < 2026) {
        alert("Invalid year.");
        return;
    }

    const years =
        getStoredAcademicYears();

    if (years.some(item =>
        Number(item.year) === newYear &&
        Number(item.year) !== Number(year)
    )) {

        alert("That year already exists.");
        return;
    }

    const item =
        years.find(item =>
            Number(item.year) === Number(year)
        );

    if (item) {
        item.year = newYear;
    }

    saveAcademicYears(years);

    showAcademicYears();
}


function setActiveAcademicYear(year) {

    const years =
        getStoredAcademicYears();

    years.forEach(item => {
        item.active =
            Number(item.year) === Number(year);
    });

    saveAcademicYears(years);

    showAcademicYears();
}


function deleteAcademicYear(year) {

    const years =
        getStoredAcademicYears();

    if (years.length <= 1) {
        alert(
            "At least one academic year must remain."
        );
        return;
    }

    const item =
        years.find(item =>
            Number(item.year) === Number(year)
        );

    if (item && item.active) {
        alert(
            "Set another year as active first."
        );
        return;
    }

    if (!confirm(
        "Delete academic year " + year + "?"
    )) return;

    const filtered =
        years.filter(item =>
            Number(item.year) !== Number(year)
        );

    saveAcademicYears(filtered);

    showAcademicYears();
}


// ======================================================
// DASHBOARD STATISTICS
// ======================================================

async function loadStats() {

    let count = students.length;

    try {

        const response =
            await fetch(API + "/students");

        const data =
            await response.json();

        if (data.ok) {
            students =
                data.students || data.data || [];
            count = students.length;
        }

    } catch(error) {}

    const studentCount =
        document.getElementById("studentCount");

    const resultCount =
        document.getElementById("resultCount");

    const publishedCount =
        document.getElementById("publishedCount");

    const missingCount =
        document.getElementById("missingCount");

    if (studentCount)
        studentCount.textContent = count;

    if (resultCount)
        resultCount.textContent = results.length;

    if (publishedCount)
        publishedCount.textContent =
            results.filter(r => r.published).length;

    if (missingCount)
        missingCount.textContent =
            Math.max(0, count - results.length);
}


// ======================================================
// LOGOUT
// ======================================================

function logout() {
    localStorage.removeItem(
        "MSA_ADMIN_TOKEN"
    );



    window.location.href =
        "/app/";
}


// ======================================================
// BACK TO PORTAL
// ======================================================

function goBack() {

    window.location.href =
        "/app/";
}


// ======================================================
// HTML SECURITY
// ======================================================

function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/* ==========================================================
   PASSWORD / PIN RESET MANAGEMENT
   ========================================================== */


async function clearAllPasswordResetRecords() {
    const confirmed = confirm(
        "CLEAR ALL PASSWORD RESET RECORDS?\n\n" +
        "This removes NEW REQUESTS, OLD REQUEST HISTORY, " +
        "and NOT APPROVED ATTEMPTS.\n\n" +
        "Active reset requests and PINs may stop working. " +
        "This cannot be undone. Continue?"
    );

    if (!confirmed) return;

    const token = localStorage.getItem("MSA_ADMIN_TOKEN");

    if (!token) {
        alert("Your administrator session has expired. Please log in again.");
        return;
    }

    try {
        const response = await fetch(
            "/api/admin/password-reset-requests/clear-all",
            {
                method: "POST",
                headers: {
                    "Authorization": "Bearer " + token,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({})
            }
        );

        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(
                data.message || data.error ||
                "Unable to clear password-reset records."
            );
        }

        alert("Password-reset requests and attempt history cleared.");
        await loadPasswordResetRequests();

    } catch (error) {
        alert(error.message || "Unable to clear password-reset records.");
    }
}

async function loadPasswordResetRequests() {

    const newContainer =
        document.getElementById(
            "newPasswordResetRequests"
        );

    const oldContainer =
        document.getElementById(
            "oldPasswordResetRequests"
        );

    const attemptsContainer =
        document.getElementById(
            "failedPasswordResetAttempts"
        );

    const newIndicator =
        document.getElementById(
            "resetNewIndicator"
        );

    const newCountElement =
        document.getElementById(
            "resetNewCount"
        );

    const oldCountElement =
        document.getElementById(
            "resetOldCount"
        );

    const attemptCountElement =
        document.getElementById(
            "resetAttemptCount"
        );

    if (!newContainer ||
        !oldContainer ||
        !attemptsContainer) {

        return;
    }

    try {

        const token =
            localStorage.getItem(
                "MSA_ADMIN_TOKEN"
            );

        const response =
            await fetch(
                "/api/admin/password-reset-requests",
                {
                    method: "GET",
                    headers: {
                        "Authorization":
                            "Bearer " + token
                    }
                }
            );

        const data =
            await response.json();

        if (!response.ok || !data.ok) {

            throw new Error(
                data.error ||
                "Unable to load reset requests."
            );
        }

        const requests =
            Array.isArray(data.requests)
                ? data.requests
                : [];

        const failedAttempts =
            Array.isArray(data.failed_attempts)
                ? data.failed_attempts
                : [];

        const newCount =
            Number(
                data.new_count || 0
            );

        const newRequests =
            requests.filter(
                request =>
                    Number(request.is_new) === 1
            );

        const oldRequests =
            requests.filter(
                request =>
                    Number(request.is_new) !== 1
            );

        if (newCountElement) {
            newCountElement.textContent =
                String(newCount);
        }

        if (oldCountElement) {
            oldCountElement.textContent =
                String(oldRequests.length);
        }

        if (attemptCountElement) {
            attemptCountElement.textContent =
                String(failedAttempts.length);
        }

        if (newIndicator) {

            newIndicator.textContent =
                newCount > 0
                    ? "🔴 NEW REQUESTS: " + newCount
                    : "🟢 NEW REQUESTS: 0";
        }

        function escapeValue(value) {

            if (typeof escapeHtml === "function") {
                return escapeHtml(
                    String(value ?? "")
                );
            }

            return String(value ?? "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }

        function statusBadge(status) {

            const clean =
                String(status || "")
                    .toLowerCase();

            let className =
                "reset-status";

            if (clean === "approved") {
                className +=
                    " reset-status-approved";
            } else if (
                clean === "pending"
            ) {
                className +=
                    " reset-status-pending";
            } else {
                className +=
                    " reset-status-not-approved";
            }

            return `
                <span class="${className}">
                    ${escapeValue(
                        String(status || "UNKNOWN")
                            .toUpperCase()
                    )}
                </span>
            `;
        }

        function formatDate(value) {

            if (!value) {
                return "—";
            }

            const date =
                new Date(
                    String(value)
                        .replace(" ", "T") +
                    "Z"
                );

            if (
                Number.isNaN(
                    date.getTime()
                )
            ) {
                return escapeValue(value);
            }

            return escapeValue(
                date.toLocaleString()
            );
        }

        function requestTable(list, emptyMessage) {
            if (!list.length) {
                return `
                    <div class="reset-empty reset-empty-card">
                        <div class="reset-empty-icon">✓</div>
                        <div>${escapeValue(emptyMessage)}</div>
                    </div>
                `;
            }

            return `
                <div class="reset-card-list">
                    ${list.map(request => {
                        const attemptCount = Number(request.attempt_count || 0);
                        const studentName =
                            request.name ||
                            request.student_name ||
                            "Unknown";
                        const studentId =
                            request.student_id_code ||
                            "NOT ASSIGNED";
                        const form =
                            request.form ||
                            request.student_form ||
                            "—";
                        const className =
                            request.class_name ||
                            request.student_class_name ||
                            "";

                        return `
                            <article class="reset-request-card">

                                <div class="reset-card-top">

                                    <div class="reset-student-block">

                                        <div class="reset-student-avatar">
                                            ${escapeValue(
                                                String(studentName)
                                                    .trim()
                                                    .charAt(0)
                                                    .toUpperCase() || "S"
                                            )}
                                        </div>

                                        <div class="reset-student-info">

                                            <h3>
                                                ${escapeValue(studentName)}
                                            </h3>

                                            <div class="reset-student-meta">
                                                <span>
                                                    ${escapeValue(studentId)}
                                                </span>

                                                <span>•</span>

                                                <span>
                                                    Form ${escapeValue(form)}
                                                </span>
                                            </div>

                                            ${
                                                className
                                                    ? `
                                                        <div class="reset-class-name">
                                                            ${escapeValue(className)}
                                                        </div>
                                                      `
                                                    : ""
                                            }

                                        </div>

                                    </div>

                                    <div class="reset-status-wrap">
                                        ${statusBadge(request.status)}
                                    </div>

                                </div>

                                <div class="reset-card-stats">

                                    <div class="reset-stat">
                                        <span class="reset-stat-label">
                                            Attempts
                                        </span>

                                        <strong>
                                            ${attemptCount}
                                        </strong>
                                    </div>

                                    <div class="reset-stat">
                                        <span class="reset-stat-label">
                                            Requested
                                        </span>

                                        <strong>
                                            ${formatDate(request.created_at)}
                                        </strong>
                                    </div>

                                    <div class="reset-stat">
                                        <span class="reset-stat-label">
                                            Last Attempt
                                        </span>

                                        <strong>
                                            ${formatDate(request.last_attempt)}
                                        </strong>
                                    </div>

                                </div>

                                <button
                                    type="button"
                                    class="reset-view-button reset-view-button-card"
                                    onclick="viewPasswordResetRequest(${Number(request.id)})"
                                >
                                    👁 VIEW REQUEST
                                </button>

                            </article>
                        `;
                    }).join("")}
                </div>
            `;
        }

        newContainer.innerHTML =
            requestTable(
                newRequests,
                "No new password/PIN reset requests."
            );

        oldContainer.innerHTML =
            requestTable(
                oldRequests,
                "No old reset requests found."
            );

        if (!failedAttempts.length) {

            attemptsContainer.innerHTML = `
                <div class="reset-empty reset-empty-card">

                    <div class="reset-empty-icon">
                        ✓
                    </div>

                    <div>
                        No not-approved Student ID reset attempts recorded.
                    </div>

                </div>
            `;

        } else {

            attemptsContainer.innerHTML = `

                <div class="reset-attempt-list">

                    ${failedAttempts.map(attempt => `

                        <article class="reset-attempt-card">

                            <div class="reset-attempt-top">

                                <div>

                                    <h3>
                                        ${escapeValue(
                                            attempt.student_name ||
                                            "Unknown"
                                        )}
                                    </h3>

                                    <div class="reset-attempt-time">
                                        ${formatDate(attempt.created_at)}
                                    </div>

                                </div>

                                ${statusBadge(
                                    attempt.result ||
                                    "not_approved"
                                )}

                            </div>

                            <div class="reset-attempt-grid">

                                <div class="reset-detail-item">

                                    <span>
                                        Correct Student ID
                                    </span>

                                    <strong>
                                        ${escapeValue(
                                            attempt.student_id_code ||
                                            "—"
                                        )}
                                    </strong>

                                </div>

                                <div class="reset-detail-item">

                                    <span>
                                        Entered ID
                                    </span>

                                    <strong>
                                        ${escapeValue(
                                            attempt.entered_student_id ||
                                            "—"
                                        )}
                                    </strong>

                                </div>

                                <div class="reset-detail-item">

                                    <span>
                                        Form
                                    </span>

                                    <strong>
                                        ${escapeValue(
                                            attempt.form ||
                                            "—"
                                        )}
                                    </strong>

                                </div>

                                <div class="reset-detail-item reset-reason-item">

                                    <span>
                                        Reason
                                    </span>

                                    <strong>
                                        ${escapeValue(
                                            attempt.reason ||
                                            "—"
                                        )}
                                    </strong>

                                </div>

                            </div>

                        </article>

                    `).join("")}

                </div>

            `;
        }

    } catch (error) {

        console.error(
            "Password reset request load error:",
            error
        );

        const message =
            `
                <div class="reset-empty">
                    ❌ Unable to load reset requests.
                    <br>
                    ${escapeValue(
                        error.message ||
                        "Unknown error"
                    )}
                </div>
            `;

        newContainer.innerHTML = message;
        oldContainer.innerHTML = message;
        attemptsContainer.innerHTML = message;
    }
}


async function approvePasswordReset(requestId) {
    if (!confirm(
        "Approve this student's password/PIN reset request?"
    )) {
        return;
    }

    try {
        const response =
            await fetch(
                API +
                "/admin/password-reset-requests/" +
                encodeURIComponent(requestId) +
                "/approve",
                {
                    method: "POST"
                }
            );

        const data =
            await response.json();

        if (!response.ok || !data.ok) {
            alert(
                data.error ||
                "Unable to approve reset request."
            );
            return;
        }

        alert(
            "Reset request approved. " +
            "The student can now receive the temporary PIN."
        );

        loadPasswordResetRequests();

    } catch (error) {
        alert(
            "Connection error while approving request."
        );
    }
}


async function rejectPasswordReset(requestId) {
    if (!confirm(
        "Reject this student's password/PIN reset request?"
    )) {
        return;
    }

    try {
        const response =
            await fetch(
                API +
                "/admin/password-reset-requests/" +
                encodeURIComponent(requestId) +
                "/reject",
                {
                    method: "POST"
                }
            );

        const data =
            await response.json();

        if (!response.ok || !data.ok) {
            alert(
                data.error ||
                "Unable to reject reset request."
            );
            return;
        }

        loadPasswordResetRequests();

    } catch (error) {
        alert(
            "Connection error while rejecting request."
        );
    }
}


function createPasswordResetPanel() {

    if (document.getElementById("passwordResetPanel")) {
        return;
    }

    if (document.getElementById("loginPage")) {
        return;
    }

    const panel = document.createElement("section");

    panel.id = "passwordResetPanel";
    panel.style.display = "none";

    panel.className = "password-reset-admin-panel";

    panel.innerHTML = `
        <div>

            <div style="
                display:flex;
                justify-content:space-between;
                align-items:center;
                gap:15px;
                flex-wrap:wrap;
            ">

                <div>
                    <h2 style="margin:0 0 6px;">
                        🔐 PASSWORD / PIN RESET
                    </h2>

                    <p style="
                        margin:0;
                        opacity:.8;
                    ">
                        Student password and PIN recovery requests
                    </p>
                </div>

                <div style="
                    display:flex;
                    gap:10px;
                    flex-wrap:wrap;
                ">

                    <span
                        id="resetNewIndicator"
                        style="
                            display:inline-flex;
                            align-items:center;
                            padding:10px 14px;
                            border-radius:999px;
                            background:#07111f;
                            color:#fff;
                            font-weight:800;
                        "
                    >
                        🔴 0 NEW REQUESTS
                    </span>

                    <button
                        type="button"
                        onclick="loadPasswordResetRequests()"
                        style="
                            border:0;
                            border-radius:10px;
                            padding:10px 16px;
                            font-weight:800;
                            cursor:pointer;
                        "
                     onclick="loadPasswordResetRequests()">
                        🔄 REFRESH REQUESTS
                    </button>

                </div>

            </div>

            <div id="passwordResetRequests"
                style="margin-top:20px;">
                Loading reset requests...
            </div>

        </div>
    `;
    loadPasswordResetRequests();
if (window.passwordResetRefresh) {
        clearInterval(window.passwordResetRefresh);
    }

    window.passwordResetRefresh =
        setInterval(
            loadPasswordResetRequests,
            15000
        );
}









/* STATUS CLICK INTERCEPTOR REMOVED */


async function toggleStudentStatus(id) {
    const student = students.find(
        s => Number(s.id) === Number(id)
    );

    if (!student) {
        alert("Student not found.");
        return;
    }

    const current =
        String(student.status || "Active").toLowerCase();

    const newStatus =
        current === "active" ? "Disabled" : "Active";

    const action =
        newStatus === "Disabled"
            ? "DISABLE"
            : "ACTIVATE";

    if (!confirm(
        action + " account for " +
        student.name +
        "?\n\n" +
        "New status: " +
        newStatus
    )) {
        return;
    }

    try {
        const response = await fetch(
            API + "/students/toggle-status",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    student_id: Number(student.id)
                })
            }
        );

        const data = await response.json();

        console.log(
            "Student status API response:",
            data
        );

        if (!response.ok || !data.ok) {
            alert(
                data.message ||
                "Unable to change student status."
            );
            return;
        }

        alert(
            "Account status changed to " +
            data.status +
            "."
        );

        await loadStudents();

    } catch (error) {
        console.error(
            "Student status error:",
            error
        );

        alert(
            "Connection error while changing student status."
        );
    }
}










/* ============================================================
   MSA PERMANENT STUDENT ID DISPLAY
   ============================================================ */
(function() {
    function decorateStudentIds() {
        const container =
            document.getElementById("studentsList");

        if (!container || !Array.isArray(window.students)) {
            return;
        }

        const cards =
            container.querySelectorAll(".student-card");

        cards.forEach(function(card) {
            if (card.querySelector(".msa-student-id-badge")) {
                return;
            }

            const text =
                card.textContent
                    .replace(/\s+/g, " ")
                    .trim();

            const student =
                window.students.find(function(item) {
                    return text.indexOf(
                        String(item.name || "")
                    ) !== -1;
                });

            if (!student || !student.student_id_code) {
                return;
            }

            const badge =
                document.createElement("div");

            badge.className =
                "msa-student-id-badge";

            badge.textContent =
                "Student ID: " +
                student.student_id_code;

            badge.style.cssText =
                "margin-top:6px;" +
                "font-weight:800;" +
                "letter-spacing:.4px;";

            const info =
                card.querySelector(".student-info") ||
                card;

            info.appendChild(badge);
        });
    }

    const originalLoadStudents =
        window.loadStudents;

    if (typeof originalLoadStudents === "function") {
        window.loadStudents = async function() {
            const result =
                await originalLoadStudents.apply(
                    this,
                    arguments
                );

            setTimeout(
                decorateStudentIds,
                50
            );

            return result;
        };
    }

    const originalRenderStudents =
        window.renderStudents;

    if (typeof originalRenderStudents === "function") {
        window.renderStudents = function() {
            const result =
                originalRenderStudents.apply(
                    this,
                    arguments
                );

            setTimeout(
                decorateStudentIds,
                20
            );

            return result;
        };
    }

    setTimeout(
        decorateStudentIds,
        500
    );
})();

async function viewPasswordResetRequest(requestId) {

    try {

        const token =
            localStorage.getItem(
                "MSA_ADMIN_TOKEN"
            );

        const response =
            await fetch(
                "/api/admin/password-reset-requests",
                {
                    method: "GET",
                    headers: {
                        "Authorization":
                            "Bearer " + token
                    }
                }
            );

        const data =
            await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(
                data.error ||
                "Unable to load request details."
            );
        }

        const requests =
            Array.isArray(data.requests)
                ? data.requests
                : [];

        const request =
            requests.find(
                item =>
                    Number(item.id) ===
                    Number(requestId)
            );

        if (!request) {

            alert(
                "This reset request could not be found."
            );

            return;
        }

        function safe(value) {

            if (typeof escapeHtml === "function") {
                return escapeHtml(
                    String(value ?? "—")
                );
            }

            return String(value ?? "—")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }

        const details = [

            "PASSWORD / PIN RESET REQUEST",
            "",
            "Student: " +
                (
                    request.name ||
                    request.student_name ||
                    "Unknown"
                ),

            "Student ID: " +
                (
                    request.student_id_code ||
                    "NOT ASSIGNED"
                ),

            "Form: " +
                (
                    request.form ||
                    request.student_form ||
                    "—"
                ),

            "Class: " +
                (
                    request.class_name ||
                    request.student_class_name ||
                    "—"
                ),

            "Status: " +
                (
                    request.status ||
                    "UNKNOWN"
                ).toUpperCase(),

            "Attempts: " +
                (
                    request.attempt_count ||
                    0
                ),

            "Requested: " +
                (
                    request.created_at ||
                    "—"
                ),

            "Last attempt: " +
                (
                    request.last_attempt ||
                    "—"
                ),

            "Approved: " +
                (
                    request.approved_at ||
                    "—"
                ),

            "Expires: " +
                (
                    request.expires_at ||
                    "—"
                ),

            "Used: " +
                (
                    request.used_at ||
                    "—"
                )
        ].join("\n");

        alert(details);

        /*
         * Mark a NEW request as seen.
         * Failure here must not break the reset system.
         */

        if (
            Number(request.is_new) === 1
        ) {

            try {

                await fetch(
                    "/api/admin/password-reset-requests/" +
                    encodeURIComponent(
                        request.id
                    ) +
                    "/seen",
                    {
                        method: "POST",
                        headers: {
                            "Authorization":
                                "Bearer " + token,
                            "Content-Type":
                                "application/json"
                        },
                        body: "{}"
                    }
                );

            } catch (seenError) {

                console.warn(
                    "Unable to mark request as seen:",
                    seenError
                );
            }

            await loadPasswordResetRequests();
        }

    } catch (error) {

        console.error(
            "Reset request view error:",
            error
        );

        alert(
            "Unable to open this reset request.\n\n" +
            (
                error.message ||
                "Unknown error"
            )
        );
    }
}

/* =========================================================
   MSA PORTAL — MAIN ADMIN MANAGEMENT PANEL
   Main Admin: Weston Mwashita
   ========================================================= */


/* =========================================================
   DASHBOARD SECTION SCREENS
   ========================================================= */


function showStudentRegistrationManagementScreen() {
    showAdminSectionScreen(
        "Student Registration Management",
        "Review registrations that need administrator attention.",
        `<div class="registration-management">
            <div class="registration-management-actions">
                <button type="button" onclick="loadStudentRegistrationQueue()">
                    REFRESH REGISTRATIONS
                </button>
            </div>
            <p id="registrationManagementStatus">Loading registrations...</p>
            <div id="registrationManagementList"></div>
        </div>`
    );
    loadStudentRegistrationQueue();
}

async function loadStudentRegistrationQueue() {
    const status = document.getElementById("registrationManagementStatus");
    const list = document.getElementById("registrationManagementList");
    if (!status || !list) return;

    status.textContent = "Loading registrations...";
    list.innerHTML = "";

    try {
        const response = await fetch("/api/admin/student-registrations");
        const result = await response.json();

        if (!response.ok || !result.ok) {
            throw new Error(result.message || "Unable to load registrations.");
        }

        const registrations = Array.isArray(result.registrations)
            ? result.registrations : [];

        if (!registrations.length) {
            status.textContent = "There are no pending registrations.";
            return;
        }

        status.textContent = registrations.length + " pending registration(s).";

        list.innerHTML = registrations.map(item => `
            <article class="registration-review-card">
                <h3>${escapeHtml(item.full_name || "")}</h3>
                <p><strong>Form:</strong> ${escapeHtml(String(item.form ?? ""))}</p>
                <p><strong>Class/stream:</strong> ${escapeHtml(item.class_name || "")}</p>
                <p><strong>Reason for review:</strong>
                    ${escapeHtml(item.review_reason || "Administrator review required")}</p>
                <p><strong>Submitted:</strong> ${escapeHtml(item.created_at || "")}</p>
                <div class="registration-review-actions">
                    <button type="button"
                        onclick="reviewStudentRegistration(${Number(item.id)}, 'approve')">
                        APPROVE AS NEW STUDENT
                    </button>
                    <button type="button"
                        onclick="reviewStudentRegistration(${Number(item.id)}, 'reject')">
                        REJECT
                    </button>
                </div>
            </article>
        `).join("");
    } catch (error) {
        status.textContent = error.message || "Unable to load registrations.";
    }
}

async function reviewStudentRegistration(id, action) {
    if (!Number.isInteger(id) || id <= 0) {
        alert("Invalid registration.");
        return;
    }

    const message = action === "approve"
        ? "Approve this registration as a NEW student account?"
        : "Reject this student registration?";

    if (!confirm(message)) return;

    try {
        const response = await fetch(
            "/api/admin/student-registrations/" + id + "/" + action,
            { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
        );
        const result = await response.json();

        if (!response.ok || !result.ok) {
            throw new Error(result.message || "The registration could not be processed.");
        }

        alert(result.message + (result.student_id_code
            ? "\nStudent ID: " + result.student_id_code : ""));
        await loadStudentRegistrationQueue();
    } catch (error) {
        alert(error.message || "Unable to process registration.");
    }
}

function showAdminSectionScreen(title, subtitle, content) {
    const dashboardMain = document.querySelector("main");

    if (!dashboardMain) {
        alert("Dashboard container not found.");
        return;
    }

    dashboardMain.innerHTML = `
        <section class="admin-section-screen">

            <div class="admin-section-header">
                <div>
                    <h2>${title}</h2>
                    <p>${subtitle}</p>
                </div>
            </div>

            <div class="admin-section-content">
                ${content}
            </div>

            <button
                type="button"
                class="admin-section-back-button"
                onclick="showDashboard()">
                ← BACK TO DASHBOARD
            </button>

        </section>
    `;

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


/* ---------------------------------------------------------
   STUDENT MANAGEMENT
   --------------------------------------------------------- */

function showStudentManagementScreen() {
    showAdminSectionScreen(
        "👨‍🎓 STUDENT MANAGEMENT",
        "Manage student accounts and student information.",
        `
            <div class="section-action-grid">

                <button
                    type="button"
                    class="section-action-card"
                    onclick="showAddStudent()">
                    <span>👨‍🎓</span>
                    <strong>Add Student</strong>
                    <small>Create a new student account</small>
                </button>

                <button
                    type="button"
                    class="section-action-card"
                    onclick="showStudents()">
                    <span>📋</span>
                    <strong>Students</strong>
                    <small>View and manage students</small>
                </button>

            </div>

            <div id="adminContent"></div>
        `
    );
}


/* ---------------------------------------------------------
   PASSWORD / PIN RESET
   --------------------------------------------------------- */

function showPasswordResetScreen() {
    const dashboardMain = document.querySelector("main");

    if (!dashboardMain) {
        alert("Dashboard container not found.");
        return;
    }

    dashboardMain.innerHTML = `
        <section class="admin-section-screen">
            <div class="admin-section-content">
                <div id="adminContent"></div>
            </div>
        </section>
    `;

    addPasswordPinResetEntry();

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


/* ---------------------------------------------------------
   RESULTS MANAGEMENT
   --------------------------------------------------------- */

function showResultsManagementScreen() {
    showAdminSectionScreen(
        "📄 RESULTS MANAGEMENT",
        "Upload, review and publish student examination results.",
        `
            <div class="section-action-grid">

                <button
                    type="button"
                    class="section-action-card"
                    onclick="showUploadResults()">
                    <span>📄</span>
                    <strong>Upload Results</strong>
                    <small>Add examination results</small>
                </button>

                <button
                    type="button"
                    class="section-action-card"
                    onclick="showAllPdfUploads()">
                    <span>📚</span>
                    <strong>All PDF Uploads</strong>
                    <small>Match and upload multiple student PDFs</small>
                </button>

                <button
                    type="button"
                    class="section-action-card"
                    onclick="showResultStatus()">
                    <span>📊</span>
                    <strong>Result Status</strong>
                    <small>Check uploaded results</small>
                </button>

                <button
                    type="button"
                    class="section-action-card"
                    onclick="showPublishResults()">
                    <span>📢</span>
                    <strong>Publish Results</strong>
                    <small>Make results available</small>
                </button>

                <button
                    type="button"
                    class="section-action-card"
                    onclick="showManageIndividualResults()">
                    <span>🗂️</span>
                    <strong>Manage Individual Results</strong>
                    <small>Unpublish or delete selected results</small>
                </button>

            </div>

            <div id="adminContent"></div>
        `
    );
}


/* ---------------------------------------------------------
   ACADEMIC MANAGEMENT
   --------------------------------------------------------- */

function showAcademicManagementScreen() {
    showAdminSectionScreen(
        "📅 ACADEMIC MANAGEMENT",
        "Manage academic years and school academic settings.",
        `
            <div class="section-action-grid">

                <button
                    type="button"
                    class="section-action-card"
                    onclick="showAcademicYears()">
                    <span>📅</span>
                    <strong>Academic Years</strong>
                    <small>Manage academic years</small>
                </button>


                <button
                    type="button"
                    class="section-action-card"
                    onclick="showAnnouncementsAdmin()">
                    <span>📢</span>
                    <strong>Announcements</strong>
                    <small>Publish messages for parents and students</small>
                </button>

            </div>

            <div id="adminContent"></div>
        `
    );
}


async function showMainAdminPanel() {
    const token = localStorage.getItem("MSA_ADMIN_TOKEN");

    if (!token) {
        alert("Administrator login required.");
        return;
    }

    let response;

    try {
        response = await fetch("/api/admin/users", {
            method: "GET",
            headers: {
                "Authorization": "Bearer " + token
            }
        });
    } catch (error) {
        alert("Unable to connect to the server.");
        return;
    }

    const data = await response.json();

    if (!response.ok || !data.ok) {
        alert(data.message || data.error || "Main Admin access required.");
        return;
    }

    /*
     * Main Administrator opens as its own dashboard screen.
     */

    const dashboardMain = document.querySelector("main");

    if (!dashboardMain) {
        alert("Dashboard container not found.");
        return;
    }

    dashboardMain.innerHTML = "";

    const panel = document.createElement("section");

    panel.id = "mainAdminPanel";
    panel.className = "main-admin-panel";

    const admins = Array.isArray(data.admins) ? data.admins : [];

    panel.innerHTML = `
        <div class="main-admin-card">

            <h2>👑 MAIN ADMINISTRATOR</h2>

            <p>
                <strong>Weston Mwashita</strong>
                — Administrator Management
            </p>

            <div class="main-admin-info">
                Manage administrator accounts, names, usernames,
                passwords and account status.
            </div>

            <div id="mainAdminUsers">

                ${
                    admins.map(admin => {

                        const isMain =
                            admin.role === "main_admin";

                        const active =
                            Number(admin.active) === 1;

                        return `
                            <div class="main-admin-card ${isMain ? "main-admin" : ""}">

                                <h3>
                                    ${isMain ? "👑 " : "👤 "}
                                    ${escapeHtml(admin.display_name || admin.username)}
                                </h3>

                                <p>
                                    <strong>Username:</strong>
                                    ${escapeHtml(admin.username)}
                                </p>

                                <p>
                                    <strong>Role:</strong>
                                    ${escapeHtml(admin.role)}
                                </p>

                                <p>
                                    <strong>Status:</strong>

                                    <span class="main-admin-status ${active ? "active" : "disabled"}">
                                        ${active ? "ACTIVE" : "DISABLED"}
                                    </span>
                                </p>

                                <p>
                                    <strong>Last Login:</strong>
                                    ${escapeHtml(admin.last_login_at || "Never")}
                                </p>

                                ${isMain
                                    ? `
                                        <div class="main-admin-actions">

                                            <div class="main-admin-protected">
                                                👑 MAIN ADMINISTRATOR
                                            </div>

                                            <button
                                                type="button"
                                                onclick="mainAdminEdit(${Number(admin.id)})">
                                                EDIT
                                            </button>

                                            <button
                                                type="button"
                                                onclick="mainAdminChangePassword(${Number(admin.id)})"
                                                class="password-button">
                                                CHANGE PASSWORD
                                            </button>

                                        </div>
                                    `
                                    : `
                                        <div class="main-admin-actions">

                                            <button
                                                type="button"
                                                onclick="mainAdminToggle(${Number(admin.id)}, ${active})"
                                                class="${active ? "disable-button" : "enable-button"}">
                                                ${active ? "DISABLE" : "ENABLE"}
                                            </button>

                                            <button
                                                type="button"
                                                onclick="mainAdminEdit(${Number(admin.id)})">
                                                EDIT
                                            </button>

                                            <button
                                                type="button"
                                                onclick="mainAdminChangePassword(${Number(admin.id)})"
                                                class="password-button">
                                                CHANGE PASSWORD
                                            </button>

                                            <button
                                                type="button"
                                                onclick="mainAdminRemove(${Number(admin.id)})"
                                                class="disable-button">
                                                REMOVE ADMINISTRATOR
                                            </button>

                                        </div>
                                    `
                                }

                            </div>
                        `;
                    }).join("")
                }

            </div>

            <div class="main-admin-screen-actions">

                <button
                    type="button"
                    onclick="mainAdminAdd()"
                    class="enable-button">
                    ➕ ADD ADMINISTRATOR
                </button>

                <button
                    type="button"
                    onclick="showMainAdminPanel()">
                    🔄 REFRESH ADMINISTRATORS
                </button>

                <button
                    type="button"
                    onclick="showDashboard()"
                    class="main-admin-back-button">
                    ← BACK TO DASHBOARD
                </button>

            </div>

        </div>
    `;

    const dashboard =
        document.querySelector(".dashboard") ||
        document.querySelector("#dashboard") ||
        document.body;

    /*
     * Keep Main Administrator inside the existing dashboard
     * without forcing the user's screen to jump.
     */
    dashboardMain.appendChild(panel);

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


async function mainAdminToggle(id, currentlyActive) {

    const token = localStorage.getItem("MSA_ADMIN_TOKEN");

    if (!token) {
        alert("Administrator login required.");
        return;
    }

    const action =
        currentlyActive
        ? "disable"
        : "enable";

    if (!confirm(
        currentlyActive
        ? "Disable this administrator account?"
        : "Enable this administrator account?"
    )) {
        return;
    }

    try {

        const response = await fetch(
            "/api/admin/users/" + id + "/" + action,
            {
                method: "POST",
                headers: {
                    "Authorization": "Bearer " + token,
                    "Content-Type": "application/json"
                }
            }
        );

        const data = await response.json();

        if (!response.ok || !data.ok) {
            alert(data.message || data.error || "Unable to update administrator.");
            return;
        }

        alert(data.message || "Administrator updated.");

        await showMainAdminPanel();

    } catch (error) {
        alert("Unable to connect to the server.");
    }
}


async function mainAdminEdit(id) {
    const token = localStorage.getItem("MSA_ADMIN_TOKEN");

    if (!token) {
        alert("Administrator login required.");
        return;
    }

    const username = prompt(
        "Enter the new administrator username:"
    );

    if (username === null) {
        return;
    }

    const cleanUsername = username.trim();

    if (!cleanUsername) {
        alert("Username cannot be empty.");
        return;
    }

    const displayName = prompt(
        "Enter the new administrator display name:"
    );

    if (displayName === null) {
        return;
    }

    const cleanDisplayName = displayName.trim();

    if (!cleanDisplayName) {
        alert("Display name cannot be empty.");
        return;
    }

    try {
        const response = await fetch(
            "/api/admin/users/" + id,
            {
                method: "PUT",
                headers: {
                    "Authorization": "Bearer " + token,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    username: cleanUsername,
                    display_name: cleanDisplayName
                })
            }
        );

        let data = {};

        try {
            data = await response.json();
        } catch (jsonError) {
            data = {};
        }

        if (!response.ok || !data.ok) {
            alert(
                data.message ||
                data.error ||
                "Unable to update administrator."
            );
            return;
        }

        alert(
            data.message ||
            "Administrator updated successfully."
        );

        await showMainAdminPanel();

    } catch (error) {
        console.error("MAIN ADMIN EDIT ERROR:", error);
        alert("Unable to connect to the server.");
    }
}

async function mainAdminChangePassword(id) {

    const token = localStorage.getItem("MSA_ADMIN_TOKEN");

    if (!token) {
        alert("Administrator login required.");
        return;
    }

    const password =
        prompt("Enter the new password:");

    if (password === null) {
        return;
    }

    if (password.length < 8) {
        alert("Password must contain at least 8 characters.");
        return;
    }

    const confirmPassword =
        prompt("Confirm the new password:");

    if (confirmPassword === null) {
        return;
    }

    if (password !== confirmPassword) {
        alert("Passwords do not match.");
        return;
    }

    try {

        const response = await fetch(
            "/api/admin/users/" + id + "/password",
            {
                method: "POST",
                headers: {
                    "Authorization": "Bearer " + token,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    password: password
                })
            }
        );

        const data = await response.json();

        if (!response.ok || !data.ok) {
            alert(data.message || data.error || "Unable to change password.");
            return;
        }

        alert(data.message || "Password changed successfully.");

        await showMainAdminPanel();

    } catch (error) {
        alert("Unable to connect to the server.");
    }
}


/* Make the function available to the existing dashboard buttons. */

async function mainAdminAdd() {
    const token = localStorage.getItem("MSA_ADMIN_TOKEN");
    if (!token) {
        alert("Administrator login required.");
        return;
    }

    const displayName = prompt("Enter the new administrator's display name:");
    if (displayName === null) return;
    if (!displayName.trim()) {
        alert("Display name cannot be empty.");
        return;
    }

    const username = prompt("Enter a unique username:");
    if (username === null) return;
    if (!username.trim()) {
        alert("Username cannot be empty.");
        return;
    }

    const password = prompt("Create a password (at least 8 characters):");
    if (password === null) return;
    if (password.length < 8) {
        alert("Password must contain at least 8 characters.");
        return;
    }

    const confirmPassword = prompt("Confirm the password:");
    if (confirmPassword === null) return;
    if (password !== confirmPassword) {
        alert("Passwords do not match.");
        return;
    }

    try {
        const response = await fetch("/api/admin/users", {
            method: "POST",
            headers: {
                "Authorization": "Bearer " + token,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                display_name: displayName.trim(),
                username: username.trim(),
                password: password
            })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) {
            alert(data.message || "Unable to create administrator.");
            return;
        }

        alert(data.message || "Administrator created successfully.");
        await showMainAdminPanel();
    } catch (error) {
        console.error("MAIN ADMIN ADD ERROR:", error);
        alert("Unable to connect to the server.");
    }
}

async function mainAdminRemove(id) {
    const token = localStorage.getItem("MSA_ADMIN_TOKEN");
    if (!token) {
        alert("Administrator login required.");
        return;
    }

    if (!confirm(
        "Remove this administrator account?\\n\\n" +
        "This cannot be undone. Student records, results and PDFs will not be deleted."
    )) {
        return;
    }

    try {
        const response = await fetch(
            "/api/admin/users/" + encodeURIComponent(id) + "/remove",
            {
                method: "POST",
                headers: {
                    "Authorization": "Bearer " + token,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({})
            }
        );

        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) {
            alert(data.message || "Unable to remove administrator.");
            return;
        }

        alert(data.message || "Administrator removed successfully.");
        await showMainAdminPanel();
    } catch (error) {
        console.error("MAIN ADMIN REMOVE ERROR:", error);
        alert("Unable to connect to the server.");
    }
}

window.showMainAdminPanel = showMainAdminPanel;
window.mainAdminAdd = mainAdminAdd;
window.mainAdminRemove = mainAdminRemove;
window.mainAdminToggle = mainAdminToggle;
window.mainAdminEdit = mainAdminEdit;
window.mainAdminChangePassword = mainAdminChangePassword;



/* ---------------------------------------------------------
   MANAGE INDIVIDUAL RESULTS
   --------------------------------------------------------- */

async function showManageIndividualResults() {
    let content = document.getElementById("adminContent");
    if (!content) {
        alert("Results screen container was not found.");
        return;
    }

    content.innerHTML = '<div class="admin-panel"><p>Loading results...</p></div>';

    await loadResults();

    content = document.getElementById("adminContent");
    if (!content) return;

    content.innerHTML = `
        <div class="admin-panel">
            <h2>Manage Individual Results</h2>
            <p class="muted">
                Unpublish a result to hide it while keeping its record and PDF.
                Delete only when you intend to remove the selected result.
            </p>

            <div class="section-action-grid">
                <button type="button" class="admin-button"
                    onclick="showManageIndividualResults()">
                    ↻ Refresh Results
                </button>
                <button type="button" class="admin-button"
                    onclick="unpublishAllResults()">
                    Unpublish All Results
                </button>
            </div>

            <div id="manageIndividualResultsList">
                ${renderManageIndividualResultsList()}
            </div>
        </div>
    `;
}

function renderManageIndividualResultsList() {
    if (!Array.isArray(results) || !results.length) {
        return '<p class="muted">No results available.</p>';
    }

    return results.map(result => {
        const id = Number(result.id);
        const name = escapeHtml(result.student_name || "Unknown student");
        const form = escapeHtml(result.form ?? result.class_name ?? "Unknown form");
        const term = escapeHtml(result.term || "Unknown term");
        const year = escapeHtml(result.academic_year ?? "Unknown year");
        const file = escapeHtml(result.file_name || "Result PDF");
        const published = result.published === true ||
            Number(result.published) === 1;

        if (!Number.isInteger(id) || id < 1) return "";

        return `
            <div class="result-row">
                <strong>${name}</strong>
                <p>Form/Class: ${form}</p>
                <p>Term: ${term} • Year: ${year}</p>
                <p>File: ${file}</p>
                <p>Status: <strong>${published ? "PUBLISHED" : "UNPUBLISHED"}</strong></p>

                <div class="section-action-grid">
                    ${published ? `
                        <button type="button" class="admin-button"
                            onclick="unpublishIndividualResult(${id})">
                            Unpublish
                        </button>
                    ` : `
                        <button type="button" class="admin-button" disabled>
                            Already Unpublished
                        </button>
                    `}
                    <button type="button" class="admin-button danger"
                        onclick="deleteIndividualResult(${id})">
                        Delete This Result
                    </button>
                </div>
            </div>
        `;
    }).join("");
}

async function manageResultPost(path) {
    const token = localStorage.getItem("MSA_ADMIN_TOKEN");
    if (!token) {
        throw new Error("Your administrator session has expired. Please log in again.");
    }

    const response = await fetch(path, {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({})
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
        throw new Error(data.message || "The result action failed.");
    }
    return data;
}

async function unpublishIndividualResult(id) {
    const result = results.find(item => Number(item.id) === Number(id));
    if (!result) {
        alert("Result not found. Refresh the list and try again.");
        return;
    }

    const details = `${result.student_name || "Unknown student"}\nForm: ${result.form ?? result.class_name ?? "Unknown"}\nTerm: ${result.term || "Unknown"}\nYear: ${result.academic_year ?? "Unknown"}`;

    if (!confirm(`Unpublish this result?\n\n${details}\n\nThe record and PDF will be kept.`)) return;

    try {
        const data = await manageResultPost(`/api/results/${Number(id)}/unpublish`);
        alert(data.message || "Result unpublished.");
        await showManageIndividualResults();
    } catch (error) {
        alert(error.message || "Could not unpublish result.");
    }
}

async function unpublishAllResults() {
    const count = results.filter(item =>
        item.published === true || Number(item.published) === 1
    ).length;

    if (!count) {
        alert("There are no published results to unpublish.");
        return;
    }

    if (!confirm(`Unpublish all ${count} currently published result(s)?\n\nAll result records and PDFs will be kept. Students will no longer be able to view published results.`)) return;

    try {
        const data = await manageResultPost("/api/results/unpublish-all");
        alert(data.message || "All results unpublished.");
        await showManageIndividualResults();
    } catch (error) {
        alert(error.message || "Could not unpublish all results.");
    }
}

async function deleteIndividualResult(id) {
    const result = results.find(item => Number(item.id) === Number(id));
    if (!result) {
        alert("Result not found. Refresh the list and try again.");
        return;
    }

    const details = `${result.student_name || "Unknown student"}\nForm: ${result.form ?? result.class_name ?? "Unknown"}\nTerm: ${result.term || "Unknown"}\nYear: ${result.academic_year ?? "Unknown"}\nFile: ${result.file_name || "Unknown file"}`;

    if (!confirm(`DELETE THIS RESULT?\n\n${details}\n\nThis removes the selected result record and attempts to remove its PDF. This action cannot be undone.`)) return;

    if (!confirm("Final confirmation: permanently delete this result?")) return;

    try {
        const data = await manageResultPost(`/api/results/${Number(id)}/delete`);
        alert(
            (data.message || "Result deleted.") +
            (data.file_removed ? "\nAssociated PDF removed." :
                "\nThe result record was deleted. The PDF may not have been found in the managed results folder.")
        );
        await showManageIndividualResults();
        if (typeof loadStats === "function") await loadStats();
    } catch (error) {
        alert(error.message || "Could not delete result.");
    }
}


/* ---------------------------------------------------------
   MSA PORTAL ANNOUNCEMENTS
   --------------------------------------------------------- */

window.msaEditingAnnouncementId = null;

function msaAnnouncementEscape(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
        return {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[c];
    });
}

function showAnnouncementsAdmin() {
    showAdminSectionScreen(
        "📢 ANNOUNCEMENTS",
        "Publish and manage messages shown to parents and students.",
        `
            <div class="section-action-grid">
                <button type="button" class="section-action-card"
                    onclick="msaResetAnnouncementForm()">
                    <span>➕</span>
                    <strong>New Announcement</strong>
                    <small>Write a new message</small>
                </button>
            </div>

            <div id="msaAnnouncementEditor"
                 style="margin-top:18px;padding:16px;border:1px solid #ddd;border-radius:12px;">
                <h3 id="msaAnnouncementFormHeading">Publish Announcement</h3>

                <label for="msaAnnouncementType">Announcement type</label>
                <select id="msaAnnouncementType"
                    style="display:block;width:100%;padding:12px;margin:8px 0 14px;">
                    <option value="results_coming_soon">Results Coming Soon</option>
                    <option value="results_are_out">Results Are Out</option>
                </select>

                <label for="msaAnnouncementTitle">Title</label>
                <input id="msaAnnouncementTitle" maxlength="120"
                    placeholder="Announcement title"
                    style="display:block;width:100%;box-sizing:border-box;padding:12px;margin:8px 0 14px;">

                <label for="msaAnnouncementMessage">Message</label>
                <textarea id="msaAnnouncementMessage" maxlength="2000" rows="4"
                    placeholder="Write the message for parents and students"
                    style="display:block;width:100%;box-sizing:border-box;padding:12px;margin:8px 0 14px;"></textarea>

                <button type="button" class="primary-button"
                    onclick="msaSaveAnnouncement()">PUBLISH ANNOUNCEMENT</button>
                <button type="button" class="secondary-button"
                    onclick="msaResetAnnouncementForm()">CLEAR FORM</button>
                <p id="msaAnnouncementStatus" role="status"></p>
            </div>

            <div id="msaAnnouncementList" style="margin-top:22px;">
                <p>Loading announcements...</p>
            </div>
        `
    );

    msaLoadAdminAnnouncements();
}

function msaResetAnnouncementForm() {
    window.msaEditingAnnouncementId = null;

    const type = document.getElementById("msaAnnouncementType");
    const title = document.getElementById("msaAnnouncementTitle");
    const message = document.getElementById("msaAnnouncementMessage");
    const heading = document.getElementById("msaAnnouncementFormHeading");
    const status = document.getElementById("msaAnnouncementStatus");

    if (type) type.value = "results_coming_soon";
    if (title) title.value = "";
    if (message) message.value = "";
    if (heading) heading.textContent = "Publish Announcement";
    if (status) status.textContent = "";

    const submit = document.querySelector(
        '#msaAnnouncementEditor button[onclick="msaSaveAnnouncement()"]'
    );
    if (submit) submit.textContent = "PUBLISH ANNOUNCEMENT";
}

async function msaLoadAdminAnnouncements() {
    const target = document.getElementById("msaAnnouncementList");
    if (!target) return;

    const token = localStorage.getItem("MSA_ADMIN_TOKEN");
    if (!token) {
        target.textContent = "Administrator login required.";
        return;
    }

    try {
        const response = await fetch("/api/admin/announcements", {
            headers: { "Authorization": "Bearer " + token }
        });
        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(data.message || "Could not load announcements.");
        }

        // Keep announcement values out of inline JavaScript arguments.
        window.msaAnnouncementsCache = data.announcements;

        if (!data.announcements.length) {
            target.innerHTML = "<p>No announcements have been created yet.</p>";
            return;
        }

        target.innerHTML = `
            <h3>Manage Announcements</h3>
            ${data.announcements.map(function (item) {
                const typeLabel = item.announcement_type === "results_are_out"
                    ? "Results Are Out" : "Results Coming Soon";

                return `
                    <article style="padding:14px;margin:12px 0;border:1px solid #ddd;border-radius:12px;">
                        <strong>${msaAnnouncementEscape(item.title)}</strong>
                        <p>${msaAnnouncementEscape(item.message).replace(/\n/g, "<br>")}</p>
                        <small>${typeLabel} · ${Number(item.active) === 1 ? "Active" : "Disabled"}</small>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
                            <button type="button" class="secondary-button"
                                onclick="msaEditAnnouncementById(${Number(item.id)})">
                                EDIT
                            </button>
                            ${Number(item.active) === 1 ? `
                                <button type="button" class="secondary-button"
                                    onclick="msaDisableAnnouncement(${Number(item.id)})">
                                    DISABLE
                                </button>` : `
                                <button type="button" class="secondary-button"
                                    onclick="msaActivateAnnouncement(${Number(item.id)})">
                                    ACTIVATE
                                </button>`}
                        </div>
                    </article>
                `;
            }).join("")}
        `;
    } catch (error) {
        target.textContent = error.message || "Unable to load announcements.";
    }
}

function msaEditAnnouncementById(id) {
    const item = (window.msaAnnouncementsCache || []).find(function (entry) {
        return Number(entry.id) === Number(id);
    });

    if (!item) {
        alert("Could not find that announcement. Please reload the list.");
        return;
    }

    msaEditAnnouncement(
        item.id,
        item.announcement_type,
        item.title,
        item.message
    );
}

function msaEditAnnouncement(id, type, title, message) {
    window.msaEditingAnnouncementId = Number(id);

    document.getElementById("msaAnnouncementType").value = type;
    document.getElementById("msaAnnouncementTitle").value = title;
    document.getElementById("msaAnnouncementMessage").value =
        message.replace(/\\n/g, "\n");

    document.getElementById("msaAnnouncementFormHeading").textContent =
        "Edit Announcement #" + id;

    document.getElementById("msaAnnouncementStatus").textContent =
        "Editing announcement #" + id;

    const submit = document.querySelector(
        '#msaAnnouncementEditor button[onclick="msaSaveAnnouncement()"]'
    );
    if (submit) submit.textContent = "SAVE CHANGES";

    document.getElementById("msaAnnouncementEditor").scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

async function msaSaveAnnouncement() {
    const status = document.getElementById("msaAnnouncementStatus");
    const token = localStorage.getItem("MSA_ADMIN_TOKEN");

    const type = document.getElementById("msaAnnouncementType").value;
    const title = document.getElementById("msaAnnouncementTitle").value.trim();
    const message = document.getElementById("msaAnnouncementMessage").value.trim();

    if (!token) {
        status.textContent = "Administrator login required.";
        return;
    }

    if (!title || !message) {
        status.textContent = "Enter both a title and a message.";
        return;
    }

    const editingId = window.msaEditingAnnouncementId;

    const payload = {
        action: editingId ? "edit" : "create",
        announcement_type: type,
        title: title,
        message: message
    };

    if (editingId) payload.id = editingId;

    status.textContent = "Saving...";

    try {
        const response = await fetch("/api/admin/announcements", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(data.message || "Could not save announcement.");
        }

        status.textContent = data.message || "Saved successfully.";
        msaResetAnnouncementForm();
        document.getElementById("msaAnnouncementStatus").textContent =
            data.message || "Saved successfully.";
        await msaLoadAdminAnnouncements();
    } catch (error) {
        status.textContent = error.message || "Unable to save announcement.";
    }
}

async function msaActivateAnnouncement(id) {
    if (!confirm("Activate this announcement for parents and students?")) {
        return;
    }

    const token = localStorage.getItem("MSA_ADMIN_TOKEN");
    if (!token) {
        alert("Administrator login required.");
        return;
    }

    try {
        const response = await fetch("/api/admin/announcements", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token
            },
            body: JSON.stringify({
                action: "activate",
                id: Number(id)
            })
        });

        const data = await response.json();
        if (!response.ok || !data.ok) {
            throw new Error(data.message || "Could not activate announcement.");
        }

        alert(data.message || "Announcement activated.");
        await msaLoadAdminAnnouncements();
    } catch (error) {
        alert(error.message || "Unable to activate announcement.");
    }
}

async function msaDisableAnnouncement(id) {
    if (!confirm("Disable this announcement for parents and students?")) {
        return;
    }

    const token = localStorage.getItem("MSA_ADMIN_TOKEN");
    if (!token) {
        alert("Administrator login required.");
        return;
    }

    try {
        const response = await fetch("/api/admin/announcements", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token
            },
            body: JSON.stringify({ action: "disable", id: Number(id) })
        });

        const data = await response.json();
        if (!response.ok || !data.ok) {
            throw new Error(data.message || "Could not disable announcement.");
        }

        alert(data.message || "Announcement disabled.");
        await msaLoadAdminAnnouncements();
    } catch (error) {
        alert(error.message || "Unable to disable announcement.");
    }
}




/* =========================================================
   ALL PDF UPLOADS — ADDITIVE FEATURE
   Uses the existing /api/results upload endpoint.
   Uploaded results remain unpublished until explicitly
   published from this batch screen.
   ========================================================= */

window.msaBatchPdfItems = window.msaBatchPdfItems || [];
window.msaBatchPendingResultIds =
    window.msaBatchPendingResultIds || [];

function msaBatchNormalizeName(value) {
    return String(value || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");
}

function showAllPdfUploads() {
    const content = document.getElementById("adminContent");
    if (!content) return;

    content.innerHTML = `
        <div class="admin-panel">
            <button type="button"
                class="admin-button"
                onclick="showResultsManagementScreen()">
                ← Back to Results Management
            </button>

            <h2>All PDF Uploads</h2>
            <p>Select multiple student result PDFs. Filenames are
            matched against registered student names.</p>

            <label>Academic Year</label>
            <select id="allPdfYear" class="admin-select">
                ${getAcademicYearOptions()}
            </select>

            <label>Term</label>
            <select id="allPdfTerm" class="admin-select">
                <option value="Term 1">Term 1</option>
                <option value="Term 2">Term 2</option>
                <option value="Term 3">Term 3</option>
            </select>

            <label>Select PDF files</label>
            <input id="allPdfFiles"
                type="file"
                accept=".pdf,application/pdf"
                multiple
                class="admin-input"
                onchange="prepareAllPdfUploads()">

            <p><small>Each PDF must be 10 MiB or smaller.
            Uploading does not publish results.</small></p>

            <div id="allPdfReview"></div>

            <button type="button"
                class="admin-button"
                onclick="uploadAllPdfBatch()">
                Upload Matched PDFs
            </button>

            <button type="button"
                class="admin-button"
                onclick="publishAllPdfBatch()">
                Publish Uploaded Batch
            </button>

            <p id="allPdfMessage" role="status"></p>
        </div>
    `;

    renderAllPdfBatchReview();
}

function prepareAllPdfUploads() {
    const input = document.getElementById("allPdfFiles");
    if (!input) return;

    const files = Array.from(input.files || []);
    const registered = Array.isArray(students) ? students : [];

    window.msaBatchPdfItems = files.map(file => {
        const stem = file.name.replace(/\.pdf$/i, "");
        const normalizedFile = msaBatchNormalizeName(stem);

        const named = registered.filter(student => {
            const name = msaBatchNormalizeName(student.name);
            return name && normalizedFile.includes(name);
        });

        const exact = named.filter(student =>
            msaBatchNormalizeName(student.name) === normalizedFile
        );

        const candidates = exact.length ? exact : named;

        return {
            file,
            studentId: candidates.length === 1
                ? String(candidates[0].id)
                : "",
            uploaded: false,
            candidates: candidates.map(student => student.id)
        };
    });

    renderAllPdfBatchReview();
}

function setBatchPdfStudent(index, studentId) {
    const item = window.msaBatchPdfItems[index];
    if (!item) return;
    item.studentId = String(studentId || "");
    renderAllPdfBatchReview();
}

function renderAllPdfBatchReview() {
    const area = document.getElementById("allPdfReview");
    if (!area) return;

    const items = window.msaBatchPdfItems || [];
    const registered = Array.isArray(students) ? students : [];

    if (!items.length) {
        area.innerHTML = "<p>No PDFs selected yet.</p>";
        return;
    }

    area.innerHTML = `
        <h3>Review files (${items.length})</h3>
        ${items.map((item, index) => {
            const options = registered.map(student => `
                <option value="${escapeHtml(String(student.id))}"
                    ${String(item.studentId) === String(student.id)
                        ? "selected" : ""}>
                    ${escapeHtml(student.name)}
                    — Form ${escapeHtml(String(
                        student.form || student.class_name || "?"
                    ))}
                </option>
            `).join("");

            const student = registered.find(s =>
                String(s.id) === String(item.studentId)
            );

            let status = item.uploaded
                ? "Uploaded — not necessarily published"
                : student ? "Matched — ready for review" :
                "Needs manual matching";

            if (item.file.size > 10 * 1024 * 1024) {
                status = "Too large — maximum 10 MiB";
            }

            return `
                <div class="admin-panel">
                    <p><strong>${escapeHtml(item.file.name)}</strong></p>
                    <p>${escapeHtml(status)}</p>
                    <label>Student</label>
                    <select class="admin-select"
                        ${item.uploaded ? "disabled" : ""}
                        onchange="setBatchPdfStudent(${index}, this.value)">
                        <option value="">Choose student</option>
                        ${options}
                    </select>
                </div>
            `;
        }).join("")}
        <p>Review every match carefully before uploading.</p>
    `;
}

function msaReadPdfAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            const result = String(reader.result || "");
            const comma = result.indexOf(",");
            if (comma < 0) {
                reject(new Error("Could not read " + file.name));
                return;
            }
            resolve(result.slice(comma + 1));
        };

        reader.onerror = () =>
            reject(new Error("Could not read " + file.name));

        reader.readAsDataURL(file);
    });
}

async function uploadAllPdfBatch() {
    const items = window.msaBatchPdfItems || [];
    const year = document.getElementById("allPdfYear");
    const term = document.getElementById("allPdfTerm");
    const message = document.getElementById("allPdfMessage");

    if (!year || !term || !message) return;

    const pending = items.filter(item => !item.uploaded);

    if (!pending.length) {
        message.textContent = "There are no new PDFs to upload.";
        return;
    }

    if (pending.some(item =>
        !item.studentId ||
        item.file.size > 10 * 1024 * 1024 ||
        !/\.pdf$/i.test(item.file.name)
    )) {
        message.textContent =
            "Resolve unmatched files and remove invalid or oversized PDFs.";
        return;
    }

    const ids = pending.map(item => item.studentId);
    if (new Set(ids).size !== ids.length) {
        message.textContent =
            "A student is selected more than once. Check the matches first.";
        return;
    }

    if (!confirm(
        "Upload " + pending.length +
        " PDFs for " + year.value + ", " + term.value +
        " as UNPUBLISHED results?"
    )) return;

    let success = 0;
    const failures = [];

    for (const item of pending) {
        try {
            const base64 = await msaReadPdfAsBase64(item.file);

            const response = await fetch("/api/results", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    student_id: Number(item.studentId),
                    academic_year: Number(year.value),
                    term: term.value,
                    file_name: item.file.name,
                    file_data: base64
                })
            });

            const data = await response.json();

            if (!response.ok || !data.ok) {
                failures.push(item.file.name + ": " +
                    (data.message || "Upload failed"));
                continue;
            }

            item.uploaded = true;
            success++;

            if (data.result_id != null) {
                window.msaBatchPendingResultIds.push(
                    Number(data.result_id)
                );
            }
        } catch (error) {
            failures.push(item.file.name + ": " + error.message);
        }
    }

    renderAllPdfBatchReview();

    message.textContent =
        success + " PDF(s) uploaded as unpublished results. " +
        failures.length + " failed.";

    if (failures.length) {
        alert("Upload report:\n" + failures.join("\n"));
    }

    if (typeof loadResults === "function") await loadResults();
    if (typeof loadStats === "function") loadStats();
}

async function publishAllPdfBatch() {
    const ids = [...new Set(
        (window.msaBatchPendingResultIds || [])
            .map(Number)
            .filter(id => Number.isInteger(id) && id > 0)
    )];

    const message = document.getElementById("allPdfMessage");
    if (!ids.length) {
        if (message) message.textContent =
            "No uploaded batch result IDs are waiting to be published.";
        return;
    }

    if (!confirm(
        "Publish only these " + ids.length +
        " result(s) from this batch? This makes them available to students."
    )) return;

    let published = 0;
    const failed = [];

    for (const id of ids) {
        try {
            const response = await fetch(
                "/api/results/" + id + "/publish",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: "{}"
                }
            );

            const data = await response.json();

            if (!response.ok || !data.ok) {
                failed.push(id + ": " +
                    (data.message || "Publish failed"));
                continue;
            }

            published++;
            window.msaBatchPendingResultIds =
                window.msaBatchPendingResultIds.filter(
                    pendingId => Number(pendingId) !== id
                );
        } catch (error) {
            failed.push(id + ": " + error.message);
        }
    }

    if (message) {
        message.textContent = published +
            " result(s) published. " + failed.length +
            " failed; failed IDs remain available for retry.";
    }

    if (failed.length) {
        alert("Publishing report:\n" + failed.join("\n"));
    }

    if (typeof loadResults === "function") await loadResults();
    if (typeof loadStats === "function") loadStats();
}



/* MSA FULL-SCREEN CHILD NAVIGATION */


/* MSA FULL-SCREEN CHILD NAVIGATION
   Opens dashboard-card actions in a standalone screen.
   Keeps existing feature functions and data requests intact.
*/
(function installMsaFullScreenNavigation() {
    if (window.msaFullScreenNavigationInstalled) return;
    window.msaFullScreenNavigationInstalled = true;

    window.msaOpenStandaloneFeature = function(title, feature, parent) {
        const main = document.querySelector("main");
        if (!main || typeof feature !== "function") {
            alert("Unable to open this screen.");
            return;
        }

        window.msaCurrentFeatureParent = parent;

        main.innerHTML = `
            <section class="admin-section-screen">
                <div class="admin-section-header">
                    <div>
                        <h2>${escapeHtml(title)}</h2>
                        <p>Manage this section independently.</p>
                    </div>
                </div>

                <div class="admin-section-content">
                    <div id="adminContent"></div>
                </div>

                <button type="button"
                    class="admin-section-back-button"
                    onclick="msaReturnToFeatureParent()">
                    ← BACK
                </button>
            </section>
        `;

        window.scrollTo({ top: 0, behavior: "smooth" });

        try {
            const result = feature();
            if (result && typeof result.catch === "function") {
                result.catch(error => {
                    console.error("Could not open admin feature:", error);
                });
            }
        } catch (error) {
            console.error("Could not open admin feature:", error);
            const content = document.getElementById("adminContent");
            if (content) {
                content.textContent =
                    "This screen could not be loaded. Please return and try again.";
            }
        }
    };

    window.msaReturnToFeatureParent = function() {
        const parent = window.msaCurrentFeatureParent;
        if (typeof parent === "function") {
            parent();
        } else if (typeof showDashboard === "function") {
            showDashboard();
        }
    };

    document.addEventListener("click", function(event) {
        const target = event.target;
        if (!target || typeof target.closest !== "function") return;

        const card = target.closest(
            ".admin-section-screen .section-action-card"
        );
        if (!card) return;

        const screen = card.closest(".admin-section-screen");
        if (!screen || !screen.querySelector("#adminContent")) return;

        const inlineAction = card.getAttribute("onclick") || "";
        const match = inlineAction.match(
            /^\s*([A-Za-z_$][\w$]*)\s*\(\s*\)\s*;?\s*$/
        );
        if (!match) return;

        const feature = window[match[1]];
        if (typeof feature !== "function") return;

        const titleNode = card.querySelector("strong");
        const title = titleNode
            ? titleNode.textContent.trim()
            : "Admin Feature";

        const heading = screen.querySelector(".admin-section-header h2");
        const headingText = heading
            ? heading.textContent.toUpperCase()
            : "";

        let parent = null;

        if (headingText.includes("RESULTS MANAGEMENT")) {
            parent = window.showResultsManagementScreen;
        } else if (headingText.includes("STUDENT MANAGEMENT")) {
            parent = window.showStudentManagementScreen;
        } else if (headingText.includes("ACADEMIC MANAGEMENT")) {
            parent = window.showAcademicManagementScreen;
        }

        if (typeof parent !== "function") {
            parent = window.showDashboard;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        window.msaOpenStandaloneFeature(title, feature, parent);
    }, true);
})();


/* MSA_BATCH_STUDENT_DELETE_V1
   Additive bulk student selection and deletion.
   Existing individual student actions are preserved.
*/
(function installMsaBatchStudentDelete() {
    if (window.msaBatchStudentDeleteInstalled) return;
    window.msaBatchStudentDeleteInstalled = true;

    window.msaSelectedStudentIds =
        window.msaSelectedStudentIds instanceof Set
            ? window.msaSelectedStudentIds
            : new Set();

    window.msaStudentBulkVisibleIds = [];

    window.showStudents = function () {
        const content = document.getElementById("adminContent");
        if (!content) {
            alert("Student Management screen was not found.");
            return;
        }

        content.innerHTML = `
            <div class="admin-panel">
                <h2>Students</h2>

                <input
                    id="studentSearch"
                    class="admin-input"
                    placeholder="Search student name..."
                    oninput="filterStudents()"
                >

                <!-- MSA_STUDENT_FORM_FILTER_SORT_V1 -->
                <label for="studentFormFilter" style="display:block;margin:12px 0 6px;">
                    FILTER BY FORM
                </label>
                <select
                    id="studentFormFilter"
                    class="admin-input"
                    onchange="filterStudents()"
                >
                    <option value="" selected disabled>Select a form to view students</option>
                    <option value="all">All Forms</option>
                    <option value="1">Form 1</option>
                    <option value="2">Form 2</option>
                    <option value="3">Form 3</option>
                    <option value="4">Form 4</option>
                    <option value="5">Form 5</option>
                    <option value="6">Form 6</option>
                </select>

                <div style="display:flex;gap:8px;flex-wrap:wrap;margin:14px 0;">
                    <button type="button" class="admin-button"
                        onclick="selectVisibleStudents()">
                        SELECT ALL VISIBLE
                    </button>
                    <button type="button" class="admin-button"
                        onclick="deselectAllStudents()">
                        DESELECT ALL
                    </button>
                    <button type="button" class="admin-button danger"
                        id="deleteSelectedStudentsButton"
                        onclick="deleteSelectedStudents()">
                        DELETE SELECTED (0)
                    </button>
                </div>

                <!-- MSA_FAST_BULK_FORM_CHANGE_V1 -->
                <label for="bulkDestinationForm"
                    style="display:block;margin:12px 0 6px;">
                    CHANGE SELECTED STUDENTS TO FORM
                </label>
                <select id="bulkDestinationForm" class="admin-input">
                    <option value="">Select destination form</option>
                    <option value="1">Form 1</option>
                    <option value="2">Form 2</option>
                    <option value="3">Form 3</option>
                    <option value="4">Form 4</option>
                    <option value="5">Form 5</option>
                    <option value="6">Form 6</option>
                </select>
                <button type="button" class="admin-button"
                    id="changeSelectedStudentFormButton"
                    onclick="changeSelectedStudentForm()" disabled>
                    CHANGE FORM (0)
                </button>

                <p id="studentBulkSelectionCount" class="muted">
                    Select students from the search results.
                </p>

                <div id="studentsList">
                    Start typing a student name to search.
                </div>
            </div>
        `;

        window.msaStudentBulkVisibleIds = [];
        filterStudents();
        updateStudentBulkSelectionCount();
    };

    window.renderStudents = function (list) {
        const container = document.getElementById("studentsList");
        if (!container) return;

        if (!Array.isArray(list)) {
            const search = String(
                document.getElementById("studentSearch")?.value || ""
            ).trim().toLowerCase();

            list = search
                ? (Array.isArray(students) ? students : []).filter(student =>
                    String(student.name || "").toLowerCase().includes(search)
                  )
                : [];
        }

        window.msaStudentBulkVisibleIds = list
            .map(student => Number(student.id))
            .filter(id => Number.isInteger(id) && id > 0);

        if (list.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    No students to display. Search for a student by name.
                </div>
            `;
            updateStudentBulkSelectionCount();
            return;
        }

        container.innerHTML = list.map(student => {
            const id = Number(student.id);
            const status = String(student.status || "Active").trim();
            const disabled = status.toLowerCase() === "disabled";
            const checked = window.msaSelectedStudentIds.has(id)
                ? "checked"
                : "";

            return `
                <div class="student-row msa-student-row-layout">
                    <label class="msa-student-identity">
                        <input
                            type="checkbox"
                            data-student-bulk-id="${id}"
                            ${checked}
                            onchange="toggleStudentBulkSelection(${id}, this.checked)"
                            aria-label="Select ${escapeHtml(student.name)}"
                            class="msa-student-checkbox"
                        >
                        <span class="msa-student-information">
                            <strong class="msa-student-full-name">${escapeHtml(student.name || "")}</strong>
                            ${checked ? '<span class="msa-student-new-tag">NEW</span>' : ''}
                            <span class="msa-student-id-badge">
                                STUDENT ID: ${escapeHtml(student.student_id_code || "NOT ASSIGNED")}
                            </span>
                            <span class="muted msa-student-meta">
                                Form ${escapeHtml(String(student.form ?? ""))}
                                • ${escapeHtml(student.class_name || "")}
                            </span>
                            <span class="msa-student-status">
                                Status: <strong>${escapeHtml(status)}</strong>
                            </span>
                        </span>
                    </label>

                    <div class="msa-student-actions">
                        <button class="admin-button" type="button"
                            onclick="editStudent(${id})">EDIT</button>

                        <button class="admin-button" type="button"
                            onclick="resetStudentPassword(${id})">RESET PASSWORD</button>

                        <button class="admin-button" type="button"
                            onclick="toggleStudentStatus(${id})">
                            ${disabled ? "ACTIVATE" : "DISABLE"}
                        </button>

                        <button class="admin-button danger" type="button"
                            onclick="deleteStudent(${id})">DELETE</button>
                    </div>
                </div>
            `;
        }).join("");

        updateStudentBulkSelectionCount();
    };

    window.filterStudents = function () {
        const search = String(
            document.getElementById("studentSearch")?.value || ""
        ).trim().toLocaleLowerCase();

        const selectedForm = String(
            document.getElementById("studentFormFilter")?.value ?? ""
        );

        // MSA_FORM_SELECTION_REQUIRED_V1
        if (!selectedForm) {
            window.msaStudentBulkVisibleIds = [];
            const container = document.getElementById("studentsList");
            if (container) {
                container.innerHTML =
                    '<p class="muted">Select a form to view students.</p>';
            }
            updateStudentBulkSelectionCount();
            return;
        }

        const source = Array.isArray(students) ? students : [];

        const filtered = source.filter(student => {
            const nameMatches = String(student.name || "")
                .toLocaleLowerCase()
                .includes(search);

            const studentForm = String(student.form ?? "").trim();
            const formMatches =
                selectedForm === "all" || studentForm === selectedForm;

            return nameMatches && formMatches;
        });

        filtered.sort((a, b) =>
            String(a.name || "").localeCompare(
                String(b.name || ""),
                undefined,
                { sensitivity: "base" }
            )
        );

        window.renderStudents(filtered);
    };

    window.toggleStudentBulkSelection = function (id, checked) {
        id = Number(id);
        if (!Number.isInteger(id) || id <= 0) return;

        if (checked) {
            window.msaSelectedStudentIds.add(id);
        } else {
            window.msaSelectedStudentIds.delete(id);
        }

        // Re-render so the NEW tag updates immediately.
        window.filterStudents();
        updateStudentBulkSelectionCount();
    };

    window.selectVisibleStudents = function () {
        window.msaStudentBulkVisibleIds.forEach(id => {
            window.msaSelectedStudentIds.add(Number(id));
        });

        window.filterStudents();
    };

    window.deselectAllStudents = function () {
        window.msaSelectedStudentIds.clear();

        window.filterStudents();
        updateStudentBulkSelectionCount();
    };

    window.updateStudentBulkSelectionCount = function () {
        const count = window.msaSelectedStudentIds.size;
        const button = document.getElementById("deleteSelectedStudentsButton");
        const label = document.getElementById("studentBulkSelectionCount");

        if (button) {
            button.textContent = `DELETE SELECTED (${count})`;
            button.disabled = count === 0;
        }

        const changeButton =
            document.getElementById("changeSelectedStudentFormButton");
        if (changeButton) {
            changeButton.textContent = `CHANGE FORM (${count})`;
            changeButton.disabled = count === 0;
        }

        if (label) {
            label.textContent =
                `${count} student(s) selected. ` +
                "Select All Visible applies only to the current search results.";
        }
    };

    window.changeSelectedStudentForm = async function () {
        const ids = Array.from(window.msaSelectedStudentIds)
            .map(Number)
            .filter(id => Number.isInteger(id) && id > 0);

        const destination = String(
            document.getElementById("bulkDestinationForm")?.value || ""
        );

        const currentForm = String(
            document.getElementById("studentFormFilter")?.value || ""
        );

        if (!currentForm) {
            alert("Select a form first, then search and select students.");
            return;
        }
        if (!ids.length) {
            alert("Select at least one student first.");
            return;
        }
        if (!/^[1-6]$/.test(destination)) {
            alert("Choose a destination form from Form 1 to Form 6.");
            return;
        }

        const allStudents = Array.isArray(students) ? students : [];
        const selected = ids.map(id =>
            allStudents.find(student => Number(student.id) === id)
        );

        if (selected.some(student => !student)) {
            alert("Some selected students could not be found. Refresh and try again.");
            return;
        }

        if (currentForm !== "all" &&
            selected.some(student => String(student.form ?? "").trim() !== currentForm)) {
            alert(
                "Your selection includes students from another form. " +
                "Select one form and choose students from that form only."
            );
            return;
        }

        const changes = selected.filter(
            student => String(student.form ?? "").trim() !== destination
        );

        if (!changes.length) {
            alert("All selected students are already in Form " + destination + ".");
            return;
        }

        const summary = changes.map(student =>
            `• ${student.name}: Form ${student.form} → Form ${destination}`
        ).join("\n");

        if (!confirm(
            `CONFIRM BULK FORM CHANGE\n\n${summary}\n\n` +
            "Student IDs, passwords/PINs and previous results will be kept.\n" +
            "Continue?"
        )) return;

        const button = document.getElementById("changeSelectedStudentFormButton");
        if (button) {
            button.disabled = true;
            button.textContent = "UPDATING...";
        }

        let updated = 0;
        const failures = [];

        try {
            for (const student of changes) {
                try {
                    const response = await fetch(API + "/students/update", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            student_id: Number(student.id),
                            name: String(student.name || "").trim(),
                            form: Number(destination),
                            class_name: String(student.class_name || "").trim() ||
                                `Form ${destination}`
                        })
                    });

                    let result = {};
                    try { result = await response.json(); } catch (_) {}

                    if (!response.ok || !result.ok) {
                        failures.push(
                            `${student.name}: ${result.message || "Update failed"}`
                        );
                        continue;
                    }

                    updated++;
                    window.msaSelectedStudentIds.delete(Number(student.id));
                } catch (_) {
                    failures.push(`${student.name}: connection error`);
                }
            }

            await loadStudents();
            window.filterStudents();

            let message = `Bulk form change finished.\n\nUpdated: ${updated}\nFailed: ${failures.length}`;
            if (failures.length) {
                message += "\n\nUnsuccessful updates:\n" +
                    failures.slice(0, 10).join("\n");
                if (failures.length > 10) {
                    message += `\n…and ${failures.length - 10} more.`;
                }
            }
            alert(message);
        } catch (error) {
            console.error("Bulk form change error:", error);
            alert(
                "The refresh failed after the update attempt. " +
                "Reload Student Management and verify the students' forms."
            );
        } finally {
            updateStudentBulkSelectionCount();
        }
    };

    window.deleteSelectedStudents = async function () {
        const ids = Array.from(window.msaSelectedStudentIds);
        if (ids.length === 0) {
            alert("Select at least one student first.");
            return;
        }

        const selectedStudents = ids.map(id =>
            (Array.isArray(students) ? students : []).find(
                student => Number(student.id) === id
            )
        ).filter(Boolean);

        if (selectedStudents.length !== ids.length) {
            alert(
                "Some selected students could not be found in the current list. " +
                "Refresh the student list before continuing."
            );
            return;
        }

        const names = selectedStudents
            .map(student => `• ${student.name} (Form ${student.form})`)
            .join("\n");

        const confirmed = confirm(
            `CONFIRM BULK STUDENT DELETION\n\n` +
            `You selected ${ids.length} student(s):\n\n${names}\n\n` +
            "Students with result records will NOT be deleted. Their results " +
            "and PDF history will be preserved. Disable those students instead.\n\n" +
            "Students without result records can still be permanently deleted.\n\n" +
            "Continue?"
        );

        if (!confirmed) return;

        const button = document.getElementById("deleteSelectedStudentsButton");
        if (button) {
            button.disabled = true;
            button.textContent = "DELETING...";
        }

        let deleted = 0;
        const failures = [];

        try {
            for (const student of selectedStudents) {
                try {
                    const response = await fetch(API + "/students/delete", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            student_id: Number(student.id)
                        })
                    });

                    const data = await response.json();

                    if (!response.ok || !data.ok) {
                        failures.push(
                            `${student.name}: ${data.message || "Deletion failed"}`
                        );
                        continue;
                    }

                    deleted++;
                    window.msaSelectedStudentIds.delete(Number(student.id));
                } catch (error) {
                    failures.push(`${student.name}: connection error`);
                }
            }

            await loadStudents();

            const search = document.getElementById("studentSearch");
            if (search) {
                window.filterStudents();
            }

            let message = `Bulk deletion finished.\n\nDeleted: ${deleted}\nFailed: ${failures.length}`;

            if (failures.some(item =>
                /result records|result history|disable the student/i.test(item)
            )) {
                message +=
                    "\n\nSome students were protected because they have results. " +
                    "Their records were preserved. Disable those students instead.";
            }

            if (failures.length) {
                message += "\n\nFailed items:\n" + failures.slice(0, 10).join("\n");
                if (failures.length > 10) {
                    message += `\n…and ${failures.length - 10} more.`;
                }
            }

            alert(message);
        } catch (error) {
            console.error("Bulk student deletion error:", error);
            alert(
                `Deletion process stopped.\nDeleted before stopping: ${deleted}\n` +
                "Please refresh Student Management and check the remaining students."
            );
        } finally {
            updateStudentBulkSelectionCount();
        }
    };
})();

/* MSA_STUDENT_LIST_LAYOUT_SORT_FIX_V1 */
(function () {
    const previousRenderStudents = window.renderStudents;
    if (typeof previousRenderStudents !== "function") {
        console.error("MSA layout fix: renderStudents was not found.");
        return;
    }

    window.renderStudents = function (list) {
        if (!Array.isArray(list)) {
            return previousRenderStudents.apply(this, arguments);
        }

        const sorted = [...list].sort((a, b) => {
            const nameA = String(
                a.name || a.full_name || a.student_name || ""
            ).trim();

            const nameB = String(
                b.name || b.full_name || b.student_name || ""
            ).trim();

            return nameA.localeCompare(nameB, undefined, {
                sensitivity: "base",
                numeric: true
            });
        });

        return previousRenderStudents.call(this, sorted);
    };
})();


// MSA PORTAL: Annual Form Promotion screen.
async function showAnnualPromotionScreen() {
    let data;
    try {
        const token = localStorage.getItem("MSA_ADMIN_TOKEN") || "";
        const response = await fetch("/api/admin/annual-promotion", {
            headers: { "Authorization": "Bearer " + token }
        });
        data = await response.json();
        if (!response.ok || !data.ok) {
            throw new Error(data.message || "Could not load settings.");
        }
    } catch (error) {
        showAdminSectionScreen(
            "Annual Form Promotion",
            "Yearly student progression",
            '<p>Could not load the promotion settings. Please return and try again.</p>'
        );
        return;
    }

    const enabled = data.enabled === true;
    const last = data.last_run;
    const lastRunHtml = last
        ? `<p><strong>Last recorded year:</strong> ${last.academic_year}</p>
           <p><strong>Status:</strong> ${last.status}</p>
           <p><strong>Started:</strong> ${last.started_at || "—"}</p>
           <p><strong>Completed:</strong> ${last.completed_at || "—"}</p>
           <p><strong>Promoted:</strong> ${(last.details || {}).promoted ?? "—"}</p>
           <p><strong>Graduated and archived:</strong> ${(last.details || {}).graduated_archived ?? "—"}</p>`
        : "<p>No annual promotion run has been recorded yet.</p>";

    const toggleHtml = data.can_manage
        ? `<button type="button" class="dashboard-menu-card"
               onclick="toggleAnnualPromotionSetting(${!enabled})">
               <strong>${enabled ? "Turn OFF automation" : "Turn ON automation"}</strong>
               <small>Only the Main Administrator can change this setting.</small>
           </button>`
        : "<p>View only: only the Main Administrator can change this setting.</p>";

    const content = `
        <section style="padding:16px">
            <h3>Automation: ${enabled ? "ON" : "OFF"}</h3>
            <p>The default is OFF. Turning it ON does not immediately promote students.</p>
            ${toggleHtml}
            <hr>
            <h3>Annual rules</h3>
            <ul>
                <li>Form 1 → Form 2</li>
                <li>Form 2 → Form 3</li>
                <li>Form 3 → Form 4</li>
                <li>Form 4 stays in Form 4</li>
                <li>Form 5 → Form 6</li>
                <li>Form 6 is marked graduated and archived, not deleted</li>
            </ul>
            <p>Only students registered before January 1 of the promotion year are considered.
            Student IDs, passwords, and historical results are retained.</p>
            <h3>Promotion history</h3>
            ${lastRunHtml}
        </section>`;
    showAdminSectionScreen(
        "Annual Form Promotion",
        "Yearly student progression",
        content
    );
}

async function toggleAnnualPromotionSetting(enabled) {
    if (!confirm(
        "Save annual promotion as " + (enabled ? "ON" : "OFF") +
        "? This will not promote students immediately."
    )) {
        return;
    }

    try {
        const token = localStorage.getItem("MSA_ADMIN_TOKEN") || "";
        const response = await fetch("/api/admin/annual-promotion", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token
            },
            body: JSON.stringify({ enabled })
        });
        const data = await response.json();
        if (!response.ok || !data.ok) {
            alert(data.message || "Could not save the setting.");
            return;
        }
        alert(data.message || "Setting saved.");
        await showAnnualPromotionScreen();
    } catch (error) {
        alert("Could not save the setting. Please try again.");
    }
}
