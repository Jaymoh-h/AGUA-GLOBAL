const express = require("express");
const {
  login,
  selectContext,
  me,
  requestPasswordReset,
  resetPassword,
  changePassword
} = require("../controllers/auth.controller");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

router.post("/login", login);
router.post("/select-context", selectContext);
router.post("/password-reset/request", requestPasswordReset);
router.post("/password-reset/confirm", resetPassword);
router.get("/me", authenticate, me);
router.post("/change-password", authenticate, changePassword);

module.exports = router;
