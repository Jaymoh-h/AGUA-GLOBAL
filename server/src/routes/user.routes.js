const express = require("express");
const { listUsers, createUser, updateUser } = require("../controllers/user.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate, authorize("admin"));
router.get("/", listUsers);
router.post("/", createUser);
router.put("/:id", updateUser);

module.exports = router;

