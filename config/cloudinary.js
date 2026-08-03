const cloudinary = require('cloudinary').v2;

console.log('Cloudinary Loaded:', process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUD_NAME || 'daf21yu47');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUD_NAME || 'daf21yu47',
  api_key: process.env.CLOUDINARY_API_KEY || process.env.CLOUD_API_KEY || '432154868979178',
  api_secret: process.env.CLOUDINARY_API_SECRET || process.env.CLOUD_API_SECRET || 'B1ihtDLGi866VkSzJHdp10mzS60',
});

module.exports = cloudinary;