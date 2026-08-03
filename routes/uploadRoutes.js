const express = require('express');
const router = express.Router();
const upload = require('../middleware/uploadMiddleware');
const Media = require('../models/Media');

router.get('/test-config', (req, res) => {
  res.json({
    has_cloud_name: !!(process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUD_NAME),
    has_api_key: !!(process.env.CLOUDINARY_API_KEY || process.env.CLOUD_API_KEY),
    has_api_secret: !!(process.env.CLOUDINARY_API_SECRET || process.env.CLOUD_API_SECRET),
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUD_NAME || 'not set',
  });
});

// Helper to extract Cloudinary public_id from URL
function getPublicIdFromUrl(url) {
  try {
    const parts = url.split('/image/upload/');
    if (parts.length > 1) {
      const pathWithVersion = parts[1];
      const pathParts = pathWithVersion.split('/');
      const startIndex = /^v\d+$/.test(pathParts[0]) ? 1 : 0;
      const pathWithoutVersion = pathParts.slice(startIndex).join('/');
      const dotIndex = pathWithoutVersion.lastIndexOf('.');
      if (dotIndex !== -1) {
        return pathWithoutVersion.substring(0, dotIndex);
      }
      return pathWithoutVersion;
    }
  } catch (err) {
    console.error('Failed to parse public_id:', err);
  }
  return null;
}

// MULTIPLE IMAGE UPLOAD
router.post(
  '/',
  upload.array('images', 10),
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          message: 'No files uploaded',
        });
      }

      // ALL IMAGE URLS
      const imageUrls = req.files.map(file => file.path || file.secure_url);

      // Save to Media collection
      for (const file of req.files) {
        const url = file.path || file.secure_url;
        const publicId = file.filename || getPublicIdFromUrl(url) || 'unknown';
        try {
          await Media.create({
            url,
            publicId,
            uploadedBy: req.user?._id
          });
        } catch (dbErr) {
          console.error('Failed to save media metadata:', dbErr);
        }
      }

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
