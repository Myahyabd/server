const express = require('express');
const router = express.Router();
const Media = require('../models/Media');
const Product = require('../models/Product');
const HomeSettings = require('../models/HomeSettings');
const User = require('../models/User');
const cloudinary = require('../config/cloudinary');
const protect = require('../middleware/authMiddleware');

// Middleware to ensure admin only
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied: Admin only' });
  }
};

// Extract Cloudinary public_id from URL
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

// GET ALL MEDIA (Admin & Moderator view)
router.get('/', protect, async (req, res) => {
  try {
    // 1. Fetch all products, settings, and users to build a "used" set of images
    const products = await Product.find({}, 'images');
    const settings = await HomeSettings.findOne();
    const users = await User.find({}, 'profilePhoto');

    const usedUrls = new Set();
    
    // Add product images
    products.forEach(p => {
      if (p.images && Array.isArray(p.images)) {
        p.images.forEach(img => {
          if (img) usedUrls.add(img);
        });
      }
    });

    // Add user profile photos
    users.forEach(u => {
      if (u.profilePhoto) usedUrls.add(u.profilePhoto);
    });

    // Add settings images
    if (settings) {
      if (settings.heroImage) usedUrls.add(settings.heroImage);
      if (settings.bannerImage) usedUrls.add(settings.bannerImage);
      if (settings.categoryImages) {
        settings.categoryImages.forEach(cat => {
          if (cat.imageUrl) usedUrls.add(cat.imageUrl);
        });
      }
      if (settings.heroSlides) {
        settings.heroSlides.forEach(slide => {
          if (slide.backgroundImage) usedUrls.add(slide.backgroundImage);
        });
      }
    }

    // 2. Perform Auto-Sync (Add missing media files to DB)
    const allFoundUrls = Array.from(usedUrls);
    for (const url of allFoundUrls) {
      // If it looks like a Cloudinary URL and not in Media, add it
      if (url.includes('cloudinary.com')) {
        const exists = await Media.findOne({ url });
        if (!exists) {
          const publicId = getPublicIdFromUrl(url) || 'unknown';
          try {
            await Media.create({ url, publicId });
          } catch (dbErr) {
            console.error('Auto-sync failed for URL:', url, dbErr.message);
          }
        }
      }
    }

    // 3. Fetch all tracked media documents
    const mediaItems = await Media.find().sort({ createdAt: -1 });

    // 4. Map items and mark if they are used
    const responseData = mediaItems.map(item => {
      return {
        _id: item._id,
        url: item.url,
        publicId: item.publicId,
        createdAt: item.createdAt,
        isUsed: usedUrls.has(item.url)
      };
    });

    res.json(responseData);
  } catch (error) {
    console.error('Failed to get media:', error);
    res.status(500).json({ message: error.message || 'Failed to fetch media' });
  }
});

// DELETE MEDIA (Admin Only)
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const media = await Media.findById(req.params.id);
    if (!media) {
      return res.status(404).json({ message: 'Media not found' });
    }

    const { url, publicId } = media;

    // 1. Delete from Cloudinary
    if (publicId && publicId !== 'unknown') {
      try {
        await cloudinary.uploader.destroy(publicId);
      } catch (cloudErr) {
        console.error('Failed to delete from Cloudinary:', cloudErr);
      }
    }

    // 2. Delete from Media Collection
    await Media.findByIdAndDelete(req.params.id);

    // 3. Clean up database references
    
    // Remove from products images array
    await Product.updateMany({ images: url }, { $pull: { images: url } });

    // Remove from user profile photos
    await User.updateMany({ profilePhoto: url }, { $set: { profilePhoto: '' } });

    // Remove from home settings
    const settings = await HomeSettings.findOne();
    if (settings) {
      let settingsChanged = false;
      if (settings.heroImage === url) {
        settings.heroImage = '';
        settingsChanged = true;
      }
      if (settings.bannerImage === url) {
        settings.bannerImage = '';
        settingsChanged = true;
      }
      if (settings.categoryImages) {
        const filtered = settings.categoryImages.filter(cat => cat.imageUrl !== url);
        if (filtered.length !== settings.categoryImages.length) {
          settings.categoryImages = filtered;
          settingsChanged = true;
        }
      }
      if (settings.heroSlides) {
        settings.heroSlides.forEach(slide => {
          if (slide.backgroundImage === url) {
            slide.backgroundImage = '';
            settingsChanged = true;
          }
        });
      }
      if (settingsChanged) {
        await settings.save();
      }
    }

    res.json({ message: 'Media deleted and references cleaned up successfully' });
  } catch (error) {
    console.error('Failed to delete media:', error);
    res.status(500).json({ message: error.message || 'Failed to delete media' });
  }
});

module.exports = router;
