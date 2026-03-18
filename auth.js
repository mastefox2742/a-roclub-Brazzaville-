/**
 * ============================================================
 *  AEROSIM 242 — Système d'Authentification
 *  auth.js · v1.0.0
 *  Gestion : Connexion · Inscription · Rôles (Étudiant / Instructeur)
 * ============================================================
 */

'use strict';

// ─────────────────────────────────────────────
//  CONSTANTES & CONFIGURATION
// ─────────────────────────────────────────────
const CONFIG = {
  STORAGE_KEY_USERS:   'avv242_users',
  STORAGE_KEY_SESSION: 'avv242_session',
  ROUTES: {
    LOGIN:       'avv-connexion.html',
    REGISTER:    'avv-register.html',
    STUDENT:     'avv-formations.html',
    INSTRUCTOR:  'avv-instructor.html',
    HOME:        'avv-index.html',
  },
  EMAIL_DOMAINS: {
    student:    'studente.avv242.cg',
    instructor: 'instructeur.avv242.cg',
  },
  ROLES: {
    STUDENT:    'etudiant',
    INSTRUCTOR: 'instructeur',
  }
};

// ─────────────────────────────────────────────
//  UTILITAIRES
// ─────────────────────────────────────────────

/** Normalise une chaîne : minuscules, sans accents, sans espaces */
function normalize(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Génère l'adresse e-mail automatique selon le rôle */
function generateEmail(firstName, lastName, role) {
  const f  = normalize(firstName).charAt(0);   // 1ère lettre du prénom
  const ln = normalize(lastName).replace(/\s+/g, '');
  const domain = role === CONFIG.ROLES.INSTRUCTOR
    ? CONFIG.EMAIL_DOMAINS.instructor
    : CONFIG.EMAIL_DOMAINS.student;
  return `${f}.${ln}@${domain}`;
}

/** Hash simple (non cryptographique — pour démo front-end) */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(16);
}

/** Récupère la liste de tous les utilisateurs stockés */
function getUsers() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY_USERS)) || [];
  } catch {
    return [];
  }
}

/** Sauvegarde la liste des utilisateurs */
function saveUsers(users) {
  localStorage.setItem(CONFIG.STORAGE_KEY_USERS, JSON.stringify(users));
}

/** Récupère la session active */
function getSession() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY_SESSION)) || null;
  } catch {
    return null;
  }
}

/** Sauvegarde la session */
function saveSession(user) {
  const session = {
    id:        user.id,
    email:     user.email,
    firstName: user.firstName,
    lastName:  user.lastName,
    role:      user.role,
    loginAt:   new Date().toISOString(),
  };
  localStorage.setItem(CONFIG.STORAGE_KEY_SESSION, JSON.stringify(session));
}

/** Détruit la session (déconnexion) */
function clearSession() {
  localStorage.removeItem(CONFIG.STORAGE_KEY_SESSION);
}

/** Vérifie si une session est active, redirige si nécessaire */
function requireAuth() {
  const session = getSession();
  if (!session) {
    redirect(CONFIG.ROUTES.LOGIN);
    return null;
  }
  return session;
}

/** Redirige vers une page */
function redirect(page) {
  window.location.href = page;
}

// ─────────────────────────────────────────────
//  INSCRIPTION
// ─────────────────────────────────────────────

/**
 * Crée un nouveau compte utilisateur.
 * @param {Object} data - { firstName, lastName, password, role, phone? }
 * @returns {{ success: boolean, message: string, user?: Object, email?: string }}
 */
function register(data) {
  const { firstName, lastName, password, role, phone = '' } = data;

  // ── Validation des champs
  if (!firstName || !lastName || !password || !role) {
    return { success: false, message: 'Tous les champs obligatoires doivent être remplis.' };
  }
  if (![CONFIG.ROLES.STUDENT, CONFIG.ROLES.INSTRUCTOR].includes(role)) {
    return { success: false, message: 'Rôle invalide. Choisissez étudiant ou instructeur.' };
  }
  if (password.length < 6) {
    return { success: false, message: 'Le mot de passe doit contenir au moins 6 caractères.' };
  }

  // ── Génération de l'email automatique
  const email = generateEmail(firstName, lastName, role);

  // ── Vérification doublon
  const users = getUsers();
  const exists = users.find(u => u.email === email);
  if (exists) {
    return {
      success: false,
      message: `Un compte avec l'identifiant <strong>${email}</strong> existe déjà.`
    };
  }

  // ── Création du compte
  const newUser = {
    id:          `avv242_${Date.now()}`,
    firstName:   firstName.trim(),
    lastName:    lastName.trim().toUpperCase(),
    email:       email,
    password:    simpleHash(password),
    role:        role,
    phone:       phone,
    createdAt:   new Date().toISOString(),
    lastLogin:   null,
    progression: {},       // suivi de cours (étudiant)
    students:    [],       // liste d'étudiants assignés (instructeur)
  };

  users.push(newUser);
  saveUsers(users);

  return {
    success: true,
    message: `Compte créé avec succès ! Votre identifiant de connexion est : <strong>${email}</strong>`,
    user:    newUser,
    email:   email,
  };
}

// ─────────────────────────────────────────────
//  CONNEXION
// ─────────────────────────────────────────────

/**
 * Authentifie un utilisateur.
 * @param {string} email    - Email généré lors de l'inscription
 * @param {string} password - Mot de passe en clair
 * @returns {{ success: boolean, message: string, user?: Object }}
 */
function login(email, password) {
  if (!email || !password) {
    return { success: false, message: 'Veuillez renseigner votre identifiant et votre mot de passe.' };
  }

  const users = getUsers();
  const user  = users.find(u => u.email === email.trim().toLowerCase());

  if (!user) {
    return {
      success: false,
      message: 'Aucun compte trouvé pour cet identifiant. <a href="' + CONFIG.ROUTES.REGISTER + '">Créer un compte ?</a>'
    };
  }

  if (user.password !== simpleHash(password)) {
    return { success: false, message: 'Mot de passe incorrect. Vérifiez et réessayez.' };
  }

  // ── Mise à jour de la dernière connexion
  const users2 = getUsers();
  const idx    = users2.findIndex(u => u.email === email);
  users2[idx].lastLogin = new Date().toISOString();
  saveUsers(users2);

  // ── Création de la session
  saveSession(user);

  return { success: true, message: 'Connexion réussie.', user };
}

// ─────────────────────────────────────────────
//  REDIRECTION SELON LE RÔLE
// ─────────────────────────────────────────────
function redirectByRole(user) {
  if (user.role === CONFIG.ROLES.INSTRUCTOR) {
    redirect(CONFIG.ROUTES.INSTRUCTOR);
  } else {
    redirect(CONFIG.ROUTES.STUDENT);
  }
}

// ─────────────────────────────────────────────
//  DÉCONNEXION
// ─────────────────────────────────────────────
function logout() {
  clearSession();
  redirect(CONFIG.ROUTES.LOGIN);
}

// ─────────────────────────────────────────────
//  GESTION DU FORMULAIRE DE CONNEXION
// ─────────────────────────────────────────────
function initLoginForm() {
  const form      = document.getElementById('loginForm');
  const emailInp  = document.getElementById('loginEmail');
  const passInp   = document.getElementById('loginPassword');
  const errBox    = document.getElementById('loginError');
  const btnToggle = document.getElementById('togglePassword');
  const btnSubmit = document.getElementById('btnLogin');

  if (!form) return; // page sans formulaire de connexion

  // Toggle affichage mot de passe
  if (btnToggle) {
    btnToggle.addEventListener('click', () => {
      passInp.type = passInp.type === 'password' ? 'text' : 'password';
      btnToggle.textContent = passInp.type === 'password' ? '👁' : '🙈';
    });
  }

  // Soumission
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearError(errBox);
    btnSubmit.textContent = 'VÉRIFICATION...';
    btnSubmit.disabled = true;

    setTimeout(() => {
      const result = login(emailInp.value, passInp.value);
      btnSubmit.textContent = 'INITIALISER LA CONNEXION';
      btnSubmit.disabled = false;

      if (!result.success) {
        showError(errBox, result.message);
        return;
      }

      showSuccess(errBox, `✓ ${result.message} Redirection en cours...`);
      setTimeout(() => redirectByRole(result.user), 900);
    }, 400);
  });
}

// ─────────────────────────────────────────────
//  GESTION DU FORMULAIRE D'INSCRIPTION
// ─────────────────────────────────────────────
function initRegisterForm() {
  const form        = document.getElementById('registerForm');
  const firstInp    = document.getElementById('regFirstName');
  const lastInp     = document.getElementById('regLastName');
  const passInp     = document.getElementById('regPassword');
  const pass2Inp    = document.getElementById('regPassword2');
  const roleInp     = document.getElementById('regRole');
  const phoneInp    = document.getElementById('regPhone');
  const emailPrev   = document.getElementById('emailPreview');
  const errBox      = document.getElementById('registerError');
  const btnSubmit   = document.getElementById('btnRegister');

  if (!form) return;

  // Aperçu de l'email en temps réel
  function updatePreview() {
    const fn   = firstInp ? firstInp.value : '';
    const ln   = lastInp  ? lastInp.value  : '';
    const role = roleInp  ? roleInp.value  : CONFIG.ROLES.STUDENT;
    if (fn && ln && emailPrev) {
      emailPrev.textContent = generateEmail(fn, ln, role);
      emailPrev.style.opacity = '1';
    } else if (emailPrev) {
      emailPrev.textContent = 'prenom.nom@studente.avv242.cg';
      emailPrev.style.opacity = '0.4';
    }
  }

  [firstInp, lastInp, roleInp].forEach(el => {
    if (el) el.addEventListener('input', updatePreview);
    if (el) el.addEventListener('change', updatePreview);
  });
  updatePreview();

  // Soumission
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearError(errBox);

    // Vérif mots de passe
    if (passInp.value !== pass2Inp.value) {
      showError(errBox, 'Les mots de passe ne correspondent pas.');
      return;
    }

    btnSubmit.textContent = 'CRÉATION EN COURS...';
    btnSubmit.disabled = true;

    setTimeout(() => {
      const result = register({
        firstName: firstInp.value,
        lastName:  lastInp.value,
        password:  passInp.value,
        role:      roleInp.value,
        phone:     phoneInp ? phoneInp.value : '',
      });

      btnSubmit.textContent = 'CRÉER MON COMPTE';
      btnSubmit.disabled = false;

      if (!result.success) {
        showError(errBox, result.message);
        return;
      }

      // Afficher l'email généré et rediriger
      showSuccess(errBox, `
        ✓ ${result.message}<br>
        <span style="opacity:0.8;">Conservez cet identifiant : <strong>${result.email}</strong></span><br>
        Redirection vers la connexion...
      `);
      setTimeout(() => redirect(CONFIG.ROUTES.LOGIN), 3000);
    }, 400);
  });
}

// ─────────────────────────────────────────────
//  UI HELPERS
// ─────────────────────────────────────────────
function showError(box, msg) {
  if (!box) return;
  box.innerHTML = msg;
  box.className = 'auth-msg auth-msg--error';
  box.style.display = 'block';
}

function showSuccess(box, msg) {
  if (!box) return;
  box.innerHTML = msg;
  box.className = 'auth-msg auth-msg--success';
  box.style.display = 'block';
}

function clearError(box) {
  if (!box) return;
  box.innerHTML = '';
  box.style.display = 'none';
}

// ─────────────────────────────────────────────
//  INJECTER INFOS SESSION DANS LA PAGE
// ─────────────────────────────────────────────
function injectSessionInfo() {
  const session = getSession();
  if (!session) return;

  // Nom affiché
  const nameEls = document.querySelectorAll('[data-session="name"]');
  nameEls.forEach(el => {
    el.textContent = `${session.firstName} ${session.lastName}`;
  });

  // Rôle affiché
  const roleEls = document.querySelectorAll('[data-session="role"]');
  roleEls.forEach(el => {
    el.textContent = session.role === CONFIG.ROLES.INSTRUCTOR ? 'Instructeur' : 'Étudiant';
  });

  // Email affiché
  const emailEls = document.querySelectorAll('[data-session="email"]');
  emailEls.forEach(el => el.textContent = session.email);

  // Boutons de déconnexion
  const logoutBtns = document.querySelectorAll('[data-action="logout"]');
  logoutBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });
  });

  // Masquer/afficher éléments selon le rôle
  document.querySelectorAll('[data-role="etudiant"]').forEach(el => {
    el.style.display = session.role === CONFIG.ROLES.STUDENT ? '' : 'none';
  });
  document.querySelectorAll('[data-role="instructeur"]').forEach(el => {
    el.style.display = session.role === CONFIG.ROLES.INSTRUCTOR ? '' : 'none';
  });
}

// ─────────────────────────────────────────────
//  ADMIN : LISTE DES UTILISATEURS (debug)
// ─────────────────────────────────────────────
function getAllUsers() {
  return getUsers().map(u => ({
    id:        u.id,
    nom:       `${u.firstName} ${u.lastName}`,
    email:     u.email,
    role:      u.role,
    cree_le:   u.createdAt,
    connexion: u.lastLogin,
  }));
}

// Appel console pour vérifier : AVV242.getAllUsers()
window.AVV242 = {
  getAllUsers,
  getSession,
  logout,
  clearAllData: () => {
    localStorage.removeItem(CONFIG.STORAGE_KEY_USERS);
    localStorage.removeItem(CONFIG.STORAGE_KEY_SESSION);
    console.log('✓ Données AeroSim 242 effacées.');
  }
};

// ─────────────────────────────────────────────
//  INITIALISATION AU CHARGEMENT
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  injectSessionInfo();
  initLoginForm();
  initRegisterForm();
});
