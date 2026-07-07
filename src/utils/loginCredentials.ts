const REMEMBER_KEY = "ag_remember_login";
const EMAIL_KEY = "ag_saved_email";
const PASSWORD_KEY = "ag_saved_password";

export type SavedLoginCredentials = {
  email: string;
  password: string;
  rememberMe: boolean;
};

export function loadSavedLoginCredentials(): SavedLoginCredentials {
  const rememberMe = localStorage.getItem(REMEMBER_KEY) !== "0";
  const email = localStorage.getItem(EMAIL_KEY) || "";
  let password = "";

  if (rememberMe) {
    try {
      const encoded = localStorage.getItem(PASSWORD_KEY);
      if (encoded) password = atob(encoded);
    } catch {
      password = "";
    }
  }

  return { email, password, rememberMe };
}

export function saveLoginCredentials(
  email: string,
  password: string,
  rememberMe: boolean
): void {
  localStorage.setItem(REMEMBER_KEY, rememberMe ? "1" : "0");
  localStorage.setItem(EMAIL_KEY, email);

  if (rememberMe && password) {
    localStorage.setItem(PASSWORD_KEY, btoa(password));
  } else {
    localStorage.removeItem(PASSWORD_KEY);
  }
}
