
function showAccountDisabledMessage() {
    alert(
        "ACCOUNT DISABLED — PLEASE CONTACT SCHOOL ADMINISTRATION."
    );
}

let selectedStudentName = '';
let selectedStudentForm = '';

const portal = document.querySelector(".portal");
    
function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function viewResults() {
    portal.innerHTML = `
        <div class="page">
            <button class="back-button" onclick="goHome()">← BACK</button>

            <div class="page-icon">📚</div>
            <h1>VIEW RESULTS</h1>
            <p class="page-subtitle">SELECT YOUR FORM</p>

            <div class="form-grid">
                <button class="form-button" onclick="selectForm(1)">
                    <span>1</span>
                    <strong>FORM 1</strong>
                </button>

                <button class="form-button" onclick="selectForm(2)">
                    <span>2</span>
                    <strong>FORM 2</strong>
                </button>

                <button class="form-button" onclick="selectForm(3)">
                    <span>3</span>
                    <strong>FORM 3</strong>
                </button>

                <button class="form-button" onclick="selectForm(4)">
                    <span>4</span>
                    <strong>FORM 4</strong>
                </button>

                <button class="form-button" onclick="selectForm(5)">
                    <span>5</span>
                    <strong>FORM 5</strong>
                </button>

                <button class="form-button" onclick="selectForm(6)">
                    <span>6</span>
                    <strong>FORM 6</strong>
                </button>
            </div>

            <div class="info-box">
                <strong>🔐 Secure Results</strong>
                <p>Select your form, search your name, then enter your password to view your examination results.</p>
            </div>
        </div>
    `;
}

function goHome() {
    window.location.href = "/app/";
}

function selectForm(formNumber) {
    portal.innerHTML = `
        <div class="page">
            <button class="back-button" onclick="viewResults()">← BACK</button>

            <div class="page-icon">🎓</div>
            <h1>FORM ${formNumber}</h1>
            <p class="page-subtitle">SEARCH STUDENT</p>

            <div class="search-box">
                <input
                    id="studentSearch"
                    type="text"
                    placeholder="Enter student name"
                    autocomplete="off"
                    oninput="searchStudent(${formNumber})"
                >
                <button onclick="searchStudent(${formNumber})">SEARCH</button>
            </div>

            <div id="studentResults"></div>
        </div>
    `;
}

async function searchStudent(formNumber) {

    const input =
        document.getElementById("studentSearch");

    const results =
        document.getElementById("studentResults");

    if (!input || !results) {
        return;
    }

    const name =
        input.value
            .trim();

    // Empty search: never show a student list.
    if (!name) {
        results.innerHTML = "";
        return;
    }

    results.innerHTML = `
        <div class="loading-box">
            <p>Searching...</p>
        </div>
    `;

    try {

        const response = await fetch(
            "/api/student-name-search" +
            "?form=" +
            encodeURIComponent(formNumber) +
            "&search=" +
            encodeURIComponent(name)
        );

        const data =
            await response.json();

        if (!response.ok || !data.ok) {
            results.innerHTML = `
                <div class="info-box">
                    Student not found
                </div>
            `;
            return;
        }

        const students =
            Array.isArray(data.students)
                ? data.students
                : [];

        if (!students.length) {
            results.innerHTML = `
                <div class="info-box">
                    Student not found
                </div>
            `;
            return;
        }

        results.innerHTML = students.map(
            function(student) {

                return `
                    <div
                        class="student-card"
                        onclick="selectStudent(
                            '${escapeHtml(student.name)}',
                            'Form ${escapeHtml(String(student.form))}'
                        )"
                    >
                        <div class="student-avatar">
                            👤
                        </div>

                        <div class="student-info">
                            <strong>
                                ${escapeHtml(student.name)}
                            </strong>

                            <span>
                                Form ${escapeHtml(String(student.form))}
                                ${student.class_name
                                    ? " • " + escapeHtml(student.class_name)
                                    : ""}
                            </span>
                        </div>

                        <div class="student-arrow">
                            ›
                        </div>
                    </div>
                `;
            }
        ).join("");

    } catch (error) {

        console.error(
            "MSA STUDENT SEARCH ERROR:",
            error
        );

        results.innerHTML = `
            <div class="info-box">
                Student not found
            </div>
        `;
    }
}
function selectStudent(name, form) {
    portal.innerHTML = `
        <div class="page">
            <button class="back-button" onclick="selectForm(${form.replace('Form ', '')})">← BACK</button>

            <div class="page-icon">🔐</div>
            <h1>STUDENT LOGIN</h1>
            <p class="page-subtitle">ENTER PASSWORD</p>

            <div class="selected-student">
                <div class="student-avatar">👤</div>
                <div>
                    <strong>${name}</strong>
                    <span>${form}</span>
                </div>
            </div>

            <input
                id="studentPassword"
                class="password-input"
                type="password"
                placeholder="Enter password"
            >

            <button class="main-button" onclick="viewResult('${name}', '${form}')">
                  VIEW RESULT
              </button>

              <button
                  class="forgot-password-button"
                  onclick="forgotPassword('${escapeHtml(name)}', '${escapeHtml(form)}')"
              >
                  FORGOT PASSWORD / PIN?
              </button>

              <div class="security-note">
                  🔒 Your examination results are protected.
              </div>
        </div>
    `;
}



async function forgotPassword(name, form) {
    const formNumber = String(form).replace("Form ", "");

    portal.innerHTML = `
        <div class="page">

            <button class="back-button"
                onclick="selectStudent(
                    '${escapeHtml(name)}',
                    '${escapeHtml(form)}'
                )">
                ← BACK
            </button>

            <div class="page-icon">🔐</div>

            <h1>FORGOT PASSWORD / PIN?</h1>

            <p class="page-subtitle">
                VERIFY STUDENT ID
            </p>

            <div class="selected-student">
                <div class="student-avatar">👤</div>

                <div>
                    <strong>${escapeHtml(name)}</strong>
                    <span>${escapeHtml(form)}</span>
                </div>
            </div>

            <div class="reset-info-box">
                <h3>Student ID Verification</h3>

                <p>
                    Enter only your Student ID number.
                </p>

                <p>
                    Your Student ID is permanent and does not
                    change when your password changes.
                </p>
            </div>

            <div class="student-id-input-wrap"
                 style="
                    display:flex;
                    align-items:center;
                    gap:10px;
                    margin:18px 0;
                 ">

                <span
                    style="
                        font-weight:800;
                        font-size:20px;
                    "
                >
                    MSA-
                </span>

                <input
                    id="studentIdNumber"
                    class="password-input"
                    type="text"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    maxlength="6"
                    placeholder="Student ID number"
                    autocomplete="off"
                    oninput="
                        this.value =
                        this.value.replace(/[^0-9]/g, '');
                    "
                    style="margin:0; flex:1;"
                >
            </div>

            <button
                id="requestResetButton"
                class="main-button"
                onclick="
                    submitPasswordReset(
                        '${escapeHtml(name)}',
                        '${escapeHtml(formNumber)}'
                    )
                "
            >
                VERIFY STUDENT ID
            </button>

            <div id="resetRequestMessage"></div>

        </div>
    `;
}

async function submitPasswordReset(name, formNumber) {
    // Remember the exact student so the final button can
    // return directly to this student's login screen.
    window.MSA_RESET_STUDENT_NAME = name;
    window.MSA_RESET_STUDENT_FORM = formNumber;

    const button = document.getElementById("requestResetButton");
    const message = document.getElementById("resetRequestMessage");

    if (!button || !message) {
        return;
    }

    const studentIdInput =
        document.getElementById("studentIdNumber");

    if (!studentIdInput) {
        return;
    }

    const studentIdNumber =
        studentIdInput.value.trim();

    if (!studentIdNumber) {
        message.innerHTML = `
            <div class="reset-error">
                <strong>STUDENT ID REQUIRED</strong>
                <p>Please enter your Student ID number.</p>
            </div>
        `;
        return;
    }

    if (!/^[0-9]+$/.test(studentIdNumber)) {
        message.innerHTML = `
            <div class="reset-error">
                <strong>INVALID STUDENT ID</strong>
                <p>Enter numbers only.</p>
            </div>
        `;
        return;
    }

    button.disabled = true;
    button.textContent = "VERIFYING STUDENT ID...";

    try {
        const response = await fetch("/api/password-reset/request", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name: name,
                form: formNumber,
                student_id_number: studentIdNumber
            })
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
            message.innerHTML = `
                <div class="reset-error">
                    <strong>
                        ${
                            response.status === 403
                                ? "❌ INCORRECT STUDENT ID"
                                : "❌ REQUEST NOT SENT"
                        }
                    </strong>
                    <p>
                        ${
                            response.status === 403
                                ? "The Student ID does not match this student's account."
                                : escapeHtml(
                                    data.error ||
                                    "Unable to send the reset request."
                                )
                        }
                    </p>
                    ${
                        response.status === 403
                            ? "<p>Please check the Student ID number and try again.</p>"
                            : ""
                    }
                </div>
            `;

            button.disabled = false;
            button.textContent = "VERIFY STUDENT ID";
            return;
        }

        message.innerHTML = `
            <div class="reset-success">
                <div class="reset-success-icon">✓</div>

                <h3>RESET APPROVED</h3>
                                                                        <p>
                                                                            Your Student ID was verified successfully.
                                                                            Your password/PIN reset was approved automatically.
                                                                        </p>

                                                                        <p>
                                                                            Your temporary PIN is ready.
                                                                            Continue to create your new PIN or password.
                                                                        </p>

                <div class="reset-status">
                    REQUEST ID:
                    <strong>${escapeHtml(String(data.request_id))}</strong>
                </div>
            </div>
        `;

        button.style.display = "none";

        window.currentResetRequestId = data.request_id;

        /*
         * Automatic approval:
         * The backend already approved this request and returned
         * the temporary PIN in the same response.
         * Show it immediately instead of waiting for another poll.
         */
        if (data.approved === true && data.reset_pin) {
            showTemporaryPin(
                data.reset_pin,
                data.expires_at
            );
        } else {
            monitorPasswordReset(data.request_id);
        }

    } catch (error) {
        message.innerHTML = `
            <div class="reset-error">
                <strong>CONNECTION ERROR</strong>
                <p>Please try again.</p>
            </div>
        `;

        button.disabled = false;
        button.textContent = "REQUEST RESET";
    }
}


async function monitorPasswordReset(requestId) {
    const interval = setInterval(async () => {
        try {
            const response = await fetch(
                "/api/password-reset/status?request_id=" +
                encodeURIComponent(requestId)
            );

            const data = await response.json();

            if (!response.ok || !data.ok) {
                const message = String(
                    data.message || "Incorrect password."
                );

                if (/disabled|inactive/i.test(message)) {
                    resultBox.innerHTML = `
                        <div class="result-error account-disabled-message">
                            <div style="font-size:48px; margin-bottom:12px;">
                                🔒
                            </div>

                            <h3>ACCOUNT DISABLED</h3>

                            <p>
                                Your MSA PORTAL account has been temporarily
                                disabled by the school administrator.
                            </p>

                            <p>
                                You cannot access your results while your
                                account is disabled.
                            </p>

                            <p>
                                <strong>
                                    Please contact the school administration
                                    for assistance.
                                </strong>
                            </p>

                            <button class="main-button"
                                onclick="selectStudent('${escapeHtml(name)}', '${escapeHtml(form)}')">
                                OK — RETURN TO LOGIN
                            </button>
                        </div>
                    `;
                } else {
                    resultBox.innerHTML = `
                        <div class="result-error">
                            <h3>ACCESS DENIED</h3>

                            <p>
                                ${escapeHtml(message)}
                            </p>

                            <button class="main-button"
                                onclick="selectStudent('${escapeHtml(name)}', '${escapeHtml(form)}')">
                                TRY AGAIN
                            </button>
                        </div>
                    `;
                }

                return;
            }

            const request = data.request;

            if (request.status === "approved") {
                clearInterval(interval);

                showTemporaryPin(
                    request.reset_pin,
                    request.expires_at
                );

                return;
            }

            if (request.status === "rejected") {
                clearInterval(interval);

                const message =
                    document.getElementById("resetRequestMessage");

                if (message) {
                    message.innerHTML = `
                        <div class="reset-error">
                            <strong>REQUEST REJECTED</strong>

                            <p>
                                Please contact the school administrator.
                            </p>
                        </div>
                    `;
                }
            }

        } catch (error) {
            // Continue checking.
        }

    }, 3000);
}


function showTemporaryPin(pin, expiresAt) {
    window.currentResetRequestId =
        window.currentResetRequestId || 0;

    const message =
        document.getElementById("resetRequestMessage");

    if (!message) {
        return;
    }

    message.innerHTML = `
        <div class="temporary-pin-box">

            <div class="reset-success-icon">✓</div>

            <h3>RESET APPROVED</h3>

            <p>Your temporary 4-digit PIN is:</p>

            <div class="temporary-pin">
                ${escapeHtml(String(pin))}
            </div>

            <p class="pin-warning">
                This PIN can only be used once.
            </p>

            <div class="pin-countdown">
                Expires in
                <strong id="resetCountdown">02:00</strong>
            </div>

            <button
                class="main-button"
                onclick="showNewCredentialScreen(${Number(window.currentResetRequestId || 0)}, '${escapeHtml(String(pin))}')"
            >
                CREATE NEW CREDENTIAL
            </button>

        </div>
    `;

    startResetCountdown(expiresAt);
}


function startResetCountdown(expiresAt) {
    const countdown =
        document.getElementById("resetCountdown");

    if (!countdown) {
        return;
    }

    const endTime =
        new Date(
            expiresAt.replace(" ", "T") + "Z"
        ).getTime();

    const timer = setInterval(() => {

        const remaining =
            Math.max(
                0,
                endTime - Date.now()
            );

        const seconds =
            Math.ceil(remaining / 1000);

        const minutes =
            Math.floor(seconds / 60);

        const secs =
            seconds % 60;

        countdown.textContent =
            String(minutes).padStart(2, "0") +
            ":" +
            String(secs).padStart(2, "0");

        if (remaining <= 0) {
            clearInterval(timer);

            countdown.textContent = "EXPIRED";

            countdown.parentElement.innerHTML =
                "This temporary PIN has expired. Please request another reset.";
        }

    }, 500);
}



function showNewCredentialScreen(requestId, temporaryPin) {
    portal.innerHTML = `
        <div class="page">

            <div class="page-icon">🔑</div>

            <h1>CREATE NEW CREDENTIAL</h1>

            <p class="page-subtitle">
                YOUR TEMPORARY PIN HAS BEEN VERIFIED
            </p>

            <div class="reset-info-box">
                <h3>Choose Your New Login</h3>

                <p>
                    You can create either a 4-digit PIN
                    or an 8-character password.
                </p>
            </div>

            <label class="credential-option">
                <input
                    type="radio"
                    name="credentialType"
                    value="pin"
                    checked
                    onchange="updateCredentialHelp()"
                >
                <span>
                    <strong>4-DIGIT PIN</strong>
                    <small>Example: 4821</small>
                </span>
            </label>

            <label class="credential-option">
                <input
                    type="radio"
                    name="credentialType"
                    value="password"
                    onchange="updateCredentialHelp()"
                >
                <span>
                    <strong>8-CHARACTER PASSWORD</strong>
                    <small>Exactly 8 characters</small>
                </span>
            </label>

            <input
                id="newCredential"
                class="password-input"
                type="password"
                maxlength="8"
                inputmode="numeric"
                placeholder="Enter new 4-digit PIN"
            >

            <input
                id="confirmCredential"
                class="password-input"
                type="password"
                maxlength="8"
                inputmode="numeric"
                placeholder="Confirm new 4-digit PIN"
            >

            <button
                id="saveCredentialButton"
                class="main-button"
                onclick="createNewCredential(${Number(requestId)}, '${escapeHtml(temporaryPin)}')"
            >
                SAVE NEW CREDENTIAL
            </button>

            <div id="credentialMessage"></div>

        </div>
    `;
}


function updateCredentialHelp() {
    const selected =
        document.querySelector(
            'input[name="credentialType"]:checked'
        );

    const input =
        document.getElementById("newCredential");

    const confirm =
        document.getElementById("confirmCredential");

    if (!selected || !input || !confirm) {
        return;
    }

    if (selected.value === "pin") {
        input.maxLength = 4;
        confirm.maxLength = 4;
        input.inputMode = "numeric";
        confirm.inputMode = "numeric";
        input.placeholder = "Enter new 4-digit PIN";
        confirm.placeholder = "Confirm new 4-digit PIN";
    } else {
        input.maxLength = 8;
        confirm.maxLength = 8;
        input.inputMode = "text";
        confirm.inputMode = "text";
        input.placeholder = "Enter new 8-character password";
        confirm.placeholder = "Confirm new 8-character password";
    }
}


async function createNewCredential(requestId, temporaryPin) {
    const selected =
        document.querySelector(
            'input[name="credentialType"]:checked'
        );

    const input =
        document.getElementById("newCredential");

    const confirm =
        document.getElementById("confirmCredential");

    const button =
        document.getElementById("saveCredentialButton");

    const message =
        document.getElementById("credentialMessage");

    if (
        !selected ||
        !input ||
        !confirm ||
        !button ||
        !message
    ) {
        return;
    }

    const credentialType = selected.value;
    const value = input.value;
    const confirmation = confirm.value;

    if (credentialType === "pin") {
        if (!/^\d{4}$/.test(value)) {
            message.innerHTML = `
                <div class="reset-error">
                    PIN must be exactly 4 digits.
                </div>
            `;
            return;
        }
    }

    if (credentialType === "password") {
        if (value.length !== 8) {
            message.innerHTML = `
                <div class="reset-error">
                    Password must be exactly 8 characters.
                </div>
            `;
            return;
        }
    }

    if (value !== confirmation) {
        message.innerHTML = `
            <div class="reset-error">
                The credentials do not match.
            </div>
        `;
        return;
    }

    button.disabled = true;
    button.textContent = "SAVING...";

    try {
        const response = await fetch(
            "/api/password-reset/redeem",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    request_id: requestId,
                    temporary_pin: temporaryPin,
                    credential_type: credentialType,
                    new_credential: value
                })
            }
        );

        const data = await response.json();

        if (!response.ok || !data.ok) {
            message.innerHTML = `
                <div class="reset-error">
                    <strong>NOT SAVED</strong>
                    <p>
                        ${escapeHtml(
                            data.error ||
                            "Unable to save the new credential."
                        )}
                    </p>
                </div>
            `;

            button.disabled = false;
            button.textContent = "SAVE NEW CREDENTIAL";
            return;
        }

        message.innerHTML = `
            <div class="reset-success">
                <div class="reset-success-icon">✓</div>

                <h3>CREDENTIAL UPDATED</h3>

                <p>
                    Your new ${
                        credentialType === "pin"
                        ? "PIN"
                        : "password"
                    } has been saved.
                </p>

                <p>
                    You can now return to Student Login
                    and use your new credential.
                </p>

                <button
                    type="button"
                    class="main-button"
                    onclick="
                        selectStudent(
                            window.MSA_RESET_STUDENT_NAME || '',
                            window.MSA_RESET_STUDENT_FORM || ''
                        );
                    "
                >
                    RETURN TO STUDENT LOGIN
                </button>
            </div>
        `;

        button.style.display = "none";

    } catch (error) {
        message.innerHTML = `
            <div class="reset-error">
                Connection error. Please try again.
            </div>
        `;

        button.disabled = false;
        button.textContent = "SAVE NEW CREDENTIAL";
    }
}




/* =========================================================
   MSA PORTAL RESULT BUTTONS
   ========================================================= */

function viewResultPDF(resultId) {

    const id = Number(resultId);

    if (!id || id <= 0) {
        alert("Invalid result.");
        return;
    }

    const url = "/api/results/" + encodeURIComponent(id);

    console.log("VIEW PDF:", url);

    if (
        window.AndroidMSA &&
        typeof window.AndroidMSA.viewResult === "function"
    ) {
        window.AndroidMSA.openInChrome(url);
        return;
    }

    /*
     * WEBSITE:
     * Open the verified PDF endpoint directly.
     */
    window.open(url, "_blank");
}











/* MSA PORTAL RESULT STATE */

window.MSAResultState = {
    student: null,
    results: []
};



/* ============================================================
   MSA PORTAL STUDENT WELCOME SCREEN
   ============================================================ */

function showStudentWelcome(studentName, afterWelcome) {

    const cleanName =
        String(studentName || "Student").trim() || "Student";

    const welcomeKey =
        "MSA_PORTAL_WELCOME_SEEN_" +
        cleanName.toUpperCase();

    let returningStudent = false;

    try {
        returningStudent =
            localStorage.getItem(welcomeKey) === "1";

        localStorage.setItem(
            welcomeKey,
            "1"
        );

    } catch (error) {

        console.warn(
            "MSA: Welcome state unavailable.",
            error
        );
    }

    const heading =
        returningStudent
            ? "WELCOME BACK"
            : "WELCOME TO MSA PORTAL";

    const overlay =
        document.createElement("div");

    overlay.className =
        "msa-welcome-overlay";

    overlay.innerHTML = `
        <div class="msa-welcome-glow"></div>

        <div class="msa-welcome-card">

            <div class="msa-welcome-logo-wrap">

                <img
                    src="/assets/mwashita_logo.jpg"
                    class="msa-welcome-logo"
                    alt="MSA PORTAL"
                >

            </div>

            <div class="msa-welcome-line"></div>

            <div class="msa-welcome-heading">
                ${heading}
            </div>

            <div class="msa-welcome-name">
                ${escapeHtml(cleanName)}
            </div>

            <div class="msa-welcome-status">
                SIGNING YOU IN...
            </div>

            <div class="msa-welcome-loader">
                <span></span>
            </div>

        </div>
    `;

    document.body.appendChild(overlay);

    window.setTimeout(function() {

        overlay.classList.add(
            "msa-welcome-overlay-hide"
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



/* ============================================================
   MSA PORTAL RESULT BUTTON HANDLERS
   ============================================================ */

window.viewResultPDF = function(resultId) {
    const id = Number(resultId);

    if (!Number.isInteger(id) || id <= 0) {
        alert("Invalid result.");
        return;
    }

    const url = "/api/results/" +
        encodeURIComponent(id);

    window.location.href = url;
};


window.downloadResultPDF = function(resultId, fileName) {

    const id = Number(resultId);

    console.log("MSA DOWNLOAD CLICK:", id);

    if (!Number.isInteger(id) || id <= 0) {
        alert("Invalid result.");
        return;
    }

    const url = "/api/results/" + encodeURIComponent(id);

    const name =
        fileName ||
        "MSA_PORTAL_Result.pdf";

    console.log("Downloading:", url);

    if (
        window.AndroidMSA &&
        typeof window.AndroidMSA.downloadResult === "function"
    ) {
        window.AndroidMSA.downloadResult(url, name);
        return;
    }

    fetch(url, {
        method: "GET",
        cache: "no-store"
    })
    .then(function(response) {

        if (!response.ok) {
            throw new Error(
                "HTTP " + response.status
            );
        }

        return response.blob();
    })
    .then(function(blob) {

        if (!blob || blob.size === 0) {
            throw new Error("Empty PDF");
        }

        const blobUrl =
            URL.createObjectURL(blob);

        const link =
            document.createElement("a");

        link.href = blobUrl;
        link.download = name;

        document.body.appendChild(link);

        link.click();

        link.remove();

        setTimeout(function() {
            URL.revokeObjectURL(blobUrl);
        }, 60000);
    })
    .catch(function(error) {

        console.error(
            "MSA DOWNLOAD ERROR:",
            error
        );

        window.open(url, "_blank");
    });
};


window.openResult = function(resultId) {

    const id = Number(resultId);

    console.log("MSA VIEW BUTTON CLICK:", id);

    window.viewResultPDF(id);
};



function wireResultButtons() {

    console.log("MSA: wiring result buttons");

    const viewButtons =
        document.querySelectorAll(
            ".history-view[data-result-id]"
        );

    const downloadButtons =
        document.querySelectorAll(
            ".download-result-btn[data-result-id]"
        );

    console.log(
        "MSA VIEW BUTTONS:",
        viewButtons.length
    );

    console.log(
        "MSA DOWNLOAD BUTTONS:",
        downloadButtons.length
    );

    viewButtons.forEach(function(button) {

        button.addEventListener(
            "click",
            function(event) {

                event.preventDefault();

                const id =
                    Number(
                        button.getAttribute(
                            "data-result-id"
                        )
                    );

                console.log(
                    "MSA VIEW CLICK:",
                    id
                );

                window.viewResultPDF(id);
            }
        );
    });

    downloadButtons.forEach(function(button) {

        button.addEventListener(
            "click",
            function(event) {

                event.preventDefault();

                const id =
                    Number(
                        button.getAttribute(
                            "data-result-id"
                        )
                    );

                const fileName =
                    button.getAttribute(
                        "data-result-file"
                    ) ||
                    "MSA_PORTAL_Result.pdf";

                console.log(
                    "MSA DOWNLOAD CLICK:",
                    id,
                    fileName
                );

                window.downloadResultPDF(
                    id,
                    fileName
                );
            }
        );
    });
}

window.refreshResults = async function() {
    console.log("MSA: refreshing Results History");

    const resultBox = document.getElementById("resultContent");

    if (!resultBox) {
        console.log("MSA: result screen not active");
        return;
    }

    const student = window.MSAResultState &&
                    window.MSAResultState.student;

    if (!student) {
        console.log("MSA: no logged-in student state");
        return;
    }

    const passwordInput = document.getElementById("studentPassword");

    let password = "";

    if (passwordInput) {
        password = passwordInput.value.trim();
    }

    /*
     * Keep the password that was used for the current session.
     * This prevents Refresh from sending the student back to login.
     */
    if (!password && window.MSAResultState.password) {
        password = window.MSAResultState.password;
    }

    if (!password) {
        alert("Your login session has expired. Please log in again.");
        return;
    }

    const refreshButton =
        document.querySelector(".results-title button");

    if (refreshButton) {
        refreshButton.disabled = true;
        refreshButton.innerHTML = "⟳";
    }

    try {
        const formNumber = String(student.form)
            .replace("Form ", "")
            .trim();

        const url =
            "/api/student-results" +
            "?form=" + encodeURIComponent(formNumber) +
            "&name=" + encodeURIComponent(student.name) +
            "&password=" + encodeURIComponent(password) +
            "&_=" + Date.now();

        const response = await fetch(url, {
            method: "GET",
            cache: "no-store"
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(
                data.message || "Could not refresh results."
            );
        }

        const results =
            Array.isArray(data.results)
                ? data.results
                : [];

        window.MSAResultState.student =
            data.student || student;

        window.MSAResultState.results = results;
        window.MSAResultState.password = password;

        /*
         * Rebuild the Results History without leaving
         * the current page.
         */
        const grouped = {};

        results.forEach(function(result) {
            const year =
                String(result.academic_year || "Unknown Year");

            if (!grouped[year]) {
                grouped[year] = [];
            }

            grouped[year].push(result);
        });

        const years = Object.keys(grouped)
            .sort(function(a, b) {
                return Number(b) - Number(a);
            });

        let historyHtml = "";

        years.forEach(function(year) {
            const terms = grouped[year];

            terms.sort(function(a, b) {
                const order = {
                    "Term 1": 1,
                    "Term 2": 2,
                    "Term 3": 3
                };

                return (
                    (order[b.term] || 99) -
                    (order[a.term] || 99)
                );
            });

            historyHtml += `
                <div class="history-year">
                    <div class="history-year-header">
                        <div>
                            <span class="history-year-label">
                                ACADEMIC YEAR
                            </span>
                            <h2>${escapeHtml(year)}</h2>
                        </div>

                        <span class="history-year-icon">
                            📚
                        </span>
                    </div>

                    <div class="history-year-results">
            `;

            terms.forEach(function(result) {
                historyHtml += `
                    <div class="history-item">
                        <div class="history-info">

                            <div class="history-term-row">
                                <strong>
                                    ${escapeHtml(
                                        result.term || "Term"
                                    )}
                                </strong>

                                <span class="history-published">
                                    ● PUBLISHED
                                </span>
                            </div>

                            <span class="history-result-name">
                                📄 ${escapeHtml(
                                    result.file_name ||
                                    "Examination Result"
                                )}
                            </span>

                            <div class="result-download">
                                <a
    class="download-result-btn"
    data-result-id="${Number(result.id)}"
    data-result-file="${escapeHtml(result.file_name || "MSA_PORTAL_Result.pdf")}"
    href="/api/results/${Number(result.id)}"
    download="${escapeHtml(result.file_name || "MSA_PORTAL_Result.pdf")}"
    onclick="if(window.AndroidMSA && typeof window.AndroidMSA.downloadResult === 'function'){event.preventDefault();event.stopImmediatePropagation();window.AndroidMSA.downloadResult('/api/results/${Number(result.id)}', this.getAttribute('download'));return false;}"
>
                                    📥 DOWNLOAD PDF
                                </a>
                            </div>
                        </div>

                        <a
    class="history-view"
    data-result-id="${Number(result.id)}"
    href="/api/results/${Number(result.id)}"
    target="_blank"
    rel="noopener"
    onclick="if(window.AndroidMSA && typeof window.AndroidMSA.viewResult === 'function'){event.preventDefault();event.stopImmediatePropagation();window.AndroidMSA.openInChrome('/api/results/${Number(result.id)}');return false;}"
>
                            👁 VIEW
                        </a>
                    </div>
                `;
            });

            historyHtml += `
                    </div>
                </div>
            `;
        });

        if (!historyHtml) {
            historyHtml = `
                <div class="loading-box">
                    <p>No published results available yet.</p>
                </div>
            `;
        }

        const historyContainer =
            resultBox.querySelector(".results-history");

        if (historyContainer) {
            historyContainer.innerHTML = historyHtml;
        }

        console.log(
            "MSA: Results History refreshed:",
            results.length,
            "result(s)"
        );

    } catch (error) {
        console.error(
            "MSA RESULTS REFRESH ERROR:",
            error
        );

        alert(
            "Could not refresh Results History. " +
            "Please try again."
        );

    } finally {
        if (refreshButton) {
            refreshButton.disabled = false;
            refreshButton.innerHTML = "↻";
        }
    }
};


async function viewResult(name, form) {
    selectedStudentName = name;
    selectedStudentForm = form;

    const passwordInput = document.getElementById("studentPassword");

    if (!passwordInput) {
        alert("Student login screen error.");
        return;
    }

    const password = passwordInput.value.trim();

    if (!password) {
        alert("Please enter your password.");
        return;
    }

    portal.innerHTML = `
        <div class="page">
            <button class="back-button"
                onclick="selectStudent('${escapeHtml(name)}', '${escapeHtml(form)}')">
                ← BACK
            </button>

            <div class="page-icon">📊</div>

            <h1>EXAMINATION RESULTS</h1>

            <div id="resultContent">
                <div class="loading-box">
                    <p>Checking your results...</p>
                </div>
            </div>
        </div>
    `;

    const resultBox = document.getElementById("resultContent");

    try {
        const formNumber = String(form).replace("Form ", "");

        const url =
            "/api/student-results" +
            "?form=" + encodeURIComponent(formNumber) +
            "&name=" + encodeURIComponent(name) +
            "&password=" + encodeURIComponent(password);

        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok || !data.ok) {

            const isBlocked =
                data.blocked === true ||
                data.show_forgot_password === true;

            const remaining =
                Number(data.attempts_remaining || 0);

            const forgotButton = isBlocked
                ? `
                    <button class="main-button"
                        onclick="forgotPassword('${escapeHtml(name)}', '${escapeHtml(form)}')">
                        FORGOT PASSWORD / PIN
                    </button>
                `
                : "";

            const attemptsMessage =
                !isBlocked && remaining > 0
                    ? `
                        <div class="login-attempts-warning">
                            ATTEMPTS REMAINING: ${remaining}
                        </div>
                    `
                    : "";

            resultBox.innerHTML = `
                <div class="result-error">

                    <h3>
                        ${isBlocked ? "PASSWORD/PIN BLOCKED" : "ACCESS DENIED"}
                    </h3>

                    <p>
                        ${escapeHtml(
                            data.message ||
                            "Incorrect password."
                        )}
                    </p>

                    ${attemptsMessage}

                    ${forgotButton}

                    ${
                        !isBlocked
                            ? `
                                <button class="main-button"
                                    onclick="selectStudent(
                                        '${escapeHtml(name)}',
                                        '${escapeHtml(form)}'
                                    )">
                                    TRY AGAIN
                                </button>
                            `
                            : ""
                    }

                </div>
            `;

            return;
        }

        const student = data.student;
        const results = Array.isArray(data.results) ? data.results : [];

        window.MSAResultState.student = student;
        window.MSAResultState.results = results;
        window.MSAResultState.password = password;

        /*
         * Password verification succeeded.
         *
         * Keep the results completely hidden while
         * the welcome/signing-in animation is running.
         * Results become visible only after the welcome
         * screen has completely finished.
         */
        resultBox.style.visibility = "hidden";

        showStudentWelcome(student.name, function() {
            resultBox.style.visibility = "visible";
        });

        if (!results.length) {
            resultBox.innerHTML = `
                <div class="result-empty">
                    <h3>NO RESULTS PUBLISHED</h3>
                    <p>Your examination results have not been published yet.</p>

                    <button class="main-button" onclick="refreshResults()">
                        ↻ REFRESH RESULTS
                    </button>
                </div>
            `;
            return;
        }

        const grouped = {};

        results.forEach(result => {
            const year = String(result.academic_year || "Unknown Year");

            if (!grouped[year]) {
                grouped[year] = [];
            }

            grouped[year].push(result);
        });

        const years = Object.keys(grouped)
            .sort((a, b) => Number(b) - Number(a));

        let historyHtml = "";

        years.forEach(year => {
            const terms = grouped[year];

            terms.sort((a, b) => {
                const order = {
                    "Term 1": 1,
                    "Term 2": 2,
                    "Term 3": 3
                };

                return (order[b.term] || 99) - (order[a.term] || 99);
            });

            historyHtml += `
                <div class="history-year">

                    <div class="history-year-header">
                        <div>
                            <span class="history-year-label">ACADEMIC YEAR</span>
                            <h2>${escapeHtml(year)}</h2>
                        </div>

                        <span class="history-year-icon">📚</span>
                    </div>

                    <div class="history-year-results">
            `;

            terms.forEach(result => {
                historyHtml += `
                    <div class="history-item">

                        <div class="history-info">

                            <div class="history-term-row">
                                <strong>
                                    ${escapeHtml(result.term || "Term")}
                                </strong>

                                <span class="history-published">
                                    ● PUBLISHED
                                </span>
                            </div>

                            <span class="history-result-name">
                                📄 ${escapeHtml(
                                    result.file_name ||
                                    "Examination Result"
                                )}
                            </span>

                            
<div class="result-download">

    <a
    class="download-result-btn"
    data-result-id="${Number(result.id)}"
    data-result-file="${escapeHtml(result.file_name || "MSA_PORTAL_Result.pdf")}"
    href="/api/results/${Number(result.id)}"
    download="${escapeHtml(result.file_name || "MSA_PORTAL_Result.pdf")}"
    onclick="if(window.AndroidMSA && typeof window.AndroidMSA.downloadResult === 'function'){event.preventDefault();event.stopImmediatePropagation();window.AndroidMSA.downloadResult('/api/results/${Number(result.id)}', this.getAttribute('download'));return false;}"
>
        📥 DOWNLOAD PDF
    </a>

</div>


                        </div>

                        
<a
    class="history-view"
    data-result-id="${Number(result.id)}"
    href="/api/results/${Number(result.id)}"
    target="_blank"
    rel="noopener"
    onclick="if(window.AndroidMSA && typeof window.AndroidMSA.viewResult === 'function'){event.preventDefault();event.stopImmediatePropagation();window.AndroidMSA.openInChrome('/api/results/${Number(result.id)}');return false;}"
>
    👁 VIEW
</a>


                    </div>
                `;
            });

            historyHtml += `
                    </div>
                </div>
            `;
        });

        resultBox.innerHTML = `
            <div class="student-result-header">
                <h2>${escapeHtml(student.name)}</h2>

                <p>
                    Form ${escapeHtml(student.form)}
                    • ${escapeHtml(student.class_name)}
                </p>
            </div>

            <div class="results-title">
                <span>RESULTS HISTORY</span>

                <button type="button" onclick="refreshResults()">
                    ↻
                </button>
            </div>

            <div class="results-history">
                ${historyHtml}
            </div>
        `;

        // IMPORTANT:
        // Results History has now been rendered.
        // Attach VIEW and DOWNLOAD events to the
        // actual buttons that now exist in the DOM.
        wireResultButtons();

    } catch (error) {
        console.error(error);

        resultBox.innerHTML = `
            <div class="result-error">
                <h3>CONNECTION ERROR</h3>
                <p>Could not connect to the MSA PORTAL server.</p>

                <button class="main-button" onclick="refreshResults()">
                    TRY AGAIN
                </button>
            </div>
        `;

    }
}


function adminLogin() {
    window.location.href = "/admin/";
}


/* ---------------------------------------------------------
   MSA PORTAL PUBLIC ANNOUNCEMENT POPUP
   --------------------------------------------------------- */

function msaAnnouncementEscapeHTML(value) {
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

async function msaLoadAnnouncements() {
    try {
        const response = await fetch("/api/announcements", {
            cache: "no-store"
        });
        const data = await response.json();

        if (!response.ok || !data.ok || !Array.isArray(data.announcements)) {
            return;
        }

        const announcements = data.announcements;
        if (!announcements.length) return;

        // Avoid duplicate popups if this function is called again.
        if (document.getElementById("msa-announcement-overlay")) return;

        const overlay = document.createElement("div");
        overlay.id = "msa-announcement-overlay";
        overlay.className = "msa-announcement-overlay";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-labelledby", "msa-announcement-heading");

        overlay.innerHTML = `
            <div class="msa-announcement-dialog">
                <button type="button" class="msa-announcement-close"
                    aria-label="Close announcements">&times;</button>
                <div class="msa-announcement-brand">MWASHITA ACADEMY</div>
                <h2 id="msa-announcement-heading">📢 School Announcements</h2>
                <div class="msa-announcement-items">
                    ${announcements.map(function (item) {
                        const heading = item.announcement_type === "results_are_out"
                            ? "RESULTS ARE OUT" : "RESULTS COMING SOON";

                        return `
                            <article class="msa-announcement-item">
                                <h3>${heading}</h3>
                                <h4>${msaAnnouncementEscapeHTML(item.title)}</h4>
                                <p>${msaAnnouncementEscapeHTML(item.message).replace(/\n/g, "<br>")}</p>
                            </article>
                        `;
                    }).join("")}
                </div>
                <button type="button" class="msa-announcement-ok">
                    CONTINUE TO PORTAL
                </button>
            </div>
        `;

        document.body.appendChild(overlay);

        function closeAnnouncementPopup() {
            overlay.remove();
        }

        overlay.querySelector(".msa-announcement-close")
            .addEventListener("click", closeAnnouncementPopup);
        overlay.querySelector(".msa-announcement-ok")
            .addEventListener("click", closeAnnouncementPopup);
        overlay.addEventListener("click", function (event) {
            if (event.target === overlay) closeAnnouncementPopup();
        });
    } catch (error) {
        // Announcements must never prevent the results portal from opening.
        console.warn("MSA announcements could not be loaded.", error);
    }
}

// app.js is loaded at the end of the portal HTML, after the body exists.
msaLoadAnnouncements();


// MSA PORTAL: Student self-registration. Existing portal screens are preserved.
function showStudentRegistration() {
    portal.innerHTML = `
        <div class="page registration-page">
            <button class="back-button" onclick="goHome()">← BACK</button>
            <div class="page-icon">📝</div>
            <h1>STUDENT REGISTRATION</h1>
            <p class="page-subtitle">CREATE YOUR STUDENT ACCOUNT</p>

            <form id="studentRegistrationForm" class="registration-form">
                <label for="registrationFullName">Full name</label>
                <input id="registrationFullName" name="full_name"
                    type="text" autocomplete="name" maxlength="120"
                    placeholder="Enter your full name" required>

                <label for="registrationForm">Form</label>
                <select id="registrationForm" name="form" required>
                    <option value="">Select your form</option>
                    <option value="1">Form 1</option>
                    <option value="2">Form 2</option>
                    <option value="3">Form 3</option>
                    <option value="4">Form 4</option>
                    <option value="5">Form 5</option>
                    <option value="6">Form 6</option>
                </select>

                <label for="registrationClass">Class / stream</label>
                <input id="registrationClass" name="class_name"
                    type="text" maxlength="80"
                    placeholder="Enter your class or stream" required>

                <label for="registrationPassword">Create password or PIN</label>
                <input id="registrationPassword" name="password"
                    type="password" autocomplete="new-password"
                    placeholder="4-digit PIN or 8-character password"
                    minlength="4" required>

                <label for="registrationConfirmPassword">Confirm password or PIN</label>
                <input id="registrationConfirmPassword" name="confirm_password"
                    type="password" autocomplete="new-password"
                    placeholder="Enter it again" minlength="4" required>

                <p class="registration-security-note">
                    Your details will be checked before an account is approved.
                    Keep your student ID and password/PIN private.
                </p>

                <button class="primary-button" id="registrationSubmitButton" type="submit">
                    SUBMIT REGISTRATION
                </button>
                <div id="registrationMessage" role="status" aria-live="polite"></div>
            </form>
        </div>
    `;

    const form = document.getElementById("studentRegistrationForm");
    form.addEventListener("submit", submitStudentRegistration);
}

async function submitStudentRegistration(event) {
    event.preventDefault();

    const fullName = document.getElementById("registrationFullName").value.trim();
    const form = document.getElementById("registrationForm").value;
    const className = document.getElementById("registrationClass").value.trim();
    const password = document.getElementById("registrationPassword").value;
    const confirmPassword = document.getElementById("registrationConfirmPassword").value;
    const message = document.getElementById("registrationMessage");
    const button = document.getElementById("registrationSubmitButton");

    if (!fullName || !form || !className || !password) {
        message.textContent = "Please complete every field.";
        return;
    }

    if (password !== confirmPassword) {
        message.textContent = "The passwords/PINs do not match.";
        return;
    }

    if (!((password.length === 4 && /^\d{4}$/.test(password)) || password.length === 8)) {
        message.textContent = "Use a 4-digit PIN or an 8-character password.";
        return;
    }

    button.disabled = true;
    message.textContent = "Submitting registration…";

    try {
        const response = await fetch("/api/student-registrations", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                full_name: fullName,
                form: Number(form),
                class_name: className,
                password: password,
                confirm_password: confirmPassword
            })
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
            message.textContent = data.message || "Registration could not be submitted.";
            return;
        }

        if (data.status === "pending") {
            portal.innerHTML = `
                <div class="page">
                    <button class="back-button" onclick="goHome()">← HOME</button>
                    <div class="page-icon">🕒</div>
                    <h1>REGISTRATION UNDER REVIEW</h1>
                    <div class="info-box">
                        <p>${escapeHtml(data.message || "An administrator must review your details before an account is created.")}</p>
                        <p>Please do not submit the same registration again.</p>
                    </div>
                </div>
            `;
            return;
        }

        portal.innerHTML = `
            <div class="page">
                <button class="back-button" onclick="goHome()">← HOME</button>
                <div class="page-icon">✅</div>
                <h1>REGISTRATION APPROVED</h1>
                <div class="info-box">
                    <p>Your student account has been created.</p>
                    <p><strong>Your student ID:</strong></p>
                    <h2>${escapeHtml(data.student_id_code || "")}</h2>
                    <p>Keep this ID and your password/PIN private.</p>
                    <p>You can now return to the home screen and view results when they are available.</p>
                </div>
            </div>
        `;
    } catch (error) {
        message.textContent = "Connection error. Please try again later.";
    } finally {
        const currentButton = document.getElementById("registrationSubmitButton");
        if (currentButton) currentButton.disabled = false;
    }
}
