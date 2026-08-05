const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Product = require('../models/Product');
const HomeSettings = require('../models/HomeSettings');
const User = require('../models/User');
const Media = require('../models/Media');

dotenv.config();

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected!');

    console.log('Querying Products...');
    const products = await Product.find({}, 'images');
    console.log('Products count:', products.length);

    console.log('Querying HomeSettings...');
    const settings = await HomeSettings.findOne();
    console.log('Settings found:', !!settings);

    console.log('Querying Users...');
    const users = await User.find({}, 'profilePhoto');
    console.log('Users count:', users.length);

    const usedUrls = new Set();
    products.forEach(p => {
      if (p.images && Array.isArray(p.images)) {
        p.images.forEach(img => {
          if (img) usedUrls.add(img);
        });
      }
    });

    users.forEach(u => {
      if (u.profilePhoto) usedUrls.add(u.profilePhoto);
    });

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

    console.log('Used URLs count:', usedUrls.size);

    console.log('Running Auto-Sync...');
    const allFoundUrls = Array.from(usedUrls);
    for (const url of allFoundUrls) {
      if (url.includes('cloudinary.com')) {
        const exists = await Media.findOne({ url });
        if (!exists) {
          console.log('Syncing missing URL:', url);
          // extract publicId
          const parts = url.split('/image/upload/');
          let publicId = 'unknown';
          if (parts.length > 1) {
            const pathWithVersion = parts[1];
            const pathParts = pathWithVersion.split('/');
            const startIndex = /^v\d+$/.test(pathParts[0]) ? 1 : 0;
            const pathWithoutVersion = pathParts.slice(startIndex).join('/');
            const dotIndex = pathWithoutVersion.lastIndexOf('.');
            publicId = dotIndex !== -1 ? pathWithoutVersion.substring(0, dotIndex) : pathWithoutVersion;
          }
          await Media.create({ url, publicId });
        }
      }
    }

    console.log('Fetching media documents...');
    const mediaItems = await Media.find().sort({ createdAt: -1 });
    console.log('Media count in database:', mediaItems.length);
    console.log('First 5 items:', mediaItems.slice(0, 5));
    
  } catch (err) {
    console.error('ERROR during media check:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected!');
  }
}

run();
