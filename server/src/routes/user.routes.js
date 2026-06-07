const express = require("express");
const {
  listUsers,
  createUser,
  updateUser,
  createUserAccessProfile,
  updateUserAccessProfile
} = require("../controllers/user.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate, authorize("admin"));
router.get("/", listUsers);
router.post("/", createUser);
router.put("/:id", updateUser);
router.post("/:id/access-profiles", createUserAccessProfile);
router.patch("/:id/access-profiles/:profileId", updateUserAccessProfile);

module.exports = router;
