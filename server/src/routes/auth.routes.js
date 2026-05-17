const express = require("express");
const { login, me, changePassword } = require("../controllers/auth.controller");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

router.post("/login", login);
router.get("/me", authenticate, me);
router.post("/change-password", authenticate, changePassword);

module.exports = router;
