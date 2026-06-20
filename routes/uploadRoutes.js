const express = require('express');

const router = express.Router();

const upload = require('../middleware/uploadMiddleware');

// MULTIPLE IMAGE UPLOAD
router.post(
  '/',

  upload.array('images', 10),

  (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          message: 'No files uploaded',
        });
      }

      // ALL IMAGE URLS
      const imageUrls = req.files.map(file => file.path || file.secure_url);

      res.json(imageUrls);
    } catch (error) {
      console.log(error);

      res.status(500).json({
        message: 'Upload failed',
      });
    }
  },
);

module.exports = router;
