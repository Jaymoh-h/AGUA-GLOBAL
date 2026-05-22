const validatePassword = (password, label = "Password") => {
  const value = String(password || "");
  const categories = [
    /[a-z]/.test(value),
    /[A-Z]/.test(value),
    /\d/.test(value),
    /[^A-Za-z0-9]/.test(value)
  ].filter(Boolean).length;

  if (value.length < 8) {
    return `${label} must be at least 8 characters.`;
  }
  if (categories < 3) {
    return `${label} must include at least three of: uppercase letters, lowercase letters, numbers, and symbols.`;
  }
  return null;
};

module.exports = {
  validatePassword
};
